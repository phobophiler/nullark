import { canLaunchGuardedV1, canMarkPhase2Ready, type GuardedV1GateStatus, type Phase2GateStatus } from "./launchGates.js";

export type ReadinessBlocker =
  | "guarded-v1-gates-incomplete"
  | "phase2-gates-incomplete"
  | "verifier-promotion-incomplete"
  | "deployment-package-incomplete"
  | "gas-evidence-incomplete"
  | "legal-review-incomplete"
  | "external-security-review-incomplete"
  | "anonymity-set-not-met"
  | "owner-approval-missing"
  | "wrong-chain"
  | "mainnet-4326-not-blocked"
  | "guarded-users-not-blocked"
  | "private-keys-in-repo"
  | "real-funds-approved"
  | "production-privacy-claims-not-blocked"
  | "deploy-signing-not-blocked";

export type LaunchReadinessRecord = {
  chainId: number;
  guardedV1: GuardedV1GateStatus;
  phase2: Phase2GateStatus;
  verifierPromotionReady: boolean;
  deploymentPackageReady: boolean;
  gasEvidenceReady: boolean;
  legalReviewComplete: boolean;
  externalSecurityReviewComplete: boolean;
  anonymitySetThresholdMet: boolean;
  ownerApprovalRecorded: boolean;
  mainnet4326Blocked: boolean;
  guardedUsersBlocked: boolean;
  privateKeysInRepo: boolean;
  realFundsApproved: boolean;
  productionPrivacyClaimsBlocked: boolean;
  deploySigningBlocked: boolean;
};

export type LaunchReadinessDecision = {
  guardedTestnetReady: boolean;
  mainnetReady: false;
  blockers: ReadinessBlocker[];
};

export type V12LaneHashRef = {
  lane?: string;
  path?: string;
  sha256?: string;
  status?: string;
};

export type V12LaneHashBindingValidationOptions = {
  statusMode?: "pre-readiness" | "final-ready";
};

export type V12AggregateReadinessPreReadinessRecord = {
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
  laneRefs?: readonly V12LaneHashRef[];
  failClosedMode?: boolean;
  v1_1PreservationResult?: {
    status?: string;
    doesNotApproveV1_2?: boolean;
  };
  v1_2OnlyApprovalGraph?: {
    excludesV1_1Approvals?: boolean;
    v1_1ApprovalDoesNotApproveV1_2?: boolean;
  };
  exactBlockers?: readonly string[];
  blockedUntil?: readonly string[];
};

const REQUIRED_V12_AGGREGATE_LANES = [
  "public-runtime-current-state",
  "deployment-package",
  "source-verification-package",
  "trusted-setup-prover-promotion",
  "custody-record",
  "fee-governance-gas-log-storage",
  "relayer-runtime-policy",
  "frontend-prover-indexer-recovery",
  "negative-vectors",
  "launch-approval"
] as const;

export function evaluateLaunchReadiness(record: LaunchReadinessRecord): LaunchReadinessDecision {
  const blockers: ReadinessBlocker[] = [];

  if (record.chainId !== 6343) {
    blockers.push("wrong-chain");
  }

  if (!canLaunchGuardedV1(record.guardedV1)) {
    blockers.push("guarded-v1-gates-incomplete");
  }

  if (!canMarkPhase2Ready(record.phase2)) {
    blockers.push("phase2-gates-incomplete");
  }

  if (!record.verifierPromotionReady) {
    blockers.push("verifier-promotion-incomplete");
  }

  if (!record.deploymentPackageReady) {
    blockers.push("deployment-package-incomplete");
  }

  if (!record.gasEvidenceReady) {
    blockers.push("gas-evidence-incomplete");
  }

  if (!record.legalReviewComplete) {
    blockers.push("legal-review-incomplete");
  }

  if (!record.externalSecurityReviewComplete) {
    blockers.push("external-security-review-incomplete");
  }

  if (!record.anonymitySetThresholdMet) {
    blockers.push("anonymity-set-not-met");
  }

  if (!record.ownerApprovalRecorded) {
    blockers.push("owner-approval-missing");
  }

  if (!record.mainnet4326Blocked) {
    blockers.push("mainnet-4326-not-blocked");
  }

  if (!record.guardedUsersBlocked) {
    blockers.push("guarded-users-not-blocked");
  }

  if (record.privateKeysInRepo) {
    blockers.push("private-keys-in-repo");
  }

  if (record.realFundsApproved) {
    blockers.push("real-funds-approved");
  }

  if (!record.productionPrivacyClaimsBlocked) {
    blockers.push("production-privacy-claims-not-blocked");
  }

  if (!record.deploySigningBlocked) {
    blockers.push("deploy-signing-not-blocked");
  }

  return {
    guardedTestnetReady: blockers.length === 0,
    mainnetReady: false,
    blockers
  };
}

