import { describe, expect, it } from "vitest";
import {
  CURRENT_V1_1_NULLARK_POOL_ADDRESS,
  LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL_ADDRESS,
  V12_FEE_GOVERNANCE_GAS_OPERATIONS,
  assertMainnetGasEvidenceReady,
  assertV12FeeGovernanceGasEvidenceReady,
  v12FeeGovernanceGasEvidenceBlockers,
  type MainnetCapacityAnalysisEntry,
  type MainnetGasEvidenceRecord,
  type MainnetRemoteGasEntry,
  type MainnetStateBlockedEntry,
  type MainnetVolatileMetadataReviewEntry,
  type V12FeeGovernanceGasEvidenceRecord,
  type V12FeeGovernanceGasOperationName,
  type V12FeeGovernanceRemoteEstimateOperation
} from "./mainnetGasEvidence.js";

const pool = "0x1111111111111111111111111111111111111111" as const;
const caller = "0x2222222222222222222222222222222222222222" as const;
const legacyDepth20Pool = LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL_ADDRESS as `0x${string}`;

const operationEntries = [
  "deposit",
  "privateTransfer",
  "withdrawal",
  "stageCWithdrawal",
  "feeSweep",
  "pauseDeposits",
  "pauseWithdrawals",
  "worstCaseRootScan"
] as const;

const functionSelectorsByOperation = {
  deposit: "0xe29973fc",
  privateTransfer: "0x6da3fd67",
  withdrawal: "0xc7787d0f",
  stageCWithdrawal: "0x678d8506",
  feeSweep: "0x90a3a042",
  pauseDeposits: "0x738b62e5",
  pauseWithdrawals: "0x04d27882",
  worstCaseRootScan: "0xbbccdbc4"
} as const;

const stageCMatrixEvidence = {
  requiredInputsRef: "docs/evidence/mainnet-readiness/gas/stage-c-mainnet-gas-log-storage-required-inputs.approved.json",
  variantEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-partial-change-variant.json",
  logSizeEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-log-size.json",
  indexerReplayRef: "docs/evidence/mainnet-readiness/gas/stage-c-indexer-replay.json",
  storageReviewRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-storage-review.json",
  currentRootEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-current-root.json",
  volatileMetadataReviewRef: "docs/evidence/mainnet-readiness/gas/stage-c-volatile-metadata-review.json",
  txReceiptEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-tx-receipt.json",
  txLogsEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-tx-logs.json",
  selectorPathEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-withdrawal-selector-path.json",
  monitoringEvidenceRef: "docs/evidence/mainnet-readiness/relayer-monitoring/stage-c-withdrawal-monitoring.json"
} as const;

