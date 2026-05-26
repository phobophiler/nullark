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

export type V12UnlinkableWithdrawProofIntent = {
  root: HexString;
  nullifier: HexString;
  outputCommitment: HexString;
  destination: HexString;
  grossAmountWei: string;
  feeWei: string;
  chainId: SupportedMegaEthChainId;
  verifyingContract: HexString;
  proofContextHash: HexString;
  encryptedOutputNoteHash: HexString;
};

export type WithdrawProofPublicInputSchema = "v1.1" | "v1.2-unlinkable";

export type WithdrawalGroth16ProofResult = {
  proof: HexString;
  proofCandidates: HexString[];
  publicInputs: HexString[];
  proofGenerationStatus: "groth16-generated";
};

export const V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER = Object.freeze([
  "root",
  "nullifier",
  "outputCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "proofContextHash",
  "encryptedOutputNoteHash"
] as const);

const WITHDRAW_PUBLIC_INPUTS_LENGTH = 12;
const V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUTS_LENGTH = V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER.length;
const BPS_DENOMINATOR = 10_000n;
const UINT256_MAX_EXCLUSIVE = 1n << 256n;

export async function generateWithdrawalGroth16Proof<TWitness extends Record<string, unknown>>(input: {
  witness: TWitness;
  artifacts: Pick<ResolvedProverArtifacts, "withdrawWasm" | "withdrawFinalZkey">;
  artifactBinding: ProverArtifactBindingStatus;
  proverRunner: ProverRunner<TWitness>;
  intent?: WithdrawProofIntent | undefined;
  v12UnlinkableIntent?: V12UnlinkableWithdrawProofIntent | undefined;
  publicInputSchema?: WithdrawProofPublicInputSchema | undefined;
  expectedFeeBps?: number | undefined;
}): Promise<WithdrawalGroth16ProofResult> {
  if (!input.artifactBinding.trusted) {
    throw new Error(`Trusted prover gate blocked withdrawal proof generation: ${input.artifactBinding.reason}.`);
  }
  assertWithdrawWitnessFee(input.witness, input.expectedFeeBps);
  const generated = await input.proverRunner.fullProve(
    input.witness,
    input.artifacts.withdrawWasm,
    input.artifacts.withdrawFinalZkey
  );
  const publicInputSchema = resolveWithdrawProofPublicInputSchema(input.publicInputSchema, !!input.v12UnlinkableIntent);
  const publicInputs =
    publicInputSchema === "v1.2-unlinkable"
      ? assertV12UnlinkableWithdrawPublicInputs(generated.publicSignals.map(toBytes32))
      : assertWithdrawPublicInputs(generated.publicSignals.map(toBytes32));
  if (input.intent) {
    if (publicInputSchema !== "v1.1") {
      throw new Error("v1.1 withdrawal proof intent cannot validate v1.2 unlinkable public inputs.");
    }
    validateWithdrawProofIntent(publicInputs, input.intent);
  }
  if (input.v12UnlinkableIntent) {
    if (publicInputSchema !== "v1.2-unlinkable") {
      throw new Error("v1.2 unlinkable withdrawal proof intent requires v1.2 unlinkable public inputs.");
    }
    validateV12UnlinkableWithdrawProofIntent(publicInputs, input.v12UnlinkableIntent);
  }
  const proofCandidates = proofObjectToCandidateBytes(generated.proof);
  return {
    proof: proofCandidates[0] ?? proofObjectToBytes(generated.proof),
    proofCandidates,
    publicInputs,
    proofGenerationStatus: "groth16-generated"
  };
}

