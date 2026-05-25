export const MAINNET_GAS_EVIDENCE_CHAIN_ID = 4326;
export const MAINNET_GAS_EVIDENCE_RPC = "https://mainnet.megaeth.com/rpc";
export const LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL_ADDRESS = "0x54af9d54b4edD062daD5581670E9E5f73048c87b";
export const CURRENT_V1_1_NULLARK_POOL_ADDRESS = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";

export const MAINNET_GAS_EVIDENCE_OPERATIONS = [
  "deposit",
  "privateTransfer",
  "withdrawal",
  "stageCWithdrawal",
  "feeSweep",
  "pauseDeposits",
  "pauseWithdrawals",
  "worstCaseRootScan",
  "nearCapacityInsertion",
  "volatileBlockMetadataReview"
] as const;

export type MainnetGasEvidenceOperation = (typeof MAINNET_GAS_EVIDENCE_OPERATIONS)[number];
export type MainnetRemoteGasOperation = Exclude<
  MainnetGasEvidenceOperation,
  "nearCapacityInsertion" | "volatileBlockMetadataReview"
>;
export type MainnetStateDependentGasOperation = "privateTransfer" | "withdrawal" | "stageCWithdrawal" | "feeSweep";
export type MainnetGasEvidenceStatus = "draft" | "review-ready" | "approved-for-mainnet";
export type MainnetGasEvidenceKind =
  | "remote-estimate"
  | "remote-receipt"
  | "manual-review"
  | "capacity-analysis"
  | "state-blocked";
export type MainnetGasEvidenceCurrentReadinessRole = "historical-reference-only" | `current-runtime-${string}`;

export type MainnetGasEvidenceRecord = {
  recordVersion: 1;
  status: MainnetGasEvidenceStatus;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  ownerApprovalRef?: string;
  deploymentPackageRef: string;
  sourceVerificationPackageRef: string;
  trustedSetupRecordRef: string;
  externalInputRefs: readonly string[];
  collectedAt: string;
  entries: readonly MainnetGasEvidenceEntry[];
  blockedUntil?: readonly string[];
};

export type MainnetRemoteGasEntry = {
  operation: MainnetRemoteGasOperation;
  chainId: number;
  rpcUrl: string;
  evidenceKind: "remote-estimate" | "remote-receipt";
  evidenceArtifactRef: string;
  inputArtifactRef: string;
  calldataHash: string;
  externalInputRefs: readonly string[];
  functionSelector: `0x${string}`;
  gasUsedOrEstimatedWei: string;
  blockNumber: number;
  target: `0x${string}`;
  from: `0x${string}`;
  currentReadinessRole?: MainnetGasEvidenceCurrentReadinessRole;
  transactionHash?: `0x${string}`;
  statePreconditionsVerified?: boolean;
  stateReadinessRef?: string;
  storageSlotsTouched?: number;
  newStorageSlots?: number;
  storageGrowthReviewed: boolean;
  stageCMatrixEvidence?: MainnetStageCMatrixEvidence;
  stageCVariant?: MainnetStageCWithdrawalVariant;
  stageCLogPayloadSizeBytes?: number;
  currentRootAfter?: `0x${string}`;
  notes: string;
};

export type MainnetStageCWithdrawalVariant = "withdraw_full_public_exit" | "withdraw_partial_public_exit_one_change_note";

export type MainnetStageCMatrixEvidence = {
  requiredInputsRef: string;
  variantEvidenceRef: string;
  logSizeEvidenceRef: string;
  indexerReplayRef: string;
  storageReviewRef: string;
  currentRootEvidenceRef: string;
  volatileMetadataReviewRef: string;
  txReceiptEvidenceRef: string;
  txLogsEvidenceRef: string;
  selectorPathEvidenceRef: string;
  monitoringEvidenceRef: string;
};

export type MainnetStateBlockedEntry = {
  operation: MainnetStateDependentGasOperation;
  chainId: number;
  rpcUrl: string;
  evidenceKind: "state-blocked";
  evidenceArtifactRef: string;
  externalInputRefs: readonly string[];
  blockNumber: number;
  target: `0x${string}`;
  currentReadinessRole?: MainnetGasEvidenceCurrentReadinessRole;
  blockedReason: string;
  requiredExternalState: readonly string[];
  notes: string;
};

export type MainnetCapacityAnalysisEntry = {
  operation: "nearCapacityInsertion";
  chainId: number;
  rpcUrl: string;
  evidenceKind: "capacity-analysis";
  evidenceArtifactRef: string;
  externalInputRefs: readonly string[];
  blockNumber: number;
  target: `0x${string}`;
  currentReadinessRole?: MainnetGasEvidenceCurrentReadinessRole;
  merkleTreeDepth: number;
  merkleTreeCapacity: number;
  currentLeafIndex: number;
  insertionPathReviewed: boolean;
  storageGrowthReviewed: boolean;
  futureBenchmarkRequired: boolean;
  notes: string;
};

export type MainnetVolatileMetadataReviewEntry = {
  operation: "volatileBlockMetadataReview";
  chainId: number;
  rpcUrl: string;
  evidenceKind: "manual-review";
  evidenceArtifactRef: string;
  externalInputRefs: readonly string[];
  blockNumber: number;
  target: `0x${string}`;
  currentReadinessRole?: MainnetGasEvidenceCurrentReadinessRole;
  usesVolatileBlockMetadata: boolean;
  volatileFieldsReviewed: readonly string[];
  volatileMetadataPaths?: readonly MainnetVolatileMetadataPathReview[];
  notes: string;
};

