export const MAINNET_RELAYER_CHAIN_ID = 4326;
export const MAINNET_RELAYER_RPC = "https://mainnet.megaeth.com/rpc";
export const MAINNET_RELAYER_CANONICAL_ENDPOINT = "https://relayer.nullark.com/transaction";
export const MAINNET_RELAYER_ALLOWED_SELECTORS = ["0x678d8506"] as const;
export const MAINNET_RELAYER_FORBIDDEN_SELECTORS = ["0xc7787d0f", "0x7c61e6b1"] as const;
export const MAINNET_RELAYER_FORBIDDEN_POOL_ADDRESSES = ["0x54af9d54b4edD062daD5581670E9E5f73048c87b"] as const;
export const CURRENT_V1_1_RELAYER_POOL = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
export const MAX_MAINNET_RELAYER_HOT_WALLET_BALANCE_WEI = 250000000000000000n;

export type RelayerOpsStatus = "draft" | "review-ready" | "approved-for-mainnet";
export type RelayerRateLimitBackend = "durable-object" | "kv" | "memory";

export type RelayerOpsRecord = {
  recordVersion: 1;
  status: RelayerOpsStatus;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  mainnet4326Blocked: boolean;
  ownerApprovalRef?: string;
  relayers: readonly RelayerWalletRecord[];
  failoverRunbookRef?: string;
  allowedPools: readonly `0x${string}`[];
  allowedSelectors: readonly string[];
  rateLimits: RelayerRateLimits;
  nullifierControls: RelayerNullifierControls;
  nonceManagement: RelayerNonceManagement;
  calldataValidation: RelayerCalldataValidation;
  monitoring: RelayerMonitoring;
  secretSafety: RelayerSecretSafety;
  deploymentBinding: RelayerDeploymentBinding;
  incidentResponseRef: string;
  blockedUntil?: readonly string[];
};

export type RelayerWalletRecord = {
  address: `0x${string}`;
  custodyRef: string;
  maxHotWalletBalanceWei: string;
  fundingRunbookRef: string;
};

export type RelayerRateLimits = {
  stateBackend: RelayerRateLimitBackend;
  windowSeconds: number;
  perIp: number;
  perDestination: number;
  perNullifier: number;
  global: number;
};

export type RelayerNullifierControls = {
  onChainPrecheck: boolean;
  duplicateCalldataIdempotency: boolean;
  duplicateNullifierIdempotency: boolean;
};

export type RelayerNonceManagement = {
  serializedPerRelayer: boolean;
  nonceTooLowRequiresExecutionCheck: boolean;
  replacementRequiresOriginalNotExecuted: boolean;
};

export type RelayerCalldataValidation = {
  decodesSelector: boolean;
  validatesDestination: boolean;
  validatesGrossAmount: boolean;
  validatesFeeBounds: boolean;
  validatesPublicInputLength: boolean;
  validatesChainId: boolean;
  validatesVerifyingContract: boolean;
  validatesSpentCommitment: boolean;
  validatesNoteAmount: boolean;
};

export type RelayerMonitoring = {
  lowBalanceAlert: boolean;
  nonceDriftAlert: boolean;
  failedSubmissionAlert: boolean;
  revertedProofAlert: boolean;
  rpcMismatchAlert: boolean;
};

export type RelayerSecretSafety = {
  cloudflareSecrets: boolean;
  noPlaintextKeysInRepo: boolean;
  noBrowserExposure: boolean;
  rotationRunbookRef: string;
};

export type RelayerDeploymentBinding = {
  workerName: string;
  deploymentUrl: string;
  deployedAt: string;
  chainId: number;
  pool: `0x${string}`;
  verifier: `0x${string}`;
  deploymentPackageRef: string;
  selfTestCommand: string;
  deploymentSelfTestArtifactRef: string;
  deploymentSelfTestHash: string;
  cloudflareBindings: RelayerCloudflareBindings;
};

export type RelayerCloudflareBindings = {
  idempotencyKvBindingName: "RELAYER_IDEMPOTENCY_KV";
  idempotencyKvNamespaceId: string;
  rateLimitKvBindingName: "RELAYER_RATE_LIMIT_KV";
  rateLimitKvNamespaceId: string;
  nonceQueueBindingName: "RELAYER_NONCE_QUEUE";
};

