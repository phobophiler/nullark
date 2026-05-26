import { describe, expect, it } from "vitest";
import { createPoseidonFieldHash } from "../notes/poseidon.js";
import type { HexString } from "../types.js";
import type { FieldHash, RootAcceptedLogRecord } from "./reconstruct.js";
import { reconstructMerklePathFromRootAcceptedLogs, verifyMerklePath } from "./reconstruct.js";

const zero = `0x${"00".repeat(32)}` as const;

describe("Merkle path reconstruction", () => {
  it("reconstructs a note leaf index and Merkle path from RootAccepted history order", () => {
    const leaves = [
      `0x01${"11".repeat(31)}`,
      `0x02${"22".repeat(31)}`,
      `0x03${"33".repeat(31)}`
    ] as const;
    const hash = (inputs: readonly bigint[]) => inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    const path = reconstructMerklePathFromRootAcceptedLogs({
      logs: rootAcceptedLogsForLeaves(leaves, hash, 12),
      commitment: leaves[1],
      hash,
      depth: 12
    });

    expect(path).toMatchObject({
      commitment: leaves[1],
      leafIndex: 1,
      pathIndices: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      status: "reconstructed-from-root-accepted-history"
    });
    expect(path.pathElements[0]).toBe(leaves[0]);
    expect(verifyMerklePath({ ...path, hash })).toBe(true);
  });

  it("reconstructs depth-20 paths without materializing a full tree", () => {
    const leaves = [
      `0x01${"11".repeat(31)}`,
      `0x02${"22".repeat(31)}`,
      `0x03${"33".repeat(31)}`
    ] as const;
    let hashCalls = 0;
    const hash = (inputs: readonly bigint[]) => {
      hashCalls += 1;
      return inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    };
    const path = reconstructMerklePathFromRootAcceptedLogs({
      logs: rootAcceptedLogsForLeaves(leaves, hash, 20),
      commitment: leaves[1],
      hash,
      depth: 20
    });

    expect(path.leafIndex).toBe(1);
    expect(path.pathIndices).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(path.pathElements).toHaveLength(20);
    expect(path.pathElements[0]).toBe(leaves[0]);
    expect(hashCalls).toBeLessThan(220);
  });

  it("supports the SDK Poseidon field hash used by the withdrawal circuit", async () => {
    const leaves = [
      `0x01${"11".repeat(31)}`,
      `0x02${"22".repeat(31)}`,
      `0x03${"33".repeat(31)}`
    ] as const;
    const hash = await createPoseidonFieldHash();

    const path = reconstructMerklePathFromRootAcceptedLogs({
      logs: rootAcceptedLogsForLeaves(leaves, hash, 2),
      commitment: leaves[2],
      hash,
      depth: 2
    });

    expect(path.leafIndex).toBe(2);
    expect(path.pathElements).toHaveLength(2);
    expect(verifyMerklePath({ ...path, hash })).toBe(true);
  });

  it("rejects missing commitments, bad path bits, and capacity overflow", () => {
    const hash = (inputs: readonly bigint[]) => inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    expect(() =>
      reconstructMerklePathFromRootAcceptedLogs({
        logs: rootAcceptedLogsForLeaves([`0x01${"11".repeat(31)}`], hash, 4),
        commitment: `0x02${"22".repeat(31)}`,
        hash,
        depth: 4
      })
    ).toThrow("Note commitment was not found");

    expect(() =>
      reconstructMerklePathFromRootAcceptedLogs({
        logs: [{ root: "0x1234", previousRoot: zero, insertedCommitment: `0x01${"11".repeat(31)}` }],
        commitment: `0x01${"11".repeat(31)}`,
        hash,
        depth: 4
      })
    ).toThrow("root must be a BN254 field bytes32 value");

    const overflowLogs = rootAcceptedLogsForLeaves(
      Array.from({ length: 5 }, (_, index) => `0x${(index + 1).toString(16).padStart(64, "0")}` as HexString),
      hash,
      2
    );
    expect(() =>
      reconstructMerklePathFromRootAcceptedLogs({
        logs: overflowLogs,
        commitment: overflowLogs[0]?.insertedCommitment ?? zero,
        hash,
        depth: 2
      })
    ).toThrow("exceeds the configured Merkle tree capacity");

    expect(() =>
      verifyMerklePath({
        commitment: `0x01${"11".repeat(31)}`,
        root: `0x02${"22".repeat(31)}`,
        pathElements: [`0x03${"33".repeat(31)}`],
        pathIndices: [2],
        hash
      })
    ).toThrow("Merkle path indices must be bits");
  });

  it("rejects RootAccepted histories whose previousRoot or root does not match the computed append chain", () => {
    const leaves = [`0x01${"11".repeat(31)}`, `0x02${"22".repeat(31)}`] as const;
    const hash = (inputs: readonly bigint[]) => inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    const logs = rootAcceptedLogsForLeaves(leaves, hash, 12);

    expect(() =>
      reconstructMerklePathFromRootAcceptedLogs({
        logs: logs.map((log, index) => (index === 2 ? { ...log, previousRoot: zero } : log)),
        commitment: leaves[1],
        hash,
        depth: 12
      })
    ).toThrow("previousRoot does not match");

    expect(() =>
      reconstructMerklePathFromRootAcceptedLogs({
        logs: logs.map((log, index) => (index === 2 ? { ...log, root: `0x09${"99".repeat(31)}` as HexString } : log)),
        commitment: leaves[1],
        hash,
        depth: 12
      })
    ).toThrow("root does not match the computed Merkle root");
  });
});

function rootAcceptedLogsForLeaves(
  leaves: readonly HexString[],
  hash: FieldHash,
  depth: number
): RootAcceptedLogRecord[] {
  const zeroHashes = buildZeroHashes(depth, hash);
  const filledSubtrees = zeroHashes.slice(0, depth);
  const logs: RootAcceptedLogRecord[] = [
    {
      root: toBytes32(zeroHashes[depth] ?? 0n),
      previousRoot: zero,
      insertedCommitment: zero
    }
  ];
  let previousRoot = logs[0]?.root ?? zero;
  leaves.forEach((leaf, leafIndex) => {
    const root = insertLeaf(leaf, leafIndex, depth, zeroHashes, filledSubtrees, hash);
    logs.push({ root, previousRoot, insertedCommitment: leaf });
    previousRoot = root;
  });
  return logs;
}

function insertLeaf(
  leaf: HexString,
  leafIndex: number,
  depth: number,
  zeroHashes: readonly bigint[],
  filledSubtrees: bigint[],
  hash: FieldHash
): HexString {
  let current = BigInt(leaf);
  for (let level = 0; level < depth; level += 1) {
    if (Math.floor(leafIndex / 2 ** level) % 2 === 0) {
      filledSubtrees[level] = current;
      current = hash([current, zeroHashes[level] ?? 0n]);
    } else {
      current = hash([filledSubtrees[level] ?? zeroHashes[level] ?? 0n, current]);
    }
  }
  return toBytes32(current);
}

function buildZeroHashes(depth: number, hash: FieldHash): bigint[] {
  const zeroHashes = [0n];
  for (let level = 0; level < depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    zeroHashes.push(hash([zeroHash, zeroHash]));
  }
  return zeroHashes;
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
