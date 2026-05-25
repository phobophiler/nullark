import { getMerklePathForCommitment, type HexString, type MerklePathIndex } from "./merklePaths.js";
import { findMissingRanges, type RangeTracker } from "./ranges.js";

export type SupportedRecoveryApiChainId = 6343 | 4326;

export type RecoveryApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

export type V12RecoveryIndexerReadinessEvidence = {
  runtimeId: string;
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  status: "ready";
  mainnet4326Blocked: false;
  finalReadiness?: true;
  evidenceSha256: HexString;
};

export const RECOVERY_INDEXER_REORG_LIMITATION =
  "Recovery responses are derived from indexed chain logs and accepted roots; callers must rescan after reorg or finality-window changes.";
export const V12_RECOVERY_INDEXER_READINESS_BLOCKER =
  "v1.2 recovery indexer remains blocked until matching readiness evidence is present.";

export function createRecoveryApiHandlers(input: {
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  originalPool?: HexString;
  runtimeId?: string;
  v12ReadinessEvidence?: V12RecoveryIndexerReadinessEvidence;
  merklePaths: MerklePathIndex;
  latestCheckedBlock: bigint;
  scanStartBlock?: bigint;
  checkedRanges?: RangeTracker;
  acceptedRoots?: ReadonlyMap<string, unknown>;
}) {
  return {
    async merklePath(query: Record<string, string>): Promise<RecoveryApiResponse> {
      if (hasWalletLinkedDiscoveryField(query)) {
        return { status: 400, body: { error: "wallet-linked discovery fields are not accepted" } };
      }
      if (query.chainId !== String(input.chainId)) {
        return { status: 400, body: { error: "unsupported chain" } };
      }
      if (typeof query.pool !== "string" || typeof query.commitment !== "string") {
        return { status: 400, body: { error: "invalid recovery query" } };
      }
      if (query.pool.toLowerCase() !== input.pool.toLowerCase()) {
        return { status: 404, body: { error: "pool not indexed" } };
      }
      if (isV12Runtime(input.runtimeId) && !hasMatchingV12ReadinessEvidence(input)) {
        return {
          status: 503,
          body: {
            error: V12_RECOVERY_INDEXER_READINESS_BLOCKER,
            runtimeId: input.runtimeId,
            productionReady: false,
            sourceOfTruth: "chain-logs",
            limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
          }
        };
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(query.commitment)) {
        return { status: 400, body: { error: "invalid commitment" } };
      }
      try {
        const path = getMerklePathForCommitment(input.merklePaths, query.commitment as HexString);
        if (isV12Runtime(input.runtimeId)) {
          const rangeStatus = missingRangeStatus(input);
          if (rangeStatus.partialSync !== false) {
            return {
              status: 503,
              body: {
                error: "v1.2 recovery indexer requires complete checked ranges before serving paths",
                sourceOfTruth: "chain-logs",
                limitations: [RECOVERY_INDEXER_REORG_LIMITATION],
                ...rangeStatus
              }
            };
          }
          if (!input.acceptedRoots) {
            return {
              status: 503,
              body: {
                error: "v1.2 recovery indexer requires accepted-root evidence before serving paths",
                sourceOfTruth: "chain-logs",
                limitations: [RECOVERY_INDEXER_REORG_LIMITATION]
              }
            };
          }
        }
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
            ...(input.originalPool ? { originalPool: input.originalPool } : {}),
            chainId: input.chainId,
            ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
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

function isV12Runtime(runtimeId: string | undefined): boolean {
  return typeof runtimeId === "string" && runtimeId.startsWith("nullark-v1.2");
}

function hasMatchingV12ReadinessEvidence(input: {
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  runtimeId?: string;
  v12ReadinessEvidence?: V12RecoveryIndexerReadinessEvidence;
}): boolean {
  const evidence = input.v12ReadinessEvidence;
  return (
    evidence !== undefined &&
    evidence.runtimeId === input.runtimeId &&
    evidence.status === "ready" &&
    evidence.mainnet4326Blocked === false &&
    evidence.finalReadiness === true &&
    evidence.chainId === input.chainId &&
    evidence.pool.toLowerCase() === input.pool.toLowerCase() &&
    /^0x[0-9a-fA-F]{64}$/.test(evidence.evidenceSha256)
  );
}

function hasWalletLinkedDiscoveryField(query: Record<string, string>): boolean {
  const forbiddenFields = new Set([
    "discoveryTag",
    "ownerAddress",
    "ownerTag",
    "publicDiscoveryTag",
    "stableDiscoveryTag",
    "walletAddress",
    "walletDiscoveryTag",
    "walletTag"
  ]);
  return Object.keys(query).some((key) => forbiddenFields.has(key));
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
