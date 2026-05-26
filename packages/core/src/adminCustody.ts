export const ADMIN_CUSTODY_MAINNET_CHAIN_ID = 4326;

export type AdminCustodyStatus = "draft" | "review-ready" | "approved-for-mainnet";
export type AdminRoleLabel = "feeController";
export type AdminCustodyType = "multisig" | "eoa";

export type AdminCustodyRecord = {
  recordVersion: 1;
  status: AdminCustodyStatus;
  chainId: number;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  ownerApprovalRef?: string;
  deploymentPackageRef: string;
  deploymentDeployer: `0x${string}`;
  roles: Record<AdminRoleLabel, AdminRoleCustody>;
  roleSeparationApproved: boolean;
  roleSeparationEvidenceRef: string;
  roleSeparationEvidenceHash: string;
  keyCompromiseRunbookRef: string;
  lostKeyRunbookRef: string;
  incidentResponseRef: string;
  blockedUntil?: readonly string[];
};

export type AdminRoleCustody = {
  address: `0x${string}`;
  custodyType: AdminCustodyType;
  chainId: number;
  threshold: number;
  signerCount: number;
  signerAddresses: readonly `0x${string}`[];
  custodyRef: string;
  executionPolicyRef: string;
  multisigConfigArtifactRef: string;
  multisigConfigHash: string;
  deploymentEvidenceRef: string;
  deploymentEvidenceHash: string;
};

export type AdminCustodyReadyOptions = {
  referencedDeploymentPackage?: ReferencedDeploymentPackageReadyState;
};

export type V12CustodyPreReadinessRecord = {
  status?: string;
  chainId?: number;
  environment?: string;
  mainnet4326Blocked?: boolean;
  approvesDeployment?: boolean;
  approvesSigning?: boolean;
  approvesFunding?: boolean;
  approvesRelayerEnablement?: boolean;
  approvesGuardedUsers?: boolean;
  approvesPrivacyClaims?: boolean;
  safe?: {
    address?: `0x${string}` | null;
    threshold?: number | null;
    owners?: readonly `0x${string}`[];
    modules?: readonly unknown[] | null;
    guards?: readonly unknown[] | null;
    fallbackHandlers?: readonly unknown[] | null;
  };
  roleMap?: {
    feeController?: {
      evidencePresent?: boolean;
    };
  };
  currentCredentialSchema?: V12CurrentCredentialSchema;
  blockedUntil?: readonly string[];
};

export type V12CurrentCredentialSchema = {
  schema?: string;
  feeControllerSafe?: {
    chainId?: number;
    threshold?: number;
    signerCount?: number;
    signerRoles?: readonly string[];
  };
  emergencyGuardianRolesPresent?: boolean;
  forbiddenRoleNamesAbsent?: readonly string[];
  privateKeysRecorded?: boolean;
  rawSecretsRecorded?: boolean;
  doesNotProveSafeAddress?: boolean;
  doesNotProveOnChainOwners?: boolean;
  doesNotApproveSigning?: boolean;
};

export type V12CustodySelectorEntry = {
  function?: string;
  selector?: `0x${string}`;
  source?: string;
  scope?: string;
};

export type V12CustodyLaneRecord = V12CustodyPreReadinessRecord & {
  schema?: string;
  productVersion?: string;
  scope?: string;
  lane?: string;
  rpcUrl?: string;
  ownerApprovalRef?: string;
  ownerApprovalSha256?: string;
  noV1_1ApprovalReuse?: boolean;
  v1_1Preservation?: {
    currentRuntimeUnchanged?: boolean;
    withdrawalsPreserved?: boolean;
    doesNotApproveV1_2?: boolean;
  };
  evidenceRefs?: readonly {
    label?: string;
    path?: string;
    sha256?: string;
  }[];
  safe?: V12CustodyPreReadinessRecord["safe"] & {
    version?: string | null;
  };
  allowedFunctionSelectors?: readonly V12CustodySelectorEntry[];
};

export type ReferencedDeploymentPackageReadyState = {
  status?: string;
  chainId?: number;
  environment?: string;
  mainnet4326Blocked?: boolean;
  deploymentApproved?: boolean;
  signingApproved?: boolean;
  realFundsApproved?: boolean;
  guardedUsersBlocked?: boolean;
  productionPrivacyClaimsBlocked?: boolean;
  blockedUntil?: readonly string[];
  addresses?: {
    feeController?: `0x${string}`;
  };
};