export function assertWithdrawWitnessFee(witness: Record<string, unknown>, expectedFeeBps?: number | undefined): void {
  if (witness.grossAmount === undefined || witness.fee === undefined) {
    return;
  }

  const grossAmount = toSnarkBigInt(witness.grossAmount);
  const fee = toSnarkBigInt(witness.fee);
  if (expectedFeeBps === undefined) {
    throw new Error("Withdrawal witness expected fee bps must be provided by the active runtime.");
  }
  if (!Number.isSafeInteger(expectedFeeBps) || expectedFeeBps < 0) {
    throw new Error("Withdrawal witness expected fee bps must be a nonnegative safe integer.");
  }
  const expectedFee = (grossAmount * BigInt(expectedFeeBps)) / BPS_DENOMINATOR;
  if (fee !== expectedFee) {
    throw new Error(
      `Withdrawal witness fee must equal floor(grossAmount * ${expectedFeeBps.toString()} / ${BPS_DENOMINATOR.toString()}).`
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

export function validateV12UnlinkableWithdrawProofIntent(
  publicInputs: readonly HexString[],
  intent: V12UnlinkableWithdrawProofIntent
): void {
  const [
    rootSignal,
    nullifierSignal,
    outputCommitmentSignal,
    destinationSignal,
    grossAmountSignal,
    feeAmountSignal,
    chainIdSignal,
    verifyingContractSignal,
    proofContextHashSignal,
    encryptedOutputNoteHashSignal
  ] = assertV12UnlinkableWithdrawPublicInputs(publicInputs) as [
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
    throw new Error("v1.2 unlinkable withdrawal proof intent must target MegaETH mainnet or testnet.");
  }
  assertBytes32Equal(rootSignal, intent.root, "v1.2 unlinkable withdrawal proof root does not match the intended root.");
  assertBytes32Equal(
    nullifierSignal,
    intent.nullifier,
    "v1.2 unlinkable withdrawal proof nullifier does not match the intended note."
  );
  assertBytes32Equal(
    outputCommitmentSignal,
    intent.outputCommitment,
    "v1.2 unlinkable withdrawal proof output commitment does not match the intended output note."
  );
  assertBytes32Equal(
    destinationSignal,
    addressToBytes32(intent.destination),
    "v1.2 unlinkable withdrawal proof destination does not match the intended recipient."
  );
  assertBytes32Equal(
    grossAmountSignal,
    toBytes32(intent.grossAmountWei),
    "v1.2 unlinkable withdrawal proof gross amount does not match the intended withdrawal."
  );
  assertBytes32Equal(
    feeAmountSignal,
    toBytes32(intent.feeWei),
    "v1.2 unlinkable withdrawal proof fee does not match the intended withdrawal."
  );
  assertBytes32Equal(
    chainIdSignal,
    toBytes32(intent.chainId),
    "v1.2 unlinkable withdrawal proof is not bound to the active MegaETH chain."
  );
  assertBytes32Equal(
    verifyingContractSignal,
    addressToBytes32(intent.verifyingContract),
    "v1.2 unlinkable withdrawal proof is not bound to the intended verifier contract."
  );
  assertBytes32Equal(
    proofContextHashSignal,
    intent.proofContextHash,
    "v1.2 unlinkable withdrawal proof context hash does not match the intended withdrawal."
  );
  assertBytes32Equal(
    encryptedOutputNoteHashSignal,
    intent.encryptedOutputNoteHash,
    "v1.2 unlinkable withdrawal proof encrypted output note hash does not match the intended withdrawal."
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

export function assertV12UnlinkableWithdrawPublicInputs(publicInputs: readonly HexString[]): HexString[] {
  if (publicInputs.length !== V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUTS_LENGTH) {
    const order = V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER.join(", ");
    throw new Error(
      `v1.2 unlinkable withdraw proof must contain exactly ${V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUTS_LENGTH.toString()} public inputs in order: ${order}. Legacy 12-input prover output is forbidden because it exposes spentCommitment and noteAmount.`
    );
  }
  return publicInputs.map((input) => {
    if (!isHexBytes32(input)) {
      throw new Error("v1.2 unlinkable withdraw proof public inputs must be bytes32.");
    }
    return input;
  });
}

function resolveWithdrawProofPublicInputSchema(
  requestedSchema: WithdrawProofPublicInputSchema | undefined,
  hasV12UnlinkableIntent: boolean
): WithdrawProofPublicInputSchema {
  const schema = requestedSchema ?? (hasV12UnlinkableIntent ? "v1.2-unlinkable" : "v1.1");
  if (schema !== "v1.1" && schema !== "v1.2-unlinkable") {
    throw new Error("Withdrawal proof public input schema must be v1.1 or v1.2-unlinkable.");
  }
  return schema;
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
