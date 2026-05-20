import { describe, expect, it } from "vitest";
import { createPoseidonFieldHash } from "../notes/poseidon.js";
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
      logs: [
        { root: zero, previousRoot: zero, insertedCommitment: zero },
        { root: `0x04${"aa".repeat(31)}`, previousRoot: zero, insertedCommitment: leaves[0] },
        { root: `0x05${"bb".repeat(31)}`, previousRoot: `0x04${"aa".repeat(31)}`, insertedCommitment: leaves[1] },
        { root: `0x06${"cc".repeat(31)}`, previousRoot: `0x05${"bb".repeat(31)}`, insertedCommitment: leaves[2] }
      ],
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
      logs: [
        { root: zero, previousRoot: zero, insertedCommitment: zero },
        { root: `0x04${"aa".repeat(31)}`, previousRoot: zero, insertedCommitment: leaves[0] },
        { root: `0x05${"bb".repeat(31)}`, previousRoot: `0x04${"aa".repeat(31)}`, insertedCommitment: leaves[1] },
        { root: `0x06${"cc".repeat(31)}`, previousRoot: `0x05${"bb".repeat(31)}`, insertedCommitment: leaves[2] }
      ],
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
      logs: [
        { root: zero, previousRoot: zero, insertedCommitment: zero },
        { root: zero, previousRoot: zero, insertedCommitment: leaves[0] },
        { root: zero, previousRoot: zero, insertedCommitment: leaves[1] },
        { root: zero, previousRoot: zero, insertedCommitment: leaves[2] }
      ],
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
        logs: [{ root: zero, previousRoot: zero, insertedCommitment: `0x01${"11".repeat(31)}` }],
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

    const overflowLogs = Array.from({ length: 5 }, (_, index) => ({
      root: zero,
      previousRoot: zero,
      insertedCommitment: `0x${(index + 1).toString(16).padStart(64, "0")}` as const
    }));
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
});