export type V12CustodyLaneBlockerOptions = {
  requireApprovalReady?: boolean;
};

const ROLE_LABELS: readonly AdminRoleLabel[] = ["feeController"];
const V12_CUSTODY_SCHEMA = "nullark-v1-2-custody-record-v1";
const V12_CUSTODY_PRODUCT_VERSION = "nullark-v1.2-fee-governance";
const V12_CUSTODY_LANE = "custody-record";
const V12_MAINNET_RPC_URL = "https://mainnet.megaeth.com/rpc";
const APPROVED_V12_CUSTODY_SELECTORS: ReadonlyMap<string, Readonly<V12CustodySelectorEntry>> = new Map([
  [
    "0x023b1fc9",
    {
      function: "setFeeBps(uint16)",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    }
  ],
  [
    "0x6a922915",
    {
      function: "executePendingFeeBps()",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    }
  ],
  [
    "0x51529e58",
    {
      function: "cancelPendingFeeBps()",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    }
  ],
  [
    "0x90a3a042",
    {
      function: "sweepFees(address,uint256)",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-sweep-accrued-protocol-fees-only"
    }
  ]
]);

export function assertV12CustodyPreReadinessBlocked(record: V12CustodyPreReadinessRecord): V12CustodyPreReadinessRecord {
  if (!isBlockedPreReadinessStatus(record.status)) {
    throw new Error("v1.2 custody record must remain blocked pre-readiness until real Safe evidence exists");
  }
  if (record.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID || record.environment !== "megaeth-mainnet") {
    throw new Error("v1.2 custody record must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked !== true) {
    throw new Error("v1.2 custody pre-readiness record must keep mainnet4326Blocked true");
  }
  assertV12NonAuthorizingFlags(record, "v1.2 custody record");

  const safe = record.safe ?? {};
  if (isNonZeroAddress(String(safe.address ?? "")) || safe.threshold !== null || (safe.owners ?? []).length !== 0) {
    throw new Error("v1.2 custody pre-readiness record must not invent Safe address, threshold, or owners");
  }
  if (hasEntries(safe.modules) || hasEntries(safe.guards) || hasEntries(safe.fallbackHandlers)) {
    throw new Error("v1.2 custody pre-readiness record must keep module, guard, and fallback-handler evidence absent");
  }
  if (record.roleMap?.feeController?.evidencePresent !== false) {
    throw new Error("v1.2 custody pre-readiness record must mark feeController evidence absent");
  }
  if (!Array.isArray(record.blockedUntil) || record.blockedUntil.length === 0) {
    throw new Error("v1.2 custody pre-readiness record must list remaining blockers");
  }

  return record;
}

export function collectV12CustodyLaneBlockers(
  record: V12CustodyLaneRecord,
  prefix = "v1.2 custody record evidence",
  { requireApprovalReady = true }: V12CustodyLaneBlockerOptions = {}
): string[] {
  const blockers: string[] = [];
  if (record.schema !== V12_CUSTODY_SCHEMA) {
    blockers.push(`${prefix} record must use schema ${V12_CUSTODY_SCHEMA}`);
  }
  if (record.productVersion !== V12_CUSTODY_PRODUCT_VERSION || record.scope !== V12_CUSTODY_PRODUCT_VERSION) {
    blockers.push(`${prefix} record must target Nullark v1.2 fee governance`);
  }
  if (record.lane !== V12_CUSTODY_LANE) {
    blockers.push(`${prefix} record must use custody-record lane`);
  }
  if (record.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID || record.environment !== "megaeth-mainnet" || record.rpcUrl !== V12_MAINNET_RPC_URL) {
    blockers.push(`${prefix} record must target MegaETH mainnet 4326 RPC`);
  }
  if (requireApprovalReady && record.mainnet4326Blocked !== false) {
    blockers.push(`${prefix} record must set mainnet4326Blocked false only when the lane is approval-ready`);
  }
  collectAuthorizingFlagBlockers(record, prefix, blockers);
  if (
    !record.ownerApprovalRef ||
    (!isPrivateOwnerApprovalRef(record.ownerApprovalRef) && !/^evidence\/owner-approval\/.+/i.test(record.ownerApprovalRef))
  ) {
    blockers.push(`${prefix} record must bind a private owner approval ref`);
  }
  if (!isSha256(record.ownerApprovalSha256)) {
    blockers.push(`${prefix} record must bind owner approval sha256`);
  }
  if (record.noV1_1ApprovalReuse !== true || record.v1_1Preservation?.doesNotApproveV1_2 !== true) {
    blockers.push(`${prefix} record must not reuse v1.1 approval as v1.2 custody approval`);
  }
  collectEvidenceRefBlockers(record.evidenceRefs, prefix, blockers);
  if (requireApprovalReady) {
    collectSafeBlockers(record, prefix, blockers);
  } else {
    collectBlockedCredentialSchemaBlockers(record, prefix, blockers);
  }
  collectSelectorBlockers(record.allowedFunctionSelectors, prefix, blockers);

  return blockers;
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

export function assertV12CustodyLaneReady(record: V12CustodyLaneRecord): V12CustodyLaneRecord {
  const blockers = collectV12CustodyLaneBlockers(record);
  if (blockers.length > 0) {
    throw new Error(blockers.join("\n"));
  }
  return record;
}

export function assertAdminCustodyReady(record: AdminCustodyRecord, options: AdminCustodyReadyOptions = {}): AdminCustodyRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported admin custody record version");
  }
  if (record.status === "draft") {
    throw new Error("admin custody record is still draft");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("admin custody record must be approved-for-mainnet");
  }
  if (record.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID || record.environment !== "megaeth-mainnet") {
    throw new Error("admin custody record must target MegaETH mainnet 4326");
  }
  assertNonPlaceholder(record.ownerApprovalRef, "owner approval ref");
  assertPromotionPath(record.deploymentPackageRef, "deployment package ref");
  if (!/^evidence\/mainnet-readiness\/v1-2\/.+/i.test(record.deploymentPackageRef) || !/deployment-package/i.test(record.deploymentPackageRef)) {
    throw new Error("admin custody deployment package ref must bind the MegaETH mainnet deployment package");
  }
  if (options.referencedDeploymentPackage !== undefined) {
    assertReferencedDeploymentPackageReady(options.referencedDeploymentPackage);
  }
  assertPromotionPath(record.keyCompromiseRunbookRef, "key compromise runbook ref");
  assertPromotionPath(record.lostKeyRunbookRef, "lost key runbook ref");
  assertPromotionPath(record.incidentResponseRef, "incident response ref");
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("admin custody record cannot have remaining blockers");
  }
  if (!isNonZeroAddress(record.deploymentDeployer)) {
    throw new Error("admin custody record requires deployment deployer address");
  }
  if (record.roleSeparationApproved !== true) {
    throw new Error("admin custody record requires role separation approval");
  }
  assertPromotionPath(record.roleSeparationEvidenceRef, "role separation evidence ref");
  assertHash(record.roleSeparationEvidenceHash, "role separation evidence hash");
  assertNoEmergencyGuardianRole(record);
  const referencedFeeController = options.referencedDeploymentPackage?.addresses?.feeController;
  if (referencedFeeController && record.roles.feeController.address.toLowerCase() !== referencedFeeController.toLowerCase()) {
    throw new Error("admin custody feeController address must match referenced deployment package feeController");
  }

  const deployer = record.deploymentDeployer.toLowerCase();
  const roleAddresses = new Set<string>();
  const roleSignerAddresses = new Set<string>();
  const multisigConfigRefs = new Set<string>();
  const multisigConfigHashes = new Set<string>();
  for (const label of ROLE_LABELS) {
    const role = record.roles[label];
    assertRoleCustody(label, role);
    const normalized = role.address.toLowerCase();
    if (normalized === deployer) {
      throw new Error("admin custody roles cannot reuse deployment deployer address");
    }
    if (roleAddresses.has(normalized)) {
      throw new Error("admin custody roles must use distinct role addresses");
    }
    roleAddresses.add(normalized);
    for (const signer of role.signerAddresses) {
      const signerAddress = signer.toLowerCase();
      if (signerAddress === deployer || roleAddresses.has(signerAddress)) {
        throw new Error("admin custody signer addresses cannot reuse deployer or admin role addresses");
      }
      if (roleSignerAddresses.has(signerAddress)) {
        throw new Error("admin custody role signer sets must be disjoint");
      }
      roleSignerAddresses.add(signerAddress);
    }
    const configRef = role.multisigConfigArtifactRef.toLowerCase();
    if (multisigConfigRefs.has(configRef)) {
      throw new Error("admin custody roles must use distinct multisig config artifacts");
    }
    multisigConfigRefs.add(configRef);
    const configHash = role.multisigConfigHash.toLowerCase();
    if (multisigConfigHashes.has(configHash)) {
      throw new Error("admin custody roles must use distinct multisig config hashes");
    }
    multisigConfigHashes.add(configHash);
  }

  return record;
}

