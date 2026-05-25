export const MAINNET_RUNTIME_CHAIN_ID = 4326;
export const MAINNET_RUNTIME_RPC = "https://mainnet.megaeth.com/rpc";
export const MAINNET_RUNTIME_RELAYER_ENDPOINT = "https://relayer.nullark.com/transaction";
export const LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL =
  "0x54af9d54b4edD062daD5581670E9E5f73048c87b";
const BLOCKED_READY_MODE_MARKER = /(^|[./-])(draft|review-ready|release-candidate|mainnet-blocked)([./-]|$)/i;

export type MainnetRuntimeConfigStatus = "draft" | "review-ready" | "approved-for-mainnet";

export type MainnetRuntimeConfigRecord = {
  recordVersion: 1;
  status: MainnetRuntimeConfigStatus;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  ownerApprovalRef?: string;
  deploymentPackageRef: string;
  sourceVerificationPackageRef: string;
  proverManifestRef: string;
  relayerOpsRecordRef: string;
  app: MainnetRuntimeAppBinding;
  recovery: MainnetRuntimeRecoveryBinding;
  relayer: MainnetRuntimeRelayerBinding;
  blockedUntil?: readonly string[];
};

export type MainnetRuntimeAppBinding = {
  deploymentUrl: string;
  chainId: number;
  rpcUrl: string;
  poolContractName: "NullarkPool";
  poolSourcePath: "contracts/src/NullarkPool.sol";
  pool: `0x${string}`;
  verifier: `0x${string}`;
  verifierBytecodeHash: `0x${string}`;
  trustedSetupManifestTrustLevel: "trusted-setup-recorded";
  localProofServiceEnabled: false;
  localRelayerEnabled: false;
  walletUnlockSupportsMainnet: true;
};

export type MainnetRuntimeRecoveryBinding = {
  apiUrl: string;
  chainId: number;
  pool: `0x${string}`;
  indexerSupportsMainnet: true;
  differentDeviceRecoveryTestRef: string;
  evidenceMode: "live-mainnet-recovery-indexer-continuity" | "owner-accepted-testnet-recovery-substitute";
  indexerContinuityEvidenceRef: string;
  ownerAcceptanceRef?: string;
};

export type MainnetRuntimeRelayerBinding = {
  endpoint: string;
  chainId: number;
  pool: `0x${string}`;
  boundedSelectorsOnly: true;
  deploymentSelfTestRef: string;
};

export function assertMainnetRuntimeConfigReady(record: MainnetRuntimeConfigRecord): MainnetRuntimeConfigRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported mainnet runtime config record version");
  }
  if (record.status === "draft") {
    throw new Error("mainnet runtime config record is still draft");
  }
  if (record.status !== "approved-for-mainnet" && BLOCKED_READY_MODE_MARKER.test(String(record.status))) {
    throw new Error("mainnet runtime config status cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("mainnet runtime config record must be approved-for-mainnet");
  }
  if (record.chainId !== MAINNET_RUNTIME_CHAIN_ID || record.rpcUrl !== MAINNET_RUNTIME_RPC || record.environment !== "megaeth-mainnet") {
    throw new Error("mainnet runtime config record must target MegaETH mainnet 4326");
  }
  assertPromotionPath(record.ownerApprovalRef, "owner approval ref");
  assertPromotionPath(record.deploymentPackageRef, "deployment package ref");
  assertPromotionPath(record.sourceVerificationPackageRef, "source verification package ref");
  assertPromotionPath(record.proverManifestRef, "prover manifest ref");
  assertPromotionPath(record.relayerOpsRecordRef, "relayer ops record ref");
  assertRuntimeEvidenceRefs(record);
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("mainnet runtime config record cannot have remaining blockers");
  }

  assertAppBinding(record.app);
  assertRecoveryBinding(record.recovery, record.app.pool);
  assertRelayerBinding(record.relayer, record.app.pool);
  return record;
}

