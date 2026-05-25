import { describe, expect, it } from "vitest";
import {
  assertAdminCustodyReady,
  assertV12CustodyLaneReady,
  assertV12CustodyPreReadinessBlocked,
  collectV12CustodyLaneBlockers,
  type AdminCustodyRecord,
  type V12CustodyLaneRecord,
  type V12CustodyPreReadinessRecord
} from "./adminCustody.js";

const record: AdminCustodyRecord = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  chainId: 4326,
  environment: "megaeth-mainnet",
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  deploymentPackageRef: "docs/evidence/megaeth-mainnet-deployment-package.json",
  deploymentDeployer: "0x9999999999999999999999999999999999999999",
  roles: {
    feeController: {
      address: "0x1111111111111111111111111111111111111111",
      custodyType: "multisig",
      chainId: 4326,
      threshold: 2,
      signerCount: 3,
      signerAddresses: [
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "0xcccccccccccccccccccccccccccccccccccccccc"
      ],
      custodyRef: "docs/evidence/mainnet-readiness/fee-controller-custody.md",
      executionPolicyRef: "docs/evidence/mainnet-readiness/fee-controller-execution-policy.md",
      multisigConfigArtifactRef: "docs/evidence/mainnet-readiness/fee-controller-safe-config.json",
      multisigConfigHash: `sha256:${"1".repeat(64)}`,
      deploymentEvidenceRef: "docs/evidence/mainnet-readiness/deployment-receipts/fee-controller-safe.json",
      deploymentEvidenceHash: `sha256:${"4".repeat(64)}`
    }
  },
  roleSeparationApproved: true,
  roleSeparationEvidenceRef: "docs/evidence/mainnet-readiness/admin-role-separation.json",
  roleSeparationEvidenceHash: `sha256:${"3".repeat(64)}`,
  keyCompromiseRunbookRef: "docs/evidence/mainnet-readiness/admin-key-compromise-runbook.md",
  lostKeyRunbookRef: "docs/evidence/mainnet-readiness/admin-lost-key-runbook.md",
  incidentResponseRef: "docs/evidence/mainnet-readiness/incident-response.md",
  blockedUntil: []
};

