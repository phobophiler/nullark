import { describe, expect, it } from "vitest";
import { createMerklePathIndex, getMerklePathForCommitment, insertIndexedCommitment } from "./merklePaths.js";
import { createRangeTracker, markCheckedRange } from "./ranges.js";
import {
  RECOVERY_INDEXER_REORG_LIMITATION,
  V12_RECOVERY_INDEXER_READINESS_BLOCKER,
  createRecoveryApiHandlers
} from "./recoveryApi.js";

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

  it("preserves v1.1 recovery identity and distinguishes v1.2 without chain fallback", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      runtimeId: "nullark-v1.1-mainnet",
      merklePaths: paths,
      latestCheckedBlock: 456n
    });

    const response = await api.merklePath({
      chainId: "4326",
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      commitment
    });

    expect(response.body).toMatchObject({
      chainId: 4326,
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      runtimeId: "nullark-v1.1-mainnet"
    });
    await expect(
      api.merklePath({
        chainId: "6343",
        pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
        commitment
      })
    ).resolves.toEqual({
      status: 400,
      body: { error: "unsupported chain" }
    });
  });

  it("blocks v1.2 recovery responses by default while readiness evidence is absent", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool: "0x2222222222222222222222222222222222222222",
      originalPool: "0x2222222222222222222222222222222222222222",
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      merklePaths: paths,
      latestCheckedBlock: 789n
    });

    const response = await api.merklePath({
      chainId: "4326",
      pool: "0x2222222222222222222222222222222222222222",
      commitment
    });

    expect(response).toEqual({
      status: 503,
      body: {
        error: V12_RECOVERY_INDEXER_READINESS_BLOCKER,
        runtimeId: "nullark-v1.2-mainnet-unlinkable",
        productionReady: false,
        sourceOfTruth: "chain-logs",
        limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
      }
    });
  });

  it("binds v1.2 recovery responses to matching readiness evidence runtime and original pool without wallet identity", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const pool = "0x2222222222222222222222222222222222222222" as const;
    const checkedRanges = createRangeTracker();
    markCheckedRange(checkedRanges, { fromBlock: 700n, toBlock: 789n });
    const reconstructed = getMerklePathForCommitment(paths, commitment);
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool,
      originalPool: pool,
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      v12ReadinessEvidence: {
        runtimeId: "nullark-v1.2-mainnet-unlinkable",
        chainId: 4326,
        pool,
        status: "ready",
        mainnet4326Blocked: false,
        finalReadiness: true,
        evidenceSha256: `0x${"aa".repeat(32)}`
      },
      merklePaths: paths,
      latestCheckedBlock: 789n,
      scanStartBlock: 700n,
      checkedRanges,
      acceptedRoots: new Map([[reconstructed.root.toLowerCase(), { source: "chain-log" }]])
    });

    const response = await api.merklePath({
      chainId: "4326",
      pool,
      commitment
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      chainId: 4326,
      pool,
      originalPool: pool,
      runtimeId: "nullark-v1.2-mainnet-unlinkable"
    });
    expect(response.body).not.toHaveProperty("walletAddress");
    expect(response.body).not.toHaveProperty("ownerAddress");
    expect(response.body).not.toHaveProperty("discoveryTag");
  });

  it("keeps v1.2 recovery blocked when readiness evidence is not final", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const pool = "0x2222222222222222222222222222222222222222" as const;
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool,
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      v12ReadinessEvidence: {
        runtimeId: "nullark-v1.2-mainnet-unlinkable",
        chainId: 4326,
        pool,
        status: "ready",
        mainnet4326Blocked: false,
        evidenceSha256: `0x${"aa".repeat(32)}`
      },
      merklePaths: paths,
      latestCheckedBlock: 789n
    });

    await expect(api.merklePath({ chainId: "4326", pool, commitment })).resolves.toMatchObject({
      status: 503,
      body: {
        error: V12_RECOVERY_INDEXER_READINESS_BLOCKER,
        productionReady: false
      }
    });
  });

  it("does not serve authoritative v1.2 recovery from incomplete checked ranges or missing accepted-root evidence", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const pool = "0x2222222222222222222222222222222222222222" as const;
    const checkedRanges = createRangeTracker();
    markCheckedRange(checkedRanges, { fromBlock: 700n, toBlock: 788n });
    const readiness = {
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      chainId: 4326 as const,
      pool,
      status: "ready" as const,
      mainnet4326Blocked: false as const,
      finalReadiness: true as const,
      evidenceSha256: `0x${"aa".repeat(32)}` as const
    };

    const missingRangeResponse = await createRecoveryApiHandlers({
      chainId: 4326,
      pool,
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      v12ReadinessEvidence: readiness,
      merklePaths: paths,
      latestCheckedBlock: 789n,
      scanStartBlock: 700n,
      checkedRanges
    }).merklePath({ chainId: "4326", pool, commitment });

    expect(missingRangeResponse).toMatchObject({
      status: 503,
      body: {
        error: "v1.2 recovery indexer requires complete checked ranges before serving paths",
        partialSync: true,
        missingRanges: [{ fromBlock: "789", toBlock: "789" }]
      }
    });

    markCheckedRange(checkedRanges, { fromBlock: 789n, toBlock: 789n });
    const missingRootResponse = await createRecoveryApiHandlers({
      chainId: 4326,
      pool,
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      v12ReadinessEvidence: readiness,
      merklePaths: paths,
      latestCheckedBlock: 789n,
      scanStartBlock: 700n,
      checkedRanges
    }).merklePath({ chainId: "4326", pool, commitment });

    expect(missingRootResponse).toEqual({
      status: 503,
      body: {
        error: "v1.2 recovery indexer requires accepted-root evidence before serving paths",
        sourceOfTruth: "chain-logs",
        limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
      }
    });
  });

  it("rejects wallet-linked recovery discovery query fields", async () => {
    const paths = createMerklePathIndex({ depth: 3, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(paths, { commitment, leafIndex: 0 });
    const api = createRecoveryApiHandlers({
      chainId: 4326,
      pool: "0x2222222222222222222222222222222222222222",
      runtimeId: "nullark-v1.2-mainnet-unlinkable",
      merklePaths: paths,
      latestCheckedBlock: 789n
    });

    await expect(
      api.merklePath({
        chainId: "4326",
        pool: "0x2222222222222222222222222222222222222222",
        commitment,
        walletAddress: "0x000000000000000000000000000000000000dEaD"
      })
    ).resolves.toEqual({
      status: 400,
      body: { error: "wallet-linked discovery fields are not accepted" }
    });
    await expect(
      api.merklePath({
        chainId: "4326",
        pool: "0x2222222222222222222222222222222222222222",
        commitment,
        publicDiscoveryTag: `0x${"12".repeat(32)}`
      })
    ).resolves.toEqual({
      status: 400,
      body: { error: "wallet-linked discovery fields are not accepted" }
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