export type V12RelayerRuntimePolicyRecord = {
  schema: "nullark-v1-2-relayer-runtime-policy-v1";
  productVersion: "nullark-v1.2-fee-governance";
  lane: "relayer-runtime-policy";
  status: "draft" | "review-ready" | "blocked-pre-readiness" | "approved-for-mainnet";
  chainId: number;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  rpcUrl: string;
  mainnet4326Blocked: boolean;
  ownerApprovalRef?: string;
  ownerApprovalSha256?: string | null;
  currentV1_1ApprovalRef: V12RelayerV11ApprovalRef;
  v1_1Preservation: V12RelayerV11Preservation;
  noV1_1ApprovalReuse: boolean;
  approvesDeployment: boolean;
  approvesSigning: boolean;
  approvesFunding: boolean;
  approvesRelayerEnablement: boolean;
  approvesGuardedUsers: boolean;
  approvesPrivacyClaims: boolean;
  evidenceRefs: readonly V12EvidenceRef[];
  feeSource: "on-chain-feeBps" | string;
  allowedPool: `0x${string}` | null;
  allowedSelector: string;
  allowedRuntime: string;
  transactionPolicy: V12RelayerTransactionPolicy;
  fundingPolicy: V12RelayerFundingPolicy;
  monitoringEvidence?: V12RelayerMonitoringEvidence;
  staleFeeRejection: V12RelayerCheckEvidence;
  pendingFeeBeforeActivationRejection: V12RelayerCheckEvidence;
  maxFeeAmountEnforced: V12RelayerCheckEvidence;
  minNetAmountEnforced: V12RelayerCheckEvidence;
  doesNotBroadenV1_1RelayerApproval: boolean;
  productionRelayerEnabled?: boolean;
  relayersEnabled?: boolean;
  blockedUntil?: readonly string[];
};

export type V12RelayerV11ApprovalRef = {
  publicRuntimeRef: string;
  pool: `0x${string}`;
  withdrawSelector: string;
};

export type V12RelayerV11Preservation = {
  currentRuntimeUnchanged: boolean;
  withdrawalsPreserved: boolean;
  doesNotApproveV1_2: boolean;
};

export type V12EvidenceRef = {
  label: string;
  path: string;
  sha256: string;
};

export type V12RelayerMonitoringEvidence = {
  monitoringRecordRef: string;
  alertDestinationTestRef: string;
  requiredAlerts: readonly string[];
  allAlertsEnabled: boolean;
  rpcMismatchAlertEnabled: boolean;
  selectorPolicyDriftAlertEnabled: boolean;
};

export type V12RelayerTransactionPolicy = {
  allowedPools: readonly `0x${string}`[];
  allowedSelectors: readonly string[];
  chainId: number;
  rpcUrl: string;
  arbitraryCalldataRejected: boolean;
  valueBearingTransactionsRejected: boolean;
  deployerFallbackRejected: boolean;
  blindNonceRetryRejected: boolean;
  unboundedTokenApprovalsRejected: boolean;
  headlessSigningDisabled: boolean;
};

export type V12RelayerFundingPolicy = {
  fundingDisabled: boolean;
  maxHotWalletBalanceWei: string;
  finalFundingApprovalRef?: string | null;
  finalFundingApprovalSha256?: string | null;
};

export type V12RelayerCheckEvidence = {
  status: "passed" | string;
  evidenceRef: string;
  evidenceSha256: string;
};

export function assertRelayerOpsReady(record: RelayerOpsRecord): RelayerOpsRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported relayer ops record version");
  }
  if (record.status === "draft") {
    throw new Error("relayer ops record is still draft");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("relayer ops record must be approved-for-mainnet");
  }
  if (record.chainId !== MAINNET_RELAYER_CHAIN_ID || record.rpcUrl !== MAINNET_RELAYER_RPC || record.environment !== "megaeth-mainnet") {
    throw new Error("relayer ops record must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked) {
    throw new Error("relayer ops record must unblock MegaETH mainnet 4326");
  }
  assertOwnerApprovalRef(record.ownerApprovalRef);
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("relayer ops record cannot have remaining blockers");
  }

  assertRelayerWallets(record);
  assertAllowedPolicy(record);
  assertRateLimits(record.rateLimits);
  assertNullifierControls(record.nullifierControls);
  assertAllTrue(record.nonceManagement, "nonce management");
  assertAllTrue(record.calldataValidation, "calldata validation");
  assertAllTrue(record.monitoring, "monitoring");
  assertSecretSafety(record.secretSafety);
  assertDeploymentBinding(record.deploymentBinding, record.allowedPools);
  assertPromotionPath(record.incidentResponseRef, "incident response ref");

  return record;
}