export type MainnetVolatileMetadataPathReview = {
  path: string;
  status: "not-used" | "reviewed-accepted" | "blocked";
  fields: readonly string[];
  computeLimitEvidenceRef?: string;
  blockedReason?: string;
};

export type MainnetGasEvidenceEntry =
  | MainnetRemoteGasEntry
  | MainnetStateBlockedEntry
  | MainnetCapacityAnalysisEntry
  | MainnetVolatileMetadataReviewEntry;

export const V12_FEE_GOVERNANCE_GAS_OPERATIONS = [
  "feeDecrease",
  "feeIncreaseSchedule",
  "feeIncreaseExecute",
  "feeIncreaseCancel",
  "withdrawalAtChangedFee",
  "feeSweep"
] as const;

const V12_FEE_GOVERNANCE_OPERATION_ABI: Record<
  V12FeeGovernanceGasOperationName,
  { functionName: string; selector: `0x${string}` }
> = {
  feeDecrease: { functionName: "setFeeBps", selector: "0x023b1fc9" },
  feeIncreaseSchedule: { functionName: "setFeeBps", selector: "0x023b1fc9" },
  feeIncreaseExecute: { functionName: "executePendingFeeBps", selector: "0x6a922915" },
  feeIncreaseCancel: { functionName: "cancelPendingFeeBps", selector: "0x51529e58" },
  withdrawalAtChangedFee: { functionName: "stageCWithdrawal", selector: "0x678d8506" },
  feeSweep: { functionName: "sweepFees", selector: "0x90a3a042" }
};

export type V12FeeGovernanceGasOperationName = (typeof V12_FEE_GOVERNANCE_GAS_OPERATIONS)[number];
export type V12FeeGovernanceTargetAddressStatus = "pending-v1-2-deployment-address" | "final-v1-2-deployment-address";
export type V12FeeGovernanceEvidenceKind = "remote-estimate" | "remote-receipt" | "owner-accepted-substitute";

export type V12FeeGovernanceGasEvidenceRecord = {
  schema: "nullark-v1-2-fee-governance-gas-log-storage-v1";
  status: string;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-mainnet";
  mainnet4326Blocked: boolean;
  operations: Record<V12FeeGovernanceGasOperationName, V12FeeGovernanceGasOperation>;
};

type V12FeeGovernanceGasOperationBase = {
  operation: V12FeeGovernanceGasOperationName;
  status: "passed";
  chainId: number;
  rpcUrl: string;
  runtime: string;
  pool: `0x${string}`;
  target: `0x${string}`;
  targetAddressStatus: V12FeeGovernanceTargetAddressStatus;
  functionName: string;
  selector: `0x${string}`;
  gas: number | string;
  blockNumber: number | string;
  evidenceRef: string;
  evidenceSha256: string;
};

export type V12FeeGovernanceRemoteEstimateOperation = V12FeeGovernanceGasOperationBase & {
  evidenceKind: "remote-estimate";
  rpcMethod: "eth_estimateGas";
  notBroadcast: true;
  requiresPrivateKey: false;
  requiresFunding: false;
  signingAttempted: false;
  broadcastAttempted: false;
  from: `0x${string}`;
  value: `0x${string}`;
  calldataSha256: string;
  targetCodeHash: `0x${string}`;
  deploymentPackageRef: string;
  deploymentPackageSha256: string;
  statePreconditionsRef: string;
  statePreconditionsSha256: string;
  txHash?: never;
};

export type V12FeeGovernanceRemoteReceiptOperation = V12FeeGovernanceGasOperationBase & {
  evidenceKind: "remote-receipt";
  txHash: `0x${string}`;
  broadcastApprovalRef: string;
  broadcastApprovalSha256: string;
  approvesDeployment: false;
  approvesSigning: false;
  approvesFunding: false;
};

export type V12FeeGovernanceOwnerAcceptedSubstituteOperation = V12FeeGovernanceGasOperationBase & {
  evidenceKind: "owner-accepted-substitute";
  ownerAcceptedSubstituteRef: string;
  ownerAcceptedSubstituteSha256: string;
  substituteReason: string;
  approvesDeployment: false;
  approvesSigning: false;
  approvesFunding: false;
};

export type V12FeeGovernanceGasOperation =
  | V12FeeGovernanceRemoteEstimateOperation
  | V12FeeGovernanceRemoteReceiptOperation
  | V12FeeGovernanceOwnerAcceptedSubstituteOperation;

const REQUIRED_OPERATION_SET = new Set<MainnetGasEvidenceOperation>(MAINNET_GAS_EVIDENCE_OPERATIONS);
const STATE_DEPENDENT_OPERATIONS = new Set<MainnetGasEvidenceOperation>([
  "privateTransfer",
  "withdrawal",
  "stageCWithdrawal",
  "feeSweep"
]);
const STORAGE_HEAVY_OPERATIONS = new Set<MainnetGasEvidenceOperation>([
  "deposit",
  "privateTransfer",
  "stageCWithdrawal",
  "withdrawal",
  "worstCaseRootScan"
]);
const READY_REF_BLOCKLIST = /(draft|release-candidate|mainnet-blocked)/i;
const STAGE_C_LOG_PAYLOAD_SIZES = new Set([0, 32, 256, 1402, 2048]);
const STAGE_C_WITHDRAWAL_VARIANTS = new Set<MainnetStageCWithdrawalVariant>([
  "withdraw_full_public_exit",
  "withdraw_partial_public_exit_one_change_note"
]);