function assertAppBinding(app: MainnetRuntimeAppBinding): void {
  assertHttpsUrl(app.deploymentUrl, "app deployment URL");
  assertMainnetChain(app.chainId, app.rpcUrl, "app");
  if (app.poolContractName !== "NullarkPool") {
    throw new Error("mainnet runtime app pool contract name must be NullarkPool");
  }
  if (app.poolSourcePath !== "contracts/src/NullarkPool.sol") {
    throw new Error("mainnet runtime app pool source path must be contracts/src/NullarkPool.sol");
  }
  assertNonZeroAddress(app.pool, "app pool");
  assertNonZeroAddress(app.verifier, "app verifier");
  assertNotObviousPlaceholderAddress(app.pool, "app pool");
  assertNotObviousPlaceholderAddress(app.verifier, "app verifier");
  assertNotLegacyShieldedPoolDepth20MainnetPool(app.pool, "app pool");
  if (app.verifier.toLowerCase() === app.pool.toLowerCase()) {
    throw new Error("mainnet runtime app verifier must differ from app pool");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(app.verifierBytecodeHash)) {
    throw new Error("mainnet runtime app verifier bytecode hash must be 32-byte hex");
  }
  if (app.trustedSetupManifestTrustLevel !== "trusted-setup-recorded") {
    throw new Error("mainnet runtime app must use trusted-setup-recorded prover manifest");
  }
  if (app.localProofServiceEnabled !== false || app.localRelayerEnabled !== false) {
    throw new Error("mainnet runtime app must disable local proof service and local relayer");
  }
  if (app.walletUnlockSupportsMainnet !== true) {
    throw new Error("mainnet runtime app must prove wallet unlock supports chain 4326");
  }
  assertNoTestnetOrLocal(app.deploymentUrl, "app deployment URL");
}

function assertRecoveryBinding(recovery: MainnetRuntimeRecoveryBinding, pool: `0x${string}`): void {
  assertHttpsUrl(recovery.apiUrl, "recovery API URL");
  assertMainnetChain(recovery.chainId, undefined, "recovery");
  assertNonZeroAddress(recovery.pool, "recovery pool");
  assertNotObviousPlaceholderAddress(recovery.pool, "recovery pool");
  assertNotLegacyShieldedPoolDepth20MainnetPool(recovery.pool, "recovery pool");
  if (recovery.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("mainnet runtime recovery pool must match app pool");
  }
  if (recovery.indexerSupportsMainnet !== true) {
    throw new Error("mainnet runtime recovery API must support chain 4326");
  }
  assertPromotionPath(recovery.differentDeviceRecoveryTestRef, "different-device recovery test ref");
  assertRecoveryEvidenceMode(recovery);
  assertNoTestnetOrLocal(recovery.apiUrl, "recovery API URL");
}

function assertRecoveryEvidenceMode(recovery: MainnetRuntimeRecoveryBinding): void {
  assertPromotionPath(recovery.indexerContinuityEvidenceRef, "recovery indexer continuity evidence ref");
  if (!/recovery|indexer|continuity/i.test(recovery.indexerContinuityEvidenceRef)) {
    throw new Error("mainnet runtime recovery indexer continuity evidence ref must identify recovery or indexer continuity evidence");
  }

  if (recovery.evidenceMode === "live-mainnet-recovery-indexer-continuity") {
    if (recovery.ownerAcceptanceRef !== undefined) {
      assertOwnerAcceptanceRef(recovery.ownerAcceptanceRef);
    }
    return;
  }

  if (recovery.evidenceMode === "owner-accepted-testnet-recovery-substitute") {
    assertOwnerAcceptanceRef(recovery.ownerAcceptanceRef);
    return;
  }

  throw new Error("mainnet runtime recovery evidence mode must be final live-mainnet continuity or owner-accepted substitute");
}

function assertOwnerAcceptanceRef(value: string | undefined): asserts value is string {
  assertNonPlaceholder(value, "recovery owner acceptance ref");
  if (isPrivateOwnerApprovalRef(value)) {
    return;
  }
  if (!/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("mainnet runtime recovery owner acceptance ref must live under docs/evidence/owner-approval");
  }
  assertNoReadyModeBlockedMarker(value, "recovery owner acceptance ref");
  if (/(^|[./-])(superseded|historical)([./-]|$)/i.test(value)) {
    throw new Error("mainnet runtime recovery owner acceptance ref cannot reference draft, review-ready, superseded, or historical evidence");
  }
  assertApprovedEvidenceRef(value, "recovery owner acceptance ref");
}

function assertRelayerBinding(relayer: MainnetRuntimeRelayerBinding, pool: `0x${string}`): void {
  assertHttpsUrl(relayer.endpoint, "relayer endpoint");
  assertMainnetChain(relayer.chainId, undefined, "relayer");
  assertNonZeroAddress(relayer.pool, "relayer pool");
  assertNotObviousPlaceholderAddress(relayer.pool, "relayer pool");
  assertNotLegacyShieldedPoolDepth20MainnetPool(relayer.pool, "relayer pool");
  if (relayer.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("mainnet runtime relayer pool must match app pool");
  }
  if (relayer.boundedSelectorsOnly !== true) {
    throw new Error("mainnet runtime relayer must use bounded withdrawal selectors only");
  }
  assertPromotionPath(relayer.deploymentSelfTestRef, "relayer deployment self-test ref");
  assertNoTestnetOrLocal(relayer.endpoint, "relayer endpoint");
  if (relayer.endpoint !== MAINNET_RUNTIME_RELAYER_ENDPOINT) {
    throw new Error(`mainnet runtime relayer endpoint must equal ${MAINNET_RUNTIME_RELAYER_ENDPOINT}`);
  }
  if (!/relayer.*self-test|self-test.*relayer/i.test(relayer.deploymentSelfTestRef)) {
    throw new Error("mainnet runtime relayer deployment self-test ref must bind to relayer self-test evidence");
  }
}