export function assertV12RelayerRuntimePolicyReady(record: V12RelayerRuntimePolicyRecord): V12RelayerRuntimePolicyRecord {
  if (
    (record.mainnet4326Blocked || (record.blockedUntil ?? []).length > 0) &&
    (record.productionRelayerEnabled === true || record.relayersEnabled === true || record.approvesRelayerEnablement === true)
  ) {
    throw new Error("v1.2 relayer runtime policy cannot enable production relayers while upstream gates are blocked");
  }
  if (
    record.schema !== "nullark-v1-2-relayer-runtime-policy-v1" ||
    record.productVersion !== "nullark-v1.2-fee-governance" ||
    record.lane !== "relayer-runtime-policy"
  ) {
    throw new Error("v1.2 relayer runtime policy must use the relayer-runtime-policy schema");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("v1.2 relayer runtime policy must be approved-for-mainnet before ready validation");
  }
  if (record.chainId !== MAINNET_RELAYER_CHAIN_ID || record.rpcUrl !== MAINNET_RELAYER_RPC || record.environment !== "megaeth-mainnet") {
    throw new Error("v1.2 relayer runtime policy must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked || (record.blockedUntil ?? []).length > 0) {
    throw new Error("v1.2 relayer runtime policy cannot have remaining upstream blockers");
  }
  assertV12OwnerApproval(record.ownerApprovalRef, record.ownerApprovalSha256);
  assertV12V11Preservation(record);
  assertV12NonAuthorizingFlags(record);
  assertV12EvidenceRefs(record.evidenceRefs);
  if (record.feeSource !== "on-chain-feeBps") {
    throw new Error("v1.2 relayer runtime policy must use on-chain-feeBps as the fee source");
  }
  assertV12AllowedPool(record.allowedPool);
  assertV12AllowedSelector(record.allowedSelector);
  if (!/v1[.-]2/i.test(record.allowedRuntime) || /v1[.-]1/i.test(record.allowedRuntime)) {
    throw new Error("v1.2 relayer runtime policy must bind an explicit v1.2 runtime label");
  }
  if (/testnet|sandbox|local|dev/i.test(record.allowedRuntime)) {
    throw new Error("v1.2 relayer runtime policy must bind an explicit mainnet v1.2 runtime label");
  }
  assertV12TransactionPolicy(record);
  assertV12FundingPolicy(record.fundingPolicy);
  assertV12MonitoringEvidence(record.monitoringEvidence);
  assertV12PassedEvidence(
    record.staleFeeRejection,
    "stale fee rejection",
    /stale[-_]fee/i,
    "stale-fee rejection evidence"
  );
  assertV12PassedEvidence(
    record.pendingFeeBeforeActivationRejection,
    "pending fee before activation rejection",
    /(pending[-_]fee[-_].*activation|preactivation[-_]fee)/i,
    "pending fee before activation evidence"
  );
  assertV12PassedEvidence(
    record.maxFeeAmountEnforced,
    "maxFeeAmount enforcement",
    /(?:max[-_]fee.*user[-_]bound|user[-_]bound.*max[-_]fee)/i,
    "user-bound evidence"
  );
  assertV12PassedEvidence(
    record.minNetAmountEnforced,
    "minNetAmount enforcement",
    /(?:min[-_]net.*user[-_]bound|user[-_]bound.*min[-_]net)/i,
    "user-bound evidence"
  );
  if (record.doesNotBroadenV1_1RelayerApproval !== true) {
    throw new Error("v1.2 relayer runtime policy must prove it does not broaden the v1.1 relayer approval");
  }

  return record;
}

function assertRelayerWallets(record: RelayerOpsRecord): void {
  if (!Array.isArray(record.relayers) || record.relayers.length === 0) {
    throw new Error("relayer ops record requires at least one relayer wallet");
  }
  if (record.relayers.length < 2 && !isNonPlaceholder(record.failoverRunbookRef)) {
    throw new Error("relayer ops record requires multiple relayers or a failover runbook");
  }

  const seen = new Set<string>();
  for (const [index, relayer] of record.relayers.entries()) {
    if (!isNonZeroAddress(relayer.address)) {
      throw new Error(`relayer ops record requires nonzero relayer[${index}] address`);
    }
    assertNotObviousPlaceholderAddress(relayer.address, `relayer[${index}] address`);
    const normalized = relayer.address.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error("relayer ops record relayer addresses must be unique");
    }
    seen.add(normalized);
    assertPromotionPath(relayer.custodyRef, `relayer[${index}] custody ref`);
    assertPromotionPath(relayer.fundingRunbookRef, `relayer[${index}] funding runbook ref`);
    if (!/^\d+$/.test(relayer.maxHotWalletBalanceWei) || BigInt(relayer.maxHotWalletBalanceWei) <= 0n) {
      throw new Error(`relayer ops record relayer[${index}] max hot wallet balance must be positive wei`);
    }
    if (BigInt(relayer.maxHotWalletBalanceWei) > MAX_MAINNET_RELAYER_HOT_WALLET_BALANCE_WEI) {
      throw new Error(`relayer ops record relayer[${index}] max hot wallet balance exceeds mainnet gas-float cap`);
    }
  }
}