export const MAINNET_GAS_EVIDENCE_OPERATION_REQUIREMENTS: Record<
  MainnetRemoteGasOperation,
  { allowedSelectors: readonly `0x${string}`[]; description: string }
> = {
  deposit: {
    allowedSelectors: ["0xb214faa5", "0xe29973fc"],
    description: "NullarkPool.deposit, with or without encrypted note payload"
  },
  privateTransfer: {
    allowedSelectors: ["0x304bcf7e", "0x6da3fd67"],
    description: "NullarkPool.privateTransfer, with or without encrypted note payload"
  },
  withdrawal: {
    allowedSelectors: ["0x9b0c797c", "0xc7787d0f"],
    description: "NullarkPool.withdraw without change-note payload"
  },
  stageCWithdrawal: {
    allowedSelectors: ["0x678d8506"],
    description: "Nullark Stage C unified withdraw for full or partial exits, with optional encrypted change note"
  },
  feeSweep: {
    allowedSelectors: ["0x90a3a042"],
    description: "NullarkPool.sweepFees"
  },
  pauseDeposits: {
    allowedSelectors: ["0x738b62e5"],
    description: "NullarkPool.pauseDeposits"
  },
  pauseWithdrawals: {
    allowedSelectors: ["0x04d27882"],
    description: "NullarkPool.pauseWithdrawalsForEmergency"
  },
  worstCaseRootScan: {
    allowedSelectors: ["0xbbccdbc4"],
    description: "NullarkPool.isAcceptedRoot against worst-case root-history scan calldata"
  }
};

export function assertMainnetGasEvidenceReady(record: MainnetGasEvidenceRecord): MainnetGasEvidenceRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported mainnet gas evidence record version");
  }
  if (
    record.chainId !== MAINNET_GAS_EVIDENCE_CHAIN_ID ||
    record.rpcUrl !== MAINNET_GAS_EVIDENCE_RPC ||
    record.environment !== "megaeth-mainnet"
  ) {
    throw new Error("mainnet gas evidence record must target MegaETH mainnet 4326");
  }
  assertPromotionPath(record.ownerApprovalRef, "owner approval ref");
  assertPromotionPath(record.deploymentPackageRef, "deployment package ref");
  assertPromotionPath(record.sourceVerificationPackageRef, "source verification package ref");
  assertPromotionPath(record.trustedSetupRecordRef, "trusted setup record ref");
  assertMainnetGasEvidenceRefs(record);
  assertExternalInputRefs(record.externalInputRefs, "record");
  if (!isIsoTimestamp(record.collectedAt)) {
    throw new Error("mainnet gas evidence collectedAt must be an ISO timestamp");
  }

  const missing = missingMainnetGasEvidenceOperations(record);
  if (missing.length > 0) {
    throw new Error(`mainnet gas evidence missing operations: ${missing.join(", ")}`);
  }

  const duplicates = duplicateMainnetGasEvidenceOperations(record);
  if (duplicates.length > 0) {
    throw new Error(`mainnet gas evidence contains duplicate operations: ${duplicates.join(", ")}`);
  }

  const artifactRefs = new Set<string>();
  const receiptTransactionHashes = new Set<string>();
  for (const entry of record.entries) {
    assertMainnetGasEvidenceEntry(entry, record.chainId, record.rpcUrl);
    const entryArtifactRefs = [entry.evidenceArtifactRef];
    if ("inputArtifactRef" in entry) {
      entryArtifactRefs.push(entry.inputArtifactRef);
    }
    for (const artifactRef of entryArtifactRefs) {
      if (artifactRef === undefined) {
        continue;
      }
      const normalizedArtifactRef = artifactRef.toLowerCase();
      if (artifactRefs.has(normalizedArtifactRef)) {
        throw new Error("mainnet gas evidence entries must use distinct evidence artifacts");
      }
      artifactRefs.add(normalizedArtifactRef);
    }
    if ("inputArtifactRef" in entry && entry.evidenceArtifactRef === entry.inputArtifactRef) {
      throw new Error("mainnet gas evidence entries must use distinct evidence artifacts");
    }
    if ("transactionHash" in entry && entry.transactionHash !== undefined) {
      const transactionHash = entry.transactionHash.toLowerCase();
      if (receiptTransactionHashes.has(transactionHash)) {
        throw new Error("mainnet gas evidence receipt transaction hashes must be unique");
      }
      receiptTransactionHashes.add(transactionHash);
    }
  }

  const stateBlocked = record.entries.filter((entry) => entry.evidenceKind === "state-blocked").map((entry) => entry.operation);
  if (stateBlocked.length > 0) {
    throw new Error(`mainnet gas evidence has state-blocked operations: ${stateBlocked.join(", ")}`);
  }
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("mainnet gas evidence record cannot have remaining blockers");
  }
  if (record.status === "draft") {
    throw new Error("mainnet gas evidence record is still draft");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("mainnet gas evidence record must be approved-for-mainnet");
  }
  assertNoLegacyDepth20ActiveTarget(record);

  return record;
}