describe("admin custody readiness gate", () => {
  it("accepts multisig-controlled mainnet admin custody evidence", () => {
    expect(assertAdminCustodyReady(record)).toBe(record);
  });

  it("rejects draft or blocked records", () => {
    expect(() => assertAdminCustodyReady({ ...record, status: "draft" })).toThrow("admin custody record is still draft");
    expect(() => assertAdminCustodyReady({ ...record, blockedUntil: ["owner-approval"] })).toThrow(
      "admin custody record cannot have remaining blockers"
    );
  });

  it("rejects EOA-style custody and weak multisig thresholds", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: { ...record.roles, feeController: { ...record.roles.feeController, custodyType: "eoa" } }
      })
    ).toThrow("feeController must use approved multisig custody");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: { ...record.roles, feeController: { ...record.roles.feeController, threshold: 1 } }
      })
    ).toThrow("feeController multisig threshold must be at least 2");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: {
            ...record.roles.feeController,
            threshold: 2,
            signerCount: 5,
            signerAddresses: [
              ...record.roles.feeController.signerAddresses,
              "0x1234567890123456789012345678901234567890",
              "0x2345678901234567890123456789012345678901"
            ]
          }
        }
      })
    ).toThrow("feeController multisig threshold must be a strict majority");
  });

  it("rejects deployer address reuse for admin roles", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: { ...record.roles, feeController: { ...record.roles.feeController, address: record.deploymentDeployer } }
      })
    ).toThrow("admin custody roles cannot reuse deployment deployer address");
  });

  it("rejects emergency guardian custody for the no-guardian Nullark v1.1 path", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          emergencyGuardian: {
            address: "0x2222222222222222222222222222222222222222",
            custodyType: "multisig",
            chainId: 4326,
            threshold: 2,
            signerCount: 3,
            signerAddresses: [
              "0xdddddddddddddddddddddddddddddddddddddddd",
              "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              "0xffffffffffffffffffffffffffffffffffffffff"
            ],
            custodyRef: "docs/evidence/mainnet-readiness/emergency-guardian-custody.md",
            executionPolicyRef: "docs/evidence/mainnet-readiness/emergency-guardian-execution-policy.md",
            multisigConfigArtifactRef: "docs/evidence/mainnet-readiness/emergency-guardian-safe-config.json",
            multisigConfigHash: `sha256:${"2".repeat(64)}`,
            deploymentEvidenceRef: "docs/evidence/mainnet-readiness/deployment-receipts/emergency-guardian-safe.json",
            deploymentEvidenceHash: `sha256:${"5".repeat(64)}`
          }
        } as typeof record.roles & { emergencyGuardian: unknown }
      })
    ).toThrow("admin custody record must not include emergencyGuardian for the no-guardian Nullark v1.1 path");
  });

  it("rejects role/deployer signer overlap", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: {
            ...record.roles.feeController,
            signerAddresses: [record.deploymentDeployer, ...record.roles.feeController.signerAddresses.slice(1)]
          }
        }
      })
    ).toThrow("admin custody signer addresses cannot reuse deployer or admin role addresses");
  });

  it("requires role separation approval for distinct role addresses", () => {
    expect(() => assertAdminCustodyReady({ ...record, roleSeparationApproved: false })).toThrow(
      "admin custody record requires role separation approval"
    );
  });

  it("requires custody evidence to bind the mainnet deployment package", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        deploymentPackageRef: "docs/evidence/mainnet-readiness/admin-custody-record.approved.json"
      })
    ).toThrow("admin custody deployment package ref must bind the MegaETH mainnet deployment package");
  });

  it("rejects approved admin custody when the referenced deployment package is still release-candidate blocked", () => {
    const releaseCandidatePackage = {
      recordVersion: 1,
      status: "release-candidate"
    };

    expect(() =>
      assertAdminCustodyReady(record, {
        referencedDeploymentPackage: releaseCandidatePackage
      })
    ).toThrow("admin custody referenced deployment package is not mainnet-ready: deployment package must be approved-for-mainnet");
  });

  it("binds the fee controller custody address to the referenced deployment package", () => {
    expect(() =>
      assertAdminCustodyReady(record, {
        referencedDeploymentPackage: {
          status: "approved-for-mainnet",
          chainId: 4326,
          environment: "megaeth-mainnet",
          mainnet4326Blocked: false,
          deploymentApproved: true,
          signingApproved: true,
          realFundsApproved: true,
          guardedUsersBlocked: false,
          productionPrivacyClaimsBlocked: false,
          blockedUntil: [],
          addresses: {
            feeController: "0x2222222222222222222222222222222222222222"
          }
        }
      })
    ).toThrow("admin custody feeController address must match referenced deployment package feeController");
  });

  it("requires multisig config and role separation proof artifacts", () => {
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roleSeparationEvidenceHash: "replace-me"
      })
    ).toThrow("admin custody record requires valid role separation evidence hash");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: { ...record.roles.feeController, multisigConfigArtifactRef: "replace-me" }
        }
      })
    ).toThrow("admin custody record requires valid feeController multisig config artifact ref");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: { ...record.roles.feeController, multisigConfigHash: "replace-me" }
        }
      })
    ).toThrow("admin custody record requires valid feeController multisig config hash");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: { ...record.roles.feeController, deploymentEvidenceRef: "replace-me" }
        }
      })
    ).toThrow("admin custody record requires valid feeController deployment evidence ref");
    expect(() =>
      assertAdminCustodyReady({
        ...record,
        roles: {
          ...record.roles,
          feeController: { ...record.roles.feeController, deploymentEvidenceHash: "replace-me" }
        }
      })
    ).toThrow("admin custody record requires valid feeController deployment evidence hash");
  });

  it("rejects a missing fee controller custody role", () => {
    expect(() => assertAdminCustodyReady({ ...record, roles: {} as typeof record.roles })).toThrow(
      "feeController custody record is missing"
    );
  });
});

const v12CustodyPreReadinessRecord: V12CustodyPreReadinessRecord = {
  status: "pre-readiness-evidence",
  chainId: 4326,
  environment: "megaeth-mainnet",
  mainnet4326Blocked: true,
  approvesDeployment: false,
  approvesSigning: false,
  approvesFunding: false,
  approvesRelayerEnablement: false,
  approvesGuardedUsers: false,
  approvesPrivacyClaims: false,
  safe: {
    address: null,
    threshold: null,
    owners: [],
    modules: [],
    guards: [],
    fallbackHandlers: []
  },
  roleMap: {
    feeController: {
      evidencePresent: false
    }
  },
  currentCredentialSchema: {
    schema: "nullark-v1-2-current-credential-state-v1",
    feeControllerSafe: {
      chainId: 4326,
      threshold: 3,
      signerCount: 5,
      signerRoles: [
        "feeControllerOwner1",
        "feeControllerOwner2",
        "feeControllerOwner3",
        "feeControllerOwner4",
        "feeControllerOwner5"
      ]
    },
    emergencyGuardianRolesPresent: false,
    forbiddenRoleNamesAbsent: ["emergencyGuardianOwner1", "emergencyGuardianOwner2", "emergencyGuardianOwner3"],
    privateKeysRecorded: false,
    rawSecretsRecorded: false,
    doesNotProveSafeAddress: true,
    doesNotProveOnChainOwners: true,
    doesNotApproveSigning: true
  },
  blockedUntil: ["v1.2 fee-controller Safe evidence is absent"]
};

