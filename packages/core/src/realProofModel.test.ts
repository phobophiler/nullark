import { describe, expect, it } from "vitest";
import {
  BN254_SCALAR_FIELD,
  NATIVE_TEST_ASSET_ID,
  createAppendOnlyMerkleTree,
  deriveNoteCommitment,
  deriveNullifier,
  fieldElementToBytes32,
  verifyMerklePath,
  type FieldHash,
  type RealProofNotePreimage
} from "./realProofModel.js";

const testHash: FieldHash = (inputs) =>
  inputs.reduce((state, input, index) => (state * 131n + input + BigInt(index + 1)) % BN254_SCALAR_FIELD, 17n);

const note: RealProofNotePreimage = {
  assetId: NATIVE_TEST_ASSET_ID,
  amount: 1_000_000n,
  ownerCommitment: 123_456n,
  noteSecret: 789_012n
};

describe("real proof note model", () => {
  it("derives deterministic note commitments and nullifiers with injected hash", () => {
    const commitment = deriveNoteCommitment(note, testHash);
    const nullifier = deriveNullifier(
      { noteSecret: note.noteSecret, leafIndex: 0, chainId: 6343, verifyingContract: 0x5555n },
      testHash
    );

    expect(commitment).toBe(3_618_622_043_851n);
    expect(nullifier).toBe(5_375_510_210_894n);
  });

  it("builds and verifies append-only Merkle paths without production crypto claims", () => {
    const tree = createAppendOnlyMerkleTree(3, 0n, testHash);
    const first = deriveNoteCommitment(note, testHash);
    const second = deriveNoteCommitment({ ...note, noteSecret: 111_111n }, testHash);

    const firstPath = tree.append(first);
    const secondPath = tree.append(second);

    expect(tree.root).toBe(secondPath.root);
    expect(verifyMerklePath(first, firstPath, testHash)).toBe(true);
    expect(verifyMerklePath(second, secondPath, testHash)).toBe(true);
    expect(verifyMerklePath(second, firstPath, testHash)).toBe(false);
  });

  it("rejects invalid field values, invalid path bits, and over-capacity insertions", () => {
    expect(() => deriveNoteCommitment({ ...note, amount: 0n }, testHash)).toThrow("amount must be positive");
    expect(() => deriveNoteCommitment({ ...note, ownerCommitment: BN254_SCALAR_FIELD }, testHash)).toThrow(
      "ownerCommitment must be a BN254 field element"
    );

    const tree = createAppendOnlyMerkleTree(1, 0n, testHash);
    const leaf = deriveNoteCommitment(note, testHash);
    const path = tree.append(leaf);
    expect(() => verifyMerklePath(leaf, { ...path, pathIndices: [2] }, testHash)).toThrow("path index must be a bit");

    tree.append(deriveNoteCommitment({ ...note, noteSecret: 1n }, testHash));
    expect(() => tree.append(deriveNoteCommitment({ ...note, noteSecret: 2n }, testHash))).toThrow("Merkle tree is full");
  });

  it("encodes field elements as bytes32 for public input comparison", () => {
    expect(fieldElementToBytes32(6343n)).toBe("0x00000000000000000000000000000000000000000000000000000000000018c7");
  });
});