export function v12FeeGovernanceGasEvidenceBlockers(record: V12FeeGovernanceGasEvidenceRecord): string[] {
  const blockers: string[] = [];

  if (record.schema !== "nullark-v1-2-fee-governance-gas-log-storage-v1") {
    blockers.push("record schema must be nullark-v1-2-fee-governance-gas-log-storage-v1");
  }
  if (
    record.chainId !== MAINNET_GAS_EVIDENCE_CHAIN_ID ||
    record.rpcUrl !== MAINNET_GAS_EVIDENCE_RPC ||
    record.environment !== "megaeth-mainnet"
  ) {
    blockers.push("record must target MegaETH mainnet 4326 with the exact RPC");
  }

  for (const operationName of V12_FEE_GOVERNANCE_GAS_OPERATIONS) {
    const operation = record.operations?.[operationName];
    if (!operation) {
      blockers.push(`${operationName} operation is missing`);
      continue;
    }
    blockers.push(...v12FeeGovernanceOperationBlockers(operationName, operation));
  }

  return blockers;
}

export function assertV12FeeGovernanceGasEvidenceReady(
  record: V12FeeGovernanceGasEvidenceRecord
): V12FeeGovernanceGasEvidenceRecord {
  const blockers = v12FeeGovernanceGasEvidenceBlockers(record);
  if (blockers.length > 0) {
    throw new Error(`v1.2 fee governance gas evidence blocked: ${blockers.join("; ")}`);
  }
  return record;
}

export function missingMainnetGasEvidenceOperations(record: MainnetGasEvidenceRecord): MainnetGasEvidenceOperation[] {
  const observed = new Set(record.entries.map((entry) => entry.operation));
  return MAINNET_GAS_EVIDENCE_OPERATIONS.filter((operation) => !observed.has(operation));
}

export function duplicateMainnetGasEvidenceOperations(record: MainnetGasEvidenceRecord): MainnetGasEvidenceOperation[] {
  const seen = new Set<string>();
  const duplicates = new Set<MainnetGasEvidenceOperation>();

  for (const entry of record.entries) {
    if (seen.has(entry.operation) && REQUIRED_OPERATION_SET.has(entry.operation)) {
      duplicates.add(entry.operation);
    }
    seen.add(entry.operation);
  }

  return MAINNET_GAS_EVIDENCE_OPERATIONS.filter((operation) => duplicates.has(operation));
}