export function assertV12AggregateReadinessPreReadinessBlocked(
  record: V12AggregateReadinessPreReadinessRecord,
  actualSha256ByPath: Readonly<Record<string, string>> = {}
): V12AggregateReadinessPreReadinessRecord {
  if (!isBlockedPreReadinessStatus(record.status)) {
    throw new Error("v1.2 aggregate readiness must remain blocked pre-readiness");
  }
  if (record.chainId !== 4326 || record.environment !== "megaeth-mainnet") {
    throw new Error("v1.2 aggregate readiness must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked !== true) {
    throw new Error("v1.2 aggregate readiness must keep mainnet4326Blocked true");
  }
  assertV12NonAuthorizingFlags(record, "v1.2 aggregate readiness");
  if (record.failClosedMode !== true) {
    throw new Error("v1.2 aggregate readiness must stay fail-closed");
  }
  if (
    record.v1_1PreservationResult?.status !== "passed" ||
    record.v1_1PreservationResult.doesNotApproveV1_2 !== true ||
    record.v1_2OnlyApprovalGraph?.excludesV1_1Approvals !== true ||
    record.v1_2OnlyApprovalGraph?.v1_1ApprovalDoesNotApproveV1_2 !== true
  ) {
    throw new Error("v1.2 aggregate readiness must preserve v1.1 as context only");
  }

  const hashBlockers = collectV12LaneHashBindingBlockers(record.laneRefs ?? [], actualSha256ByPath);
  if (hashBlockers.length > 0) {
    throw new Error(hashBlockers[0]);
  }
  if (!Array.isArray(record.exactBlockers) || record.exactBlockers.length === 0) {
    throw new Error("v1.2 aggregate readiness must list exact blockers");
  }
  if (!Array.isArray(record.blockedUntil) || record.blockedUntil.length === 0) {
    throw new Error("v1.2 aggregate readiness must list stop conditions");
  }

  return record;
}

export function collectV12LaneHashBindingBlockers(
  refs: readonly V12LaneHashRef[],
  actualSha256ByPath: Readonly<Record<string, string>>,
  options: V12LaneHashBindingValidationOptions = {}
): string[] {
  const blockers: string[] = [];
  const statusMode = options.statusMode ?? "pre-readiness";
  blockers.push(...collectV12LaneGraphShapeBlockers(refs));

  for (const lane of REQUIRED_V12_AGGREGATE_LANES) {
    const expectedPath = `evidence/mainnet-readiness/v1-2/${v12LaneFilename(lane)}`;
    const ref = refs.find((candidate) => candidate.lane === lane && candidate.path === expectedPath);
    if (!ref) {
      blockers.push(`v1.2 aggregate readiness missing lane hash ref for ${lane}`);
      continue;
    }
    if (!v12LaneRefStatusMatchesMode(ref.status, statusMode)) {
      blockers.push(v12LaneStatusBlocker(lane, statusMode));
    }
    if (!isSha256(ref.sha256)) {
      blockers.push(`v1.2 aggregate readiness has invalid sha256 for ${lane}`);
      continue;
    }
    const actual = actualSha256ByPath[expectedPath];
    if (actual === undefined) {
      blockers.push(`v1.2 aggregate readiness missing current lane hash for ${lane}: ${expectedPath}`);
    } else if (normalizeSha256(actual) !== normalizeSha256(ref.sha256)) {
      blockers.push(`v1.2 aggregate readiness hash mismatch for ${lane}: ${expectedPath}`);
    }
  }
  return blockers;
}

function collectV12LaneGraphShapeBlockers(refs: readonly V12LaneHashRef[]): string[] {
  const expectedPathsByLane = new Map<string, string>(
    REQUIRED_V12_AGGREGATE_LANES.map((lane) => [
      lane,
      `evidence/mainnet-readiness/v1-2/${v12LaneFilename(lane)}`
    ])
  );
  const laneCounts = new Map<string, number>();
  const pathCounts = new Map<string, number>();
  const unknownLanes = new Set<string>();
  const mismatchedPaths = new Set<string>();

  for (const ref of refs) {
    const lane = typeof ref.lane === "string" ? ref.lane : "";
    const refPath = typeof ref.path === "string" ? ref.path : "";
    if (!lane || !expectedPathsByLane.has(lane)) {
      unknownLanes.add(lane || "<missing>");
    } else if (refPath !== expectedPathsByLane.get(lane)) {
      mismatchedPaths.add(refPath || "<missing>");
    }
    if (lane) {
      laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    }
    if (refPath) {
      pathCounts.set(refPath, (pathCounts.get(refPath) ?? 0) + 1);
    }
  }

  const blockers: string[] = [];
  const duplicateLanes = [...laneCounts.entries()].filter(([, count]) => count > 1).map(([lane]) => lane);
  if (duplicateLanes.length > 0) {
    blockers.push(`v1.2 aggregate readiness laneRefs must not contain duplicate lane refs: ${duplicateLanes.sort().join(", ")}`);
  }
  if (unknownLanes.size > 0) {
    blockers.push(`v1.2 aggregate readiness laneRefs must not contain unknown lane refs: ${[...unknownLanes].sort().join(", ")}`);
  }
  const duplicatePaths = [...pathCounts.entries()].filter(([, count]) => count > 1).map(([entryPath]) => entryPath);
  if (duplicatePaths.length > 0) {
    blockers.push(`v1.2 aggregate readiness laneRefs must not contain duplicate paths: ${duplicatePaths.sort().join(", ")}`);
  }
  if (mismatchedPaths.size > 0) {
    blockers.push(`v1.2 aggregate readiness laneRefs must not contain lane/path mismatches: ${[...mismatchedPaths].sort().join(", ")}`);
  }

  return blockers;
}

function v12LaneFilename(lane: (typeof REQUIRED_V12_AGGREGATE_LANES)[number]): string {
  if (lane === "public-runtime-current-state") {
    return "public-runtime-current-state.json";
  }
  return `${lane}.approved.json`;
}

function assertV12NonAuthorizingFlags(record: V12AggregateReadinessPreReadinessRecord, label: string): void {
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

function v12LaneRefStatusMatchesMode(status: unknown, statusMode: V12LaneHashBindingValidationOptions["statusMode"]): boolean {
  if (statusMode === "final-ready") {
    return status === "approved-for-mainnet";
  }
  return isBlockedPreReadinessStatus(status);
}

function v12LaneStatusBlocker(
  lane: (typeof REQUIRED_V12_AGGREGATE_LANES)[number],
  statusMode: V12LaneHashBindingValidationOptions["statusMode"]
): string {
  if (statusMode === "final-ready") {
    return `v1.2 aggregate readiness must keep ${lane} status approved-for-mainnet for final-ready validation`;
  }
  return `v1.2 aggregate readiness must keep ${lane} status blocked pre-readiness`;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^(sha256:)?[0-9a-f]{64}$/.test(value);
}

function normalizeSha256(value: string | undefined): string | undefined {
  return value?.replace(/^sha256:/, "");
}
