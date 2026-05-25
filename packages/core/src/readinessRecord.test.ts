import { describe, expect, it } from "vitest";
import {
  assertV12AggregateReadinessPreReadinessBlocked,
  collectV12LaneHashBindingBlockers,
  evaluateLaunchReadiness,
  type LaunchReadinessRecord,
  type V12AggregateReadinessPreReadinessRecord,
  type V12LaneHashRef
} from "./readinessRecord.js";

const guardedV1Complete = {
  realVerifierContracts: true,
  realCircuitsWithVectors: true,
  publicInputsBoundToChainAndContract: true,
  rootHistoryPolicyComplete: true,
  provingWitnessExposureDocumented: true,
  legalReviewComplete: true,
  securityReviewComplete: true,
  complianceGatesComplete: true,
  emergencyPolicyComplete: true,
  anonymitySetThresholdRecorded: true,
  anonymitySetThresholdMet: true,
  megaEthGasAndStorageReviewed: true,
  megaEthRemoteGasEvidenceRecorded: true,
  slitherOrStaticAnalysisComplete: true,
  noHighOrCriticalFindings: true
};

const phase2Complete = {
  guardedV1GatesComplete: true,
  privacyUxExplainsSmallAnonymitySets: true,
  proofModeUxDistinguishesLocalAndService: true,
  publicEdgeComplianceChecksStayPublic: true,
  hostedServicesCannotHoldSpendingKeys: true,
  noProductionPrivacyClaims: true,
  mainnetChain4326Blocked: true
};

const completeRecord: LaunchReadinessRecord = {
  chainId: 6343,
  guardedV1: guardedV1Complete,
  phase2: phase2Complete,
  verifierPromotionReady: true,
  deploymentPackageReady: true,
  gasEvidenceReady: true,
  legalReviewComplete: true,
  externalSecurityReviewComplete: true,
  anonymitySetThresholdMet: true,
  ownerApprovalRecorded: true,
  mainnet4326Blocked: true,
  guardedUsersBlocked: true,
  privateKeysInRepo: false,
  realFundsApproved: false,
  productionPrivacyClaimsBlocked: true,
  deploySigningBlocked: true
};

describe("launch readiness record", () => {
  it("keeps current scaffold state blocked with explicit blockers", () => {
    const decision = evaluateLaunchReadiness({
      ...completeRecord,
      verifierPromotionReady: false,
      deploymentPackageReady: false,
      gasEvidenceReady: false,
      legalReviewComplete: false,
      externalSecurityReviewComplete: false,
      anonymitySetThresholdMet: false,
      ownerApprovalRecorded: false,
      mainnet4326Blocked: true,
      guardedUsersBlocked: true,
      privateKeysInRepo: false,
      realFundsApproved: false,
      productionPrivacyClaimsBlocked: true,
      deploySigningBlocked: true
    });

    expect(decision.guardedTestnetReady).toBe(false);
    expect(decision.mainnetReady).toBe(false);
    expect(decision.blockers).toEqual([
      "verifier-promotion-incomplete",
      "deployment-package-incomplete",
      "gas-evidence-incomplete",
      "legal-review-incomplete",
      "external-security-review-incomplete",
      "anonymity-set-not-met",
      "owner-approval-missing"
    ]);
  });

  it("includes guarded v1 and Phase 2 gate blockers", () => {
    const decision = evaluateLaunchReadiness({
      ...completeRecord,
      guardedV1: { ...guardedV1Complete, megaEthRemoteGasEvidenceRecorded: false },
      phase2: { ...phase2Complete, hostedServicesCannotHoldSpendingKeys: false }
    });

    expect(decision.blockers).toContain("guarded-v1-gates-incomplete");
    expect(decision.blockers).toContain("phase2-gates-incomplete");
    expect(decision.guardedTestnetReady).toBe(false);
  });

  it("allows guarded testnet only when every recorded gate is complete, while mainnet remains false", () => {
    const decision = evaluateLaunchReadiness(completeRecord);

    expect(decision).toEqual({
      guardedTestnetReady: true,
      mainnetReady: false,
      blockers: []
    });
  });

  it("requires testnet safety blocks to remain active", () => {
    const decision = evaluateLaunchReadiness({
      ...completeRecord,
      chainId: 4326,
      mainnet4326Blocked: false,
      guardedUsersBlocked: false,
      privateKeysInRepo: true,
      realFundsApproved: true,
      productionPrivacyClaimsBlocked: false,
      deploySigningBlocked: false
    });

    expect(decision.guardedTestnetReady).toBe(false);
    expect(decision.blockers).toEqual([
      "wrong-chain",
      "mainnet-4326-not-blocked",
      "guarded-users-not-blocked",
      "private-keys-in-repo",
      "real-funds-approved",
      "production-privacy-claims-not-blocked",
      "deploy-signing-not-blocked"
    ]);
  });
});