const record: MainnetGasEvidenceRecord = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  environment: "megaeth-mainnet",
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  deploymentPackageRef: "docs/evidence/megaeth-mainnet-deployment-package.json",
  sourceVerificationPackageRef: "docs/evidence/mainnet-readiness/source-verification-package.approved.json",
  trustedSetupRecordRef: "docs/evidence/mainnet-readiness/trusted-setup-verifier-promotion.approved.json",
  externalInputRefs: [
    "docs/evidence/mainnet-readiness/mainnet-required-inputs.md",
    "docs/evidence/mainnet-readiness/source-verification-package.approved.json",
    "docs/evidence/mainnet-readiness/trusted-setup-verifier-promotion.approved.json"
  ],
  collectedAt: "2026-05-07T00:00:00.000Z",
  entries: [
    ...operationEntries.map((operation, index): MainnetRemoteGasEntry => ({
      operation,
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      evidenceKind: "remote-estimate" as const,
      evidenceArtifactRef: `docs/evidence/mainnet-readiness/gas/${operation}.json`,
      inputArtifactRef: `docs/evidence/mainnet-readiness/gas/${operation}-input.json`,
      calldataHash: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
      externalInputRefs: [
        "docs/evidence/mainnet-readiness/source-verification-package.approved.json",
        `docs/evidence/mainnet-readiness/gas/${operation}-input.json`
      ],
      functionSelector: functionSelectorsByOperation[operation],
      gasUsedOrEstimatedWei: String(1_000_000 + index),
      blockNumber: 100 + index,
      target: pool,
      from: caller,
      ...(operation === "stageCWithdrawal"
        ? {
            evidenceKind: "remote-receipt" as const,
            transactionHash: `0x${String(index + 1).repeat(64).slice(0, 64)}` as const
          }
        : {}),
      ...(operation === "privateTransfer" || operation === "withdrawal" || operation === "stageCWithdrawal" || operation === "feeSweep"
        ? {
            statePreconditionsVerified: true,
            stateReadinessRef: `docs/evidence/mainnet-readiness/gas/${operation}-state-readiness.json`
          }
        : {}),
      storageSlotsTouched: 2,
      newStorageSlots: operation === "feeSweep" || operation.startsWith("pause") ? 0 : 1,
      storageGrowthReviewed: true,
      ...(operation === "stageCWithdrawal"
        ? {
            stageCMatrixEvidence,
            stageCVariant: "withdraw_partial_public_exit_one_change_note",
            stageCLogPayloadSizeBytes: 2048,
            currentRootAfter: `0x${"a".repeat(64)}`
          }
        : {}),
      notes: `remote MegaETH mainnet evidence for ${operation}`
    })),
    {
      operation: "nearCapacityInsertion",
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      evidenceKind: "capacity-analysis",
      evidenceArtifactRef: "docs/evidence/mainnet-readiness/gas/near-capacity-insertion-analysis.md",
      externalInputRefs: [
        "docs/evidence/mainnet-readiness/depth20-mainnet-benchmark-evidence.md",
        "docs/evidence/mainnet-readiness/mainnet-pool-architecture.approved.json"
      ],
      blockNumber: 150,
      target: pool,
      merkleTreeDepth: 20,
      merkleTreeCapacity: 1_048_576,
      currentLeafIndex: 0,
      insertionPathReviewed: true,
      storageGrowthReviewed: true,
      futureBenchmarkRequired: true,
      notes: "near-capacity insertion is covered by static depth-20 capacity analysis; filling 2^20 mainnet leaves is not a launch prerequisite"
    } satisfies MainnetCapacityAnalysisEntry,
    {
      operation: "volatileBlockMetadataReview",
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      evidenceKind: "manual-review",
      evidenceArtifactRef: "docs/evidence/mainnet-readiness/gas/volatile-block-metadata-review.md",
      externalInputRefs: ["docs/evidence/mainnet-readiness/contract-review-mainnet-readiness.md"],
      blockNumber: 200,
      target: pool,
      usesVolatileBlockMetadata: true,
      volatileFieldsReviewed: ["block.timestamp", "block.number", "blockhash", "prevrandao", "coinbase", "basefee"],
      volatileMetadataPaths: [
        {
          path: "default-no-deadline-paths",
          status: "not-used",
          fields: []
        },
        {
          path: "deadline-enabled-relayer-policy-paths",
          status: "reviewed-accepted",
          fields: ["block.timestamp"],
          computeLimitEvidenceRef: "docs/evidence/mainnet-readiness/gas/stage-c-deadline-volatile-compute-limit.json"
        }
      ],
      notes: "source review confirmed deadline-enabled relayer policy paths read block.timestamp and have compute-limit evidence"
    } satisfies MainnetVolatileMetadataReviewEntry
  ],
  blockedUntil: []
};

