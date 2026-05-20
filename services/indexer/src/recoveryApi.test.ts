import { describe, expect, it } from "vitest";
import { createMerklePathIndex, getMerklePathForCommitment, insertIndexedCommitment } from "./merklePaths.js";
import { createRangeTracker, markCheckedRange } from "./ranges.js";
import { RECOVERY_INDEXER_REORG_LIMITATION, createRecoveryApiHandlers } from "./recoveryApi.js";

const zero = `0x${"00".repeat(32)}` as const;
const commitment = `0x${"11".repeat(32)}` as const;

function fakeHash(left: `0x${string}`, right: `0x${string}`): `0x${string}` {
  return `0x${(BigInt(left) ^ (BigInt(right) << 1n)).toString(16).padStart(64, "0").slice(-64)}`;
}

describe("recovery API handlers", () => {
  it("serves a Merkle path for an indexed commitment", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 6343,
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      merklePaths: paths,
      latestCheckedBlock: 123n
    });

    const response = await api.merklePath({
      chainId: "6343",
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      commitment
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      commitment,
      leafIndex: 0,
      source: "reconstructed-from-indexed-logs",
      latestCheckedBlock: "123"
    });
    expect(response.body.limitations).toEqual([RECOVERY_INDEXER_REORG_LIMITATION]);
    expect(response.body.pathElements).toHaveLength(3);
  });

  it("serves MegaETH mainnet Merkle paths when the indexer is configured for chain 4326", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool: "0x4444444444444444444444444444444444444444",
      merklePaths: paths,
      latestCheckedBlock: 456n
    });

    const response = await api.merklePath({
      chainId: "4326",
      pool: "0x4444444444444444444444444444444444444444",
      commitment
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      commitment,
      chainId: 4326,
      latestCheckedBlock: "456"
    });
  });

  it("rejects Merkle path requests for the wrong pool", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 6343,
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      merklePaths: paths,
      latestCheckedBlock: 123n
    });

    const response = await api.merklePath({
      chainId: "6343",
      pool: "0x0000000000000000000000000000000000000001",
      commitment
    });

    expect(response).toEqual({
      status: 404,
      body: { error: "pool not indexed" }
    });
  });

  it("reports missing checked ranges and keeps chain logs as source of truth for absent commitments", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    const checkedRanges = createRangeTracker();
    markCheckedRange(checkedRanges, { fromBlock: 10n, toBlock: 12n });
    markCheckedRange(checkedRanges, { fromBlock: 15n, toBlock: 16n });
    const api = createRecoveryApiHandlers({
      chainId: 6343,
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      merklePaths: paths,
      latestCheckedBlock: 17n,
      scanStartBlock: 10n,
      checkedRanges
    });

    const response = await api.merklePath({
      chainId: "6343",
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      commitment
    });

    expect(response).toEqual({
      status: 404,
      body: {
        error: "Commitment is not indexed.",
        sourceOfTruth: "chain-logs",
        limitations: [RECOVERY_INDEXER_REORG_LIMITATION],
        partialSync: true,
        missingRanges: [
          { fromBlock: "13", toBlock: "14" },
          { fromBlock: "17", toBlock: "17" }
        ]
      }
    });
  });

  it("rejects stale Merkle paths whose reconstructed root is not confirmed by indexed chain logs", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const reconstructed = getMerklePathForCommitment(paths, commitment);
    const acceptedRoots = new Map<string, unknown>([[`0x${"99".repeat(32)}`, { source: "chain-log" }]]);
    const api = createRecoveryApiHandlers({
      chainId: 6343,
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      merklePaths: paths,
      latestCheckedBlock: 123n,
      acceptedRoots
    });

    const response = await api.merklePath({
      chainId: "6343",
      pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
      commitment
    });

    expect(acceptedRoots.has(reconstructed.root.toLowerCase())).toBe(false);
    expect(response).toEqual({
      status: 409,
      body: {
        error: "Merkle path root is not confirmed by indexed chain logs",
        sourceOfTruth: "chain-logs",
        limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
      }
    });
  });
});
