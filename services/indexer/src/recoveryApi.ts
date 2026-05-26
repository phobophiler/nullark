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
  canonicalRuntimeSource?: "public-artifacts/current.json" | "apps/web/public/proving/trusted-setup-record.json";
};

export const RECOVERY_INDEXER_REORG_LIMITATION =
  "Recovery responses are derived from indexed chain logs and accepted roots; callers must rescan after reorg or finality-window changes.";
export const V12_RECOVERY_INDEXER_READINESS_BLOCKER =
  "v1.2 recovery indexer remains blocked until matching readiness evidence is present.";
export const MAX_RECOVERY_API_MISSING_RANGES = 25;

const V12_MAINNET_POOL = "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8" as const;
const V12_APPROVED_PUBLIC_RUNTIME_HASH =
  "0x66def458e16ea6ed9d1df9c15a79ec83c23d4d4ccdec631d868f614cc0e94ff4" as const;
const V12_APPROVED_TRUSTED_SETUP_RECORD_HASH =
  "0xb87aa47a407f0347a920fcebe76f84d402be8bd5e82f5fe5980ffea557bfa996" as const;

const V12_RUNTIME_BINDINGS = [
  {
    runtimeId: "nullark-v1.2-mainnet",
    chainId: 4326,
    pool: V12_MAINNET_POOL,
    approvedEvidenceHashes: [V12_APPROVED_PUBLIC_RUNTIME_HASH, V12_APPROVED_TRUSTED_SETUP_RECORD_HASH]
  },
  {
    runtimeId: "nullark-v1.2-fee-governance",
    chainId: 4326,
    pool: V12_MAINNET_POOL,
    approvedEvidenceHashes: [V12_APPROVED_PUBLIC_RUNTIME_HASH, V12_APPROVED_TRUSTED_SETUP_RECORD_HASH]
  }
] as const;

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
      const v12Runtime = getV12RuntimeBinding(input);
      if (v12Runtime.blocked || (v12Runtime.binding && !hasMatchingV12ReadinessEvidence(input, v12Runtime.binding))) {
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
      if (v12Runtime.binding) {
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
        if (!input.acceptedRoots || input.acceptedRoots.size === 0) {
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

type V12RuntimeBinding = (typeof V12_RUNTIME_BINDINGS)[number];

function getV12RuntimeBinding(input: {
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  runtimeId?: string;
}): { binding?: V12RuntimeBinding; blocked: boolean } {
  if (input.runtimeId === undefined || input.runtimeId === "nullark-v1.1-mainnet") {
    return { blocked: false };
  }
  const binding = V12_RUNTIME_BINDINGS.find(
    (candidate) =>
      candidate.runtimeId === input.runtimeId &&
      candidate.chainId === input.chainId &&
      candidate.pool.toLowerCase() === input.pool.toLowerCase()
  );
  if (binding) {
    return { binding, blocked: false };
  }
  return { blocked: input.runtimeId.includes("v1.2") };
}

function hasMatchingV12ReadinessEvidence(input: {
  chainId: SupportedRecoveryApiChainId;
  pool: HexString;
  runtimeId?: string;
  v12ReadinessEvidence?: V12RecoveryIndexerReadinessEvidence;
}, binding: V12RuntimeBinding): boolean {
  const evidence = input.v12ReadinessEvidence;
  return (
    evidence !== undefined &&
    evidence.runtimeId === binding.runtimeId &&
    evidence.status === "ready" &&
    evidence.mainnet4326Blocked === false &&
    evidence.finalReadiness === true &&
    evidence.chainId === binding.chainId &&
    evidence.pool.toLowerCase() === binding.pool.toLowerCase() &&
    binding.approvedEvidenceHashes.some((hash) => hash.toLowerCase() === evidence.evidenceSha256.toLowerCase()) &&
    (evidence.canonicalRuntimeSource === undefined ||
      evidence.canonicalRuntimeSource === "public-artifacts/current.json" ||
      evidence.canonicalRuntimeSource === "apps/web/public/proving/trusted-setup-record.json")
  );
}

function hasWalletLinkedDiscoveryField(query: Record<string, string>): boolean {
  const forbiddenFields = new Set([
    "discoveryTag",
    "futureNullifier",
    "ownerAddress",
    "ownerTag",
    "publicDiscoveryTag",
    "stableDiscoveryTag",
    "walletAddress",
    "walletDiscoveryTag",
    "walletTag"
  ]);
  return Object.keys(query).some((key) => {
    const normalizedKey = key.toLowerCase();
    return (
      forbiddenFields.has(key) ||
      /wallet|discovery|tag/i.test(key) ||
      normalizedKey.includes("nullifier")
    );
  });
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
    return { partialSync: true, missingRangeCount: 0, missingRanges: [] };
  }

  const missingRanges = findMissingRanges(input.checkedRanges, {
    fromBlock: scanStartBlock,
    toBlock: input.latestCheckedBlock
  });
  const visibleMissingRanges = missingRanges.slice(0, MAX_RECOVERY_API_MISSING_RANGES);
  return {
    partialSync: missingRanges.length > 0,
    missingRangeCount: missingRanges.length,
    missingRanges: visibleMissingRanges.map((range) => ({
      fromBlock: range.fromBlock.toString(),
      toBlock: range.toBlock.toString()
    })),
    ...(missingRanges.length > visibleMissingRanges.length ? { missingRangesTruncated: true } : {})
  };
}