function assertAllowedPolicy(record: RelayerOpsRecord): void {
  if (record.allowedPools.length === 0 || record.allowedPools.some((pool) => !isNonZeroAddress(pool))) {
    throw new Error("relayer ops record requires nonzero allowed pool addresses");
  }
  for (const [index, pool] of record.allowedPools.entries()) {
    assertNotObviousPlaceholderAddress(pool, `allowed pool[${index}]`);
    assertNotForbiddenPoolAddress(pool, `allowed pool[${index}]`);
  }
  if (new Set(record.allowedPools.map((pool) => pool.toLowerCase())).size !== record.allowedPools.length) {
    throw new Error("relayer ops record allowed pool addresses must be unique");
  }
  const normalizedSelectors = record.allowedSelectors.map((selector) => selector.toLowerCase());
  const forbiddenSelectors = new Set(MAINNET_RELAYER_FORBIDDEN_SELECTORS);
  for (const selector of normalizedSelectors) {
    if (forbiddenSelectors.has(selector as (typeof MAINNET_RELAYER_FORBIDDEN_SELECTORS)[number])) {
      throw new Error(`relayer ops record cannot approve stale or forbidden production selector ${selector}`);
    }
  }
  if (normalizedSelectors.join("|") !== MAINNET_RELAYER_ALLOWED_SELECTORS.join("|")) {
    throw new Error("relayer ops record allowed selectors must equal bounded mainnet withdrawal selectors");
  }
}

function assertRateLimits(rateLimits: RelayerRateLimits): void {
  if (rateLimits.stateBackend !== "durable-object" && rateLimits.stateBackend !== "kv") {
    throw new Error("relayer ops record rate limit state must be durable-object or kv");
  }
  for (const key of ["windowSeconds", "perIp", "perDestination", "perNullifier", "global"] as const) {
    if (!Number.isSafeInteger(rateLimits[key]) || rateLimits[key] <= 0) {
      throw new Error(`relayer ops record rateLimits.${key} must be positive`);
    }
  }
}

function assertNullifierControls(controls: RelayerNullifierControls): void {
  if (!controls.onChainPrecheck || !controls.duplicateCalldataIdempotency || !controls.duplicateNullifierIdempotency) {
    throw new Error("relayer ops record must enforce nullifier precheck and duplicate idempotency");
  }
}

function assertV12OwnerApproval(ownerApprovalRef: string | undefined, ownerApprovalSha256: string | null | undefined): void {
  assertV12PromotionPath(ownerApprovalRef, "owner approval ref");
  if (!isPrivateOwnerApprovalRef(ownerApprovalRef) && !/^evidence\/owner-approval\/.+v1-?2.+/i.test(ownerApprovalRef)) {
    throw new Error("v1.2 relayer runtime policy owner approval ref must live under evidence/owner-approval and identify v1.2");
  }
  assertV12Hash(ownerApprovalSha256, "owner approval sha256");
}

