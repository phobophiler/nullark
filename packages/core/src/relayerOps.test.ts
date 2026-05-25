import { describe, expect, it } from "vitest";
import {
  MAINNET_RELAYER_ALLOWED_SELECTORS,
  MAINNET_RELAYER_FORBIDDEN_SELECTORS,
  MAINNET_RELAYER_FORBIDDEN_POOL_ADDRESSES,
  MAX_MAINNET_RELAYER_HOT_WALLET_BALANCE_WEI,
  assertRelayerOpsReady,
  assertV12RelayerRuntimePolicyReady,
  type RelayerOpsRecord,
  type V12RelayerRuntimePolicyRecord
} from "./relayerOps.js";

const record: RelayerOpsRecord = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  environment: "megaeth-mainnet",
  mainnet4326Blocked: false,
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  relayers: [
    {
      address: "0x95D44c470B65BD97986b0809c0862Cd36376e1A8",
      custodyRef: "docs/evidence/mainnet-readiness/relayer-1-custody.md",
      maxHotWalletBalanceWei: "100000000000000000",
      fundingRunbookRef: "docs/evidence/mainnet-readiness/relayer-funding.md"
    }
  ],
  failoverRunbookRef: "docs/evidence/mainnet-readiness/relayer-failover.md",
  allowedPools: ["0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9"],
  allowedSelectors: MAINNET_RELAYER_ALLOWED_SELECTORS,
  rateLimits: {
    stateBackend: "durable-object",
    windowSeconds: 60,
    perIp: 10,
    perDestination: 5,
    perNullifier: 1,
    global: 100
  },
  nullifierControls: {
    onChainPrecheck: true,
    duplicateCalldataIdempotency: true,
    duplicateNullifierIdempotency: true
  },
  nonceManagement: {
    serializedPerRelayer: true,
    nonceTooLowRequiresExecutionCheck: true,
    replacementRequiresOriginalNotExecuted: true
  },
  calldataValidation: {
    decodesSelector: true,
    validatesDestination: true,
    validatesGrossAmount: true,
    validatesFeeBounds: true,
    validatesPublicInputLength: true,
    validatesChainId: true,
    validatesVerifyingContract: true,
    validatesSpentCommitment: true,
    validatesNoteAmount: true
  },
  monitoring: {
    lowBalanceAlert: true,
    nonceDriftAlert: true,
    failedSubmissionAlert: true,
    revertedProofAlert: true,
    rpcMismatchAlert: true
  },
  secretSafety: {
    cloudflareSecrets: true,
    noPlaintextKeysInRepo: true,
    noBrowserExposure: true,
    rotationRunbookRef: "docs/evidence/mainnet-readiness/relayer-key-rotation.md"
  },
  deploymentBinding: {
    workerName: "shielded-withdrawal-relayer-mainnet",
    deploymentUrl: "https://relayer.nullark.com/transaction",
    deployedAt: "2026-05-07T00:00:00.000Z",
    chainId: 4326,
    pool: "0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9",
    verifier: "0x4b2a8C9d7F11E39b66A0A2eAc599D912b3CEf6a0",
    deploymentPackageRef: "docs/evidence/megaeth-mainnet-deployment-package.json",
    selfTestCommand:
      "npm run relayer:self-test -- --url https://relayer.nullark.com/transaction --chain-id 4326 --pool 0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9 --verifier 0x4b2a8C9d7F11E39b66A0A2eAc599D912b3CEf6a0",
    deploymentSelfTestArtifactRef: "docs/evidence/mainnet-readiness/relayer-deployment-self-test.json",
    deploymentSelfTestHash: `sha256:${"4".repeat(64)}`,
    cloudflareBindings: {
      idempotencyKvBindingName: "RELAYER_IDEMPOTENCY_KV",
      idempotencyKvNamespaceId: "1234567890abcdef1234567890abcdef",
      rateLimitKvBindingName: "RELAYER_RATE_LIMIT_KV",
      rateLimitKvNamespaceId: "abcdef1234567890abcdef1234567890",
      nonceQueueBindingName: "RELAYER_NONCE_QUEUE"
    }
  },
  incidentResponseRef: "docs/evidence/mainnet-readiness/incident-response.md",
  blockedUntil: []
};