function assertNoEmergencyGuardianRole(record: AdminCustodyRecord): void {
  const roles = record.roles as AdminCustodyRecord["roles"] & { emergencyGuardian?: unknown };
  if (roles && Object.hasOwn(roles, "emergencyGuardian")) {
    throw new Error("admin custody record must not include emergencyGuardian for the no-guardian Nullark v1.1 path");
  }
}

function assertReferencedDeploymentPackageReady(packageRecord: ReferencedDeploymentPackageReadyState): void {
  if (packageRecord.status !== "approved-for-mainnet") {
    throw new Error("admin custody referenced deployment package is not mainnet-ready: deployment package must be approved-for-mainnet");
  }
  if (packageRecord.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID || packageRecord.environment !== "megaeth-mainnet") {
    throw new Error("admin custody referenced deployment package must target MegaETH mainnet 4326");
  }
  if (packageRecord.mainnet4326Blocked === true || (packageRecord.blockedUntil ?? []).length !== 0) {
    throw new Error("admin custody referenced deployment package is still mainnet-blocked");
  }
  if (
    packageRecord.deploymentApproved !== true ||
    packageRecord.signingApproved !== true ||
    packageRecord.realFundsApproved !== true ||
    packageRecord.guardedUsersBlocked !== false ||
    packageRecord.productionPrivacyClaimsBlocked !== false
  ) {
    throw new Error("admin custody referenced deployment package has not approved mainnet deployment, signing, funding, users, and production claims");
  }
}