function assertV12V11Preservation(record: V12RelayerRuntimePolicyRecord): void {
  const current = record.currentV1_1ApprovalRef;
  if (
    current.publicRuntimeRef !== "public-artifacts/current.json" ||
    current.pool.toLowerCase() !== CURRENT_V1_1_RELAYER_POOL.toLowerCase() ||
    current.withdrawSelector.toLowerCase() !== MAINNET_RELAYER_ALLOWED_SELECTORS[0]
  ) {
    throw new Error("v1.2 relayer runtime policy must bind current v1.1 pool allowlist context");
  }
  if (
    record.v1_1Preservation.currentRuntimeUnchanged !== true ||
    record.v1_1Preservation.withdrawalsPreserved !== true ||
    record.v1_1Preservation.doesNotApproveV1_2 !== true ||
    record.noV1_1ApprovalReuse !== true
  ) {
    throw new Error("v1.2 relayer runtime policy must preserve v1.1 without approving v1.2");
  }
}

function assertV12NonAuthorizingFlags(record: V12RelayerRuntimePolicyRecord): void {
  if (
    record.approvesGuardedUsers === true ||
    record.approvesPrivacyClaims === true ||
    record.approvesDeployment === true ||
    record.approvesSigning === true ||
    record.approvesFunding === true ||
    record.approvesRelayerEnablement === true ||
    record.productionRelayerEnabled === true ||
    record.relayersEnabled === true
  ) {
    if (record.approvesGuardedUsers === true || record.approvesPrivacyClaims === true) {
      throw new Error("v1.2 relayer runtime policy must not approve guarded users or production privacy claims");
    }
    throw new Error("v1.2 relayer runtime policy must not approve deployment, signing, funding, or relayer enablement");
  }
}

function assertV12AllowedPool(pool: `0x${string}` | null): void {
  if (pool === null || !isNonZeroAddress(pool)) {
    throw new Error("v1.2 relayer runtime policy must allowlist a distinct v1.2 pool");
  }
  if (pool.toLowerCase() === CURRENT_V1_1_RELAYER_POOL.toLowerCase()) {
    throw new Error("v1.2 relayer runtime policy must allowlist a distinct v1.2 pool, not the current v1.1 pool");
  }
  if (isObviousPlaceholderAddress(pool)) {
    throw new Error("v1.2 relayer runtime policy allowedPool cannot be an obvious placeholder address");
  }
  if (MAINNET_RELAYER_FORBIDDEN_POOL_ADDRESSES.map((address) => address.toLowerCase()).includes(pool.toLowerCase())) {
    throw new Error("v1.2 relayer runtime policy allowedPool cannot approve legacy ShieldedPoolDepth20 pool address");
  }
}

function assertV12AllowedSelector(selector: string): void {
  if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
    throw new Error("v1.2 relayer runtime policy must allowlist an exact 4-byte withdrawal selector");
  }
  if (selector.toLowerCase() === "0x12345678") {
    throw new Error("v1.2 relayer runtime policy cannot use placeholder selector 0x12345678");
  }
  if (selector.toLowerCase() !== MAINNET_RELAYER_ALLOWED_SELECTORS[0]) {
    throw new Error("v1.2 relayer runtime policy must allowlist the exact bounded withdrawal selector");
  }
}

