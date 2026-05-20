import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPoseidon } from "../../../circuits/node_modules/circomlibjs/main.js";
import { createAppendOnlyMerkleTree, verifyMerklePath } from "./realProofModel.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, "../../..");
const poseidon = await buildPoseidon();
const poseidonHash = (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));
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
