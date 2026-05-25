import {
  deriveNoteCommitment as deriveCoreNoteCommitment,
  deriveNullifier as deriveCoreNullifier
} from "@nullark/core";
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

export type HexString = `0x${string}`;

export type BrowserNoteCommitmentInput = {
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
};

export type BrowserNullifierInput = {
  noteSecret: HexString;
  leafIndex: number;
  chainId: number;
  verifyingContract: HexString;
};

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export async function deriveBrowserNoteCommitment({
  assetId,
  noteAmountWei,
  ownerCommitment,
  noteSecret
}: BrowserNoteCommitmentInput): Promise<HexString> {
  const commitment = deriveCoreNoteCommitment(
    {
      assetId: BigInt(assetId),
      amount: BigInt(noteAmountWei),
      ownerCommitment: BigInt(ownerCommitment),
      noteSecret: BigInt(noteSecret)
    },
    poseidonHash
  );

  return toBytes32(commitment);
}

export async function deriveBrowserNullifier({
  noteSecret,
  leafIndex,
  chainId,
  verifyingContract
}: BrowserNullifierInput): Promise<HexString> {
  const nullifier = deriveCoreNullifier(
    {
      noteSecret: BigInt(noteSecret),
      leafIndex,
      chainId,
      verifyingContract: BigInt(verifyingContract)
    },
    poseidonHash
  );

  return toBytes32(nullifier);
}

export async function createBrowserPoseidonFieldHash(): Promise<(inputs: readonly bigint[]) => bigint> {
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