function assertRoleCustody(label: AdminRoleLabel, role: AdminRoleCustody): void {
  if (!role || typeof role !== "object") {
    throw new Error(`${label} custody record is missing`);
  }
  if (!isNonZeroAddress(role.address)) {
    throw new Error(`${label} requires nonzero multisig address`);
  }
  if (role.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID) {
    throw new Error(`${label} custody must target MegaETH mainnet 4326`);
  }
  if (role.custodyType !== "multisig") {
    throw new Error(`${label} must use approved multisig custody`);
  }
  if (!Number.isSafeInteger(role.signerCount) || role.signerCount < 2) {
    throw new Error(`${label} multisig signer count must be at least 2`);
  }
  if (!Number.isSafeInteger(role.threshold) || role.threshold < 2) {
    throw new Error(`${label} multisig threshold must be at least 2`);
  }
  if (role.threshold > role.signerCount) {
    throw new Error(`${label} multisig threshold cannot exceed signer count`);
  }
  if (role.threshold * 2 <= role.signerCount) {
    throw new Error(`${label} multisig threshold must be a strict majority`);
  }
  if (!Array.isArray(role.signerAddresses) || role.signerAddresses.length !== role.signerCount) {
    throw new Error(`${label} signer addresses must match signer count`);
  }
  const signers = new Set<string>();
  for (const signer of role.signerAddresses) {
    if (!isNonZeroAddress(signer)) {
      throw new Error(`${label} signer address must be nonzero`);
    }
    const normalized = signer.toLowerCase();
    if (signers.has(normalized)) {
      throw new Error(`${label} signer addresses must be unique`);
    }
    signers.add(normalized);
  }
  assertPromotionPath(role.custodyRef, `${label} custody ref`);
  assertPromotionPath(role.executionPolicyRef, `${label} execution policy ref`);
  assertPromotionPath(role.multisigConfigArtifactRef, `${label} multisig config artifact ref`);
  assertHash(role.multisigConfigHash, `${label} multisig config hash`);
  assertPromotionPath(role.deploymentEvidenceRef, `${label} deployment evidence ref`);
  assertHash(role.deploymentEvidenceHash, `${label} deployment evidence hash`);
}

function assertPromotionPath(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  const lower = value.toLowerCase();
  if (/(local|untrusted|sandbox|replace-me|placeholder|pending|todo|tbd|\/tmp\/|\.\.)/.test(lower)) {
    throw new Error(`admin custody ${label} cannot reference placeholder or local artifacts`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(replace-me|placeholder|pending|todo|tbd|dummy|sample|example)/i.test(value)) {
    throw new Error(`admin custody record requires valid ${label}`);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`admin custody record requires valid ${label}`);
  }
}

