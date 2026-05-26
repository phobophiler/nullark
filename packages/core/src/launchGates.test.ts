import { describe, expect, it } from "vitest";
import {
  assertV12LaunchApprovalPreReadinessBlocked,
  canLaunchGuardedV1,
  canMarkPhase2Ready,
  canMarkPhase3Ready,
  type GuardedV1GateStatus,
  type V12LaunchApprovalPreReadinessRecord,
  type Phase3GateStatus
} from "./launchGates.js";

const passingStatus: GuardedV1GateStatus = {
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

describe("guarded v1 launch gates", () => {
  it("blocks guarded v1 when legal or security review is missing", () => {
    expect(canLaunchGuardedV1({ ...passingStatus, legalReviewComplete: false })).toBe(false);
  });

  it("requires MegaETH gas and storage review", () => {
    expect(canLaunchGuardedV1({ ...passingStatus, megaEthGasAndStorageReviewed: false })).toBe(false);
  });

  it("requires real circuits with vectors and public input binding", () => {
    expect(canLaunchGuardedV1({ ...passingStatus, realCircuitsWithVectors: false })).toBe(false);
    expect(canLaunchGuardedV1({ ...passingStatus, publicInputsBoundToChainAndContract: false })).toBe(false);
  });

  it("requires an accepted-root and Merkle root-history policy", () => {
    expect(canLaunchGuardedV1({ ...passingStatus, rootHistoryPolicyComplete: false })).toBe(false);
  });

  it("requires static analysis, remote gas evidence, and a met anonymity threshold", () => {
    expect(canLaunchGuardedV1({ ...passingStatus, slitherOrStaticAnalysisComplete: false })).toBe(false);
    expect(canLaunchGuardedV1({ ...passingStatus, megaEthRemoteGasEvidenceRecorded: false })).toBe(false);
    expect(canLaunchGuardedV1({ ...passingStatus, anonymitySetThresholdMet: false })).toBe(false);
  });

  it("allows guarded v1 only when all gates pass", () => {
    expect(canLaunchGuardedV1(passingStatus)).toBe(true);
  });
});

const passingPhase3Status: Phase3GateStatus = {
  guardedV1GatesComplete: true,
  privacyUxExplainsSmallAnonymitySets: true,
  proofModeUxDistinguishesLocalAndService: true,
  publicEdgeComplianceChecksStayPublic: true,
  hostedServicesCannotHoldSpendingKeys: true,
  noProductionPrivacyClaims: true,
  mainnetChain4326Blocked: true,
  expansionPolicyComplete: true,
  assetExpansionPolicyComplete: true,
  internalPrivateTransferFeePolicyComplete: true,
  publicEdgeCompliancePolicyComplete: true,
  privateIntegrationPolicyComplete: true
};

describe("Phase 2 and Phase 3 launch gates", () => {
  it("blocks Phase 2 readiness until guarded v1 gates remain complete", () => {
    expect(canMarkPhase2Ready({ ...passingPhase3Status, guardedV1GatesComplete: false })).toBe(false);
  });

  it("blocks Phase 2 readiness until privacy UX hardening policies are complete", () => {
    expect(canMarkPhase2Ready({ ...passingPhase3Status, privacyUxExplainsSmallAnonymitySets: false })).toBe(false);
    expect(canMarkPhase2Ready({ ...passingPhase3Status, proofModeUxDistinguishesLocalAndService: false })).toBe(false);
    expect(canMarkPhase2Ready({ ...passingPhase3Status, publicEdgeComplianceChecksStayPublic: false })).toBe(false);
    expect(canMarkPhase2Ready({ ...passingPhase3Status, hostedServicesCannotHoldSpendingKeys: false })).toBe(false);
  });

  it("blocks Phase 2 readiness when production privacy claims are present", () => {
    expect(canMarkPhase2Ready({ ...passingPhase3Status, noProductionPrivacyClaims: false })).toBe(false);
  });

  it("keeps Phase 2 and Phase 3 blocked while mainnet chain 4326 is blocked", () => {
    expect(canMarkPhase2Ready({ ...passingPhase3Status, mainnetChain4326Blocked: false })).toBe(false);
    expect(canMarkPhase3Ready({ ...passingPhase3Status, mainnetChain4326Blocked: false })).toBe(false);
  });

  it("blocks Phase 3 readiness unless expansion, fee, compliance, and integration policies are complete", () => {
    expect(canMarkPhase3Ready({ ...passingPhase3Status, assetExpansionPolicyComplete: false })).toBe(false);
    expect(canMarkPhase3Ready({ ...passingPhase3Status, internalPrivateTransferFeePolicyComplete: false })).toBe(false);
    expect(canMarkPhase3Ready({ ...passingPhase3Status, publicEdgeCompliancePolicyComplete: false })).toBe(false);
    expect(canMarkPhase3Ready({ ...passingPhase3Status, privateIntegrationPolicyComplete: false })).toBe(false);
  });

  it("allows Phase 3 readiness only when every Phase 2 and Phase 3 gate passes", () => {
    expect(canMarkPhase3Ready(passingPhase3Status)).toBe(true);
  });
});

const v12LaunchApprovalPreReadinessRecord: V12LaunchApprovalPreReadinessRecord = {
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
  fundingLimits: {
    status: "blocked",
    deployerFundingApproved: false,
    relayerFundingApproved: false,
    approvesFunding: false,
    approvesDeployment: false,
    approvesSigning: false,
    maxBalanceWei: "NOT_APPROVED"
  },
  signingLimits: {
    status: "blocked",
    approvesSigning: false,
    approvesBroadcast: false,
    approvesDeployment: false,
    deploymentApproved: false,
    broadcastApproved: false,
    signingApproved: false,
    allowedSelectors: ["NOT_APPROVED"]
  },
  guardedUserPolicy: {
    status: "blocked",
    approvesGuardedUsers: false,
    enablementApproved: false,
    guardedUsersApproved: false,
    selfSubmissionFallback: true
  },
  privacyCopyStatus: {
    status: "blocked",
    approvesPrivacyClaims: false,
    productionPrivacyClaimsApproved: false
  },
  exactBlockers: ["No final launch owner approval exists."],
  blockedUntil: ["obtain separate final launch owner approval"]
};

const shaA = `sha256:${"a".repeat(64)}`;
const shaB = `sha256:${"b".repeat(64)}`;
const approvedV12LaneHashes = [
  "public-runtime-current-state",
  "deployment-package",
  "source-verification-package",
  "trusted-setup-prover-promotion",
  "custody-record",
  "fee-governance-gas-log-storage",
  "relayer-runtime-policy",
  "frontend-prover-indexer-recovery",
  "negative-vectors"
].map((lane) => ({
  lane,
  path: `evidence/mainnet-readiness/v1-2/${lane}.approved.json`,
  status: "approved",
  sha256: shaA
}));

describe("v1.2 launch approval pre-readiness boundary", () => {
  it("accepts blocked non-authorizing launch approval evidence", () => {
    expect(assertV12LaunchApprovalPreReadinessBlocked(v12LaunchApprovalPreReadinessRecord)).toBe(
      v12LaunchApprovalPreReadinessRecord
    );
  });

  it("rejects funding, signing, guarded-user, or privacy approval in pre-readiness evidence", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        fundingLimits: {
          ...v12LaunchApprovalPreReadinessRecord.fundingLimits,
          relayerFundingApproved: true
        }
      })
    ).toThrow("v1.2 launch approval must not grant funding limits");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        signingLimits: {
          ...v12LaunchApprovalPreReadinessRecord.signingLimits,
          allowedSelectors: ["0x678d8506"]
        }
      })
    ).toThrow("v1.2 launch approval must not grant signing, broadcast, deployment, or selectors");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        guardedUserPolicy: {
          ...v12LaunchApprovalPreReadinessRecord.guardedUserPolicy,
          guardedUsersApproved: true
        }
      })
    ).toThrow("v1.2 launch approval must keep guarded users blocked and self-submission fallback enabled");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        privacyCopyStatus: {
          ...v12LaunchApprovalPreReadinessRecord.privacyCopyStatus,
          productionPrivacyClaimsApproved: true
        }
      })
    ).toThrow("v1.2 launch approval must keep production privacy claims blocked");
  });

  it("rejects records that leave blocked pre-readiness mode or target the wrong chain", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        status: "approved-for-mainnet"
      })
    ).toThrow("v1.2 launch approval must remain blocked pre-readiness");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        chainId: 6343
      })
    ).toThrow("v1.2 launch approval must target MegaETH mainnet 4326");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        mainnet4326Blocked: false
      })
    ).toThrow("v1.2 launch approval must keep mainnet4326Blocked true");
  });

  it("requires exact blockers and stop conditions while final launch approval is absent", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        exactBlockers: []
      })
    ).toThrow("v1.2 launch approval must list exact blockers");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        blockedUntil: []
      })
    ).toThrow("v1.2 launch approval must list stop conditions");
  });

  it("rejects relayer enablement and nonzero funding caps in pre-readiness evidence", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        approvesRelayerEnablement: true
      })
    ).toThrow("v1.2 launch approval must keep approvesRelayerEnablement false");

    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        fundingLimits: {
          ...v12LaunchApprovalPreReadinessRecord.fundingLimits,
          maxBalanceWei: "1"
        }
      })
    ).toThrow("v1.2 launch approval must not grant funding limits");
  });

  it("rejects approved launch evidence when final owner approval ref and hash are missing", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        launchEvidenceStatus: "approved",
        finalOwnerApprovalRef: null,
        finalOwnerApprovalSha256: null
      })
    ).toThrow("v1.2 launch approval cannot claim approved status without final owner approval ref and hash");
  });

  it("rejects approved launch evidence when final owner approval does not match the owner approval ref and hash", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        launchEvidenceStatus: "approved",
        ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        ownerApprovalSha256: shaA,
        finalOwnerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        finalOwnerApprovalSha256: shaB
      })
    ).toThrow("v1.2 launch approval final owner approval must match the owner approval ref and hash");
  });

  it("rejects stale v1.1 final owner approval refs for v1.2 launch approval", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        launchEvidenceStatus: "approved",
        ownerApprovalRef: "docs/evidence/owner-approval/v1-1-mainnet-approval.md",
        ownerApprovalSha256: shaA,
        finalOwnerApprovalRef: "docs/evidence/owner-approval/v1-1-mainnet-approval.md",
        finalOwnerApprovalSha256: shaA
      })
    ).toThrow("v1.2 launch approval must not reuse stale v1.1 approval refs");
  });

  it("rejects approved launch evidence when required v1.2 lane hashes are blocked or missing", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        launchEvidenceStatus: "approved",
        ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        ownerApprovalSha256: shaA,
        finalOwnerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        finalOwnerApprovalSha256: shaA,
        evidenceHashes: [
          ...approvedV12LaneHashes.slice(0, -1),
          {
            lane: "negative-vectors",
            path: "evidence/mainnet-readiness/v1-2/negative-vectors.approved.json",
            status: "blocked",
            sha256: shaA
          }
        ]
      })
    ).toThrow("v1.2 launch approval cannot claim approved status while required readiness lanes are blocked or missing");
  });

  it("rejects approved launch evidence when lane refs drift to stale paths or malformed hashes", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        launchEvidenceStatus: "approved",
        ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        ownerApprovalSha256: shaA,
        finalOwnerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        finalOwnerApprovalSha256: shaA,
        evidenceHashes: [
          {
            ...approvedV12LaneHashes[0]!,
            path: "docs/evidence/mainnet-readiness/v1-1/public-runtime-current-state.json"
          },
          ...approvedV12LaneHashes.slice(1, -1),
          {
            ...approvedV12LaneHashes.at(-1)!,
            sha256: "not-a-sha"
          }
        ]
      })
    ).toThrow("v1.2 launch approval cannot claim approved status while required readiness lanes are blocked or missing");
  });

  it("accepts only blocked evidence even when approved lane hashes are pre-staged for later final approval", () => {
    const record = {
      ...v12LaunchApprovalPreReadinessRecord,
      ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      ownerApprovalSha256: shaA,
      finalOwnerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      finalOwnerApprovalSha256: shaA,
      evidenceHashes: approvedV12LaneHashes
    };
    expect(assertV12LaunchApprovalPreReadinessBlocked(record)).toBe(record);
  });

  it("rejects top-level authorization leakage across deployment, signing, funding, relayer, guarded users, and privacy flags", () => {
    for (const flag of [
      "approvesDeployment",
      "approvesSigning",
      "approvesFunding",
      "approvesRelayerEnablement",
      "approvesGuardedUsers",
      "approvesPrivacyClaims"
    ] as const) {
      expect(() =>
        assertV12LaunchApprovalPreReadinessBlocked({
          ...v12LaunchApprovalPreReadinessRecord,
          [flag]: true
        })
      ).toThrow(`v1.2 launch approval must keep ${flag} false`);
    }
  });

  it("rejects non-authorizing text that leaks launch action approval", () => {
    expect(() =>
      assertV12LaunchApprovalPreReadinessBlocked({
        ...v12LaunchApprovalPreReadinessRecord,
        ownerApprovalText: "I approve deployment, signing, broadcast, funding, and guarded users for launch."
      })
    ).toThrow(
      "v1.2 launch approval text must not authorize deployment, signing, broadcast, funding, relayer enablement, guarded users, or privacy claims"
    );
  });
});