describe("relayer ops readiness gate", () => {
  const firstRelayer = record.relayers[0]!;
  const firstAllowedPool = record.allowedPools[0]!;

  it("accepts an owner-approved mainnet relayer ops record", () => {
    expect(assertRelayerOpsReady(record)).toBe(record);
  });

  it("rejects draft or blocked mainnet records", () => {
    expect(() => assertRelayerOpsReady({ ...record, status: "draft" })).toThrow("relayer ops record is still draft");
    expect(() => assertRelayerOpsReady({ ...record, mainnet4326Blocked: true })).toThrow(
      "relayer ops record must unblock MegaETH mainnet 4326"
    );
    expect(() => assertRelayerOpsReady({ ...record, blockedUntil: ["owner-approval"] })).toThrow(
      "relayer ops record cannot have remaining blockers"
    );
  });

  it("requires production selectors to be bounded withdrawal only", () => {
    expect(() => assertRelayerOpsReady({ ...record, allowedSelectors: ["0x9b0c797c", ...MAINNET_RELAYER_ALLOWED_SELECTORS] })).toThrow(
      "relayer ops record allowed selectors must equal bounded mainnet withdrawal selectors"
    );
    for (const selector of MAINNET_RELAYER_FORBIDDEN_SELECTORS) {
      expect(() => assertRelayerOpsReady({ ...record, allowedSelectors: [selector] })).toThrow(
        `relayer ops record cannot approve stale or forbidden production selector ${selector}`
      );
    }
  });

  it("requires durable rate limit and idempotency controls", () => {
    expect(() => assertRelayerOpsReady({ ...record, rateLimits: { ...record.rateLimits, stateBackend: "memory" } })).toThrow(
      "relayer ops record rate limit state must be durable-object or kv"
    );
    expect(() =>
      assertRelayerOpsReady({ ...record, nullifierControls: { ...record.nullifierControls, duplicateNullifierIdempotency: false } })
    ).toThrow("relayer ops record must enforce nullifier precheck and duplicate idempotency");
  });

  it("requires either multiple relayers or an explicit failover runbook", () => {
    const { failoverRunbookRef: _failoverRunbookRef, ...withoutFailover } = record;
    expect(() => assertRelayerOpsReady(withoutFailover)).toThrow("relayer ops record requires multiple relayers or a failover runbook");
  });

  it("requires relayer wallets to stay under the mainnet hot-wallet gas-float cap", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        relayers: [
          {
            ...firstRelayer,
            maxHotWalletBalanceWei: (MAX_MAINNET_RELAYER_HOT_WALLET_BALANCE_WEI + 1n).toString()
          }
        ]
      })
    ).toThrow("relayer ops record relayer[0] max hot wallet balance exceeds mainnet gas-float cap");
  });

  it("rejects obvious placeholder relayer and deployment addresses", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        relayers: [{ ...firstRelayer, address: "0x1111111111111111111111111111111111111111" }]
      })
    ).toThrow("relayer ops record relayer[0] address cannot be an obvious placeholder address");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        allowedPools: ["0x2222222222222222222222222222222222222222"],
        deploymentBinding: { ...record.deploymentBinding, pool: "0x2222222222222222222222222222222222222222" }
      })
    ).toThrow("relayer ops record allowed pool[0] cannot be an obvious placeholder address");
  });

  it("requires unique allowed pools and distinct pool/verifier deployment bindings", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        allowedPools: [firstAllowedPool, firstAllowedPool]
      })
    ).toThrow("relayer ops record allowed pool addresses must be unique");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: {
          ...record.deploymentBinding,
          verifier: record.deploymentBinding.pool
        }
      })
    ).toThrow("relayer ops record deployment binding pool and verifier must be distinct");
  });

  it("rejects the legacy ShieldedPoolDepth20 pool address even when metadata is NullarkPool", () => {
    const legacyPool = MAINNET_RELAYER_FORBIDDEN_POOL_ADDRESSES[0]!;
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        allowedPools: [legacyPool],
        deploymentBinding: {
          ...record.deploymentBinding,
          pool: legacyPool,
          selfTestCommand: record.deploymentBinding.selfTestCommand.replace(record.deploymentBinding.pool, legacyPool)
        }
      })
    ).toThrow("relayer ops record allowed pool[0] cannot approve legacy ShieldedPoolDepth20 pool address");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        allowedPools: [firstAllowedPool, legacyPool],
        deploymentBinding: {
          ...record.deploymentBinding,
          pool: legacyPool,
          selfTestCommand: record.deploymentBinding.selfTestCommand.replace(record.deploymentBinding.pool, legacyPool)
        }
      })
    ).toThrow("relayer ops record allowed pool[1] cannot approve legacy ShieldedPoolDepth20 pool address");
  });

  it("requires deployment self-test evidence", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: { ...record.deploymentBinding, selfTestCommand: "npm run relayer-ops:validate -- --ready" }
      })
    ).toThrow("relayer ops record deployment self-test command must use npm run relayer:self-test");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: {
          ...record.deploymentBinding,
          selfTestCommand: record.deploymentBinding.selfTestCommand.replace("--chain-id 4326", "--chain-id 6343")
        }
      })
    ).toThrow("relayer ops record deployment self-test command must bind --chain-id");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: { ...record.deploymentBinding, deploymentSelfTestArtifactRef: "replace-me" }
      })
    ).toThrow("relayer ops record requires valid deployment self-test artifact ref");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: { ...record.deploymentBinding, deploymentSelfTestHash: "replace-me" }
      })
    ).toThrow("relayer ops record requires valid deployment self-test hash");
  });

  it("requires production Cloudflare KV namespace bindings", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: {
          ...record.deploymentBinding,
          cloudflareBindings: {
            ...record.deploymentBinding.cloudflareBindings,
            idempotencyKvNamespaceId: "replace-me"
          }
        }
      })
    ).toThrow("relayer ops record requires valid Cloudflare KV namespace id for RELAYER_IDEMPOTENCY_KV");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: {
          ...record.deploymentBinding,
          cloudflareBindings: {
            ...record.deploymentBinding.cloudflareBindings,
            rateLimitKvNamespaceId: record.deploymentBinding.cloudflareBindings.idempotencyKvNamespaceId
          }
        }
      })
    ).toThrow("relayer ops record Cloudflare KV namespace ids must be distinct");
  });

  it("rejects draft evidence refs and unapproved owner approval refs", () => {
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-owner-approval-message.md"
      })
    ).toThrow("relayer ops record owner approval ref must live under docs/evidence/owner-approval");
    expect(() =>
      assertRelayerOpsReady({
        ...record,
        deploymentBinding: {
          ...record.deploymentBinding,
          deploymentSelfTestArtifactRef: "docs/evidence/mainnet-readiness/relayer-deployment-self-test.draft.json"
        }
      })
    ).toThrow("relayer ops record deployment self-test artifact ref cannot reference draft or review-ready evidence");
  });
});