describe("mainnet gas evidence readiness gate", () => {
  it("accepts complete MegaETH mainnet gas and storage evidence", () => {
    expect(assertMainnetGasEvidenceReady(record)).toBe(record);
  });

  it("rejects draft or blocked records", () => {
    expect(() => assertMainnetGasEvidenceReady({ ...record, status: "draft" })).toThrow(
      "mainnet gas evidence record is still draft"
    );
    expect(() => assertMainnetGasEvidenceReady({ ...record, blockedUntil: ["remote-receipts"] })).toThrow(
      "mainnet gas evidence record cannot have remaining blockers"
    );
  });

  it("rejects the legacy ShieldedPoolDepth20 address as an active Nullark v1.1 gas target", () => {
    const legacyTargetEntries = record.entries.map((entry) => ({
      ...entry,
      target: legacyDepth20Pool,
      contractName: "NullarkPool",
      sourcePath: "contracts/src/NullarkPool.sol"
    }));

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: legacyTargetEntries
      } as MainnetGasEvidenceRecord)
    ).toThrow("mainnet gas evidence active target must not reuse legacy ShieldedPoolDepth20 pool address");
  });

  it("keeps historical blocked drafts from being treated as active legacy targets", () => {
    const historicalEntries = record.entries.map((entry) => ({
      ...entry,
      target: legacyDepth20Pool,
      contractName: "NullarkPool",
      sourcePath: "contracts/src/NullarkPool.sol"
    }));

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        status: "draft",
        entries: historicalEntries,
        blockedUntil: ["historical-depth20-gas-evidence-only"]
      } as MainnetGasEvidenceRecord)
    ).toThrow("mainnet gas evidence record cannot have remaining blockers");
  });

  it("requires exact operation coverage", () => {
    expect(() => assertMainnetGasEvidenceReady({ ...record, entries: record.entries.slice(1) })).toThrow(
      "mainnet gas evidence missing operations: deposit"
    );
    expect(() => assertMainnetGasEvidenceReady({ ...record, entries: [record.entries[0]!, ...record.entries] })).toThrow(
      "mainnet gas evidence contains duplicate operations: deposit"
    );
  });

  it("requires mainnet remote evidence and storage-growth review", () => {
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [{ ...record.entries[0]!, chainId: 6343 }, ...record.entries.slice(1)]
      })
    ).toThrow("mainnet gas evidence entry deposit has mismatched chainId");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [{ ...(record.entries[0]! as MainnetRemoteGasEntry), storageGrowthReviewed: false }, ...record.entries.slice(1)]
      })
    ).toThrow("mainnet gas evidence entry deposit must review MegaETH storage growth");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [{ ...(record.entries[0]! as MainnetRemoteGasEntry), functionSelector: "0x1234" }, ...record.entries.slice(1)]
      })
    ).toThrow("mainnet gas evidence entry deposit must record a function selector");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [{ ...(record.entries[0]! as MainnetRemoteGasEntry), functionSelector: "0x00000000" }, ...record.entries.slice(1)]
      })
    ).toThrow("mainnet gas evidence entry deposit cannot use the zero function selector");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          record.entries[0]!,
          { ...(record.entries[1]! as MainnetRemoteGasEntry), functionSelector: (record.entries[0]! as MainnetRemoteGasEntry).functionSelector },
          ...record.entries.slice(2)
        ]
      })
    ).toThrow("mainnet gas evidence entry privateTransfer must use an allowed selector");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          { ...(record.entries[0]! as MainnetRemoteGasEntry), evidenceKind: "remote-receipt" },
          ...record.entries.slice(1)
        ]
      })
    ).toThrow("mainnet gas evidence receipt entry deposit must record a transaction hash");
  });

  it("keeps real-state blockers explicit and rejects fake state-dependent estimates", () => {
    const blockedPrivateTransfer = {
      operation: "privateTransfer",
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      evidenceKind: "state-blocked",
      evidenceArtifactRef: "docs/evidence/mainnet-readiness/gas/private-transfer-state-blocker.md",
      externalInputRefs: ["docs/evidence/mainnet-readiness/mainnet-required-inputs.md"],
      blockNumber: 120,
      target: pool,
      blockedReason: "mainnet pool has no deposited note state for private transfer proof estimation",
      requiredExternalState: ["funded deposited commitment", "accepted root", "pool-bound Groth16 proof"],
      notes: "blocked honestly until real mainnet state exists"
    } satisfies MainnetStateBlockedEntry;
    const privateTransferIndex = record.entries.findIndex((entry) => entry.operation === "privateTransfer");
    const blockedRecord = {
      ...record,
      entries: [
        ...record.entries.slice(0, privateTransferIndex),
        blockedPrivateTransfer,
        ...record.entries.slice(privateTransferIndex + 1)
      ]
    };

    expect(() => assertMainnetGasEvidenceReady(blockedRecord)).toThrow(
      "mainnet gas evidence has state-blocked operations: privateTransfer"
    );

    const { statePreconditionsVerified: _statePreconditionsVerified, stateReadinessRef: _stateReadinessRef, ...fakeEstimate } =
      record.entries[1]! as MainnetRemoteGasEntry;
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [record.entries[0]!, fakeEstimate, ...record.entries.slice(2)]
      })
    ).toThrow("mainnet gas evidence entry privateTransfer must verify real on-chain state preconditions");
  });

  it("treats near-capacity launch evidence as analytical, not a synthetic mainnet fill", () => {
    const nearCapacity = record.entries.find((entry) => entry.operation === "nearCapacityInsertion") as MainnetCapacityAnalysisEntry;

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "nearCapacityInsertion" ? ({ ...nearCapacity, evidenceKind: "remote-estimate" } as any) : entry
        )
      })
    ).toThrow("mainnet near-capacity insertion must be capacity-analysis evidence");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "nearCapacityInsertion" ? { ...nearCapacity, merkleTreeCapacity: 1_000_000 } : entry
        )
      })
    ).toThrow("mainnet near-capacity insertion must record the exact Merkle tree capacity");
  });

  it("requires distinct evidence artifacts and receipt transaction hashes", () => {
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          record.entries[0]!,
          { ...record.entries[1]!, evidenceArtifactRef: record.entries[0]!.evidenceArtifactRef },
          ...record.entries.slice(2)
        ]
      })
    ).toThrow("mainnet gas evidence entries must use distinct evidence artifacts");

    const firstReceipt = {
      ...(record.entries[0]! as MainnetRemoteGasEntry),
      evidenceKind: "remote-receipt" as const,
      transactionHash: `0x${"1".repeat(64)}` as const
    };
    const secondReceipt = {
      ...(record.entries[1]! as MainnetRemoteGasEntry),
      evidenceKind: "remote-receipt" as const,
      transactionHash: firstReceipt.transactionHash
    };
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [firstReceipt, secondReceipt, ...record.entries.slice(2)]
      })
    ).toThrow("mainnet gas evidence receipt transaction hashes must be unique");
  });

  it("requires operation-specific input artifacts, calldata hashes, and external input refs", () => {
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        externalInputRefs: []
      })
    ).toThrow("mainnet gas evidence record must list external input refs");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          { ...(record.entries[0]! as MainnetRemoteGasEntry), inputArtifactRef: "replace-me" },
          ...record.entries.slice(1)
        ]
      })
    ).toThrow("mainnet gas evidence record requires valid deposit input artifact ref");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          { ...(record.entries[0]! as MainnetRemoteGasEntry), calldataHash: "replace-me" },
          ...record.entries.slice(1)
        ]
      })
    ).toThrow("mainnet gas evidence entry deposit must record calldata hash");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          { ...(record.entries[0]! as MainnetRemoteGasEntry), functionSelector: "0x90a3a042" },
          ...record.entries.slice(1)
        ]
      })
    ).toThrow("mainnet gas evidence entry deposit must use an allowed selector");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          { ...(record.entries[0]! as MainnetRemoteGasEntry), externalInputRefs: [] },
          ...record.entries.slice(1)
        ]
      })
    ).toThrow("mainnet gas evidence entry deposit must list external input refs");
  });

  it("requires reviewed volatile metadata paths instead of a blanket no-usage claim", () => {
    const last = record.entries[record.entries.length - 1]! as MainnetVolatileMetadataReviewEntry;
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          ...record.entries.slice(0, -1),
          {
            ...last,
            volatileMetadataPaths: [
              {
                path: "deadline-enabled-relayer-policy-paths",
                status: "reviewed-accepted",
                fields: ["block.timestamp"]
              }
            ]
          }
        ]
      })
    ).toThrow(
      "mainnet volatile block metadata path deadline-enabled-relayer-policy-paths requires compute-limit evidence"
    );

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          ...record.entries.slice(0, -1),
          {
            ...last,
            volatileMetadataPaths: [
              {
                path: "deadline-enabled-relayer-policy-paths",
                status: "blocked",
                fields: ["block.timestamp"],
                blockedReason: "deadline path compute-limit evidence is not collected"
              }
            ]
          }
        ]
      })
    ).toThrow("mainnet volatile block metadata review has blocked paths: deadline-enabled-relayer-policy-paths");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: [
          ...record.entries.slice(0, -1),
          { ...last, volatileFieldsReviewed: ["block.timestamp", "block.number", "blockhash", "prevrandao", "coinbase"] }
        ]
      })
    ).toThrow("mainnet volatile block metadata review must cover basefee");
  });

  it("requires mainnet gas evidence refs to bind expected packages", () => {
    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-gas-evidence.md"
      })
    ).toThrow("mainnet gas evidence owner approval ref must live under docs/evidence/owner-approval");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        deploymentPackageRef: "private-owner-approval-record-not-in-public-repo"
      })
    ).toThrow("mainnet gas evidence deployment package ref must identify the MegaETH mainnet deployment package");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        sourceVerificationPackageRef: "docs/evidence/mainnet-readiness/security-review.approved.json"
      })
    ).toThrow("mainnet gas evidence source verification package ref must identify the expected evidence package");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        deploymentPackageRef: "docs/evidence/mainnet-readiness/nullark-v1-1-release-candidate-deployment-package.json"
      })
    ).toThrow("mainnet gas evidence deployment package ref cannot reference draft, release-candidate, or mainnet-blocked artifacts");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        sourceVerificationPackageRef: "docs/evidence/mainnet-readiness/source-verification-package.draft.json"
      })
    ).toThrow(
      "mainnet gas evidence source verification package ref cannot reference draft, release-candidate, or mainnet-blocked artifacts"
    );
  });

  it("rejects synthetic Stage C withdrawal evidence bound to draft package refs", () => {
    const stageCRemote = record.entries.find((entry) => entry.operation === "stageCWithdrawal") as MainnetRemoteGasEntry;

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        deploymentPackageRef: "docs/evidence/mainnet-readiness/nullark-v1-1-release-candidate-deployment-package.json",
        sourceVerificationPackageRef: "docs/evidence/mainnet-readiness/source-verification-package.draft.json",
        entries: record.entries.map((entry) => (entry.operation === "stageCWithdrawal" ? stageCRemote : entry))
      })
    ).toThrow("mainnet gas evidence deployment package ref cannot reference draft, release-candidate, or mainnet-blocked artifacts");
  });

  it("keeps Stage C withdrawal selector evidence separate from old withdrawal selectors", () => {
    const stageCRemote = record.entries.find((entry) => entry.operation === "stageCWithdrawal") as MainnetRemoteGasEntry;
    const withdrawalRemote = record.entries.find((entry) => entry.operation === "withdrawal") as MainnetRemoteGasEntry;

    expect(stageCRemote.functionSelector).toBe("0x678d8506");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal" ? { ...stageCRemote, functionSelector: "0xc7787d0f" } : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal must use an allowed selector");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "withdrawal" ? { ...withdrawalRemote, functionSelector: "0x678d8506" } : entry
        )
      })
    ).toThrow("mainnet gas evidence entry withdrawal must use an allowed selector");
  });

  it("requires Stage C withdrawal matrix artifacts before remote evidence can pass", () => {
    const stageCRemote = record.entries.find((entry) => entry.operation === "stageCWithdrawal") as MainnetRemoteGasEntry;
    const { stageCMatrixEvidence: _stageCMatrixEvidence, ...withoutMatrix } = stageCRemote as any;

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) => (entry.operation === "stageCWithdrawal" ? withoutMatrix : entry))
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal must include Stage C matrix evidence");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({
                ...stageCRemote,
                stageCMatrixEvidence: { ...stageCMatrixEvidence, logSizeEvidenceRef: undefined }
              } as any)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal requires valid Stage C log size evidence ref");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({
                ...stageCRemote,
                stageCMatrixEvidence: { ...stageCMatrixEvidence, indexerReplayRef: undefined }
              } as any)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal requires valid Stage C indexer replay ref");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({
                ...stageCRemote,
                stageCMatrixEvidence: { ...stageCMatrixEvidence, txReceiptEvidenceRef: undefined }
              } as any)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal requires valid Stage C transaction receipt evidence ref");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal" ? ({ ...stageCRemote, currentRootAfter: undefined } as any) : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal must record currentRootAfter");
  });

  it("requires Stage C withdrawal to be backed by a real receipt transaction", () => {
    const stageCRemote = record.entries.find((entry) => entry.operation === "stageCWithdrawal") as MainnetRemoteGasEntry;

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({ ...stageCRemote, evidenceKind: "remote-estimate", transactionHash: undefined } as any)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal must use remote receipt evidence");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal" ? ({ ...stageCRemote, transactionHash: undefined } as any) : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal must record a transaction hash");
  });

  it("requires Stage C state blockers to name current-runtime receipt, log, storage, selector, and redaction gates", () => {
    const stageCBlocked = {
      operation: "stageCWithdrawal",
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      evidenceKind: "state-blocked",
      evidenceArtifactRef: "docs/evidence/mainnet-readiness/gas/stage-c-current-runtime-blocker.md",
      externalInputRefs: ["docs/evidence/mainnet-readiness/gas/stage-c-mainnet-gas-log-storage-required-inputs.json"],
      blockNumber: 180,
      target: pool,
      blockedReason: "Stage C current-runtime receipt/log/storage matrix is incomplete",
      requiredExternalState: [
        "single approved current runtime NullarkPool address",
        "selector 0x678d8506 pool-bound proof input",
        "sanitized Stage C transaction receipt evidence",
        "sanitized Stage C transaction logs evidence",
        "variant-specific partial public exit evidence",
        "log-size evidence for encrypted change-note payload",
        "indexer replay evidence for nullifier, withdrawal, root, and change-note logs",
        "storage review with touched slots and new slots",
        "current root and currentRootAfter evidence",
        "secret redaction attestations and sha256 hashes"
      ],
      notes: "blocked honestly until the current-runtime Stage C evidence matrix is complete"
    } satisfies MainnetStateBlockedEntry;

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) => (entry.operation === "stageCWithdrawal" ? stageCBlocked : entry))
      })
    ).toThrow("mainnet gas evidence has state-blocked operations: stageCWithdrawal");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({
                ...stageCBlocked,
                requiredExternalState: stageCBlocked.requiredExternalState.filter((item) => !/receipt/i.test(item))
              } satisfies MainnetStateBlockedEntry)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal state blocker must list transaction receipt requirement");

    expect(() =>
      assertMainnetGasEvidenceReady({
        ...record,
        entries: record.entries.map((entry) =>
          entry.operation === "stageCWithdrawal"
            ? ({
                ...stageCBlocked,
                requiredExternalState: stageCBlocked.requiredExternalState.filter((item) => !/redaction|sha256/i.test(item))
              } satisfies MainnetStateBlockedEntry)
            : entry
        )
      })
    ).toThrow("mainnet gas evidence entry stageCWithdrawal state blocker must list redaction and hashes requirement");
  });
});