describe("v1.2 custody pre-readiness boundary", () => {
  it("accepts a blocked non-authorizing custody record with absent Safe evidence", () => {
    expect(assertV12CustodyPreReadinessBlocked(v12CustodyPreReadinessRecord)).toBe(v12CustodyPreReadinessRecord);
  });

  it("rejects invented Safe authority in pre-readiness evidence", () => {
    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        safe: {
          ...v12CustodyPreReadinessRecord.safe,
          address: "0x1111111111111111111111111111111111111111",
          threshold: 3,
          owners: [
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "0xcccccccccccccccccccccccccccccccccccccccc",
            "0xdddddddddddddddddddddddddddddddddddddddd",
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          ]
        }
      })
    ).toThrow("v1.2 custody pre-readiness record must not invent Safe address, threshold, or owners");
  });

  it("rejects any custody pre-readiness record that authorizes gated actions", () => {
    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        approvesFunding: true
      })
    ).toThrow("v1.2 custody record must keep approvesFunding false");
  });

  it("rejects Safe module guard fallback or role evidence claims in pre-readiness evidence", () => {
    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        safe: {
          ...v12CustodyPreReadinessRecord.safe,
          modules: ["0x1111111111111111111111111111111111111111"]
        }
      })
    ).toThrow("v1.2 custody pre-readiness record must keep module, guard, and fallback-handler evidence absent");

    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        safe: {
          ...v12CustodyPreReadinessRecord.safe,
          guards: ["0x1111111111111111111111111111111111111111"]
        }
      })
    ).toThrow("v1.2 custody pre-readiness record must keep module, guard, and fallback-handler evidence absent");

    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        safe: {
          ...v12CustodyPreReadinessRecord.safe,
          fallbackHandlers: ["0x1111111111111111111111111111111111111111"]
        }
      })
    ).toThrow("v1.2 custody pre-readiness record must keep module, guard, and fallback-handler evidence absent");

    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        roleMap: {
          feeController: {
            evidencePresent: true
          }
        }
      })
    ).toThrow("v1.2 custody pre-readiness record must mark feeController evidence absent");
  });

  it("requires explicit custody blockers and mainnet-blocked status in pre-readiness evidence", () => {
    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        mainnet4326Blocked: false
      })
    ).toThrow("v1.2 custody pre-readiness record must keep mainnet4326Blocked true");

    expect(() =>
      assertV12CustodyPreReadinessBlocked({
        ...v12CustodyPreReadinessRecord,
        blockedUntil: []
      })
    ).toThrow("v1.2 custody pre-readiness record must list remaining blockers");
  });
});

const v12CustodyReadyRecord: V12CustodyLaneRecord = {
  schema: "nullark-v1-2-custody-record-v1",
  productVersion: "nullark-v1.2-fee-governance",
  scope: "nullark-v1.2-fee-governance",
  lane: "custody-record",
  status: "approved-for-mainnet",
  chainId: 4326,
  environment: "megaeth-mainnet",
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  mainnet4326Blocked: false,
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  ownerApprovalSha256: "a".repeat(64),
  noV1_1ApprovalReuse: true,
  v1_1Preservation: {
    currentRuntimeUnchanged: true,
    withdrawalsPreserved: true,
    doesNotApproveV1_2: true
  },
  approvesDeployment: false,
  approvesSigning: false,
  approvesFunding: false,
  approvesRelayerEnablement: false,
  approvesGuardedUsers: false,
  approvesPrivacyClaims: false,
  evidenceRefs: [
    {
      label: "fee-controller-safe-config",
      path: "docs/evidence/mainnet-readiness/v1-2/fee-controller-safe-config.json",
      sha256: "b".repeat(64)
    },
    {
      label: "fee-controller-owner-roster-review",
      path: "docs/evidence/mainnet-readiness/v1-2/fee-controller-owner-roster-review.json",
      sha256: "c".repeat(64)
    }
  ],
  safe: {
    address: "0x9876543210987654321098765432109876543210",
    version: "1.4.1",
    threshold: 3,
    owners: [
      "0x1000000000000000000000000000000000000001",
      "0x2000000000000000000000000000000000000002",
      "0x3000000000000000000000000000000000000003",
      "0x4000000000000000000000000000000000000004",
      "0x5000000000000000000000000000000000000005"
    ],
    modules: [],
    guards: [],
    fallbackHandlers: []
  },
  allowedFunctionSelectors: [
    {
      function: "setFeeBps(uint16)",
      selector: "0x023b1fc9",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    },
    {
      function: "executePendingFeeBps()",
      selector: "0x6a922915",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    },
    {
      function: "cancelPendingFeeBps()",
      selector: "0x51529e58",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-governance"
    },
    {
      function: "sweepFees(address,uint256)",
      selector: "0x90a3a042",
      source: "contracts/src/v1_2/NullarkPool.sol",
      scope: "fee-sweep-accrued-protocol-fees-only"
    }
  ],
  roleMap: {
    feeController: {
      evidencePresent: true
    }
  },
  blockedUntil: []
};

