export type GuardedV1GateStatus = {
  realVerifierContracts: boolean;
  realCircuitsWithVectors: boolean;
  publicInputsBoundToChainAndContract: boolean;
  rootHistoryPolicyComplete: boolean;
  provingWitnessExposureDocumented: boolean;
  legalReviewComplete: boolean;
  securityReviewComplete: boolean;
  complianceGatesComplete: boolean;
  emergencyPolicyComplete: boolean;
  anonymitySetThresholdRecorded: boolean;
  anonymitySetThresholdMet: boolean;
  megaEthGasAndStorageReviewed: boolean;
  megaEthRemoteGasEvidenceRecorded: boolean;
  slitherOrStaticAnalysisComplete: boolean;
  noHighOrCriticalFindings: boolean;
};

export function canLaunchGuardedV1(status: GuardedV1GateStatus): boolean {
  return Object.values(status).every(Boolean);
}

export type Phase2GateStatus = {
  guardedV1GatesComplete: boolean;
  privacyUxExplainsSmallAnonymitySets: boolean;
  proofModeUxDistinguishesLocalAndService: boolean;
  publicEdgeComplianceChecksStayPublic: boolean;
  hostedServicesCannotHoldSpendingKeys: boolean;
  noProductionPrivacyClaims: boolean;
  mainnetChain4326Blocked: boolean;
};

export type Phase3GateStatus = Phase2GateStatus & {
  expansionPolicyComplete: boolean;
  assetExpansionPolicyComplete: boolean;
  internalPrivateTransferFeePolicyComplete: boolean;
  publicEdgeCompliancePolicyComplete: boolean;
  privateIntegrationPolicyComplete: boolean;
};

export function canMarkPhase2Ready(status: Phase2GateStatus): boolean {
  return Object.values(status).every(Boolean);
}

export function canMarkPhase3Ready(status: Phase3GateStatus): boolean {
  return canMarkPhase2Ready(status) && Object.values(status).every(Boolean);
}

export type V12LaunchApprovalPreReadinessRecord = {
  status?: string;
  launchEvidenceStatus?: string;
  ownerApprovalText?: string;
  finalOwnerApprovalText?: string;
  chainId?: number;
  environment?: string;
  mainnet4326Blocked?: boolean;
  ownerApprovalRef?: string | null;
  ownerApprovalSha256?: string | null;
  finalOwnerApprovalRef?: string | null;
  finalOwnerApprovalSha256?: string | null;
  evidenceHashes?: readonly V12LaunchApprovalEvidenceHash[];
  approvesDeployment?: boolean;
  approvesSigning?: boolean;
  approvesFunding?: boolean;
  approvesRelayerEnablement?: boolean;
  approvesGuardedUsers?: boolean;
  approvesPrivacyClaims?: boolean;
  fundingLimits?: {
    status?: string;
    deployerFundingApproved?: boolean;
    relayerFundingApproved?: boolean;
    approvesFunding?: boolean;
    approvesDeployment?: boolean;
    approvesSigning?: boolean;
    maxBalanceWei?: string | number | boolean | null;
  };
  signingLimits?: {
    status?: string;
    approvesSigning?: boolean;
    approvesBroadcast?: boolean;
    approvesDeployment?: boolean;
    deploymentApproved?: boolean;
    broadcastApproved?: boolean;
    signingApproved?: boolean;
    allowedSelectors?: readonly string[];
  };
  guardedUserPolicy?: {
    status?: string;
    approvesGuardedUsers?: boolean;
    enablementApproved?: boolean;
    guardedUsersApproved?: boolean;
    selfSubmissionFallback?: boolean;
  };
  privacyCopyStatus?: {
    status?: string;
    approvesPrivacyClaims?: boolean;
    productionPrivacyClaimsApproved?: boolean;
  };
  exactBlockers?: readonly string[];
  blockedUntil?: readonly string[];
};

export type V12LaunchApprovalEvidenceHash = {
  lane?: string;
  path?: string;
  status?: string;
  sha256?: string;
};