const v12OperationSelectors: Record<V12FeeGovernanceGasOperationName, `0x${string}`> = {
  feeDecrease: "0x023b1fc9",
  feeIncreaseSchedule: "0x023b1fc9",
  feeIncreaseExecute: "0x6a922915",
  feeIncreaseCancel: "0x51529e58",
  withdrawalAtChangedFee: "0x678d8506",
  feeSweep: "0x90a3a042"
};

const v12OperationFunctions: Record<V12FeeGovernanceGasOperationName, string> = {
  feeDecrease: "setFeeBps",
  feeIncreaseSchedule: "setFeeBps",
  feeIncreaseExecute: "executePendingFeeBps",
  feeIncreaseCancel: "cancelPendingFeeBps",
  withdrawalAtChangedFee: "stageCWithdrawal",
  feeSweep: "sweepFees"
};

const v12Pool = "0x3333333333333333333333333333333333333333" as const;
const v12FeeController = "0x4444444444444444444444444444444444444444" as const;

function v12RemoteEstimateOperation(operation: V12FeeGovernanceGasOperationName): V12FeeGovernanceRemoteEstimateOperation {
  return {
    operation,
    status: "passed",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    runtime: "nullark-v1.2-fee-governance",
    pool: v12Pool,
    target: v12Pool,
    targetAddressStatus: "final-v1-2-deployment-address",
    functionName: v12OperationFunctions[operation],
    selector: v12OperationSelectors[operation],
    gas: "123456",
    blockNumber: "12345678",
    evidenceRef: `docs/evidence/mainnet-readiness/v1-2/fee-governance-gas-log-storage-${operation}.json`,
    evidenceSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    evidenceKind: "remote-estimate",
    rpcMethod: "eth_estimateGas",
    notBroadcast: true,
    requiresPrivateKey: false,
    requiresFunding: false,
    signingAttempted: false,
    broadcastAttempted: false,
    from: operation === "feeSweep" ? v12FeeController : caller,
    value: "0x0",
    calldataSha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    targetCodeHash: `0x${"c".repeat(64)}`,
    deploymentPackageRef: "docs/evidence/mainnet-readiness/v1-2/deployment-package.approved.json",
    deploymentPackageSha256: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    statePreconditionsRef: `docs/evidence/mainnet-readiness/v1-2/fee-governance-state-preconditions-${operation}.json`,
    statePreconditionsSha256: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  };
}

