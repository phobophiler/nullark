import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { V11_BROWSER_PROVER_MANIFEST_HASH, V11_TRUSTED_SETUP_RECORD_HASH } from "./verifierPromotion.js";
import { V12_SPEND_PUBLIC_INPUT_ORDER } from "./v12UnlinkableSchemas.js";

export const LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID = 6343;
export const LOCAL_SANDBOX_EVIDENCE_BLOCKED_MAINNET_CHAIN_ID = 4326;
export const NULLARK_V12_FRONTEND_MAINNET_CHAIN_ID = 4326;
export const NULLARK_V12_FRONTEND_MAINNET_RPC = "https://mainnet.megaeth.com/rpc";
export const NULLARK_CURRENT_V11_MAINNET_POOL = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
export const LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS = [
  "root",
  "nullifier",
  "newCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "spentCommitment",
  "noteAmount",
  "proofContextHash",
  "encryptedNoteHash"
] as const;

export type LocalSandboxArtifact = {
  label: string;
  path: string;
  hash: string;
};

export type LocalSandboxCredentialRecord = {
  envPath: ".env.local";
  keystoreAccount: string;
  publicAddress: `0x${string}`;
  keystorePasswordStoredInGitignoredEnv: true;
  rawPrivateKeyStored: false;
  privateKeyPrinted: false;
  envFileMode: "0600";
};

export type LocalUntrustedSandboxEvidenceRecord = {
  recordVersion: 1;
  status: "local-untrusted-sandbox";
  purpose: "sandbox-only";
  trustedSetupSource: "local-untrusted-development";
  chainId: number;
  mainnet4326Blocked: boolean;
  deploymentApproved: false;
  signingApproved: false;
  privateKeysIncludedInEvidence: false;
  realFundsApproved: false;
  guardedUsersBlocked: true;
  productionPrivacyClaimsBlocked: true;
  cannotSatisfyPromotion: true;
  cannotSatisfyDeployment: true;
  cannotSatisfyGuardedUsers: true;
  localPotLabel: "pot13";
  localArtifactRoot: string;
  artifacts: readonly LocalSandboxArtifact[];
  credential?: LocalSandboxCredentialRecord;
  notes: string;
};

type PassedEvidence = {
  status: "passed" | string;
  evidenceRef?: string;
  evidenceSha256?: string;
};

export type NullarkV12FrontendProverIndexerRecoveryEvidenceRecord = {
  schema: "nullark-v1-2-frontend-prover-indexer-recovery-v1";
  productVersion: "nullark-v1.2-fee-governance";
  lane: "frontend-prover-indexer-recovery";
  status: "approved-for-mainnet" | string;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-mainnet" | string;
  approvesDeployment: false;
  approvesSigning: false;
  approvesFunding: false;
  approvesRelayerEnablement: false;
  approvesGuardedUsers: false;
  approvesPrivacyClaims: false;
  runtimeLabels: {
    v1_1: "nullark-v1.1-mainnet" | string;
    v1_2: string;
  };
  activeFeeDisplay: PassedEvidence & {
    source: "on-chain-feeBps" | string;
    feeBps: number;
    maxFeeBps: number;
  };
  pendingFeeDisplay: PassedEvidence & {
    visible: boolean;
    appliesBeforeActivation: boolean;
    pendingFeeBps: number;
    pendingFeeActivationTime: number | string;
  };
  proofFeeSource: PassedEvidence & {
    source: "active-on-chain-feeBps" | string;
    formula: string;
    activeFeeBpsReadBeforeProof?: boolean;
    activeFeeBpsRecheckedBeforeSubmit?: boolean;
    recheckedBeforeSubmit: boolean;
    staleFeeVectorRejected: boolean;
    staleFeeRejectedBeforeSubmit?: boolean;
    maxFeeAmountEnforced: boolean;
    minNetAmountEnforced: boolean;
  };
  artifactSelectionRules: {
    selectsByRuntimeLabel: boolean;
    selectsByChainPoolVerifierAndBytecode: boolean;
    v1_1ArtifactsNotUsedForV1_2: boolean;
    chainId: number;
    rpcUrl: string;
    runtimeLabel: string;
    pool: `0x${string}`;
    verifier: `0x${string}`;
    verifierBytecodeHash: `0x${string}`;
    testnetFallbackAllowed: boolean;
    browserManifestSha256?: string;
    trustedSetupRecordSha256?: string;
    withdrawWasmSha256?: string;
    withdrawZkeySha256?: string;
  };
  v1_1WithdrawalPreservation: {
    withdrawalsPreserved: boolean;
    pool: `0x${string}`;
    withdrawSelector: string;
    proverManifestSha256: string;
    trustedSetupRecordSha256: string;
    routesRecoveredNotesToOriginalPool: boolean;
  };
  recoveryIndexerRuntimeDistinction: PassedEvidence & {
    distinguishesByChainPoolRuntime: boolean;
    merkleDepthPerRuntime: boolean;
    scansAllHistoricalPools: boolean;
    withdrawalRoutesToNoteOriginalPool: boolean;
    recoveredNotesRouteByOriginalPool: boolean;
    originalPoolRoutingEvidence?: boolean;
    noTestnetFallback: boolean;
    testnetFallbackAllowed: boolean;
    sparseOrCheckpointedPathGeneration: boolean;
    chainIds: readonly number[];
  };
};

