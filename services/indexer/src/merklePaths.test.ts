import { describe, expect, it } from "vitest";
import { createMerklePathIndex, getMerklePathForCommitment, insertIndexedCommitment } from "./merklePaths.js";

const zero = `0x${"00".repeat(32)}` as const;
const a = `0x${"11".repeat(32)}` as const;
const b = `0x${"22".repeat(32)}` as const;
const c = `0x${"33".repeat(32)}` as const;
const one = toBytes32(1n);
const two = toBytes32(2n);
const four = toBytes32(4n);
const expectedSparseDepth3Root = toBytes32(25n);

function fakeHash(left: `0x${string}`, right: `0x${string}`): `0x${string}` {
  const value = BigInt(left) ^ (BigInt(right) << 1n);
  return `0x${value.toString(16).padStart(64, "0").slice(-64)}`;
}

describe("merkle path index", () => {
  it("matches a deterministic sparse-tree fixture root and path", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(index, { commitment: one, leafIndex: 0 });
    insertIndexedCommitment(index, { commitment: two, leafIndex: 3 });
    insertIndexedCommitment(index, { commitment: four, leafIndex: 6 });

    const path = getMerklePathForCommitment(index, two);

    expect(path).toMatchObject({
      commitment: two,
      leafIndex: 3,
      root: expectedSparseDepth3Root,
      pathElements: [zero, one, toBytes32(8n)],
      pathIndices: [1, 1, 0],
      source: "reconstructed-from-indexed-logs"
    });
    expect(recomputeRootFromPath({ leaf: two, pathElements: path.pathElements, pathIndices: path.pathIndices })).toBe(
      expectedSparseDepth3Root
    );
  });

  it("reconstructs a path and root from indexed commitments", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(index, { commitment: a, leafIndex: 0 });
    insertIndexedCommitment(index, { commitment: b, leafIndex: 1 });
    insertIndexedCommitment(index, { commitment: c, leafIndex: 2 });

    const path = getMerklePathForCommitment(index, b);

    expect(path).toMatchObject({
      commitment: b,
      leafIndex: 1,
      pathIndices: [1, 0, 0],
      source: "reconstructed-from-indexed-logs"
    });
    expect(path.pathElements).toHaveLength(3);
    expect(path.root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects unknown commitments instead of fabricating paths", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });

    expect(() => getMerklePathForCommitment(index, a)).toThrow("Commitment is not indexed.");
  });

  it("rejects duplicate or contradictory commitment and leaf-index records", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(index, { commitment: a, leafIndex: 2 });

    expect(() => insertIndexedCommitment(index, { commitment: a, leafIndex: 2 })).not.toThrow();
    expect(() => insertIndexedCommitment(index, { commitment: a, leafIndex: 3 })).toThrow(
      "Commitment is already indexed at a different leaf index."
    );
    expect(() => insertIndexedCommitment(index, { commitment: b, leafIndex: 2 })).toThrow(
      "Leaf index already has a different commitment."
    );
    expect(() => insertIndexedCommitment(index, { commitment: c, leafIndex: 8 })).toThrow(
      "Leaf index exceeds Merkle tree capacity."
    );
  });

  it("detects wrong leaf index, wrong sibling order, and wrong path direction against the fixture root", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(index, { commitment: one, leafIndex: 0 });
    insertIndexedCommitment(index, { commitment: two, leafIndex: 3 });
    insertIndexedCommitment(index, { commitment: four, leafIndex: 6 });
    const path = getMerklePathForCommitment(index, two);

    const wrongLeafIndexPathIndices = path.pathIndices.map((bit, level) => (level === 0 ? bit ^ 1 : bit));
    const wrongSiblingOrder = [path.pathElements[1]!, path.pathElements[0]!, path.pathElements[2]!];
    const wrongDirectionPathIndices = path.pathIndices.map((bit) => bit ^ 1);

    expect(recomputeRootFromPath({ leaf: two, pathElements: path.pathElements, pathIndices: wrongLeafIndexPathIndices })).not.toBe(
      path.root
    );
    expect(recomputeRootFromPath({ leaf: two, pathElements: wrongSiblingOrder, pathIndices: path.pathIndices })).not.toBe(
      path.root
    );
    expect(recomputeRootFromPath({ leaf: two, pathElements: path.pathElements, pathIndices: wrongDirectionPathIndices })).not.toBe(
      path.root
    );
  });

  it("reconstructs a high-depth proof without allocating a full leaf level", () => {
    const depth = 20;
    const index = createMerklePathIndex({ depth, zeroHash: zero, hashPair: fakeHash });
    const leafIndex = 2 ** (depth - 1) - 5;
    const commitment = a;

    insertIndexedCommitment(index, { commitment, leafIndex });

    const path = getMerklePathForCommitment(index, commitment);

    const expectedPathIndices = Array.from({ length: depth }, (_, level) => (leafIndex >> level) & 1);
    expect(path).toMatchObject({
      commitment,
      leafIndex,
      pathIndices: expectedPathIndices
    });
    expect(path.pathElements).toHaveLength(depth);
    expect(path.root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("caches generated paths and invalidates them when new commitments are indexed", () => {
    const index = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash, maxPathCacheEntries: 1 });
    insertIndexedCommitment(index, { commitment: a, leafIndex: 0 });

    const firstPath = getMerklePathForCommitment(index, a);
    const cachedPath = getMerklePathForCommitment(index, a);

    expect(cachedPath).toBe(firstPath);
    expect(index.pathCache.size).toBe(1);

    insertIndexedCommitment(index, { commitment: b, leafIndex: 1 });

    expect(index.pathCache.size).toBe(0);
    expect(getMerklePathForCommitment(index, a).root).not.toBe(firstPath.root);
  });
});

function recomputeRootFromPath(input: {
  leaf: `0x${string}`;
  pathElements: readonly `0x${string}`[];
  pathIndices: readonly number[];
}): `0x${string}` {
  return input.pathElements.reduce((current, sibling, level) => {
    const pathIndex = input.pathIndices[level];
    if (pathIndex === 0) {
      return fakeHash(current, sibling);
    }
    if (pathIndex === 1) {
      return fakeHash(sibling, current);
    }
    throw new Error("Path index must be 0 or 1.");
  }, input.leaf);
}

function toBytes32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
