import { BPS_DENOMINATOR, WITHDRAWAL_FEE_BPS } from "@nullark/core";

const WITHDRAW_PUBLIC_INPUTS_LENGTH = 12;

export type BrowserWithdrawProofInput = {
  witness: Record<string, string | string[] | number | bigint>;
  wasmUrl: string;
  zkeyUrl: string;
};

export type BrowserWithdrawProofResult = {
  proof: `0x${string}`;
  proofCandidates: `0x${string}`[];
  publicInputs: `0x${string}`[];
  proofGenerationStatus: "browser-groth16-generated";
};

export type WithdrawProofIntent = {
  root: `0x${string}`;
  nullifier: `0x${string}`;
  changeCommitment: `0x${string}`;
  destination: `0x${string}`;
  grossAmountWei: string;
  feeWei: string;
  chainId: 6343 | 4326;
  pool: `0x${string}`;
  spentCommitment: `0x${string}`;
  noteAmountWei: string;
  proofContextHash: `0x${string}`;
  encryptedNoteHash: `0x${string}`;
};

export async function generateBrowserWithdrawProof(input: BrowserWithdrawProofInput): Promise<BrowserWithdrawProofResult> {
  assertWithdrawWitnessFee(input.witness);
  const { groth16 } = await import("snarkjs");
  const generated = await groth16.fullProve(input.witness, input.wasmUrl, input.zkeyUrl);
  const proofCandidates = proofObjectToCandidateBytes(generated.proof);
  return {
    proof: proofCandidates[0] ?? proofObjectToBytes(generated.proof),
    proofCandidates,
    publicInputs: assertWithdrawPublicInputs(generated.publicSignals.map(toBytes32)),
    proofGenerationStatus: "browser-groth16-generated"
  };
}

function assertWithdrawWitnessFee(witness: Record<string, string | string[] | number | bigint>): void {
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

export function parseSolidityCalldataProof(
  calldata: string
): Pick<BrowserWithdrawProofResult, "proof" | "publicInputs"> {
  const normalized = JSON.parse(`[${calldata}]`) as [unknown, unknown, unknown, unknown[]];
  const [a, b, c, publicSignals] = normalized;

  if (!Array.isArray(publicSignals) || publicSignals.length !== WITHDRAW_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Withdraw proof must contain 12 public inputs.");
  }

  const proof = toBytesFromSolidityCalldata(a, b, c);
  return {
    proof,
    publicInputs: assertWithdrawPublicInputs(publicSignals.map(toBytes32))
  };
}

export function validateWithdrawProofIntent(
  publicInputs: `0x${string}`[],
  intent: WithdrawProofIntent
): void {
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
  ] = assertWithdrawPublicInputs(publicInputs);

  assertBytes32Equal(
    rootSignal,
    intent.root,
    "Withdrawal proof root does not match the intended root."
  );
  assertBytes32Equal(
    nullifierSignal,
    intent.nullifier,
    "Withdrawal proof nullifier does not match the intended note."
  );
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
    toBytes32(BigInt(intent.chainId)),
    "Withdrawal proof is not bound to MegaETH testnet."
  );
  assertBytes32Equal(
    poolSignal,
    addressToBytes32(intent.pool),
    "Withdrawal proof is not bound to the intended pool."
  );
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

type WithdrawPublicInputs = [
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`
];

function assertWithdrawPublicInputs(
  publicInputs: `0x${string}`[]
): WithdrawPublicInputs {
  if (publicInputs.length !== WITHDRAW_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Withdraw proof must contain 12 public inputs.");
  }
  return publicInputs as WithdrawPublicInputs;
}

function toBytesFromSolidityCalldata(a: unknown, b: unknown, c: unknown): `0x${string}` {
  const tupleA = parseUint256Tuple(a, 2);
  const matrixB = parseUint256Matrix2x2(b);
  const tupleC = parseUint256Tuple(c, 2);
  const chunks = [
    ...tupleA,
    matrixB[0][0],
    matrixB[0][1],
    matrixB[1][0],
    matrixB[1][1],
    ...tupleC
  ];
  return `0x${chunks.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
}

export function proofObjectToBytes(proof: unknown): `0x${string}` {
  const candidates = proofObjectToCandidateBytes(proof);
  const proofBytes = candidates[0];
  if (!proofBytes) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return proofBytes;
}

export function proofObjectToCandidateBytes(proof: unknown): `0x${string}`[] {
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

function encodeGroth16ProofChunks(chunks: bigint[]): `0x${string}` {
  return `0x${chunks.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
}

function parseUint256Tuple(value: unknown, length: number): [bigint, ...bigint[]] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return value.map(toSnarkBigInt) as [bigint, ...bigint[]];
}

function parseUint256Matrix2x2(value: unknown): [[bigint, bigint], [bigint, bigint]] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Malformed Groth16 proof calldata.");
  }
  return [
    parseUint256Tuple(value[0], 2) as [bigint, bigint],
    parseUint256Tuple(value[1], 2) as [bigint, bigint]
  ];
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
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value !== "string") {
    throw new Error("Malformed Groth16 scalar.");
  }
  if (!/^(?:0x[0-9a-fA-F]{1,64}|[0-9]+)$/.test(value)) {
    throw new Error("Malformed Groth16 scalar.");
  }
  return BigInt(value);
}

function toBytes32(value: unknown): `0x${string}` {
  return `0x${toSnarkBigInt(value).toString(16).padStart(64, "0")}`;
}

function addressToBytes32(address: `0x${string}`): `0x${string}` {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error("Malformed Ethereum address.");
  }
  return `0x${clean.padStart(64, "0")}`;
}

function assertBytes32Equal(actual: `0x${string}`, expected: `0x${string}`, message: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(message);
  }
}
