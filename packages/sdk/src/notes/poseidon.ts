import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";

type Poseidon = {
  F: { toObject(value: unknown): bigint };
  (inputs: readonly bigint[]): unknown;
};

export type NoteCommitmentInput = {
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
};

export type NullifierInput = {
  noteSecret: HexString;
  leafIndex: number;
  chainId: number;
  verifyingContract: HexString;
};

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const NOTE_COMMITMENT_DOMAIN = 10_001n;
const NULLIFIER_DOMAIN = 10_002n;

let poseidonPromise: Promise<Poseidon> | null = null;

export async function deriveNoteCommitment(input: NoteCommitmentInput): Promise<HexString> {
  const poseidon = await getPoseidon();
  const commitment = normalizeHashOutput(
    fieldHash(poseidon)([
      NOTE_COMMITMENT_DOMAIN,
      fieldElement(input.assetId, "assetId"),
      positiveFieldElement(input.noteAmountWei, "amount"),
      fieldElement(input.ownerCommitment, "ownerCommitment"),
      fieldElement(input.noteSecret, "noteSecret")
    ]),
    "commitment"
  );
  return toBytes32(commitment);
}

export async function deriveNullifier(input: NullifierInput): Promise<HexString> {
  if (!Number.isSafeInteger(input.leafIndex) || input.leafIndex < 0) {
    throw new Error("leafIndex must be a safe nonnegative integer");
  }
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new Error("chainId must be a safe positive integer");
  }
  if (!isEvmAddress(input.verifyingContract)) {
    throw new Error("verifyingContract must be an EVM address");
  }
  const poseidon = await getPoseidon();
  const nullifier = normalizeHashOutput(
    fieldHash(poseidon)([
      NULLIFIER_DOMAIN,
      fieldElement(input.noteSecret, "noteSecret"),
      BigInt(input.leafIndex),
      BigInt(input.chainId),
      addressFieldElement(input.verifyingContract, "verifyingContract")
    ]),
    "nullifier"
  );
  return toBytes32(nullifier);
}

export async function poseidonFieldHash(inputs: readonly bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  return fieldHash(poseidon)(inputs);
}

export async function createPoseidonFieldHash(): Promise<(inputs: readonly bigint[]) => bigint> {
  const poseidon = await getPoseidon();
  return fieldHash(poseidon);
}

async function getPoseidon(): Promise<Poseidon> {
  poseidonPromise ??= import("circomlibjs").then(({ buildPoseidon }) => buildPoseidon() as Promise<Poseidon>);
  return poseidonPromise;
}

function fieldHash(poseidon: Poseidon): (inputs: readonly bigint[]) => bigint {
  return (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));
}

function fieldElement(value: string, label: string): bigint {
  if (!isHexBytes32(value)) {
    throw new Error(`${label} must be a bytes32 hex string`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BN254_SCALAR_FIELD) {
    throw new Error(`${label} must be a BN254 field element`);
  }
  return parsed;
}

function positiveFieldElement(value: string, label: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a decimal integer`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed >= BN254_SCALAR_FIELD) {
    throw new Error(`${label} must be positive`);
  }
  return parsed;
}

function addressFieldElement(value: string, label: string): bigint {
  if (!isEvmAddress(value)) {
    throw new Error(`${label} must be an EVM address`);
  }
  return BigInt(value);
}

function normalizeHashOutput(value: bigint, label: string): bigint {
  if (value <= 0n || value >= BN254_SCALAR_FIELD) {
    throw new Error(`${label} hash output must be a nonzero BN254 field element`);
  }
  return value;
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