const v12LaneRefTuples = [
  ["public-runtime-current-state", "public-runtime-current-state.json"],
  ["deployment-package", "deployment-package.approved.json"],
  ["source-verification-package", "source-verification-package.approved.json"],
  ["trusted-setup-prover-promotion", "trusted-setup-prover-promotion.approved.json"],
  ["custody-record", "custody-record.approved.json"],
  ["fee-governance-gas-log-storage", "fee-governance-gas-log-storage.approved.json"],
  ["relayer-runtime-policy", "relayer-runtime-policy.approved.json"],
  ["frontend-prover-indexer-recovery", "frontend-prover-indexer-recovery.approved.json"],
  ["negative-vectors", "negative-vectors.approved.json"],
  ["launch-approval", "launch-approval.approved.json"]
] as const;

const v12LaneRefHashChars = "123456789a";

const v12LaneRefs: V12LaneHashRef[] = v12LaneRefTuples.map(([lane, filename], index) => ({
  lane,
  path: `docs/evidence/mainnet-readiness/v1-2/${filename}`,
  sha256: `sha256:${v12LaneRefHashChars.charAt(index).repeat(64)}`,
  status: "blocked-pre-readiness"
}));

const v12AggregatePreReadinessRecord: V12AggregateReadinessPreReadinessRecord = {
  status: "blocked-pre-readiness",
  chainId: 4326,
  environment: "megaeth-mainnet",
  mainnet4326Blocked: true,
  approvesDeployment: false,
  approvesSigning: false,
  approvesFunding: false,
  approvesRelayerEnablement: false,
  approvesGuardedUsers: false,
  approvesPrivacyClaims: false,
  laneRefs: v12LaneRefs,
  v1_1PreservationResult: {
    status: "passed",
    doesNotApproveV1_2: true
  },
  v1_2OnlyApprovalGraph: {
    excludesV1_1Approvals: true,
    v1_1ApprovalDoesNotApproveV1_2: true
  },
  failClosedMode: true,
  exactBlockers: ["All referenced semantic lane records remain blocked."],
  blockedUntil: ["replace every pre-readiness or blocked lane with final evidence"]
};

const v12CurrentLaneHashes = (): Record<string, string> =>
  Object.fromEntries(v12LaneRefs.map((ref) => [ref.path, String(ref.sha256).replace(/^sha256:/, "")]));