export function assertLocalUntrustedSandboxEvidence(
  record: LocalUntrustedSandboxEvidenceRecord
): LocalUntrustedSandboxEvidenceRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported local sandbox evidence record version");
  }

  if (record.status !== "local-untrusted-sandbox" || record.purpose !== "sandbox-only") {
    throw new Error("local sandbox evidence must be sandbox-only");
  }

  if (record.trustedSetupSource !== "local-untrusted-development" || record.localPotLabel !== "pot13") {
    throw new Error("local sandbox evidence must record local untrusted pot13 artifacts");
  }

  if (record.chainId === LOCAL_SANDBOX_EVIDENCE_BLOCKED_MAINNET_CHAIN_ID) {
    throw new Error("local sandbox evidence cannot target MegaETH mainnet 4326");
  }

  if (record.chainId !== LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID) {
    throw new Error(`local sandbox evidence must target MegaETH testnet ${LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID}`);
  }

  if (!record.mainnet4326Blocked) {
    throw new Error("local sandbox evidence must keep mainnet 4326 blocked");
  }

  if (record.deploymentApproved || record.signingApproved || record.realFundsApproved) {
    throw new Error("local sandbox evidence cannot approve deployment, signing, or real funds");
  }

  if (!record.guardedUsersBlocked || !record.productionPrivacyClaimsBlocked) {
    throw new Error("local sandbox evidence must block guarded users and production privacy claims");
  }

  if (record.privateKeysIncludedInEvidence) {
    throw new Error("local sandbox evidence must not include private keys");
  }

  if (!record.cannotSatisfyPromotion || !record.cannotSatisfyDeployment || !record.cannotSatisfyGuardedUsers) {
    throw new Error("local sandbox evidence must not satisfy promotion, deployment, or guarded-user gates");
  }

  assertLocalPath(record.localArtifactRoot, "local artifact root");

  if (record.artifacts.length === 0) {
    throw new Error("local sandbox evidence requires artifact hashes");
  }

  for (const artifact of record.artifacts) {
    assertNonPlaceholder(artifact.label, "artifact label");
    assertLocalPath(artifact.path, `${artifact.label} artifact path`);
    assertHash(artifact.hash, `${artifact.label} artifact hash`);
  }

  if (record.credential !== undefined) {
    assertCredential(record.credential);
  }

  assertNonPlaceholder(record.notes, "notes");

  return record;
}

