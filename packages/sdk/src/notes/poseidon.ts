import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";
import {
  poseidon1,
  poseidon2,
  poseidon3,
  poseidon4,
  poseidon5,
  poseidon6,
  poseidon7,
  poseidon8,
  poseidon9,
  poseidon10,
  poseidon11,
  poseidon12,
  poseidon13,
  poseidon14,
  poseidon15,
  poseidon16
} from "poseidon-lite";

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

export async function deriveNoteCommitment(input: NoteCommitmentInput): Promise<HexString> {
  const commitment = normalizeHashOutput(
    poseidonHash([
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
  const nullifier = normalizeHashOutput(
    poseidonHash([
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
  return poseidonHash(inputs);
}

export async function createPoseidonFieldHash(): Promise<(inputs: readonly bigint[]) => bigint> {
  return poseidonHash;
}

function poseidonHash(inputs: readonly bigint[]): bigint {
  const normalizedInputs = inputs.map(BigInt);
  switch (normalizedInputs.length) {
    case 1:
      return poseidon1(normalizedInputs);
    case 2:
      return poseidon2(normalizedInputs);
    case 3:
      return poseidon3(normalizedInputs);
    case 4:
      return poseidon4(normalizedInputs);
    case 5:
      return poseidon5(normalizedInputs);
    case 6:
      return poseidon6(normalizedInputs);
    case 7:
      return poseidon7(normalizedInputs);
    case 8:
      return poseidon8(normalizedInputs);
    case 9:
      return poseidon9(normalizedInputs);
    case 10:
      return poseidon10(normalizedInputs);
    case 11:
      return poseidon11(normalizedInputs);
    case 12:
      return poseidon12(normalizedInputs);
    case 13:
      return poseidon13(normalizedInputs);
    case 14:
      return poseidon14(normalizedInputs);
    case 15:
      return poseidon15(normalizedInputs);
    case 16:
      return poseidon16(normalizedInputs);
    default:
      throw new Error("Poseidon field hash supports 1 to 16 inputs.");
  }
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
