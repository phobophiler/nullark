import {
  deriveNoteCommitment as deriveCoreNoteCommitment,
  deriveNullifier as deriveCoreNullifier
} from "@nullark/core";
import type { Poseidon } from "circomlibjs";

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

let poseidonPromise: Promise<Poseidon> | null = null;

function getPoseidon(): Promise<Poseidon> {
  poseidonPromise ??= import("circomlibjs").then(({ buildPoseidon }) => buildPoseidon());
  return poseidonPromise;
}

function fieldHash(poseidon: Poseidon) {
  return (inputs: readonly bigint[]) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export async function deriveBrowserNoteCommitment({
  assetId,
  noteAmountWei,
  ownerCommitment,
  noteSecret
}: BrowserNoteCommitmentInput): Promise<HexString> {
  const poseidon = await getPoseidon();
  const commitment = deriveCoreNoteCommitment(
    {
      assetId: BigInt(assetId),
      amount: BigInt(noteAmountWei),
      ownerCommitment: BigInt(ownerCommitment),
      noteSecret: BigInt(noteSecret)
    },
    fieldHash(poseidon)
  );

  return toBytes32(commitment);
}

export async function deriveBrowserNullifier({
  noteSecret,
  leafIndex,
  chainId,
  verifyingContract
}: BrowserNullifierInput): Promise<HexString> {
  const poseidon = await getPoseidon();
  const nullifier = deriveCoreNullifier(
    {
      noteSecret: BigInt(noteSecret),
      leafIndex,
      chainId,
      verifyingContract: BigInt(verifyingContract)
    },
    fieldHash(poseidon)
  );

  return toBytes32(nullifier);
}

export async function createBrowserPoseidonFieldHash(): Promise<(inputs: readonly bigint[]) => bigint> {
  const poseidon = await getPoseidon();
  return fieldHash(poseidon);
}
