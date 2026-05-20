import type { ProverRunner } from "../adapters/index.js";
import type { ProverArtifactBindingStatus, ResolvedProverArtifacts } from "../artifacts/resolver.js";
import { MEGAETH_MAINNET_CHAIN_ID, MEGAETH_TESTNET_CHAIN_ID, type SupportedMegaEthChainId } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";

export type WithdrawProofIntent = {
  root: HexString;
  nullifier: HexString;
  changeCommitment: HexString;
  destination: HexString;
  grossAmountWei: string;
  feeWei: string;
  chainId: SupportedMegaEthChainId;
  pool: HexString;
  spentCommitment: HexString;
  noteAmountWei: string;
  proofContextHash: HexString;
  encryptedNoteHash: HexString;
};

export type WithdrawalGroth16ProofResult = {
  proof: HexString;
  proofCandidates: HexString[];
  publicInputs: HexString[];
  proofGenerationStatus: "groth16-generated";
};

const WITHDRAW_PUBLIC_INPUTS_LENGTH = 12;
const WITHDRAWAL_FEE_BPS = 33n;
const BPS_DENOMINATOR = 10_000n;
const UINT256_MAX_EXCLUSIVE = 1n << 256n;

export async function generateWithdrawalGroth16Proof<TWitness extends Record<string, unknown>>(input: {
  witness: TWitness;
  artifacts: Pick<ResolvedProverArtifacts, "withdrawWasm" | "withdrawFinalZkey">;
  artifactBinding: ProverArtifactBindingStatus;
  proverRunner: ProverRunner<TWitness>;
  intent?: WithdrawProofIntent | undefined;
}): Promise<WithdrawalGroth16ProofResult> {
  if (!input.artifactBinding.trusted) {
    throw new Error(`Trusted prover gate blocked withdrawal proof generation: ${input.artifactBinding.reason}.`);
  }
  assertWithdrawWitnessFee(input.witness);
  const generated = await input.proverRunner.fullProve(
    input.witness,
    input.artifacts.withdrawWasm,
    input.artifacts.withdrawFinalZkey
  );
  const publicInputs = assertWithdrawPublicInputs(generated.publicSignals.map(toBytes32));
  if (input.intent) {
    validateWithdrawProofIntent(publicInputs, input.intent);
  }
  const proofCandidates = proofObjectToCandidateBytes(generated.proof);
  return {
    proof: proofCandidates[0] ?? proofObjectToBytes(generated.proof),
    proofCandidates,
    publicInputs,
    proofGenerationStatus: "groth16-generated"
  };
}