const currentV11Pool = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
const concreteV12Pool = "0x51f3F2E7C673E842D66b8aC34bFA28483edC08E2";
const v12EvidenceHash = `sha256:${"5".repeat(64)}`;
const staleFeeEvidenceHash = `sha256:${"6".repeat(64)}`;
const pendingFeeEvidenceHash = `sha256:${"7".repeat(64)}`;
const maxFeeEvidenceHash = `sha256:${"8".repeat(64)}`;
const minNetEvidenceHash = `sha256:${"9".repeat(64)}`;

const v12RuntimePolicy: V12RelayerRuntimePolicyRecord = {
  schema: "nullark-v1-2-relayer-runtime-policy-v1",
  productVersion: "nullark-v1.2-fee-governance",
  lane: "relayer-runtime-policy",
  status: "approved-for-mainnet",
  chainId: 4326,
  environment: "megaeth-mainnet",
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  mainnet4326Blocked: false,
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  ownerApprovalSha256: v12EvidenceHash,
  currentV1_1ApprovalRef: {
    publicRuntimeRef: "public-artifacts/current.json",
    pool: currentV11Pool,
    withdrawSelector: "0x678d8506"
  },
  v1_1Preservation: {
    currentRuntimeUnchanged: true,
    withdrawalsPreserved: true,
    doesNotApproveV1_2: true
  },
  noV1_1ApprovalReuse: true,
  approvesDeployment: false,
  approvesSigning: false,
  approvesFunding: false,
  approvesRelayerEnablement: false,
  approvesGuardedUsers: false,
  approvesPrivacyClaims: false,
  evidenceRefs: [
    {
      label: "relayer-runtime-policy-final-evidence",
      path: "docs/evidence/mainnet-readiness/v1-2/relayer-runtime-policy-final-evidence.json",
      sha256: v12EvidenceHash
    }
  ],
  feeSource: "on-chain-feeBps",
  allowedPool: concreteV12Pool,
  allowedSelector: "0x678d8506",
  allowedRuntime: "nullark-v1.2-fee-governance",
  monitoringEvidence: {
    monitoringRecordRef: "docs/evidence/mainnet-readiness/v1-2/relayer-monitoring-evidence.approved.json",
    alertDestinationTestRef: "docs/evidence/mainnet-readiness/v1-2/relayer-alert-destination-test.approved.json",
    requiredAlerts: ["lowBalance", "nonceDrift", "failedSubmission", "revertedProof", "rpcMismatch", "selectorPolicyDrift"],
    allAlertsEnabled: true,
    rpcMismatchAlertEnabled: true,
    selectorPolicyDriftAlertEnabled: true
  },
  transactionPolicy: {
    allowedPools: [concreteV12Pool],
    allowedSelectors: ["0x678d8506"],
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    arbitraryCalldataRejected: true,
    valueBearingTransactionsRejected: true,
    deployerFallbackRejected: true,
    blindNonceRetryRejected: true,
    unboundedTokenApprovalsRejected: true,
    headlessSigningDisabled: true
  },
  fundingPolicy: {
    fundingDisabled: true,
    maxHotWalletBalanceWei: "0"
  },
  staleFeeRejection: {
    status: "passed",
    evidenceRef: "docs/evidence/mainnet-readiness/v1-2/relayer-stale-fee-rejection.approved.json",
    evidenceSha256: staleFeeEvidenceHash
  },
  pendingFeeBeforeActivationRejection: {
    status: "passed",
    evidenceRef: "docs/evidence/mainnet-readiness/v1-2/relayer-preactivation-fee-rejection.approved.json",
    evidenceSha256: pendingFeeEvidenceHash
  },
  maxFeeAmountEnforced: {
    status: "passed",
    evidenceRef: "docs/evidence/mainnet-readiness/v1-2/relayer-max-fee-amount-user-bound.approved.json",
    evidenceSha256: maxFeeEvidenceHash
  },
  minNetAmountEnforced: {
    status: "passed",
    evidenceRef: "docs/evidence/mainnet-readiness/v1-2/relayer-min-net-amount-user-bound.approved.json",
    evidenceSha256: minNetEvidenceHash
  },
  doesNotBroadenV1_1RelayerApproval: true,
  productionRelayerEnabled: false,
  relayersEnabled: false,
  blockedUntil: []
};