function assertV12TransactionPolicy(record: V12RelayerRuntimePolicyRecord): void {
  const policy = record.transactionPolicy;
  if (!policy) {
    throw new Error("v1.2 relayer runtime policy must include a transaction policy");
  }
  if (policy.arbitraryCalldataRejected !== true) {
    throw new Error("v1.2 relayer runtime policy must reject arbitrary calldata");
  }
  if (policy.valueBearingTransactionsRejected !== true) {
    throw new Error("v1.2 relayer runtime policy must reject value-bearing transactions");
  }
  if (policy.deployerFallbackRejected !== true) {
    throw new Error("v1.2 relayer runtime policy must reject deployer fallback execution");
  }
  if (policy.blindNonceRetryRejected !== true) {
    throw new Error("v1.2 relayer runtime policy must reject blind nonce retry");
  }
  if (policy.unboundedTokenApprovalsRejected !== true) {
    throw new Error("v1.2 relayer runtime policy must reject unbounded token approvals");
  }
  if (policy.headlessSigningDisabled !== true) {
    throw new Error("v1.2 relayer runtime policy must keep headless signing disabled");
  }
  const policyPools = policy.allowedPools.map((pool) => pool.toLowerCase());
  if (policyPools.length !== 1 || policyPools[0] !== record.allowedPool?.toLowerCase()) {
    throw new Error("v1.2 relayer runtime policy transaction policy must bind the v1.2 allowed pool");
  }
  const policySelectors = policy.allowedSelectors.map((selector) => selector.toLowerCase());
  if (policySelectors.length !== 1 || policySelectors[0] !== record.allowedSelector.toLowerCase()) {
    throw new Error("v1.2 relayer runtime policy transaction policy must bind only the bounded withdrawal selector");
  }
  if (policy.chainId !== MAINNET_RELAYER_CHAIN_ID || policy.rpcUrl !== MAINNET_RELAYER_RPC) {
    throw new Error("v1.2 relayer runtime policy transaction policy must bind MegaETH mainnet 4326 and RPC");
  }
}

function assertV12FundingPolicy(policy: V12RelayerFundingPolicy): void {
  if (!policy) {
    throw new Error("v1.2 relayer runtime policy must include a funding policy");
  }
  if (!/^\d+$/.test(policy.maxHotWalletBalanceWei)) {
    throw new Error("v1.2 relayer runtime policy funding policy must bind a wei-denominated hot-wallet cap");
  }
  if (policy.fundingDisabled === true) {
    return;
  }
  if (!policy.finalFundingApprovalRef || !policy.finalFundingApprovalSha256) {
    throw new Error("v1.2 relayer runtime policy cannot enable funding without final funding approval evidence");
  }
  assertV12MainnetReadinessPath(policy.finalFundingApprovalRef, "final funding approval ref");
  assertV12Hash(policy.finalFundingApprovalSha256, "final funding approval sha256");
}

function assertV12EvidenceRefs(refs: readonly V12EvidenceRef[]): void {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error("v1.2 relayer runtime policy must include hash-bound evidence refs");
  }
  for (const [index, ref] of refs.entries()) {
    assertV12PromotionPath(ref.label, `evidenceRefs[${index}].label`);
    assertV12MainnetReadinessPath(ref.path, `evidenceRefs[${index}].path`);
    assertV12Hash(ref.sha256, `evidenceRefs[${index}].sha256`);
  }
}

function assertV12MonitoringEvidence(evidence: V12RelayerMonitoringEvidence | undefined): void {
  if (!evidence) {
    throw new Error("v1.2 relayer runtime policy must include monitoring and alert evidence");
  }
  assertV12MainnetReadinessPath(evidence.monitoringRecordRef, "monitoring record ref");
  assertV12MainnetReadinessPath(evidence.alertDestinationTestRef, "alert destination test ref");
  const requiredAlerts = ["lowBalance", "nonceDrift", "failedSubmission", "revertedProof", "rpcMismatch", "selectorPolicyDrift"];
  for (const alert of requiredAlerts) {
    if (!evidence.requiredAlerts.includes(alert)) {
      throw new Error(`v1.2 relayer runtime policy monitoring evidence missing alert: ${alert}`);
    }
  }
  if (evidence.allAlertsEnabled !== true || evidence.rpcMismatchAlertEnabled !== true || evidence.selectorPolicyDriftAlertEnabled !== true) {
    throw new Error("v1.2 relayer runtime policy monitoring evidence must prove required alerts are enabled");
  }
}

function assertV12PassedEvidence(
  evidence: V12RelayerCheckEvidence,
  label: string,
  evidenceRefPattern?: RegExp,
  evidenceRefDescription?: string
): void {
  if (evidence.status !== "passed") {
    throw new Error(`v1.2 relayer runtime policy must prove ${label}`);
  }
  assertV12MainnetReadinessPath(evidence.evidenceRef, `${label} evidence ref`);
  if (evidenceRefPattern && !evidenceRefPattern.test(evidence.evidenceRef)) {
    throw new Error(`v1.2 relayer runtime policy ${label} evidence ref must identify ${evidenceRefDescription}`);
  }
  assertV12Hash(evidence.evidenceSha256, `${label} evidence sha256`);
}

