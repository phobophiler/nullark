import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { poseidon2, poseidon5 } from "poseidon-lite";
import { createAppendOnlyMerkleTree, verifyMerklePath } from "./realProofModel.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, "../../..");
const poseidonHash = (inputs) => {
  const normalizedInputs = inputs.map(BigInt);
  if (normalizedInputs.length === 2) {
    return poseidon2(normalizedInputs);
  }
  if (normalizedInputs.length === 5) {
    return poseidon5(normalizedInputs);
  }
  throw new Error("Poseidon fixture parity supports 2-input Merkle hashes and 5-input note commitments.");
};
const MERKLE_TREE_DEPTH = 20;

describe("Poseidon fixture parity", () => {
  it("matches private-transfer circuit fixture root with append-only tree model", () => {
    const fixture = readFixture("private_transfer.valid.json");
    const spentCommitment = noteCommitment(fixture);
    const tree = createAppendOnlyMerkleTree(MERKLE_TREE_DEPTH, 0n, poseidonHash);
    const path = tree.append(spentCommitment);

    expect(path.leafIndex).toBe(Number(fixture.leafIndex));
    expect(path.root).toBe(BigInt(fixture.root));
    expect(path.pathElements).toEqual(fixture.pathElements.map(BigInt));
    expect(verifyMerklePath(spentCommitment, path, poseidonHash)).toBe(true);
  });

  it("matches withdrawal circuit fixture root with append-only tree model", () => {
    const fixture = readFixture("withdraw.valid.json");
    const spentCommitment = noteCommitment(fixture);
    const tree = createAppendOnlyMerkleTree(MERKLE_TREE_DEPTH, 0n, poseidonHash);
    const path = tree.append(spentCommitment);

    expect(path.leafIndex).toBe(Number(fixture.leafIndex));
    expect(path.root).toBe(BigInt(fixture.root));
    expect(path.pathElements).toEqual(fixture.pathElements.map(BigInt));
    expect(verifyMerklePath(spentCommitment, path, poseidonHash)).toBe(true);
  });
});

function readFixture(name) {
  return JSON.parse(readFileSync(path.join(repoDir, "circuits", "fixtures", name), "utf8"));
}

function noteCommitment(fixture) {
  return poseidonHash([10001n, BigInt(fixture.assetId), BigInt(fixture.noteAmount), BigInt(fixture.ownerCommitment), BigInt(fixture.noteSecret)]);
}