describe("v1.2 custody approval lane boundary", () => {
  it("accepts hash-bound custody evidence for a 3-of-5 fee-controller Safe without authorizing gated actions", () => {
    expect(assertV12CustodyLaneReady(v12CustodyReadyRecord)).toBe(v12CustodyReadyRecord);
  });

  it("rejects v1.2 custody approval records that keep stale v1.1 approval reuse or authorize gated actions", () => {
    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        noV1_1ApprovalReuse: false
      })
    ).toThrow("v1.2 custody record evidence record must not reuse v1.1 approval as v1.2 custody approval");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        approvesFunding: true
      })
    ).toThrow("v1.2 custody record evidence record must keep approvesFunding false");
  });

  it("rejects weak, duplicated, placeholder, or incomplete Safe owner evidence", () => {
    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        safe: {
          ...v12CustodyReadyRecord.safe,
          threshold: 2
        }
      })
    ).toThrow("v1.2 custody record evidence record must require Safe threshold 3-of-5 or stronger");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        safe: {
          ...v12CustodyReadyRecord.safe,
          owners: [
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "0xcccccccccccccccccccccccccccccccccccccccc",
            "0xdddddddddddddddddddddddddddddddddddddddd",
            "0xdddddddddddddddddddddddddddddddddddddddd"
          ]
        }
      })
    ).toThrow("v1.2 custody record evidence record must bind unique non-placeholder Safe owners");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        safe: {
          ...v12CustodyReadyRecord.safe,
          address: "0x1111111111111111111111111111111111111111"
        }
      })
    ).toThrow("v1.2 custody record evidence record must bind a nonzero non-placeholder feeController Safe address");
  });

  it("rejects incomplete Safe review lists and absent feeController role evidence", () => {
    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        safe: omitKey(v12CustodyReadyRecord.safe, "modules")
      })
    ).toThrow("v1.2 custody record evidence record must bind reviewed module, guard, and fallback-handler lists");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        roleMap: {
          feeController: {
            evidencePresent: false
          }
        }
      })
    ).toThrow("v1.2 custody record evidence record must mark feeController Safe evidence present");
  });

  it("rejects custody selector allowlists that omit, duplicate, or relabel approved fee-governance selectors", () => {
    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        allowedFunctionSelectors: [...(v12CustodyReadyRecord.allowedFunctionSelectors ?? [])].slice(0, 3)
      })
    ).toThrow("v1.2 custody record evidence record must include every approved fee-governance selector");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        allowedFunctionSelectors: [
          ...(v12CustodyReadyRecord.allowedFunctionSelectors ?? []),
          {
            function: "recoverExcessBalance(address)",
            selector: "0x738b62e5",
            source: "contracts/src/v1_2/NullarkPool.sol",
            scope: "arbitrary-recovery"
          }
        ]
      })
    ).toThrow("v1.2 custody record evidence allowedFunctionSelectors must be limited to approved v1.2 fee-governance selectors");

    expect(() =>
      assertV12CustodyLaneReady({
        ...v12CustodyReadyRecord,
        allowedFunctionSelectors: (v12CustodyReadyRecord.allowedFunctionSelectors ?? []).map((entry) =>
          entry.selector === "0x90a3a042" ? { ...entry, scope: "fee-and-principal-sweep" } : entry
        )
      })
    ).toThrow("v1.2 custody record evidence allowedFunctionSelectors must bind approved function, source, and scope metadata");
  });

  it("returns all custody lane blockers for aggregate readiness callers without flipping readiness", () => {
    const blockedPreReadinessRecord = {
      ...v12CustodyReadyRecord,
      mainnet4326Blocked: true,
      evidenceRefs: [],
      safe: {
        ...v12CustodyReadyRecord.safe,
        owners: [],
        threshold: 1
      },
      allowedFunctionSelectors: []
    };

    const blockers = collectV12CustodyLaneBlockers(blockedPreReadinessRecord);

    expect(blockers).toContain(
      "v1.2 custody record evidence record must set mainnet4326Blocked false only when the lane is approval-ready"
    );
    expect(blockers).toContain("v1.2 custody record evidence record must include hash-bound custody evidence refs");
    expect(blockers).toContain("v1.2 custody record evidence record must bind at least five valid nonzero Safe owners");
    expect(blockers).toContain("v1.2 custody record evidence record must list allowed fee-governance function selectors");

    const blockedModeBlockers = collectV12CustodyLaneBlockers(blockedPreReadinessRecord, "v1.2 custody record evidence", {
      requireApprovalReady: false
    });

    expect(blockedModeBlockers).not.toContain(
      "v1.2 custody record evidence record must set mainnet4326Blocked false only when the lane is approval-ready"
    );
    expect(blockedModeBlockers).toContain("v1.2 custody record evidence record must include hash-bound custody evidence refs");
    expect(blockedModeBlockers).toContain(
      "v1.2 custody record evidence record must include current credential schema nullark-v1-2-current-credential-state-v1"
    );
  });

  it("accepts blocked-mode current credential schema for 3-of-5 fee-controller owners without emergency guardian roles", () => {
    const blockedPreReadinessRecord = {
      ...v12CustodyReadyRecord,
      status: "pre-readiness-evidence",
      mainnet4326Blocked: true,
      evidenceRefs: v12CustodyReadyRecord.evidenceRefs!,
      safe: {
        address: null,
        version: null,
        threshold: null,
        owners: [],
        modules: [],
        guards: [],
        fallbackHandlers: []
      },
      roleMap: {
        feeController: {
          evidencePresent: false
        }
      },
      currentCredentialSchema: v12CustodyPreReadinessRecord.currentCredentialSchema!,
      blockedUntil: ["exact on-chain Safe evidence and final owner approval remain required"]
    };

    const blockers = collectV12CustodyLaneBlockers(blockedPreReadinessRecord, "v1.2 custody record evidence", {
      requireApprovalReady: false
    });

    expect(blockers).not.toContain("v1.2 custody record evidence record must bind a nonzero non-placeholder feeController Safe address");
    expect(blockers).not.toContain("v1.2 custody record evidence record must bind a concrete Safe version");
    expect(blockers).not.toContain("v1.2 custody record evidence record must bind at least five valid nonzero Safe owners");
    expect(blockers).not.toContain("v1.2 custody record evidence record must require Safe threshold 3-of-5 or stronger");
    expect(blockers).not.toContain("v1.2 custody record evidence record must mark feeController Safe evidence present");
  });

  it("rejects blocked-mode current credential schema that keeps old guardian roles or weak fee-controller owners", () => {
    const blockedPreReadinessRecord = {
      ...v12CustodyReadyRecord,
      mainnet4326Blocked: true,
      currentCredentialSchema: {
        ...v12CustodyPreReadinessRecord.currentCredentialSchema!,
        feeControllerSafe: {
          chainId: 4326,
          threshold: 2,
          signerCount: 3,
          signerRoles: ["feeControllerOwner1", "feeControllerOwner2", "emergencyGuardianOwner1"]
        },
        emergencyGuardianRolesPresent: true,
        forbiddenRoleNamesAbsent: []
      }
    };

    const blockers = collectV12CustodyLaneBlockers(blockedPreReadinessRecord, "v1.2 custody record evidence", {
      requireApprovalReady: false
    });

    expect(blockers).toContain("v1.2 custody record evidence record current credential schema must match fee-controller Safe 3-of-5 signer roles");
    expect(blockers).toContain("v1.2 custody record evidence record current credential schema must prove emergencyGuardianOwner1/2/3 roles are absent");
  });
});

function omitKey<T extends object, K extends keyof T>(value: T | undefined, key: K): Omit<T, K> {
  const copy = { ...(value ?? ({} as T)) };
  delete copy[key];
  return copy;
}