function isBlockedPreReadinessStatus(status: unknown): boolean {
  return typeof status === "string" && /^(blocked-|pre-readiness|blocked$)/.test(status);
}

function hasEntries(value: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function assertV12NonAuthorizingFlags(record: V12CustodyPreReadinessRecord, label: string): void {
  const flags = [
    "approvesDeployment",
    "approvesSigning",
    "approvesFunding",
    "approvesRelayerEnablement",
    "approvesGuardedUsers",
    "approvesPrivacyClaims"
  ] as const;
  for (const flag of flags) {
    if (record[flag] !== false) {
      throw new Error(`${label} must keep ${flag} false`);
    }
  }
}

function collectAuthorizingFlagBlockers(record: V12CustodyLaneRecord, label: string, blockers: string[]): void {
  const flags = [
    "approvesDeployment",
    "approvesSigning",
    "approvesFunding",
    "approvesRelayerEnablement",
    "approvesGuardedUsers",
    "approvesPrivacyClaims"
  ] as const;
  for (const flag of flags) {
    if (record[flag] !== false) {
      blockers.push(`${label} record must keep ${flag} false`);
    }
  }
}

function collectEvidenceRefBlockers(
  evidenceRefs: V12CustodyLaneRecord["evidenceRefs"],
  prefix: string,
  blockers: string[]
): void {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    blockers.push(`${prefix} record must include hash-bound custody evidence refs`);
    return;
  }
  for (const [index, ref] of evidenceRefs.entries()) {
    if (!ref.label || /template|placeholder|replace-me|pending|todo|tbd/i.test(ref.label)) {
      blockers.push(`${prefix} evidenceRefs[${index}] must use a concrete label`);
    }
    if (!ref.path || !isMainnetReadinessEvidencePath(ref.path)) {
      blockers.push(`${prefix} evidenceRefs[${index}] must use a repo-local mainnet-readiness path`);
    }
    if (!isSha256(ref.sha256)) {
      blockers.push(`${prefix} evidenceRefs[${index}] must bind sha256`);
    }
  }
}

function collectSafeBlockers(record: V12CustodyLaneRecord, prefix: string, blockers: string[]): void {
  const safe = record.safe ?? {};
  if (!isNonZeroAddress(String(safe.address ?? "")) || isObviousPlaceholderAddress(String(safe.address ?? ""))) {
    blockers.push(`${prefix} record must bind a nonzero non-placeholder feeController Safe address`);
  }
  if (!safe.version || /template|placeholder|replace-me|pending|todo|tbd/i.test(safe.version)) {
    blockers.push(`${prefix} record must bind a concrete Safe version`);
  }
  const owners = Array.isArray(safe.owners) ? safe.owners : [];
  const normalizedOwners = owners.filter((owner) => typeof owner === "string" && isNonZeroAddress(owner)).map((owner) => owner.toLowerCase());
  if (owners.length < 5 || !owners.every((owner) => typeof owner === "string" && isNonZeroAddress(owner))) {
    blockers.push(`${prefix} record must bind at least five valid nonzero Safe owners`);
  }
  if (
    owners.length > 0 &&
    (!owners.every((owner) => typeof owner === "string" && !isObviousPlaceholderAddress(owner)) ||
      new Set(normalizedOwners).size !== normalizedOwners.length)
  ) {
    blockers.push(`${prefix} record must bind unique non-placeholder Safe owners`);
  }
  const threshold = safe.threshold;
  if (typeof threshold !== "number" || !Number.isSafeInteger(threshold) || threshold < 3) {
    blockers.push(`${prefix} record must require Safe threshold 3-of-5 or stronger`);
  }
  if (Array.isArray(safe.owners) && typeof threshold === "number" && Number.isSafeInteger(threshold) && threshold > owners.length) {
    blockers.push(`${prefix} record Safe threshold cannot exceed owner count`);
  }
  if (typeof threshold === "number" && Number.isSafeInteger(threshold) && owners.length >= 5 && threshold * 5 < owners.length * 3) {
    blockers.push(`${prefix} record Safe threshold must be 3-of-5 or stronger relative to owner count`);
  }
  if (!Array.isArray(safe.modules) || !Array.isArray(safe.guards) || !Array.isArray(safe.fallbackHandlers)) {
    blockers.push(`${prefix} record must bind reviewed module, guard, and fallback-handler lists`);
  }
  if (record.roleMap?.feeController?.evidencePresent !== true) {
    blockers.push(`${prefix} record must mark feeController Safe evidence present`);
  }
}

