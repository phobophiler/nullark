import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error productionReadinessChecks is a Node ESM release script tested through Vitest.
import { validatePrivateProductionEvidence } from "./productionReadinessChecks.mjs";

const tempRoots: string[] = [];

describe("private production readiness evidence gate", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects production readiness when the private evidence root is missing", () => {
    const publicRoot = makeTempRoot("nullark-public-root-");
    writePublicRuntime(publicRoot);

    expect(
      validatePrivateProductionEvidence({
        publicRoot,
        privateRoot: path.join(publicRoot, "missing-private-root")
      })
    ).toEqual(expect.arrayContaining([expect.stringContaining("missing private production evidence root")]));
  });

  it("rejects public value-moving claims when private launch evidence keeps them blocked", () => {
    const fixture = createProductionFixture({
      launchOverrides: {
        exactBlockers: ["Final owner approval is absent for launch approval."],
        approvesSigning: false,
        approvesFunding: false,
        approvesRelayerEnablement: false,
        approvesGuardedUsers: false,
        fundingLimits: { status: "blocked", approvesFunding: false },
        signingLimits: { status: "blocked", approvesSigning: false, approvesBroadcast: false },
        guardedUserPolicy: { status: "blocked", guardedUsersApproved: false }
      }
    });

    expect(validatePrivateProductionEvidence(fixture)).toEqual(
      expect.arrayContaining([
        "launch approval exactBlockers must be empty for production readiness",
        "launch approval approvesSigning must be true for production readiness",
        "launch approval approvesRelayerEnablement must be true for production readiness",
        "public-artifacts/current.json productionRelayerApproved=true requires private launch approval approvesRelayerEnablement=true",
        "public-artifacts/current.json guardedUsersApproved=true requires private launch approval approvesGuardedUsers=true"
      ])
    );
  });

  it("accepts hash-bound private production evidence when every operational approval is present", () => {
    const fixture = createProductionFixture();

    expect(validatePrivateProductionEvidence(fixture)).toEqual([]);
  });
});

function createProductionFixture(options: { launchOverrides?: Record<string, unknown> } = {}): {
  publicRoot: string;
  privateRoot: string;
} {
  const publicRoot = makeTempRoot("nullark-public-root-");
  const privateRoot = makeTempRoot("private-evidence-root-");
  writePublicRuntime(publicRoot);

  const laneNames = [
    "public-runtime-current-state",
    "deployment-package",
    "source-verification-package",
    "trusted-setup-prover-promotion",
    "custody-record",
    "fee-governance-gas-log-storage",
    "relayer-runtime-policy",
    "frontend-prover-indexer-recovery",
    "negative-vectors",
    "formal-security-core",
    "incident-control",
    "launch-approval"
  ];
  const laneRefs = laneNames.filter((lane) => lane !== "launch-approval").map((lane) => {
    const filePath = `evidence/mainnet-readiness/v1-2/${lane}.approved.json`;
    return {
      lane,
      path: filePath,
      sha256: writeJson(privateRoot, filePath, { lane, status: "approved-for-mainnet" }),
      status: "approved-for-mainnet"
    };
  });
  const aggregateEvidenceRef = {
    label: "aggregate final evidence",
    path: "evidence/mainnet-readiness/v1-2/aggregate-readiness-final-ready-evidence.json",
    sha256: writeJson(privateRoot, "evidence/mainnet-readiness/v1-2/aggregate-readiness-final-ready-evidence.json", {
      status: "approved-for-mainnet"
    })
  };

  const launchApprovalSha256 = writeJson(privateRoot, "evidence/mainnet-readiness/v1-2/launch-approval.approved.json", {
    schema: "nullark-v1-2-launch-approval-v1",
    productVersion: "nullark-v1.2-fee-governance",
    chainId: 4326,
    environment: "megaeth-mainnet",
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    status: "approved-for-mainnet",
    mainnet4326Blocked: false,
    blockedUntil: [],
    exactBlockers: [],
    finalOwnerApprovalRef: "evidence/mainnet-readiness/v1-2/final-owner-approval.approved.json",
    finalOwnerApprovalSha256: "1".repeat(64),
    approvesDeployment: true,
    approvesSigning: true,
    approvesFunding: true,
    approvesRelayerEnablement: true,
    approvesGuardedUsers: true,
    approvesPrivacyClaims: false,
    v1_2Runtime: {
      productVersion: "nullark-v1.2-fee-governance",
      runtimeId: "nullark-v1.2-mainnet",
      chainId: 4326,
      pool: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8"
    },
    fundingLimits: { status: "approved", approvesFunding: true },
    signingLimits: { status: "approved", approvesSigning: true, approvesBroadcast: true },
    guardedUserPolicy: { status: "approved", guardedUsersApproved: true },
    privacyCopyStatus: { productionPrivacyClaimsApproved: false },
    ...options.launchOverrides
  });
  laneRefs.push({
    lane: "launch-approval",
    path: "evidence/mainnet-readiness/v1-2/launch-approval.approved.json",
    sha256: launchApprovalSha256,
    status: "approved-for-mainnet"
  });

  writeJson(privateRoot, "evidence/mainnet-readiness/v1-2/aggregate-readiness.approved.json", {
    schema: "nullark-v1-2-aggregate-readiness-v1",
    productVersion: "nullark-v1.2-fee-governance",
    chainId: 4326,
    environment: "megaeth-mainnet",
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    status: "approved-for-mainnet",
    mainnet4326Blocked: false,
    blockedUntil: [],
    exactBlockers: [],
    laneRefs,
    evidenceRefs: [aggregateEvidenceRef]
  });

  return { publicRoot, privateRoot };
}

function writePublicRuntime(root: string): void {
  writeJson(root, "public-artifacts/current.json", {
    productVersion: "nullark-v1.2-fee-governance",
    runtimeId: "nullark-v1.2-mainnet",
    chainId: 4326,
    pool: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8",
    productionRelayerApproved: true,
    mainnetValueMovingApproved: true,
    automatedValueMovementApprovedByThisRecord: true,
    guardedUsersApproved: true,
    privacyClaimsApproved: false
  });
}

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeJson(root: string, relativePath: string, value: unknown): string {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}