export function assertWithdrawWitnessFee(witness: Record<string, unknown>): void {
  if (witness.grossAmount === undefined || witness.fee === undefined) {
    return;
  }

  const grossAmount = toSnarkBigInt(witness.grossAmount);
  const fee = toSnarkBigInt(witness.fee);
  const expectedFee = (grossAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
  if (fee !== expectedFee) {
    throw new Error(
      `Withdrawal witness fee must equal floor(grossAmount * ${WITHDRAWAL_FEE_BPS.toString()} / ${BPS_DENOMINATOR.toString()}).`
    );
  }
}

export function validateWithdrawProofIntent(publicInputs: readonly HexString[], intent: WithdrawProofIntent): void {
  const [
    rootSignal,
    nullifierSignal,
    changeCommitmentSignal,
    destinationSignal,
    grossAmountSignal,
    feeAmountSignal,
    chainIdSignal,
    poolSignal,
    spentCommitmentSignal,
    noteAmountSignal,
    proofContextHashSignal,
    encryptedNoteHashSignal
  ] = assertWithdrawPublicInputs(publicInputs) as [
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString
  ];

  if (intent.chainId !== MEGAETH_MAINNET_CHAIN_ID && intent.chainId !== MEGAETH_TESTNET_CHAIN_ID) {
    throw new Error("Withdrawal proof intent must target MegaETH mainnet or testnet.");
  }
  assertBytes32Equal(rootSignal, intent.root, "Withdrawal proof root does not match the intended root.");
  assertBytes32Equal(nullifierSignal, intent.nullifier, "Withdrawal proof nullifier does not match the intended note.");
  assertBytes32Equal(
    changeCommitmentSignal,
    intent.changeCommitment,
    "Withdrawal proof change commitment does not match the intended change note."
  );
  assertBytes32Equal(
    destinationSignal,
    addressToBytes32(intent.destination),
    "Withdrawal proof destination does not match the intended recipient."
  );
  assertBytes32Equal(
    grossAmountSignal,
    toBytes32(intent.grossAmountWei),
    "Withdrawal proof gross amount does not match the intended withdrawal."
  );
  assertBytes32Equal(
    feeAmountSignal,
    toBytes32(intent.feeWei),
    "Withdrawal proof fee does not match the intended withdrawal."
  );
  assertBytes32Equal(
    chainIdSignal,
    toBytes32(intent.chainId),
    "Withdrawal proof is not bound to the active MegaETH chain."
  );
  assertBytes32Equal(poolSignal, addressToBytes32(intent.pool), "Withdrawal proof is not bound to the intended pool.");
  assertBytes32Equal(
    spentCommitmentSignal,
    intent.spentCommitment,
    "Withdrawal proof spent commitment does not match the intended note."
  );
  assertBytes32Equal(
    noteAmountSignal,
    toBytes32(intent.noteAmountWei),
    "Withdrawal proof note amount does not match the intended note."
  );
  assertBytes32Equal(
    proofContextHashSignal,
    intent.proofContextHash,
    "Withdrawal proof context hash does not match the intended withdrawal."
  );
  assertBytes32Equal(
    encryptedNoteHashSignal,
    intent.encryptedNoteHash,
    "Withdrawal proof encrypted note hash does not match the intended withdrawal."
  );
}

export function proofObjectToBytes(proof: unknown): HexString {
  const proofBytes = proofObjectToCandidateBytes(proof)[0];
  if (!proofBytes) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return proofBytes;
}

export function proofObjectToCandidateBytes(proof: unknown): HexString[] {
  const value = proof as {
    pi_a?: unknown;
    pi_b?: unknown;
    pi_c?: unknown;
  };
  const tupleA = parseUint256Tuple(value.pi_a, 3).slice(0, 2);
  const matrixB = parseUint256Matrix3x2(value.pi_b);
  const tupleC = parseUint256Tuple(value.pi_c, 3).slice(0, 2);
  const bVariants: Array<[bigint, bigint, bigint, bigint]> = [
    [matrixB[0][1], matrixB[0][0], matrixB[1][1], matrixB[1][0]],
    [matrixB[0][0], matrixB[0][1], matrixB[1][0], matrixB[1][1]],
    [matrixB[0][0], matrixB[1][0], matrixB[0][1], matrixB[1][1]],
    [matrixB[1][0], matrixB[0][0], matrixB[1][1], matrixB[0][1]],
    [matrixB[0][1], matrixB[1][1], matrixB[0][0], matrixB[1][0]],
    [matrixB[1][1], matrixB[0][1], matrixB[1][0], matrixB[0][0]]
  ];
  const candidates = bVariants.map((bVariant) => encodeGroth16ProofChunks([...tupleA, ...bVariant, ...tupleC]));
  return Array.from(new Set(candidates));
}

function assertWithdrawPublicInputs(publicInputs: readonly HexString[]): HexString[] {
  if (publicInputs.length !== WITHDRAW_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Withdraw proof must contain 12 public inputs.");
  }
  return publicInputs.map((input) => {
    if (!isHexBytes32(input)) {
      throw new Error("Withdraw proof public inputs must be bytes32.");
    }
    return input;
  });
}

function encodeGroth16ProofChunks(chunks: bigint[]): HexString {
  return `0x${chunks.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
}

function parseUint256Tuple(value: unknown, length: number): [bigint, ...bigint[]] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return value.map(toSnarkBigInt) as [bigint, ...bigint[]];
}

function parseUint256Matrix3x2(value: unknown): [[bigint, bigint], [bigint, bigint], [bigint, bigint]] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return [
    parseUint256Tuple(value[0], 2) as [bigint, bigint],
    parseUint256Tuple(value[1], 2) as [bigint, bigint],
    parseUint256Tuple(value[2], 2) as [bigint, bigint]
  ];
}

function toSnarkBigInt(value: unknown): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === "string" && /^(?:0x[0-9a-fA-F]{1,64}|[0-9]+)$/.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new Error("Malformed Groth16 scalar.");
  }
  if (parsed < 0n || parsed >= UINT256_MAX_EXCLUSIVE) {
    throw new Error("Malformed Groth16 scalar.");
  }
  return parsed;
}

function toBytes32(value: unknown): HexString {
  return `0x${toSnarkBigInt(value).toString(16).padStart(64, "0")}`;
}

function addressToBytes32(address: HexString): HexString {
  if (!isEvmAddress(address)) {
    throw new Error("Malformed Ethereum address.");
  }
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function assertBytes32Equal(actual: HexString, expected: HexString, message: string): void {
  if (!isHexBytes32(expected) || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(message);
  }
}