function collectBlockedCredentialSchemaBlockers(record: V12CustodyLaneRecord, prefix: string, blockers: string[]): void {
  const schema = record.currentCredentialSchema ?? {};
  const feeControllerSafe = schema.feeControllerSafe ?? {};
  const signerRoles = Array.isArray(feeControllerSafe.signerRoles) ? feeControllerSafe.signerRoles : [];
  const forbiddenRoleNamesAbsent = Array.isArray(schema.forbiddenRoleNamesAbsent) ? schema.forbiddenRoleNamesAbsent : [];
  const requiredSignerRoles = ["feeControllerOwner1", "feeControllerOwner2", "feeControllerOwner3", "feeControllerOwner4", "feeControllerOwner5"];
  const forbiddenGuardianRoles = ["emergencyGuardianOwner1", "emergencyGuardianOwner2", "emergencyGuardianOwner3"];

  if (schema.schema !== "nullark-v1-2-current-credential-state-v1") {
    blockers.push(`${prefix} record must include current credential schema nullark-v1-2-current-credential-state-v1`);
  }
  if (
    feeControllerSafe.chainId !== ADMIN_CUSTODY_MAINNET_CHAIN_ID ||
    feeControllerSafe.threshold !== 3 ||
    feeControllerSafe.signerCount !== 5 ||
    signerRoles.length !== requiredSignerRoles.length ||
    !requiredSignerRoles.every((role) => signerRoles.includes(role))
  ) {
    blockers.push(`${prefix} record current credential schema must match fee-controller Safe 3-of-5 signer roles`);
  }
  if (
    schema.emergencyGuardianRolesPresent !== false ||
    !forbiddenGuardianRoles.every((role) => forbiddenRoleNamesAbsent.includes(role)) ||
    signerRoles.some((role) => /^emergencyGuardianOwner[1-3]$/.test(role))
  ) {
    blockers.push(`${prefix} record current credential schema must prove emergencyGuardianOwner1/2/3 roles are absent`);
  }
  if (schema.privateKeysRecorded !== false || schema.rawSecretsRecorded !== false) {
    blockers.push(`${prefix} record current credential schema must not record private keys or raw secrets`);
  }
  if (
    schema.doesNotProveSafeAddress !== true ||
    schema.doesNotProveOnChainOwners !== true ||
    schema.doesNotApproveSigning !== true
  ) {
    blockers.push(`${prefix} record current credential schema must keep Safe address, on-chain owners, and signing approval fail-closed`);
  }
}

function collectSelectorBlockers(
  selectors: V12CustodyLaneRecord["allowedFunctionSelectors"],
  prefix: string,
  blockers: string[]
): void {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    blockers.push(`${prefix} record must list allowed fee-governance function selectors`);
    return;
  }
  const seen = new Set<string>();
  for (const entry of selectors) {
    const selector = typeof entry.selector === "string" ? entry.selector.toLowerCase() : "";
    const approved = APPROVED_V12_CUSTODY_SELECTORS.get(selector);
    if (!approved || selector.length !== 10 || seen.has(selector)) {
      blockers.push(`${prefix} allowedFunctionSelectors must be limited to approved v1.2 fee-governance selectors`);
      return;
    }
    seen.add(selector);
    if (entry.function !== approved.function || entry.source !== approved.source || entry.scope !== approved.scope) {
      blockers.push(`${prefix} allowedFunctionSelectors must bind approved function, source, and scope metadata`);
      return;
    }
  }
  for (const selector of APPROVED_V12_CUSTODY_SELECTORS.keys()) {
    if (!seen.has(selector)) {
      blockers.push(`${prefix} record must include every approved fee-governance selector`);
      return;
    }
  }
}

function isMainnetReadinessEvidencePath(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    /^evidence\/mainnet-readiness\/v1-2\//.test(lower) &&
    !/(local|untrusted|sandbox|replace-me|placeholder|pending|todo|tbd|\/tmp\/|\.\.)/.test(lower)
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isObviousPlaceholderAddress(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    /^0x([0-9a-f])\1{39}$/.test(lower) ||
    lower === "0x1234567890123456789012345678901234567890" ||
    lower === "0x2345678901234567890123456789012345678901"
  );
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}