const V12_FINAL_REQUIRED_LANES = [
  "public-runtime-current-state",
  "deployment-package",
  "source-verification-package",
  "trusted-setup-prover-promotion",
  "custody-record",
  "fee-governance-gas-log-storage",
  "relayer-runtime-policy",
  "frontend-prover-indexer-recovery",
  "negative-vectors"
] as const;

export function assertV12LaunchApprovalPreReadinessBlocked(
  record: V12LaunchApprovalPreReadinessRecord
): V12LaunchApprovalPreReadinessRecord {
  if (!isBlockedPreReadinessStatus(record.status)) {
    throw new Error("v1.2 launch approval must remain blocked pre-readiness");
  }
  if (record.chainId !== 4326 || record.environment !== "megaeth-mainnet") {
    throw new Error("v1.2 launch approval must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked !== true) {
    throw new Error("v1.2 launch approval must keep mainnet4326Blocked true");
  }
  assertNoAuthorizingLaunchApprovalText(record);
  assertNoApprovedLaunchEvidenceWithoutFinalOwnerApproval(record);
  assertV12NonAuthorizingFlags(record, "v1.2 launch approval");
  assertFundingLimitsBlocked(record.fundingLimits);
  assertSigningLimitsBlocked(record.signingLimits);
  assertGuardedUsersBlocked(record.guardedUserPolicy);
  assertPrivacyClaimsBlocked(record.privacyCopyStatus);
  if (!Array.isArray(record.exactBlockers) || record.exactBlockers.length === 0) {
    throw new Error("v1.2 launch approval must list exact blockers");
  }
  if (!Array.isArray(record.blockedUntil) || record.blockedUntil.length === 0) {
    throw new Error("v1.2 launch approval must list stop conditions");
  }

  return record;
}

function assertNoApprovedLaunchEvidenceWithoutFinalOwnerApproval(record: V12LaunchApprovalPreReadinessRecord): void {
  if (!isApprovedStatus(record.launchEvidenceStatus)) {
    return;
  }
  if (!record.finalOwnerApprovalRef || !isSha256(record.finalOwnerApprovalSha256)) {
    throw new Error("v1.2 launch approval cannot claim approved status without final owner approval ref and hash");
  }
  if (
    record.ownerApprovalRef !== record.finalOwnerApprovalRef ||
    normalizeSha256(record.ownerApprovalSha256) !== normalizeSha256(record.finalOwnerApprovalSha256)
  ) {
    throw new Error("v1.2 launch approval final owner approval must match the owner approval ref and hash");
  }
  if (isStaleV11Ref(record.ownerApprovalRef) || isStaleV11Ref(record.finalOwnerApprovalRef)) {
    throw new Error("v1.2 launch approval must not reuse stale v1.1 approval refs");
  }
  if (!approvedLaunchEvidenceHashesAreComplete(record.evidenceHashes)) {
    throw new Error("v1.2 launch approval cannot claim approved status while required readiness lanes are blocked or missing");
  }
}

function assertNoAuthorizingLaunchApprovalText(record: V12LaunchApprovalPreReadinessRecord): void {
  const text = [record.ownerApprovalText, record.finalOwnerApprovalText].filter(Boolean).join("\n").toLowerCase();
  const forbidden = [
    /\bi approve\b.*\bdeploy(?:ment)?\b/,
    /\bdeploy(?:ment)?\b.*\bapproved\b/,
    /\bi approve\b.*\bsign(?:ing)?\b/,
    /\bsign(?:ing)?\b.*\bapproved\b/,
    /\bi approve\b.*\bbroadcast\b/,
    /\bbroadcast\b.*\bapproved\b/,
    /\bi approve\b.*\bfunding\b/,
    /\bfunding\b.*\bapproved\b/,
    /\bi approve\b.*\brelayer\b/,
    /\brelayer\b.*\benablement\b.*\bapproved\b/,
    /\bi approve\b.*\bguarded[-\s]?users?\b/,
    /\bguarded[-\s]?users?\b.*\bapproved\b/,
    /\bi approve\b.*\bprivacy claims?\b/,
    /\bproduction privacy claims?\b.*\bapproved\b/
  ];
  if (forbidden.some((pattern) => pattern.test(text))) {
    throw new Error(
      "v1.2 launch approval text must not authorize deployment, signing, broadcast, funding, relayer enablement, guarded users, or privacy claims"
    );
  }
}

function approvedLaunchEvidenceHashesAreComplete(entries: V12LaunchApprovalPreReadinessRecord["evidenceHashes"]): boolean {
  if (!Array.isArray(entries)) {
    return false;
  }
  return V12_FINAL_REQUIRED_LANES.every((lane) => {
    const entry = entries.find((candidate) => candidate.lane === lane);
    return (
      entry !== undefined &&
      isApprovedStatus(entry.status) &&
      typeof entry.path === "string" &&
      entry.path.startsWith("docs/evidence/mainnet-readiness/v1-2/") &&
      !isStaleV11Ref(entry.path) &&
      isSha256(entry.sha256)
    );
  });
}

function assertFundingLimitsBlocked(limits: V12LaunchApprovalPreReadinessRecord["fundingLimits"]): void {
  if (
    !isNotApprovedOrBlocked(limits?.status) ||
    limits?.deployerFundingApproved !== false ||
    limits?.relayerFundingApproved !== false ||
    limits?.approvesFunding !== false ||
    limits?.approvesDeployment !== false ||
    limits?.approvesSigning !== false ||
    !isNotApprovedValue(limits?.maxBalanceWei)
  ) {
    throw new Error("v1.2 launch approval must not grant funding limits");
  }
}

function assertSigningLimitsBlocked(limits: V12LaunchApprovalPreReadinessRecord["signingLimits"]): void {
  const selectors = limits?.allowedSelectors;
  const selectorsBlocked =
    selectors === undefined || selectors.length === 0 || selectors.every((selector) => selector.toUpperCase() === "NOT_APPROVED");
  if (
    !isNotApprovedOrBlocked(limits?.status) ||
    limits?.approvesSigning !== false ||
    limits?.approvesBroadcast !== false ||
    limits?.approvesDeployment !== false ||
    limits?.deploymentApproved !== false ||
    limits?.broadcastApproved !== false ||
    limits?.signingApproved !== false ||
    !selectorsBlocked
  ) {
    throw new Error("v1.2 launch approval must not grant signing, broadcast, deployment, or selectors");
  }
}

function assertGuardedUsersBlocked(policy: V12LaunchApprovalPreReadinessRecord["guardedUserPolicy"]): void {
  if (
    !isNotApprovedOrBlocked(policy?.status) ||
    policy?.approvesGuardedUsers !== false ||
    policy?.enablementApproved !== false ||
    policy?.guardedUsersApproved !== false ||
    policy?.selfSubmissionFallback !== true
  ) {
    throw new Error("v1.2 launch approval must keep guarded users blocked and self-submission fallback enabled");
  }
}

function assertPrivacyClaimsBlocked(status: V12LaunchApprovalPreReadinessRecord["privacyCopyStatus"]): void {
  if (
    !isNotApprovedOrBlocked(status?.status) ||
    status?.approvesPrivacyClaims !== false ||
    status?.productionPrivacyClaimsApproved !== false
  ) {
    throw new Error("v1.2 launch approval must keep production privacy claims blocked");
  }
}

function assertV12NonAuthorizingFlags(record: V12LaunchApprovalPreReadinessRecord, label: string): void {
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

function isBlockedPreReadinessStatus(status: unknown): boolean {
  return typeof status === "string" && /^(blocked-|pre-readiness|blocked$)/.test(status);
}

function isNotApprovedOrBlocked(status: unknown): boolean {
  if (typeof status !== "string") {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === "blocked" || normalized.startsWith("blocked-") || normalized === "not-approved" || normalized === "not_approved";
}

function isNotApprovedValue(value: unknown): boolean {
  return value === undefined || value === null || value === false || value === 0 || value === "0" || String(value).toUpperCase() === "NOT_APPROVED";
}

function isApprovedStatus(status: unknown): boolean {
  return typeof status === "string" && /approved|ready/i.test(status);
}

function isSha256(value: unknown): boolean {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function isStaleV11Ref(value: unknown): boolean {
  return typeof value === "string" && /v1[._-]?1|nullark-v1\.1-mainnet/i.test(value);
}