function assertV12MainnetReadinessPath(value: string | undefined, label: string): void {
  assertV12PromotionPath(value, label);
  if (!/^evidence\/mainnet-readiness\/v1-2\/.+/i.test(value)) {
    throw new Error(`v1.2 relayer runtime policy ${label} must live under evidence/mainnet-readiness/v1-2`);
  }
}

function assertV12PromotionPath(value: string | undefined, label: string): asserts value is string {
  if (!isNonPlaceholder(value)) {
    throw new Error(`v1.2 relayer runtime policy requires valid ${label}`);
  }
  if (/(^|[./-])(draft|review-ready|template)([./-]|$)|local|untrusted|sandbox|\/tmp\/|\.\./i.test(value)) {
    throw new Error(`v1.2 relayer runtime policy ${label} cannot reference draft, template, local, or untrusted material`);
  }
}

function assertV12Hash(value: string | null | undefined, label: string): void {
  if (typeof value !== "string" || !/^(sha256:)?[0-9a-f]{64}$/.test(value)) {
    throw new Error(`v1.2 relayer runtime policy requires valid ${label}`);
  }
}

function assertSecretSafety(secretSafety: RelayerSecretSafety): void {
  if (!secretSafety.cloudflareSecrets || !secretSafety.noPlaintextKeysInRepo || !secretSafety.noBrowserExposure) {
    throw new Error("relayer ops record must prove secret safety controls");
  }
  assertPromotionPath(secretSafety.rotationRunbookRef, "secret rotation runbook ref");
}

function assertDeploymentBinding(binding: RelayerDeploymentBinding, allowedPools: readonly `0x${string}`[]): void {
  assertNonPlaceholder(binding.workerName, "deployment worker name");
  if (binding.deploymentUrl !== MAINNET_RELAYER_CANONICAL_ENDPOINT) {
    throw new Error("relayer ops record deployment URL must be the canonical Nullark relayer endpoint");
  }
  if (!isIsoTimestamp(binding.deployedAt)) {
    throw new Error("relayer ops record deployment timestamp must be ISO");
  }
  if (binding.chainId !== MAINNET_RELAYER_CHAIN_ID) {
    throw new Error("relayer ops record deployment binding must target MegaETH mainnet 4326");
  }
  if (!allowedPools.map((pool) => pool.toLowerCase()).includes(binding.pool.toLowerCase())) {
    throw new Error("relayer ops record deployment binding pool must be allowlisted");
  }
  if (!isNonZeroAddress(binding.verifier)) {
    throw new Error("relayer ops record deployment binding verifier must be nonzero");
  }
  assertNotObviousPlaceholderAddress(binding.pool, "deployment binding pool");
  assertNotObviousPlaceholderAddress(binding.verifier, "deployment binding verifier");
  assertNotForbiddenPoolAddress(binding.pool, "deployment binding pool");
  if (binding.pool.toLowerCase() === binding.verifier.toLowerCase()) {
    throw new Error("relayer ops record deployment binding pool and verifier must be distinct");
  }
  assertPromotionPath(binding.deploymentPackageRef, "deployment package ref");
  assertDeploymentSelfTestCommand(binding);
  assertPromotionPath(binding.deploymentSelfTestArtifactRef, "deployment self-test artifact ref");
  assertHash(binding.deploymentSelfTestHash, "deployment self-test hash");
  assertCloudflareBindings(binding.cloudflareBindings);
}

function assertDeploymentSelfTestCommand(binding: RelayerDeploymentBinding): void {
  assertNonPlaceholder(binding.selfTestCommand, "deployment self-test command");
  if (/private_key|mnemonic|cast send|--broadcast|sendrawtransaction|wrangler secret/i.test(binding.selfTestCommand)) {
    throw new Error("relayer ops record deployment self-test command contains signing or secret material");
  }
  if (!/\bnpm\s+run\s+relayer:self-test\s+--(?:\s|$)/.test(binding.selfTestCommand)) {
    throw new Error("relayer ops record deployment self-test command must use npm run relayer:self-test");
  }
  for (const [flag, value] of [
    ["--url", binding.deploymentUrl],
    ["--chain-id", String(MAINNET_RELAYER_CHAIN_ID)],
    ["--pool", binding.pool],
    ["--verifier", binding.verifier]
  ] as const) {
    if (!binding.selfTestCommand.includes(`${flag} ${value}`)) {
      throw new Error(`relayer ops record deployment self-test command must bind ${flag}`);
    }
  }
}

