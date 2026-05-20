import { getMerklePathForCommitment, type HexString, type MerklePathIndex } from "./merklePaths.js";
import { findMissingRanges, type RangeTracker } from "./ranges.js";

export type SupportedRecoveryApiChainId = 6343 | 4326;

export type RecoveryApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

export const RECOVERY_INDEXER_REORG_LIMITATION =
  "Recovery responses are derived from indexed chain logs and accepted roots; callers must rescan after reorg or finality-window changes.";

export function createRecoveryApiHandlers(input: {
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  merklePaths: MerklePathIndex;
  latestCheckedBlock: bigint;
  scanStartBlock?: bigint;
  checkedRanges?: RangeTracker;
  acceptedRoots?: ReadonlyMap<string, unknown>;
}) {
  return {
    async merklePath(query: { chainId: string; pool: string; commitment: string }): Promise<RecoveryApiResponse> {
      if (query.chainId !== String(input.chainId)) {
        return { status: 400, body: { error: "unsupported chain" } };
      }
      if (query.pool.toLowerCase() !== input.pool.toLowerCase()) {
        return { status: 404, body: { error: "pool not indexed" } };
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(query.commitment)) {
        return { status: 400, body: { error: "invalid commitment" } };
      }
      try {
        const path = getMerklePathForCommitment(input.merklePaths, query.commitment as HexString);
        if (input.acceptedRoots && !input.acceptedRoots.has(path.root.toLowerCase())) {
          return {
            status: 409,
            body: {
              error: "Merkle path root is not confirmed by indexed chain logs",
              sourceOfTruth: "chain-logs",
              limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
            }
          };
        }
        return {
          status: 200,
          body: {
            ...path,
            pool: input.pool,
            chainId: input.chainId,
            latestCheckedBlock: input.latestCheckedBlock.toString(),
            limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
          }
        };
      } catch (error) {
        return {
          status: 404,
          body: {
            error: error instanceof Error ? error.message : "path unavailable",
            sourceOfTruth: "chain-logs",
            limitations: [RECOVERY_INDEXER_REORG_LIMITATION],
            ...missingRangeStatus(input)
          }
        };
      }
    }
  };
}

function missingRangeStatus(input: {
  latestCheckedBlock: bigint;
  scanStartBlock?: bigint;
  checkedRanges?: RangeTracker;
}): Record<string, unknown> {
  if (!input.checkedRanges) {
    return {};
  }

  const scanStartBlock = input.scanStartBlock ?? 0n;
  if (input.latestCheckedBlock < scanStartBlock) {
    return { partialSync: true, missingRanges: [] };
  }

  const missingRanges = findMissingRanges(input.checkedRanges, {
    fromBlock: scanStartBlock,
    toBlock: input.latestCheckedBlock
  });
  return {
    partialSync: missingRanges.length > 0,
    missingRanges: missingRanges.map((range) => ({
      fromBlock: range.fromBlock.toString(),
      toBlock: range.toBlock.toString()
    }))
  };
}