describe("v1.2 relayer runtime policy readiness gate", () => {
  it("accepts only a hash-bound v1.2 policy that preserves v1.1 without approving launch surfaces", () => {
    expect(assertV12RelayerRuntimePolicyReady(v12RuntimePolicy)).toBe(v12RuntimePolicy);
  });

  it("rejects v1.1 pool reuse, placeholder v1.2 pools, and missing distinct v1.2 allowlists", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedPool: currentV11Pool
      })
    ).toThrow("v1.2 relayer runtime policy must allowlist a distinct v1.2 pool, not the current v1.1 pool");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedPool: "0x2222222222222222222222222222222222222222"
      })
    ).toThrow("v1.2 relayer runtime policy allowedPool cannot be an obvious placeholder address");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedPool: null
      })
    ).toThrow("v1.2 relayer runtime policy must allowlist a distinct v1.2 pool");
  });

  it("rejects production relayer enablement while upstream gates are still blocked", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        mainnet4326Blocked: true,
        productionRelayerEnabled: true,
        blockedUntil: ["final v1.2 owner approval"]
      })
    ).toThrow("v1.2 relayer runtime policy cannot enable production relayers while upstream gates are blocked");
  });

  it("requires monitoring and alert evidence before any v1.2 relayer policy can be ready", () => {
    const { monitoringEvidence: _monitoringEvidence, ...withoutMonitoring } = v12RuntimePolicy;
    expect(() => assertV12RelayerRuntimePolicyReady(withoutMonitoring)).toThrow(
      "v1.2 relayer runtime policy must include monitoring and alert evidence"
    );
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        monitoringEvidence: {
          ...v12RuntimePolicy.monitoringEvidence!,
          requiredAlerts: ["lowBalance", "nonceDrift", "failedSubmission", "revertedProof", "rpcMismatch"]
        }
      })
    ).toThrow("v1.2 relayer runtime policy monitoring evidence missing alert: selectorPolicyDrift");
  });

  it("requires chain and RPC binding to MegaETH mainnet", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        chainId: 6343,
        rpcUrl: "https://carrot.megaeth.com/rpc"
      })
    ).toThrow("v1.2 relayer runtime policy must target MegaETH mainnet 4326");
  });

  it("requires the exact bounded withdrawal selector allowlist", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedSelector: "0x9b0c797c"
      })
    ).toThrow("v1.2 relayer runtime policy must allowlist the exact bounded withdrawal selector");
  });

  it("rejects weak v1.2 fee-source, pool, runtime, selector, and v1.1 broadening evidence", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        feeSource: "client-supplied-feeBps"
      })
    ).toThrow("v1.2 relayer runtime policy must use on-chain-feeBps as the fee source");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedPool: "0x54af9d54b4edD062daD5581670E9E5f73048c87b",
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          allowedPools: ["0x54af9d54b4edD062daD5581670E9E5f73048c87b"]
        }
      })
    ).toThrow("v1.2 relayer runtime policy allowedPool cannot approve legacy ShieldedPoolDepth20 pool address");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedRuntime: "nullark-v1.2-fee-governance-testnet"
      })
    ).toThrow("v1.2 relayer runtime policy must bind an explicit mainnet v1.2 runtime label");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        allowedSelector: "0x12345678"
      })
    ).toThrow("v1.2 relayer runtime policy cannot use placeholder selector 0x12345678");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        doesNotBroadenV1_1RelayerApproval: false
      })
    ).toThrow("v1.2 relayer runtime policy must prove it does not broaden the v1.1 relayer approval");
  });

  it("requires stale-fee and user-bound checks to use their own final v1.2 evidence", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        staleFeeRejection: {
          ...v12RuntimePolicy.staleFeeRejection,
          evidenceRef: "docs/evidence/mainnet-readiness/v1-2/relayer-runtime-policy-final-evidence.json"
        }
      })
    ).toThrow("v1.2 relayer runtime policy stale fee rejection evidence ref must identify stale-fee rejection evidence");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        maxFeeAmountEnforced: {
          ...v12RuntimePolicy.staleFeeRejection,
          evidenceRef: v12RuntimePolicy.staleFeeRejection.evidenceRef,
          evidenceSha256: v12RuntimePolicy.staleFeeRejection.evidenceSha256
        }
      })
    ).toThrow("v1.2 relayer runtime policy maxFeeAmount enforcement evidence ref must identify user-bound evidence");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        minNetAmountEnforced: {
          ...v12RuntimePolicy.staleFeeRejection,
          evidenceRef: v12RuntimePolicy.staleFeeRejection.evidenceRef,
          evidenceSha256: v12RuntimePolicy.staleFeeRejection.evidenceSha256
        }
      })
    ).toThrow("v1.2 relayer runtime policy minNetAmount enforcement evidence ref must identify user-bound evidence");
  });

  it("requires a fail-closed transaction policy for relayer calldata and signing risks", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          arbitraryCalldataRejected: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must reject arbitrary calldata");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          valueBearingTransactionsRejected: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must reject value-bearing transactions");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          deployerFallbackRejected: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must reject deployer fallback execution");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          blindNonceRetryRejected: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must reject blind nonce retry");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          unboundedTokenApprovalsRejected: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must reject unbounded token approvals");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          headlessSigningDisabled: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy must keep headless signing disabled");
  });

  it("requires transaction policy pool selector chain and RPC to match the v1.2 runtime allowlist", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          allowedPools: [currentV11Pool]
        }
      })
    ).toThrow("v1.2 relayer runtime policy transaction policy must bind the v1.2 allowed pool");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          allowedSelectors: ["0x9b0c797c"]
        }
      })
    ).toThrow("v1.2 relayer runtime policy transaction policy must bind only the bounded withdrawal selector");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        transactionPolicy: {
          ...v12RuntimePolicy.transactionPolicy,
          chainId: 6343
        }
      })
    ).toThrow("v1.2 relayer runtime policy transaction policy must bind MegaETH mainnet 4326 and RPC");
  });

  it("keeps relayer funding disabled unless final funding approval evidence is present", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        fundingPolicy: {
          ...v12RuntimePolicy.fundingPolicy,
          fundingDisabled: false
        }
      })
    ).toThrow("v1.2 relayer runtime policy cannot enable funding without final funding approval evidence");
  });

  it("rejects guarded-user or production privacy approval claims", () => {
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        approvesGuardedUsers: true
      })
    ).toThrow("v1.2 relayer runtime policy must not approve guarded users or production privacy claims");
    expect(() =>
      assertV12RelayerRuntimePolicyReady({
        ...v12RuntimePolicy,
        approvesPrivacyClaims: true
      })
    ).toThrow("v1.2 relayer runtime policy must not approve guarded users or production privacy claims");
  });
});