export function assertNullarkV12FrontendProverIndexerRecoveryEvidence(
  record: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord
): NullarkV12FrontendProverIndexerRecoveryEvidenceRecord {
  if (
    record.schema !== "nullark-v1-2-frontend-prover-indexer-recovery-v1" ||
    record.productVersion !== "nullark-v1.2-fee-governance" ||
    record.lane !== "frontend-prover-indexer-recovery"
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must use the final v1.2 lane schema");
  }

  if (
    record.status !== "approved-for-mainnet" ||
    record.chainId !== NULLARK_V12_FRONTEND_MAINNET_CHAIN_ID ||
    record.rpcUrl !== NULLARK_V12_FRONTEND_MAINNET_RPC ||
    record.environment !== "megaeth-mainnet"
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must target MegaETH mainnet chain 4326 and RPC");
  }

  if (
    record.approvesDeployment ||
    record.approvesSigning ||
    record.approvesFunding ||
    record.approvesRelayerEnablement ||
    record.approvesGuardedUsers ||
    record.approvesPrivacyClaims
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence cannot approve deployment, signing, funding, relayers, guarded users, or privacy claims");
  }

  if (record.runtimeLabels.v1_1 !== "nullark-v1.1-mainnet" || !isV12RuntimeLabel(record.runtimeLabels.v1_2)) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must bind distinct v1.1 and v1.2 runtime labels");
  }

  assertV12ActiveFeeDisplay(record.activeFeeDisplay);
  assertV12PendingFeeDisplay(record.pendingFeeDisplay);
  assertV12ProofFeeSource(record.proofFeeSource);
  assertV12ArtifactSelection(record.artifactSelectionRules, record.runtimeLabels.v1_2);
  assertV11WithdrawalPreservation(record.v1_1WithdrawalPreservation);
  assertV12RecoveryIndexerDistinction(record.recoveryIndexerRuntimeDistinction);

  return record;
}

export function assertLocalUntrustedSandboxArtifactIntegrity(
  record: LocalUntrustedSandboxEvidenceRecord,
  options: { repoRoot: string }
): LocalUntrustedSandboxEvidenceRecord {
  assertLocalUntrustedSandboxEvidence(record);

  for (const artifact of record.artifacts) {
    const artifactPath = path.resolve(options.repoRoot, artifact.path);
    if (!artifactPath.startsWith(path.resolve(options.repoRoot) + path.sep)) {
      throw new Error(`${artifact.label} artifact path escapes repository root`);
    }

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`${artifact.label} artifact file is missing: ${artifact.path}`);
    }

    const actualHash = sha256File(artifactPath);
    if (actualHash !== artifact.hash) {
      throw new Error(`${artifact.label} artifact hash mismatch: expected ${artifact.hash}, got ${actualHash}`);
    }

    if (artifact.label === "provenance-manifest" || artifact.path.endsWith("provenance/manifest.json")) {
      assertProvenanceManifestPublicInputs(artifactPath);
    }
  }

  return record;
}