function assertMainnetChain(chainId: number, rpcUrl: string | undefined, label: string): void {
  if (chainId !== MAINNET_RUNTIME_CHAIN_ID) {
    throw new Error(`mainnet runtime ${label} must use chain 4326`);
  }
  if (rpcUrl !== undefined && rpcUrl !== MAINNET_RUNTIME_RPC) {
    throw new Error(`mainnet runtime ${label} must use MegaETH mainnet RPC`);
  }
}

function assertHttpsUrl(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  if (!/^https:\/\/[^ ]+$/i.test(value)) {
    throw new Error(`mainnet runtime ${label} must be HTTPS`);
  }
}

function assertPromotionPath(value: string | undefined, label: string): asserts value is string {
  assertNonPlaceholder(value, label);
  assertNoTestnetOrLocal(value, label);
  assertNoReadyModeBlockedMarker(value, label);
}

function assertNoReadyModeBlockedMarker(value: string, label: string): void {
  if (BLOCKED_READY_MODE_MARKER.test(value)) {
    throw new Error(`mainnet runtime ${label} cannot reference draft, review-ready, release-candidate, or mainnet-blocked material`);
  }
}

function assertRuntimeEvidenceRefs(record: MainnetRuntimeConfigRecord): void {
  assertOwnerApprovalRef(record.ownerApprovalRef);
  assertDeploymentPackageRef(record.deploymentPackageRef);
  assertMainnetReadinessRef(record.sourceVerificationPackageRef, "source verification package ref", /source-verification/i);
  assertMainnetReadinessRef(record.proverManifestRef, "prover manifest ref", /browser-prover-manifest|prover-manifest/i);
  assertMainnetReadinessRef(record.relayerOpsRecordRef, "relayer ops record ref", /relayer-ops/i);
}

function assertDeploymentPackageRef(value: string): void {
  if (/^docs\/evidence\/megaeth-mainnet-deployment-package\.json$/i.test(value)) {
    return;
  }
  if (/^docs\/evidence\/mainnet-readiness\/.+/i.test(value) && /deployment-package/i.test(value)) {
    return;
  }
  throw new Error("mainnet runtime deployment package ref must identify the MegaETH mainnet deployment package");
}

function assertOwnerApprovalRef(value: string | undefined): void {
  assertPromotionPath(value, "owner approval ref");
  if (isPrivateOwnerApprovalRef(value)) {
    return;
  }
  if (!/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("mainnet runtime owner approval ref must live under docs/evidence/owner-approval");
  }
  assertApprovedEvidenceRef(value, "owner approval ref");
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertMainnetReadinessRef(value: string, label: string, pattern: RegExp): void {
  if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value)) {
    throw new Error(`mainnet runtime ${label} must live under docs/evidence/mainnet-readiness`);
  }
  if (!pattern.test(value)) {
    throw new Error(`mainnet runtime ${label} must identify the expected evidence package`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(replace-me|placeholder|pending|todo|tbd|dummy)/i.test(value)) {
    throw new Error(`mainnet runtime config record requires valid ${label}`);
  }
}

function assertApprovedEvidenceRef(value: string, label: string): void {
  if (!/(^|[./-])approved([./-]|$)/i.test(value)) {
    throw new Error(`mainnet runtime ${label} must reference approved owner evidence`);
  }
}

function assertNoTestnetOrLocal(value: string, label: string): void {
  if (/(carrot|testnet|6343|localhost|127\.0\.0\.1|local-untrusted|\/tmp\/|example|sample|preview|staging|\.\.)/i.test(value)) {
    throw new Error(`mainnet runtime ${label} cannot reference placeholder, testnet, or local material`);
  }
}

function assertNotLegacyShieldedPoolDepth20MainnetPool(value: string, label: string): void {
  if (value.toLowerCase() === LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL.toLowerCase()) {
    throw new Error(`mainnet runtime ${label} cannot use the legacy ShieldedPoolDepth20 mainnet pool address`);
  }
}

function assertNonZeroAddress(value: string, label: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error(`mainnet runtime config record requires nonzero ${label}`);
  }
}

function assertNotObviousPlaceholderAddress(value: string, label: string): void {
  const hex = value.slice(2).toLowerCase();
  if (/^([0-9a-f])\1{39}$/.test(hex)) {
    throw new Error(`mainnet runtime ${label} cannot be an obvious placeholder address`);
  }
}