function v12RemoteEstimateRecord(): V12FeeGovernanceGasEvidenceRecord {
  return {
    schema: "nullark-v1-2-fee-governance-gas-log-storage-v1",
    status: "approved-for-mainnet",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    environment: "megaeth-mainnet",
    mainnet4326Blocked: false,
    operations: Object.fromEntries(
      V12_FEE_GOVERNANCE_GAS_OPERATIONS.map((operation) => [operation, v12RemoteEstimateOperation(operation)])
    ) as V12FeeGovernanceGasEvidenceRecord["operations"]
  };
}

describe("Nullark v1.2 fee-governance gas estimate evidence schema", () => {
  it("accepts non-broadcast eth_estimateGas evidence only after final v1.2 targets are bound", () => {
    const estimateRecord = v12RemoteEstimateRecord();

    expect(assertV12FeeGovernanceGasEvidenceReady(estimateRecord)).toBe(estimateRecord);
    expect(v12FeeGovernanceGasEvidenceBlockers(estimateRecord)).toEqual([]);
  });

  it("keeps non-broadcast estimate templates blocked until real target addresses exist", () => {
    const estimateRecord = v12RemoteEstimateRecord();
    const pendingTemplate = {
      ...estimateRecord,
      status: "blocked-template",
      mainnet4326Blocked: true,
      operations: Object.fromEntries(
        V12_FEE_GOVERNANCE_GAS_OPERATIONS.map((operation) => [
          operation,
          {
            ...v12RemoteEstimateOperation(operation),
            target: "0x0000000000000000000000000000000000000012",
            targetAddressStatus: "pending-v1-2-deployment-address"
          }
        ])
      )
    } as unknown as V12FeeGovernanceGasEvidenceRecord;

    expect(v12FeeGovernanceGasEvidenceBlockers(pendingTemplate)).toContain(
      "feeDecrease target address must be final before remote estimate evidence can satisfy the lane"
    );
    expect(() => assertV12FeeGovernanceGasEvidenceReady(pendingTemplate)).toThrow(
      "feeDecrease target address must be final before remote estimate evidence can satisfy the lane"
    );
  });

  it("rejects estimates that imply signing, funding, broadcast, full calldata, or receipts", () => {
    const estimateRecord = v12RemoteEstimateRecord();
    const feeDecreaseEstimate = estimateRecord.operations.feeDecrease as V12FeeGovernanceRemoteEstimateOperation;

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeDecrease: {
            ...feeDecreaseEstimate,
            notBroadcast: false as true,
            requiresPrivateKey: true as false,
            txHash: `0x${"1".repeat(64)}` as never
          }
        }
      })
    ).toThrow("feeDecrease remote estimate must prove no signing, broadcast, private key, or funding was used");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeDecrease: {
            ...feeDecreaseEstimate,
            calldataSha256: "0x1234"
          }
        }
      })
    ).toThrow("feeDecrease remote estimate must include calldataSha256 instead of full calldata");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeDecrease: {
            ...feeDecreaseEstimate,
            value: "0x1"
          }
        }
      })
    ).toThrow("feeDecrease remote estimate must use zero value");
  });

  it("requires receipts and owner-accepted substitutes to stay explicit and non-authorizing", () => {
    const estimateRecord = v12RemoteEstimateRecord();

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeSweep: {
            ...estimateRecord.operations.feeSweep,
            evidenceKind: "remote-receipt",
            txHash: undefined,
            broadcastApprovalRef: "docs/evidence/mainnet-readiness/v1-2/broadcast-approval.json",
            broadcastApprovalSha256: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            approvesDeployment: false,
            approvesSigning: false,
            approvesFunding: false
          } as any
        }
      })
    ).toThrow("feeSweep remote receipt must include a transaction hash");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeSweep: {
            ...estimateRecord.operations.feeSweep,
            evidenceKind: "remote-receipt",
            txHash: `0x${"1".repeat(64)}`,
            broadcastApprovalRef: "docs/evidence/mainnet-readiness/v1-2/broadcast-approval.json",
            broadcastApprovalSha256: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            approvesDeployment: false,
            approvesSigning: true,
            approvesFunding: false
          } as any
        }
      })
    ).toThrow("feeSweep remote receipt must not approve deployment, signing, or funding");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeSweep: {
            ...estimateRecord.operations.feeSweep,
            evidenceKind: "owner-accepted-substitute",
            ownerAcceptedSubstituteRef: "docs/evidence/mainnet-readiness/v1-2/fee-governance-owner-substitute.json",
            ownerAcceptedSubstituteSha256: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
            substituteReason: "owner accepts local gas/log/storage substitute until remote receipt is unavailable",
            approvesDeployment: false,
            approvesSigning: true,
            approvesFunding: false
          } as any
        }
      })
    ).toThrow("feeSweep owner-accepted substitute must not approve deployment, signing, or funding");
  });

  it("rejects accidental reuse of the current v1.1 pool as v1.2 estimate evidence", () => {
    const estimateRecord = v12RemoteEstimateRecord();

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          withdrawalAtChangedFee: {
            ...estimateRecord.operations.withdrawalAtChangedFee,
            pool: CURRENT_V1_1_NULLARK_POOL_ADDRESS,
            target: CURRENT_V1_1_NULLARK_POOL_ADDRESS
          }
        }
      })
    ).toThrow("withdrawalAtChangedFee pool must be a non-v1.1 v1.2 pool address");
  });

  it("rejects wrong v1.2 schema chain rpc or missing operation lanes", () => {
    const estimateRecord = v12RemoteEstimateRecord();
    const { feeSweep: _feeSweep, ...missingFeeSweep } = estimateRecord.operations;

    expect(v12FeeGovernanceGasEvidenceBlockers({ ...estimateRecord, schema: "wrong-schema" as any })).toContain(
      "record schema must be nullark-v1-2-fee-governance-gas-log-storage-v1"
    );
    expect(v12FeeGovernanceGasEvidenceBlockers({ ...estimateRecord, chainId: 6343 })).toContain(
      "record must target MegaETH mainnet 4326 with the exact RPC"
    );
    expect(v12FeeGovernanceGasEvidenceBlockers({ ...estimateRecord, rpcUrl: "https://carrot.megaeth.com/rpc" })).toContain(
      "record must target MegaETH mainnet 4326 with the exact RPC"
    );
    expect(v12FeeGovernanceGasEvidenceBlockers({ ...estimateRecord, operations: missingFeeSweep as any })).toContain(
      "feeSweep operation is missing"
    );
  });

  it("rejects stale runtime labels, malformed selectors, wrong function selectors, and nonfinal substitute references", () => {
    const estimateRecord = v12RemoteEstimateRecord();

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeDecrease: {
            ...estimateRecord.operations.feeDecrease,
            runtime: "nullark-v1.1-static-fee"
          }
        }
      })
    ).toThrow("feeDecrease operation must bind a v1.2 runtime label");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeIncreaseExecute: {
            ...estimateRecord.operations.feeIncreaseExecute,
            selector: "0x1234"
          }
        }
      })
    ).toThrow("feeIncreaseExecute selector must be bytes4");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeIncreaseExecute: {
            ...estimateRecord.operations.feeIncreaseExecute,
            selector: "0x023b1fc9"
          }
        }
      })
    ).toThrow("feeIncreaseExecute selector must match executePendingFeeBps");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeIncreaseCancel: {
            ...estimateRecord.operations.feeIncreaseCancel,
            functionName: "setFeeBps"
          }
        }
      })
    ).toThrow("feeIncreaseCancel functionName must be cancelPendingFeeBps");

    expect(() =>
      assertV12FeeGovernanceGasEvidenceReady({
        ...estimateRecord,
        operations: {
          ...estimateRecord.operations,
          feeSweep: {
            ...estimateRecord.operations.feeSweep,
            evidenceKind: "owner-accepted-substitute",
            ownerAcceptedSubstituteRef: "docs/evidence/mainnet-readiness/v1-2/draft-fee-governance-owner-substitute.json",
            ownerAcceptedSubstituteSha256: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
            substituteReason: "owner accepts a substitute while remote evidence remains unavailable",
            approvesDeployment: false,
            approvesSigning: false,
            approvesFunding: false
          } as any
        }
      })
    ).toThrow("feeSweep owner-accepted substitute must bind final repo-local substitute evidence");
  });
});