function assertAllTrue(record: Record<string, boolean>, label: string): void {
  for (const [key, value] of Object.entries(record)) {
    if (value !== true) {
      throw new Error(`relayer ops record ${label}.${key} must be true`);
    }
  }
}

function assertOwnerApprovalRef(value: string | undefined): void {
  assertPromotionPath(value, "owner approval ref");
  if (!isPrivateOwnerApprovalRef(value) && !/^evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("relayer ops record owner approval ref must live under evidence/owner-approval");
  }
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertPromotionPath(value: string | undefined, label: string): asserts value is string {
  assertNonPlaceholder(value, label);
  const lower = value.toLowerCase();
  if (/(local|untrusted|sandbox|replace-me|placeholder|pending|todo|tbd|\/tmp\/|\.\.)/.test(lower)) {
    throw new Error(`relayer ops record ${label} cannot reference placeholder or local artifacts`);
  }
  if (/(^|[./-])(draft|review-ready)([./-]|$)/.test(lower)) {
    throw new Error(`relayer ops record ${label} cannot reference draft or review-ready evidence`);
  }
}

function assertCloudflareBindings(bindings: RelayerCloudflareBindings): void {
  if (!bindings || bindings.idempotencyKvBindingName !== "RELAYER_IDEMPOTENCY_KV") {
    throw new Error("relayer ops record requires RELAYER_IDEMPOTENCY_KV binding");
  }
  if (bindings.rateLimitKvBindingName !== "RELAYER_RATE_LIMIT_KV") {
    throw new Error("relayer ops record requires RELAYER_RATE_LIMIT_KV binding");
  }
  if (bindings.nonceQueueBindingName !== "RELAYER_NONCE_QUEUE") {
    throw new Error("relayer ops record requires RELAYER_NONCE_QUEUE Durable Object binding");
  }
  assertCloudflareKvNamespaceId(bindings.idempotencyKvNamespaceId, "RELAYER_IDEMPOTENCY_KV");
  assertCloudflareKvNamespaceId(bindings.rateLimitKvNamespaceId, "RELAYER_RATE_LIMIT_KV");
  if (bindings.idempotencyKvNamespaceId.toLowerCase() === bindings.rateLimitKvNamespaceId.toLowerCase()) {
    throw new Error("relayer ops record Cloudflare KV namespace ids must be distinct");
  }
}

function assertCloudflareKvNamespaceId(value: string, bindingName: string): void {
  if (!/^[0-9a-fA-F]{32}$/.test(value) || !isNonPlaceholder(value)) {
    throw new Error(`relayer ops record requires valid Cloudflare KV namespace id for ${bindingName}`);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`relayer ops record requires valid ${label}`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!isNonPlaceholder(value)) {
    throw new Error(`relayer ops record requires valid ${label}`);
  }
}

function isNonPlaceholder(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/(replace-me|placeholder|pending|todo|tbd|dummy|sample|example)/i.test(value);
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function assertNotObviousPlaceholderAddress(value: `0x${string}`, label: string): void {
  if (isObviousPlaceholderAddress(value)) {
    throw new Error(`relayer ops record ${label} cannot be an obvious placeholder address`);
  }
}

function isObviousPlaceholderAddress(value: `0x${string}`): boolean {
  const hex = value.slice(2).toLowerCase();
  return /^([0-9a-f])\1{39}$/.test(hex);
}

function assertNotForbiddenPoolAddress(value: `0x${string}`, label: string): void {
  const forbiddenPools = new Set(MAINNET_RELAYER_FORBIDDEN_POOL_ADDRESSES.map((address) => address.toLowerCase()));
  if (forbiddenPools.has(value.toLowerCase())) {
    throw new Error(`relayer ops record ${label} cannot approve legacy ShieldedPoolDepth20 pool address`);
  }
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /\d{4}-\d{2}-\d{2}T/.test(value);
}