describe("v1.2 aggregate readiness pre-readiness boundary", () => {
  it("accepts a fail-closed, non-authorizing aggregate record with current lane hashes", () => {
    const currentHashes = v12CurrentLaneHashes();

    expect(assertV12AggregateReadinessPreReadinessBlocked(v12AggregatePreReadinessRecord, currentHashes)).toBe(
      v12AggregatePreReadinessRecord
    );
  });

  it("rejects stale lane hash bindings", () => {
    expect(
      collectV12LaneHashBindingBlockers(v12LaneRefs, {
        "docs/evidence/mainnet-readiness/v1-2/custody-record.approved.json": "0".repeat(64)
      })
    ).toContain("v1.2 aggregate readiness hash mismatch for custody-record: docs/evidence/mainnet-readiness/v1-2/custody-record.approved.json");
  });

  it("rejects missing current lane hash evidence", () => {
    const currentHashes = v12CurrentLaneHashes();
    delete currentHashes["docs/evidence/mainnet-readiness/v1-2/source-verification-package.approved.json"];

    expect(collectV12LaneHashBindingBlockers(v12LaneRefs, currentHashes)).toContain(
      "v1.2 aggregate readiness missing current lane hash for source-verification-package: docs/evidence/mainnet-readiness/v1-2/source-verification-package.approved.json"
    );
  });

  it("rejects missing required lane refs", () => {
    expect(collectV12LaneHashBindingBlockers(v12LaneRefs.filter((ref) => ref.lane !== "negative-vectors"), {})).toContain(
      "v1.2 aggregate readiness missing lane hash ref for negative-vectors"
    );
  });

  it("rejects aggregate self-references in lane refs", () => {
    expect(
      collectV12LaneHashBindingBlockers(
        [
          ...v12LaneRefs,
          {
            lane: "aggregate-readiness",
            path: "docs/evidence/mainnet-readiness/v1-2/aggregate-readiness.approved.json",
            sha256: `sha256:${"b".repeat(64)}`,
            status: "blocked-pre-readiness"
          }
        ],
        v12CurrentLaneHashes()
      )
    ).toContain("v1.2 aggregate readiness laneRefs must not contain unknown lane refs: aggregate-readiness");
  });

  it("rejects duplicate lane refs and duplicate paths", () => {
    expect(collectV12LaneHashBindingBlockers([...v12LaneRefs, { ...v12LaneRefs[0] }], {})).toEqual(
      expect.arrayContaining([
        "v1.2 aggregate readiness laneRefs must not contain duplicate lane refs: public-runtime-current-state",
        "v1.2 aggregate readiness laneRefs must not contain duplicate paths: docs/evidence/mainnet-readiness/v1-2/public-runtime-current-state.json"
      ])
    );
  });

  it("rejects lane/path label mismatches", () => {
    const mismatchedRefs = v12LaneRefs.map((ref) =>
      ref.lane === "source-verification-package"
        ? {
            ...ref,
            path: "docs/evidence/mainnet-readiness/v1-2/deployment-package.approved.json"
          }
        : ref
    );

    expect(collectV12LaneHashBindingBlockers(mismatchedRefs, {})).toContain(
      "v1.2 aggregate readiness laneRefs must not contain lane/path mismatches: docs/evidence/mainnet-readiness/v1-2/deployment-package.approved.json"
    );
  });

  it("rejects blocked lane refs when validating final-ready bindings", () => {
    expect(collectV12LaneHashBindingBlockers(v12LaneRefs, {}, { statusMode: "final-ready" })).toContain(
      "v1.2 aggregate readiness must keep public-runtime-current-state status approved-for-mainnet for final-ready validation"
    );
  });

  it("rejects aggregate records that mark any lane non-blocked during pre-readiness", () => {
    expect(() =>
      assertV12AggregateReadinessPreReadinessBlocked(
        {
          ...v12AggregatePreReadinessRecord,
          laneRefs: v12LaneRefs.map((ref) => (ref.lane === "launch-approval" ? { ...ref, status: "approved-for-mainnet" } : ref))
        },
        v12CurrentLaneHashes()
      )
    ).toThrow("v1.2 aggregate readiness must keep launch-approval status blocked pre-readiness");

    expect(() =>
      assertV12AggregateReadinessPreReadinessBlocked(
        {
          ...v12AggregatePreReadinessRecord,
          laneRefs: v12LaneRefs.map((ref) => (ref.lane === "custody-record" ? { ...ref, status: "ready" } : ref))
        },
        v12CurrentLaneHashes()
      )
    ).toThrow("v1.2 aggregate readiness must keep custody-record status blocked pre-readiness");
  });

  it.each([
    "approvesDeployment",
    "approvesSigning",
    "approvesFunding",
    "approvesRelayerEnablement",
    "approvesGuardedUsers",
    "approvesPrivacyClaims"
  ] as const)("rejects aggregate records that set %s", (flag) => {
    expect(() =>
      assertV12AggregateReadinessPreReadinessBlocked({
        ...v12AggregatePreReadinessRecord,
        [flag]: true
      })
    ).toThrow(`v1.2 aggregate readiness must keep ${flag} false`);
  });

  it("rejects aggregate records that disable fail-closed mode", () => {
    expect(() =>
      assertV12AggregateReadinessPreReadinessBlocked({
        ...v12AggregatePreReadinessRecord,
        failClosedMode: false
      })
    ).toThrow("v1.2 aggregate readiness must stay fail-closed");
  });
});