function sha256File(filePath: string): string {
  return `sha256:${createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function assertProvenanceManifestPublicInputs(filePath: string): void {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    publicInputs?: unknown;
    publicInputsByCircuit?: Record<string, unknown>;
  };
  const actual = Array.isArray(manifest.publicInputs) ? manifest.publicInputs : [];
  const expected = [...LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS];
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`provenance manifest public inputs must match ${expected.join(",")}`);
  }

  const v12WithdrawActual = Array.isArray(manifest.publicInputsByCircuit?.withdraw_v1_2)
    ? manifest.publicInputsByCircuit.withdraw_v1_2
    : [];
  const v12WithdrawExpected = [...V12_SPEND_PUBLIC_INPUT_ORDER];
  if (
    v12WithdrawActual.length !== v12WithdrawExpected.length ||
    v12WithdrawActual.some((value, index) => value !== v12WithdrawExpected[index])
  ) {
    throw new Error(`provenance manifest withdraw_v1_2 public inputs must match ${v12WithdrawExpected.join(",")}`);
  }
}

function assertV12ActiveFeeDisplay(display: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["activeFeeDisplay"]): void {
  if (
    display.status !== "passed" ||
    display.source !== "on-chain-feeBps" ||
    !Number.isSafeInteger(display.feeBps) ||
    display.feeBps < 0 ||
    display.maxFeeBps !== 100 ||
    display.feeBps > display.maxFeeBps
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove active on-chain feeBps display with MAX_FEE_BPS 100");
  }
}

function assertV12PendingFeeDisplay(display: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["pendingFeeDisplay"]): void {
  if (
    display.status !== "passed" ||
    display.visible !== true ||
    display.appliesBeforeActivation !== false ||
    !Number.isSafeInteger(display.pendingFeeBps) ||
    display.pendingFeeBps < 0 ||
    display.pendingFeeBps > 100 ||
    !isNonNegativeIntegerLike(display.pendingFeeActivationTime)
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove pending fee display without applying pending fee before activation");
  }
}

function assertV12ProofFeeSource(source: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["proofFeeSource"]): void {
  if (
    source.status !== "passed" ||
    source.source !== "active-on-chain-feeBps" ||
    source.formula !== "floor(grossAmount * feeBps / 10000)" ||
    source.activeFeeBpsReadBeforeProof !== true ||
    source.activeFeeBpsRecheckedBeforeSubmit !== true ||
    source.recheckedBeforeSubmit !== true
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove browser proof generation uses active on-chain feeBps and rechecks before submit");
  }

  if (
    source.staleFeeVectorRejected !== true ||
    source.staleFeeRejectedBeforeSubmit !== true ||
    source.maxFeeAmountEnforced !== true ||
    source.minNetAmountEnforced !== true
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove stale fee rejection and user maxFeeAmount/minNetAmount enforcement");
  }
}

function assertV12ArtifactSelection(
  rules: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["artifactSelectionRules"],
  runtimeLabel: string
): void {
  const hashes = [
    normalizeSha256(rules.browserManifestSha256),
    normalizeSha256(rules.trustedSetupRecordSha256),
    normalizeSha256(rules.withdrawWasmSha256),
    normalizeSha256(rules.withdrawZkeySha256)
  ].filter(Boolean);

  if (
    rules.selectsByRuntimeLabel !== true ||
    rules.selectsByChainPoolVerifierAndBytecode !== true ||
    rules.v1_1ArtifactsNotUsedForV1_2 !== true ||
    hashes.includes(V11_BROWSER_PROVER_MANIFEST_HASH) ||
    hashes.includes(V11_TRUSTED_SETUP_RECORD_HASH)
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove runtime-selected v1.2 prover artifacts without v1.1 artifact reuse");
  }

  if (
    rules.chainId !== NULLARK_V12_FRONTEND_MAINNET_CHAIN_ID ||
    rules.rpcUrl !== NULLARK_V12_FRONTEND_MAINNET_RPC ||
    rules.testnetFallbackAllowed !== false ||
    rules.runtimeLabel !== runtimeLabel ||
    !isV12RuntimeLabel(rules.runtimeLabel) ||
    !isNonZeroHexAddress(rules.pool) ||
    !isNonZeroHexAddress(rules.verifier) ||
    isObviousPlaceholderAddress(rules.pool) ||
    isObviousPlaceholderAddress(rules.verifier) ||
    rules.pool.toLowerCase() === NULLARK_CURRENT_V11_MAINNET_POOL.toLowerCase() ||
    rules.pool.toLowerCase() === rules.verifier.toLowerCase() ||
    !/^0x[0-9a-fA-F]{64}$/.test(rules.verifierBytecodeHash)
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must bind prover artifacts to mainnet chain, v1.2 pool, verifier, bytecode, and no testnet fallback");
  }
}

function assertV11WithdrawalPreservation(
  preservation: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["v1_1WithdrawalPreservation"]
): void {
  if (
    preservation.withdrawalsPreserved !== true ||
    preservation.pool.toLowerCase() !== NULLARK_CURRENT_V11_MAINNET_POOL.toLowerCase() ||
    preservation.withdrawSelector !== "0x678d8506" ||
    normalizeSha256(preservation.proverManifestSha256) !== V11_BROWSER_PROVER_MANIFEST_HASH ||
    normalizeSha256(preservation.trustedSetupRecordSha256) !== V11_TRUSTED_SETUP_RECORD_HASH ||
    preservation.routesRecoveredNotesToOriginalPool !== true
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must preserve v1.1 withdrawals and route recovered notes to their original pool");
  }
}

function assertV12RecoveryIndexerDistinction(
  distinction: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord["recoveryIndexerRuntimeDistinction"]
): void {
  if (
    distinction.status !== "passed" ||
    distinction.distinguishesByChainPoolRuntime !== true ||
    distinction.merkleDepthPerRuntime !== true ||
    distinction.scansAllHistoricalPools !== true ||
    distinction.sparseOrCheckpointedPathGeneration !== true ||
    !distinction.chainIds.includes(NULLARK_V12_FRONTEND_MAINNET_CHAIN_ID) ||
    distinction.chainIds.includes(LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID)
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove recovery/indexer distinguishes v1.1 and v1.2 by chain, pool, runtime, and Merkle depth");
  }

  if (
    distinction.withdrawalRoutesToNoteOriginalPool !== true ||
    distinction.recoveredNotesRouteByOriginalPool !== true ||
    distinction.originalPoolRoutingEvidence !== true ||
    distinction.noTestnetFallback !== true ||
    distinction.testnetFallbackAllowed !== false
  ) {
    throw new Error("v1.2 frontend/prover/indexer/recovery evidence must prove recovery/indexer disables testnet fallback and routes recovered notes by original pool");
  }
}

function isV12RuntimeLabel(value: string): boolean {
  return /v1[.-]2/i.test(value) && !/v1[.-]1/i.test(value);
}

function normalizeSha256(value: string | undefined): string | undefined {
  return value?.replace(/^sha256:/i, "").toLowerCase();
}

function isNonNegativeIntegerLike(value: number | string): boolean {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0;
  }
  return /^[0-9]+$/.test(value);
}

function isNonZeroHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function isObviousPlaceholderAddress(value: string): boolean {
  const hex = value.slice(2).toLowerCase();
  return /^([0-9a-f])\1{39}$/.test(hex);
}

function assertCredential(credential: LocalSandboxCredentialRecord): void {
  if (credential.envPath !== ".env.local") {
    throw new Error("local sandbox credential must use gitignored .env.local");
  }

  assertNonPlaceholder(credential.keystoreAccount, "keystore account");

  if (!/^0x[0-9a-fA-F]{40}$/.test(credential.publicAddress)) {
    throw new Error("local sandbox credential requires a public address");
  }

  if (
    !credential.keystorePasswordStoredInGitignoredEnv ||
    credential.rawPrivateKeyStored !== false ||
    credential.privateKeyPrinted !== false ||
    credential.envFileMode !== "0600"
  ) {
    throw new Error("local sandbox credential must use keystore plus gitignored 0600 env metadata and must not store or print raw private keys");
  }
}

function assertLocalPath(value: string, label: string): void {
  assertNonPlaceholder(value, label);

  if (!/(circuits\/build|contracts\/test\/generated|local|sandbox|UNTRUSTED|pot13|dev)/i.test(value)) {
    throw new Error(`local sandbox evidence ${label} must be clearly local or untrusted`);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`invalid ${label}`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(todo|tbd|placeholder|replace-me|pending|dummy|sample|example)/i.test(value)) {
    throw new Error(`local sandbox evidence requires ${label}`);
  }
}