function assertMainnetGasEvidenceEntry(entry: MainnetGasEvidenceEntry, chainId: number, rpcUrl: string): void {
  if (!REQUIRED_OPERATION_SET.has(entry.operation)) {
    throw new Error(`unknown mainnet gas evidence operation: ${entry.operation}`);
  }
  if (entry.chainId !== chainId) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} has mismatched chainId`);
  }
  if (entry.rpcUrl !== rpcUrl) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} has mismatched rpcUrl`);
  }
  if (!Number.isSafeInteger(entry.blockNumber) || entry.blockNumber <= 0) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record a remote block number`);
  }
  if (!isNonZeroAddress(entry.target)) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record a target contract address`);
  }
  if (entry.notes.trim().length === 0) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must include notes`);
  }
  assertPromotionPath(entry.evidenceArtifactRef, `${entry.operation} evidence artifact ref`);
  assertExternalInputRefs(entry.externalInputRefs, `entry ${entry.operation}`);

  if (entry.evidenceKind === "state-blocked") {
    if (!STATE_DEPENDENT_OPERATIONS.has(entry.operation)) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} cannot be state-blocked`);
    }
    if (entry.blockedReason.trim().length === 0) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} must record a blocked reason`);
    }
    if (!Array.isArray(entry.requiredExternalState) || entry.requiredExternalState.length === 0) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} must list required external state`);
    }
    if (entry.requiredExternalState.some((item) => item.trim().length === 0)) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} required external state must be nonempty`);
    }
    if (entry.operation === "stageCWithdrawal") {
      assertStageCWithdrawalBlockedEvidence(entry);
    }
    return;
  }

  if (entry.operation === "nearCapacityInsertion") {
    if (entry.evidenceKind !== "capacity-analysis") {
      throw new Error("mainnet near-capacity insertion must be capacity-analysis evidence");
    }
    if (!Number.isSafeInteger(entry.merkleTreeDepth) || entry.merkleTreeDepth <= 0) {
      throw new Error("mainnet near-capacity insertion must record Merkle tree depth");
    }
    if (!Number.isSafeInteger(entry.merkleTreeCapacity) || entry.merkleTreeCapacity !== 2 ** entry.merkleTreeDepth) {
      throw new Error("mainnet near-capacity insertion must record the exact Merkle tree capacity");
    }
    if (
      !Number.isSafeInteger(entry.currentLeafIndex) ||
      entry.currentLeafIndex < 0 ||
      entry.currentLeafIndex >= entry.merkleTreeCapacity
    ) {
      throw new Error("mainnet near-capacity insertion must record a valid current leaf index");
    }
    if (entry.insertionPathReviewed !== true || entry.storageGrowthReviewed !== true) {
      throw new Error("mainnet near-capacity insertion must review insertion path and storage growth");
    }
    return;
  }

  if (entry.operation === "volatileBlockMetadataReview") {
    if (entry.evidenceKind !== "manual-review") {
      throw new Error("mainnet volatile block metadata review must be manual-review evidence");
    }
    if (!Array.isArray(entry.volatileFieldsReviewed) || entry.volatileFieldsReviewed.length === 0) {
      throw new Error("mainnet volatile block metadata review must list reviewed fields");
    }
    if (entry.volatileFieldsReviewed.some((field) => field.trim().length === 0)) {
      throw new Error("mainnet volatile block metadata review fields must be nonempty");
    }
    for (const field of ["block.timestamp", "block.number", "blockhash", "prevrandao", "coinbase", "basefee"]) {
      if (!hasReviewedVolatileField(entry.volatileFieldsReviewed, field)) {
        throw new Error(`mainnet volatile block metadata review must cover ${field}`);
      }
    }
    assertVolatileMetadataPathReview(entry);
    return;
  }

  if (entry.evidenceKind !== "remote-estimate" && entry.evidenceKind !== "remote-receipt") {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must be remote estimate or receipt evidence`);
  }
  if (entry.operation === "stageCWithdrawal") {
    assertStageCWithdrawalRemoteEvidence(entry);
  }
  if (STATE_DEPENDENT_OPERATIONS.has(entry.operation)) {
    if (entry.statePreconditionsVerified !== true) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} must verify real on-chain state preconditions`);
    }
    assertPromotionPath(entry.stateReadinessRef, `${entry.operation} state readiness ref`);
    if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(entry.stateReadinessRef)) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} state readiness ref must live under evidence docs`);
    }
  }
  if (!/^\d+$/.test(entry.gasUsedOrEstimatedWei) || BigInt(entry.gasUsedOrEstimatedWei) <= 0n) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record positive gas`);
  }
  if (!isNonZeroAddress(entry.from)) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record a from address`);
  }
  if (!/^0x[0-9a-fA-F]{8}$/.test(entry.functionSelector)) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record a function selector`);
  }
  if (entry.functionSelector.toLowerCase() === "0x00000000") {
    throw new Error(`mainnet gas evidence entry ${entry.operation} cannot use the zero function selector`);
  }
  const allowedSelectors = MAINNET_GAS_EVIDENCE_OPERATION_REQUIREMENTS[entry.operation].allowedSelectors.map((selector) =>
    selector.toLowerCase()
  );
  if (!allowedSelectors.includes(entry.functionSelector.toLowerCase())) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must use an allowed selector`);
  }
  assertPromotionPath(entry.inputArtifactRef, `${entry.operation} input artifact ref`);
  if (!/^sha256:[0-9a-f]{64}$/.test(entry.calldataHash)) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must record calldata hash`);
  }
  if (entry.evidenceKind === "remote-receipt" && entry.transactionHash === undefined) {
    throw new Error(`mainnet gas evidence receipt entry ${entry.operation} must record a transaction hash`);
  }
  if (entry.transactionHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(entry.transactionHash)) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} has an invalid transaction hash`);
  }
  if (entry.storageGrowthReviewed !== true) {
    throw new Error(`mainnet gas evidence entry ${entry.operation} must review MegaETH storage growth`);
  }
  if (STORAGE_HEAVY_OPERATIONS.has(entry.operation)) {
    const storageSlotsTouched = entry.storageSlotsTouched;
    const newStorageSlots = entry.newStorageSlots;
    if (!Number.isSafeInteger(storageSlotsTouched) || storageSlotsTouched === undefined || storageSlotsTouched <= 0) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} must record touched storage slots`);
    }
    if (!Number.isSafeInteger(newStorageSlots) || newStorageSlots === undefined || newStorageSlots < 0) {
      throw new Error(`mainnet gas evidence entry ${entry.operation} must record new storage slots`);
    }
  }
}

function assertStageCWithdrawalRemoteEvidence(entry: MainnetRemoteGasEntry): void {
  if (entry.evidenceKind !== "remote-receipt") {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must use remote receipt evidence");
  }
  if (entry.transactionHash === undefined) {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must record a transaction hash");
  }
  if (!entry.stageCMatrixEvidence || typeof entry.stageCMatrixEvidence !== "object") {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must include Stage C matrix evidence");
  }

  const matrix = entry.stageCMatrixEvidence;
  assertStageCEvidenceRef(matrix.requiredInputsRef, "required inputs");
  if (!/stage-c-mainnet-gas-log-storage-required-inputs/i.test(matrix.requiredInputsRef)) {
    throw new Error("mainnet gas evidence entry stageCWithdrawal requires valid Stage C required inputs ref");
  }
  assertStageCEvidenceRef(matrix.variantEvidenceRef, "variant evidence");
  assertStageCEvidenceRef(matrix.logSizeEvidenceRef, "log size evidence");
  assertStageCEvidenceRef(matrix.indexerReplayRef, "indexer replay");
  assertStageCEvidenceRef(matrix.storageReviewRef, "storage review");
  assertStageCEvidenceRef(matrix.currentRootEvidenceRef, "current root evidence");
  assertStageCEvidenceRef(matrix.volatileMetadataReviewRef, "volatile metadata review");
  assertStageCEvidenceRef(matrix.txReceiptEvidenceRef, "transaction receipt evidence");
  assertStageCEvidenceRef(matrix.txLogsEvidenceRef, "transaction logs evidence");
  assertStageCEvidenceRef(matrix.selectorPathEvidenceRef, "selector path evidence");
  assertStageCEvidenceRef(matrix.monitoringEvidenceRef, "monitoring evidence");

  if (!entry.stageCVariant || !STAGE_C_WITHDRAWAL_VARIANTS.has(entry.stageCVariant)) {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must record a Stage C withdrawal variant");
  }
  if (!STAGE_C_LOG_PAYLOAD_SIZES.has(entry.stageCLogPayloadSizeBytes ?? -1)) {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must record a Stage C log payload size");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(entry.currentRootAfter ?? "")) {
    throw new Error("mainnet gas evidence entry stageCWithdrawal must record currentRootAfter");
  }
}

function assertStageCWithdrawalBlockedEvidence(entry: MainnetStateBlockedEntry): void {
  const joinedState = entry.requiredExternalState.join("\n").toLowerCase();
  const requiredTerms = [
    ["current runtime", "current-runtime", "current runtime"],
    ["selector 0x678d8506", "0x678d8506"],
    ["transaction receipt", "receipt"],
    ["transaction logs", "tx logs", "transaction logs", "logs"],
    ["variant", "partial"],
    ["log-size", "log"],
    ["indexer replay", "indexer"],
    ["storage review", "storage"],
    ["current root", "current root", "currentroot"],
    ["redaction and hashes", "redaction", "sha256", "hash"]
  ] as const;

  for (const [label, ...terms] of requiredTerms) {
    if (!terms.some((term) => joinedState.includes(term))) {
      throw new Error(`mainnet gas evidence entry stageCWithdrawal state blocker must list ${label} requirement`);
    }
  }
}

function v12FeeGovernanceOperationBlockers(
  operationName: V12FeeGovernanceGasOperationName,
  operation: V12FeeGovernanceGasOperation
): string[] {
  const blockers: string[] = [];

  if (operation.operation !== operationName) {
    blockers.push(`${operationName} operation must self-identify as ${operationName}`);
  }
  if (operation.status !== "passed") {
    blockers.push(`${operationName} operation status must be passed`);
  }
  if (operation.chainId !== MAINNET_GAS_EVIDENCE_CHAIN_ID || operation.rpcUrl !== MAINNET_GAS_EVIDENCE_RPC) {
    blockers.push(`${operationName} operation must target MegaETH mainnet 4326 with the exact RPC`);
  }
  if (!/v1[.-]2/i.test(operation.runtime) || /v1[.-]1/i.test(operation.runtime)) {
    blockers.push(`${operationName} operation must bind a v1.2 runtime label`);
  }
  if (operation.targetAddressStatus !== "final-v1-2-deployment-address") {
    blockers.push(`${operationName} target address must be final before remote estimate evidence can satisfy the lane`);
  }
  if (!isNonZeroAddress(operation.pool) || operation.pool.toLowerCase() === CURRENT_V1_1_NULLARK_POOL_ADDRESS.toLowerCase()) {
    blockers.push(`${operationName} pool must be a non-v1.1 v1.2 pool address`);
  }
  if (!isNonPlaceholderMainnetTarget(operation.target)) {
    blockers.push(`${operationName} target must be a final non-placeholder v1.2 address`);
  }
  if (!/^0x[0-9a-fA-F]{8}$/.test(operation.selector)) {
    blockers.push(`${operationName} selector must be bytes4`);
  } else if (operation.selector.toLowerCase() !== V12_FEE_GOVERNANCE_OPERATION_ABI[operationName].selector) {
    blockers.push(`${operationName} selector must match ${V12_FEE_GOVERNANCE_OPERATION_ABI[operationName].functionName}`);
  }
  if (operation.functionName !== V12_FEE_GOVERNANCE_OPERATION_ABI[operationName].functionName) {
    blockers.push(`${operationName} functionName must be ${V12_FEE_GOVERNANCE_OPERATION_ABI[operationName].functionName}`);
  }
  if (!isPositiveIntegerLikeValue(operation.gas)) {
    blockers.push(`${operationName} gas must be a positive integer`);
  }
  if (!isPositiveIntegerLikeValue(operation.blockNumber)) {
    blockers.push(`${operationName} blockNumber must be a positive integer`);
  }
  if (!isV12EvidencePath(operation.evidenceRef)) {
    blockers.push(`${operationName} evidenceRef must be a final repo-local v1.2 evidence path`);
  }
  if (!isSha256Like(operation.evidenceSha256)) {
    blockers.push(`${operationName} evidenceSha256 must be sha256-bound`);
  }

  if (operation.evidenceKind === "remote-estimate") {
    blockers.push(...v12RemoteEstimateBlockers(operationName, operation));
  } else if (operation.evidenceKind === "remote-receipt") {
    blockers.push(...v12RemoteReceiptBlockers(operationName, operation));
  } else if (operation.evidenceKind === "owner-accepted-substitute") {
    blockers.push(...v12OwnerAcceptedSubstituteBlockers(operationName, operation));
  } else {
    blockers.push(`${operationName} evidenceKind must be remote-estimate, remote-receipt, or owner-accepted-substitute`);
  }

  return blockers;
}

function v12RemoteEstimateBlockers(
  operationName: V12FeeGovernanceGasOperationName,
  operation: V12FeeGovernanceRemoteEstimateOperation
): string[] {
  const blockers: string[] = [];
  if (operation.rpcMethod !== "eth_estimateGas") {
    blockers.push(`${operationName} remote estimate must record rpcMethod eth_estimateGas`);
  }
  if (
    operation.notBroadcast !== true ||
    operation.requiresPrivateKey !== false ||
    operation.requiresFunding !== false ||
    operation.signingAttempted !== false ||
    operation.broadcastAttempted !== false
  ) {
    blockers.push(`${operationName} remote estimate must prove no signing, broadcast, private key, or funding was used`);
  }
  if ("txHash" in operation && operation.txHash !== undefined) {
    blockers.push(`${operationName} remote estimate must not include a transaction hash`);
  }
  if (!isNonZeroAddress(operation.from)) {
    blockers.push(`${operationName} remote estimate must include a nonzero from address`);
  }
  if (String(operation.value ?? "").toLowerCase() !== "0x0") {
    blockers.push(`${operationName} remote estimate must use zero value`);
  }
  if (!isSha256Like(operation.calldataSha256)) {
    blockers.push(`${operationName} remote estimate must include calldataSha256 instead of full calldata`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(operation.targetCodeHash)) {
    blockers.push(`${operationName} remote estimate must bind target code hash`);
  }
  if (!isV12EvidencePath(operation.deploymentPackageRef)) {
    blockers.push(`${operationName} remote estimate must bind the final v1.2 deployment package ref`);
  }
  if (!isSha256Like(operation.deploymentPackageSha256)) {
    blockers.push(`${operationName} remote estimate must hash-bind the final v1.2 deployment package`);
  }
  if (!isV12EvidencePath(operation.statePreconditionsRef)) {
    blockers.push(`${operationName} remote estimate must bind state preconditions evidence`);
  }
  if (!isSha256Like(operation.statePreconditionsSha256)) {
    blockers.push(`${operationName} remote estimate must hash-bind state preconditions evidence`);
  }
  return blockers;
}

function v12RemoteReceiptBlockers(
  operationName: V12FeeGovernanceGasOperationName,
  operation: V12FeeGovernanceRemoteReceiptOperation
): string[] {
  const blockers: string[] = [];
  if (!/^0x[0-9a-fA-F]{64}$/.test(operation.txHash)) {
    blockers.push(`${operationName} remote receipt must include a transaction hash`);
  }
  if (!isV12EvidencePath(operation.broadcastApprovalRef)) {
    blockers.push(`${operationName} remote receipt must bind explicit broadcast approval evidence`);
  }
  if (!isSha256Like(operation.broadcastApprovalSha256)) {
    blockers.push(`${operationName} remote receipt must hash-bind explicit broadcast approval evidence`);
  }
  if (operation.approvesDeployment !== false || operation.approvesSigning !== false || operation.approvesFunding !== false) {
    blockers.push(`${operationName} remote receipt must not approve deployment, signing, or funding`);
  }
  return blockers;
}

function v12OwnerAcceptedSubstituteBlockers(
  operationName: V12FeeGovernanceGasOperationName,
  operation: V12FeeGovernanceOwnerAcceptedSubstituteOperation
): string[] {
  const blockers: string[] = [];
  if (!isV12EvidencePath(operation.ownerAcceptedSubstituteRef)) {
    blockers.push(`${operationName} owner-accepted substitute must bind final repo-local substitute evidence`);
  }
  if (!isSha256Like(operation.ownerAcceptedSubstituteSha256)) {
    blockers.push(`${operationName} owner-accepted substitute must hash-bind final repo-local substitute evidence`);
  }
  if (!operation.substituteReason || operation.substituteReason.trim().length === 0) {
    blockers.push(`${operationName} owner-accepted substitute must explain why remote evidence is unavailable`);
  }
  if (operation.approvesDeployment !== false || operation.approvesSigning !== false || operation.approvesFunding !== false) {
    blockers.push(`${operationName} owner-accepted substitute must not approve deployment, signing, or funding`);
  }
  return blockers;
}

function assertStageCEvidenceRef(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new Error(`mainnet gas evidence entry stageCWithdrawal requires valid Stage C ${label} ref`);
  }
  assertPromotionPath(value, `stageCWithdrawal Stage C ${label} ref`);
  if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value)) {
    throw new Error(`mainnet gas evidence entry stageCWithdrawal requires valid Stage C ${label} ref`);
  }
}

function assertVolatileMetadataPathReview(entry: MainnetVolatileMetadataReviewEntry): void {
  const pathReviews = entry.volatileMetadataPaths;
  if (!entry.usesVolatileBlockMetadata) {
    return;
  }
  if (!Array.isArray(pathReviews) || pathReviews.length === 0) {
    throw new Error("mainnet volatile block metadata review must list volatile metadata paths");
  }

  const blockedPaths: string[] = [];
  for (const pathReview of pathReviews) {
    if (pathReview.path.trim().length === 0) {
      throw new Error("mainnet volatile block metadata path names must be nonempty");
    }
    if (!["not-used", "reviewed-accepted", "blocked"].includes(pathReview.status)) {
      throw new Error(`mainnet volatile block metadata path ${pathReview.path} has invalid status`);
    }
    if (!Array.isArray(pathReview.fields)) {
      throw new Error(`mainnet volatile block metadata path ${pathReview.path} must list fields`);
    }
    if (pathReview.status !== "not-used" && pathReview.fields.length === 0) {
      throw new Error(`mainnet volatile block metadata path ${pathReview.path} must list fields`);
    }
    for (const field of pathReview.fields) {
      if (!hasReviewedVolatileField(entry.volatileFieldsReviewed, field)) {
        throw new Error(`mainnet volatile block metadata path ${pathReview.path} references unreviewed field ${field}`);
      }
    }
    if (pathReview.status === "reviewed-accepted") {
      if (!pathReview.computeLimitEvidenceRef || pathReview.computeLimitEvidenceRef.trim().length === 0) {
        throw new Error(`mainnet volatile block metadata path ${pathReview.path} requires compute-limit evidence`);
      }
      assertPromotionPath(pathReview.computeLimitEvidenceRef, `${pathReview.path} compute-limit evidence ref`);
      if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(pathReview.computeLimitEvidenceRef)) {
        throw new Error(`mainnet volatile block metadata path ${pathReview.path} requires compute-limit evidence`);
      }
    }
    if (pathReview.status === "blocked") {
      if (!pathReview.blockedReason || pathReview.blockedReason.trim().length === 0) {
        throw new Error(`mainnet volatile block metadata path ${pathReview.path} must record blocked reason`);
      }
      blockedPaths.push(pathReview.path);
    }
  }

  if (blockedPaths.length > 0) {
    throw new Error(`mainnet volatile block metadata review has blocked paths: ${blockedPaths.join(", ")}`);
  }
}

function hasReviewedVolatileField(reviewedFields: readonly string[], requiredField: string): boolean {
  const normalizedRequired = normalizeVolatileField(requiredField);
  return reviewedFields.some((field) => normalizeVolatileField(field) === normalizedRequired);
}

function normalizeVolatileField(field: string): string {
  return field.trim().toLowerCase().replace(/^block\.(prevrandao|coinbase|basefee)$/, "$1");
}

function assertPromotionPath(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(replace-me|placeholder|pending|todo|tbd|dummy|sample|example)/i.test(value)) {
    throw new Error(`mainnet gas evidence record requires valid ${label}`);
  }
  if (READY_REF_BLOCKLIST.test(value)) {
    throw new Error(
      `mainnet gas evidence ${label} cannot reference draft, release-candidate, or mainnet-blocked artifacts: ${value}`
    );
  }
  if (/(local|untrusted|sandbox|\/tmp\/|\.\.)/i.test(value)) {
    throw new Error(`mainnet gas evidence ${label} cannot reference placeholder or local artifacts: ${value}`);
  }
}

function assertExternalInputRefs(values: readonly string[] | undefined, label: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`mainnet gas evidence ${label} must list external input refs`);
  }
  const seen = new Set<string>();
  for (const value of values) {
    assertPromotionPath(value, `${label} external input ref`);
    if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value) && !/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
      throw new Error(`mainnet gas evidence ${label} external input refs must live under evidence docs`);
    }
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`mainnet gas evidence ${label} external input refs must be unique`);
    }
    seen.add(normalized);
  }
}

function assertMainnetGasEvidenceRefs(record: MainnetGasEvidenceRecord): void {
  assertOwnerApprovalRef(record.ownerApprovalRef);
  assertDeploymentPackageRef(record.deploymentPackageRef);
  assertMainnetReadinessRef(record.sourceVerificationPackageRef, "source verification package ref", /source-verification/i);
  assertMainnetReadinessRef(record.trustedSetupRecordRef, "trusted setup record ref", /trusted-setup|verifier-promotion/i);
}

function assertNoLegacyDepth20ActiveTarget(record: MainnetGasEvidenceRecord): void {
  const legacyTarget = LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL_ADDRESS.toLowerCase();
  const legacyOperations = record.entries
    .filter((entry) => entry.target.toLowerCase() === legacyTarget && entry.currentReadinessRole !== "historical-reference-only")
    .map((entry) => entry.operation);

  if (legacyOperations.length > 0) {
    throw new Error(
      `mainnet gas evidence active target must not reuse legacy ShieldedPoolDepth20 pool address ${LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL_ADDRESS}; affected operations: ${legacyOperations.join(", ")}`
    );
  }
}

function assertDeploymentPackageRef(value: string): void {
  if (/^docs\/evidence\/megaeth-mainnet-deployment-package\.json$/i.test(value)) {
    return;
  }
  if (/^docs\/evidence\/mainnet-readiness\/.+/i.test(value) && /deployment-package/i.test(value)) {
    return;
  }
  throw new Error("mainnet gas evidence deployment package ref must identify the MegaETH mainnet deployment package");
}

function assertOwnerApprovalRef(value: string | undefined): void {
  assertPromotionPath(value, "owner approval ref");
  if (!isPrivateOwnerApprovalRef(value) && !/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("mainnet gas evidence owner approval ref must live under docs/evidence/owner-approval");
  }
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertMainnetReadinessRef(value: string, label: string, pattern: RegExp): void {
  if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value)) {
    throw new Error(`mainnet gas evidence ${label} must live under docs/evidence/mainnet-readiness`);
  }
  if (!pattern.test(value)) {
    throw new Error(`mainnet gas evidence ${label} must identify the expected evidence package`);
  }
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function isNonPlaceholderMainnetTarget(value: string): boolean {
  if (!isNonZeroAddress(value)) {
    return false;
  }
  const numeric = BigInt(value);
  return numeric > 255n && value.toLowerCase() !== CURRENT_V1_1_NULLARK_POOL_ADDRESS.toLowerCase();
}

function isV12EvidencePath(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^docs\/evidence\/mainnet-readiness\/v1-2\/.+/i.test(value) &&
    !/(draft|template|intent|placeholder|pending|todo|tbd|\/tmp\/|local|untrusted|sandbox)/i.test(value)
  );
}

function isSha256Like(value: string | undefined): boolean {
  return typeof value === "string" && /^(sha256:)?[0-9a-f]{64}$/.test(value);
}

function isPositiveIntegerLikeValue(value: number | string | undefined): boolean {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0;
  }
  return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function isHexString(value: string | undefined): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /\d{4}-\d{2}-\d{2}T/.test(value);
}
