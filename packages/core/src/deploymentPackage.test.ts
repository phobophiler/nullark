import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_ADDRESS,
  DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID,
  DEPLOYMENT_PACKAGE_MAINNET_RPC,
  DEPLOYMENT_PACKAGE_TESTNET_CHAIN_ID,
  DEPLOYMENT_PACKAGE_TESTNET_RPC,
  assertDeploymentPackageReady,
  assertDeploymentPackageReleaseCandidate,
  type DeploymentPackageCandidate
} from "./deploymentPackage.js";

const addresses = {
  privateTransferVerifier: "0x1111111111111111111111111111111111111111",
  withdrawVerifier: "0x2222222222222222222222222222222222222222",
  verifierAdapter: "0x3333333333333333333333333333333333333333",
  shieldedPool: "0x4444444444444444444444444444444444444444",
  poseidon2: "0x5555555555555555555555555555555555555555",
  feeController: "0x6666666666666666666666666666666666666666",
  adminOwner: "0x8888888888888888888888888888888888888888"
} as const;

const predictedContracts = Object.entries(addresses).map(([label, expectedAddress], index) => ({
  label: label as keyof typeof addresses,
  expectedAddress,
  deployer: "0x9999999999999999999999999999999999999999" as const,
  salt: `shielded-v1-${label}`,
  initCodeHash: `sha256:${String(index + 1).repeat(64)}`,
  derivationCommand: `forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --sig derive${label} --rpc-url https://carrot.megaeth.com/rpc`
}));

const mainnetPredictedContracts = Object.entries(addresses).map(([label, expectedAddress], index) => ({
  label: label as keyof typeof addresses,
  expectedAddress,
  deployer: "0x9999999999999999999999999999999999999999" as const,
  salt: `shielded-v1-mainnet-${label}`,
  initCodeHash: `sha256:${String(index + 1).repeat(64)}`,
  derivationCommand: `forge script contracts/script/DeriveMegaEthMainnetAddresses.s.sol --sig derive${label} --rpc-url https://mainnet.megaeth.com/rpc`
}));

function requirePredictedAddressEvidence(
  input: DeploymentPackageCandidate
): NonNullable<DeploymentPackageCandidate["predictedAddressEvidence"]> {
  if (!input.predictedAddressEvidence) {
    throw new Error("test fixture requires predicted address evidence");
  }
  return input.predictedAddressEvidence;
}

const deployedContractLabels = ["privateTransferVerifier", "withdrawVerifier", "verifierAdapter", "shieldedPool", "poseidon2"] as const;

const candidate: DeploymentPackageCandidate = {
  recordVersion: 1,
  status: "review-ready",
  chainId: DEPLOYMENT_PACKAGE_TESTNET_CHAIN_ID,
  rpcUrl: DEPLOYMENT_PACKAGE_TESTNET_RPC,
  environment: "megaeth-testnet",
  mainnet4326Blocked: true,
  broadcast: false,
  deploymentApproved: false,
  signingApproved: false,
  privateKeysInRepo: false,
  realFundsApproved: false,
  guardedUsersBlocked: true,
  productionPrivacyClaimsBlocked: true,
  addressMode: "predicted-create2",
  predictedAddressEvidence: {
    deployer: "0x9999999999999999999999999999999999999999",
    salt: "shielded-v1-megaeth-testnet-2026-05-02",
    initCodeHash: `sha256:${"9".repeat(64)}`,
    derivationCommand: "forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --rpc-url https://carrot.megaeth.com/rpc",
    contracts: predictedContracts
  },
  addresses,
  signerPolicy: {
    privateKeysInRepo: false,
    broadcastDefault: false,
    signerDescription: "Hardware wallet or external signer after explicit approval; no key material in repository."
  },
  constructorArgs: {
    privateTransferVerifier: [],
    withdrawVerifier: [],
    verifierAdapter: [addresses.privateTransferVerifier, addresses.withdrawVerifier],
    shieldedPool: [addresses.verifierAdapter, addresses.feeController, addresses.poseidon2]
  },
  verifierPromotionRecordPath: "docs/evidence/trusted-setup-verifier-promotion.record.json",
  trustedSetupRecordPath: "docs/evidence/trusted-setup-verifier-promotion.record.json",
  gasEvidencePlanPath: "docs/evidence/megaeth-testnet-gas-plan.json",
  slitherReportPath: "docs/slither-analysis.md",
  launchReadinessRecordPath: "docs/launch-readiness-record.md",
  deploymentDryRunCommand:
    "forge script contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot.megaeth.com/rpc",
  postDeployReadOnlyCheckCommand:
    "forge script contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot.megaeth.com/rpc",
  constructorArgsRecorded: true,
  noMainnetConfigPresent: true
};

const mainnetCandidate: DeploymentPackageCandidate = {
  ...candidate,
  status: "approved-for-mainnet",
  chainId: DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID,
  rpcUrl: DEPLOYMENT_PACKAGE_MAINNET_RPC,
  environment: "megaeth-mainnet",
  mainnet4326Blocked: false,
  deploymentApproved: true,
  signingApproved: true,
  realFundsApproved: true,
  guardedUsersBlocked: false,
  productionPrivacyClaimsBlocked: false,
  predictedAddressEvidence: {
    deployer: "0x9999999999999999999999999999999999999999",
    salt: "shielded-v1-megaeth-mainnet-2026-05-07",
    initCodeHash: `sha256:${"9".repeat(64)}`,
    derivationCommand: "forge script contracts/script/DeriveMegaEthMainnetAddresses.s.sol --rpc-url https://mainnet.megaeth.com/rpc",
    contracts: mainnetPredictedContracts
  },
  signerPolicy: {
    ...candidate.signerPolicy,
    approvedSignerOrSafeAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBB11",
    signerApprovalRef: "private-owner-approval-record-not-in-public-repo",
    ownerApprovalRef: "private-owner-approval-record-not-in-public-repo"
  },
  adminCustody: {
    feeControllerMultisig: true,
    feeControllerCustodyRef: "docs/evidence/mainnet-readiness/fee-controller-custody.md",
    roleSeparationApproved: true,
    keyCompromiseRunbookRef: "docs/evidence/mainnet-readiness/admin-key-compromise-runbook.md"
  },
  fundingOrder: {
    fundingIsFinalStep: true,
    fundingBeforeNonFundingGatesReady: false,
    fundingStepDescription: "Fund the deployer and capped relayer only after every non-funding evidence gate is complete.",
    requiredBeforeFunding: [
      "trusted-setup-verifier-record-promoted",
      "admin-safe-addresses-predicted-and-reviewed",
      "source-verification-package-ready",
      "relayer-ops-and-monitoring-ready",
      "mainnet-gas-and-runtime-evidence-ready"
    ],
    fundingCapApprovalRef: "private-owner-approval-record-not-in-public-repo",
    fundingTargets: [
      {
        label: "deployment-deployer",
        address: "0x9999999999999999999999999999999999999999",
        purpose: "Gas for final Safe and contract deployment broadcasts",
        maxBalanceWei: "100000000000000000"
      },
      {
        label: "withdrawal-relayer",
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        purpose: "Capped gas float for relayed withdrawals",
        maxBalanceWei: "250000000000000000"
      }
    ]
  },
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  remoteGasEvidenceRef: "docs/evidence/mainnet-readiness/remote-gas-evidence.md",
  relayerOpsRecordPath: "docs/evidence/mainnet-readiness/relayer-ops-mainnet-readiness.md",
  incidentResponseRef: "docs/evidence/mainnet-readiness/incident-response.md",
  deploymentTransactions: deployedContractLabels.map((contract, index) => ({
    contract,
    address: addresses[contract],
    txHash: `0x${String(index + 10).repeat(64).slice(0, 64)}` as `0x${string}`,
    chainId: DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID,
    receiptArtifactRef: `docs/evidence/mainnet-readiness/deployment-receipts/${contract}.json`,
    receiptArtifactHash: `sha256:${String(index + 11).repeat(64).slice(0, 64)}`
  })),
  sourceVerificationRecords: deployedContractLabels.map((contract, index) => ({
    contract,
    address: addresses[contract],
    chainId: DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID,
    explorerUrl: `https://mega.etherscan.io/address/${addresses[contract]}#code`,
    sourceHash: `sha256:${String(index + 3).repeat(64).slice(0, 64)}`,
    runtimeBytecodeHash: `sha256:${String(index + 4).repeat(64).slice(0, 64)}`,
    verified: true
  })),
  blockedUntil: [],
  deploymentDryRunCommand: "forge script contracts/script/DeployMegaEthMainnet.s.sol --rpc-url https://mainnet.megaeth.com/rpc",
  postDeployReadOnlyCheckCommand: "forge script contracts/script/VerifyMegaEthMainnet.s.sol --rpc-url https://mainnet.megaeth.com/rpc"
};

describe("deployment package gate", () => {
  it("accepts a review-ready MegaETH testnet package without deployment approval", () => {
    expect(assertDeploymentPackageReady(candidate)).toBe(candidate);
  });

  it("accepts dry-run approval only with signer and owner approval refs", () => {
    const approved: DeploymentPackageCandidate = {
      ...candidate,
      status: "approved-for-dry-run",
      signerPolicy: {
        ...candidate.signerPolicy,
        signerApprovalRef: "private-owner-approval-record-not-in-public-repo",
        ownerApprovalRef: "private-owner-approval-record-not-in-public-repo"
      }
    };

    expect(assertDeploymentPackageReady(approved)).toBe(approved);
    const { ownerApprovalRef: _ownerApprovalRef, ...missingOwnerApproval } = approved.signerPolicy;
    expect(() => assertDeploymentPackageReady({ ...approved, signerPolicy: missingOwnerApproval })).toThrow(
      "deployment package requires valid owner approval ref"
    );
  });

  it("accepts a fully approved MegaETH mainnet package", () => {
    expect(assertDeploymentPackageReady(mainnetCandidate)).toBe(mainnetCandidate);
  });

  it("accepts a Nullark v1.1 release candidate only with explicit blocked-state evidence", () => {
    const releaseCandidate: DeploymentPackageCandidate = {
      ...mainnetCandidate,
      status: "release-candidate",
      releaseCandidate: {
        productVersion: "Nullark v1.1",
        mainnet4326Blocked: true,
        deploymentApproved: false,
        signingApproved: false,
        broadcastApproved: false,
        realFundsApproved: false,
        guardedUsersBlocked: true,
        productionPrivacyClaimsBlocked: true,
        blockedStateEvidenceRef: "docs/evidence/mainnet-readiness/nullark-v1.1-deployment-source-verification-required-inputs.md",
        testnetDryRunEvidenceRef: "docs/evidence/mainnet-readiness/nullark-v1.1-deployment-source-verification-required-inputs.md"
      },
      mainnet4326Blocked: true,
      deploymentApproved: false,
      signingApproved: false,
      realFundsApproved: false,
      guardedUsersBlocked: true,
      productionPrivacyClaimsBlocked: true,
      addressMode: "deployed",
      fundingOrder: {
        ...mainnetCandidate.fundingOrder!,
        fundingTargets: [
          {
            label: "deployment-deployer",
            address: "0x9999999999999999999999999999999999999999",
            purpose: "Gas for final Safe and contract deployment broadcasts"
          },
          mainnetCandidate.fundingOrder!.fundingTargets[1]!
        ]
      },
      blockedUntil: [
        "final owner approval is not recorded",
        "deployment-deployer maxBalanceWei funding cap is not recorded",
        "approvedSignerOrSafeAddress signer Safe address is not recorded"
      ]
    };

    expect(assertDeploymentPackageReleaseCandidate(releaseCandidate)).toBe(releaseCandidate);
    expect(() => assertDeploymentPackageReady(releaseCandidate)).toThrow("deployment package must be approved-for-mainnet");
    expect(() => assertDeploymentPackageReady({ ...releaseCandidate, status: "approved-for-mainnet" })).toThrow(
      "mainnet deployment package must unblock MegaETH mainnet 4326"
    );
    const { releaseCandidate: _releaseCandidateGate, ...missingReleaseCandidateGate } = releaseCandidate;
    expect(() =>
      assertDeploymentPackageReleaseCandidate(missingReleaseCandidateGate)
    ).toThrow("deployment package release candidate requires blocked-state evidence");
    expect(() =>
      assertDeploymentPackageReleaseCandidate({
        ...releaseCandidate,
        releaseCandidate: {
          ...releaseCandidate.releaseCandidate!,
          signingApproved: true as false
        }
      })
    ).toThrow("deployment package release candidate must keep mainnet deployment, signing, broadcast, funding, users, and production claims blocked");
    expect(() => assertDeploymentPackageReleaseCandidate({ ...releaseCandidate, blockedUntil: [] })).toThrow(
      "deployment package release candidate must list remaining blockers"
    );
    expect(() =>
      assertDeploymentPackageReleaseCandidate({
        ...releaseCandidate,
        blockedUntil: ["final owner approval is not recorded"]
      })
    ).toThrow("deployment package release candidate must record missing funding target caps as blockers");
  });

  it("accepts a deployed MegaETH mainnet package with receipt records", () => {
    const deployed = {
      ...mainnetCandidate,
      addressMode: "deployed"
    } satisfies DeploymentPackageCandidate;

    expect(assertDeploymentPackageReady(deployed)).toBe(deployed);
  });

  it("blocks draft, wrong chain, and wrong RPC", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, status: "draft" })).toThrow("deployment package is still draft");
    expect(() => assertDeploymentPackageReady({ ...candidate, chainId: 1 })).toThrow(
      "deployment package must target MegaETH testnet 6343 or mainnet 4326"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, rpcUrl: "https://mainnet.megaeth.com/rpc" })).toThrow(
      "deployment package must target the approved MegaETH testnet RPC"
    );
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, rpcUrl: "https://carrot.megaeth.com/rpc" })).toThrow(
      "deployment package must target the approved MegaETH mainnet RPC"
    );
  });

  it("keeps deployment, signing, real funds, guarded users, and production claims blocked", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, mainnet4326Blocked: false })).toThrow(
      "testnet deployment package must keep mainnet 4326 blocked"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, deploymentApproved: true })).toThrow(
      "testnet deployment package cannot approve deployment, signing, or real funds"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, signingApproved: true })).toThrow(
      "testnet deployment package cannot approve deployment, signing, or real funds"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, realFundsApproved: true })).toThrow(
      "testnet deployment package cannot approve deployment, signing, or real funds"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, guardedUsersBlocked: false })).toThrow(
      "testnet deployment package must keep guarded users blocked"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, productionPrivacyClaimsBlocked: false })).toThrow(
      "testnet deployment package must block production privacy claims"
    );
  });

  it("requires mainnet approvals, multisig custody, and source verification evidence", () => {
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, status: "review-ready" })).toThrow(
      "mainnet deployment package must be approved-for-mainnet or review-ready with deployed evidence"
    );
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, mainnet4326Blocked: true })).toThrow(
      "mainnet deployment package must unblock MegaETH mainnet 4326"
    );
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, deploymentApproved: false })).toThrow(
      "mainnet deployment package must approve deployment, signing, and real funds"
    );
    const { fundingOrder: _fundingOrder, ...missingFundingOrder } = mainnetCandidate;
    expect(() => assertDeploymentPackageReady(missingFundingOrder)).toThrow("mainnet deployment package must make funding the final step");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        fundingOrder: {
          ...mainnetCandidate.fundingOrder!,
          fundingBeforeNonFundingGatesReady: true as false
        }
      })
    ).toThrow("mainnet deployment package must make funding the final step");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        fundingOrder: {
          ...mainnetCandidate.fundingOrder!,
          requiredBeforeFunding: ["trusted-setup"]
        }
      })
    ).toThrow("mainnet deployment package must list non-funding gates before funding");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        fundingOrder: {
          ...mainnetCandidate.fundingOrder!,
          fundingTargets: [
            {
              label: "deployment-deployer",
              address: "0x9999999999999999999999999999999999999999",
              purpose: "Gas for final Safe and contract deployment broadcasts"
            },
            mainnetCandidate.fundingOrder!.fundingTargets[1]!
          ]
        }
      })
    ).toThrow("mainnet deployment package funding target deployment-deployer must record maxBalanceWei cap");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        adminCustody: { ...mainnetCandidate.adminCustody!, feeControllerMultisig: false }
      })
    ).toThrow("mainnet deployment package requires multisig fee controller custody evidence");
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, sourceVerificationRecords: [] })).toThrow(
      "mainnet deployment package requires source verification records for every deployed contract"
    );
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, blockedUntil: ["source-verification"] })).toThrow(
      "approved mainnet deployment package cannot have remaining blockers"
    );
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        incidentResponseRef: mainnetCandidate.relayerOpsRecordPath!
      })
    ).toThrow("mainnet deployment package incident response ref must be distinct from relayer ops record");
    const { approvedSignerOrSafeAddress: _approvedSignerOrSafeAddress, ...signerPolicyWithoutApprovedSigner } =
      mainnetCandidate.signerPolicy;
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        signerPolicy: signerPolicyWithoutApprovedSigner
      })
    ).toThrow("mainnet deployment package signerPolicy must record approvedSignerOrSafeAddress");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        deploymentTransactions: [{ ...mainnetCandidate.deploymentTransactions![0]!, txHash: "0xnot-a-tx" }]
      })
    ).toThrow("mainnet deployment package requires deployment transaction records for every deployed contract");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        deploymentTransactions: [
          { ...mainnetCandidate.deploymentTransactions![0]!, receiptArtifactRef: "replace-me" },
          ...mainnetCandidate.deploymentTransactions!.slice(1)
        ]
      })
    ).toThrow("deployment package requires valid privateTransferVerifier deployment receipt artifact ref");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        deploymentTransactions: [
          { ...mainnetCandidate.deploymentTransactions![0]!, receiptArtifactHash: "replace-me" },
          ...mainnetCandidate.deploymentTransactions!.slice(1)
        ]
      })
    ).toThrow("deployment package requires valid privateTransferVerifier deployment receipt artifact hash");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        deploymentTransactions: [
          { ...mainnetCandidate.deploymentTransactions![0]!, receiptArtifactRef: "docs/evidence/mainnet-readiness/receipts/privateTransferVerifier.json" },
          ...mainnetCandidate.deploymentTransactions!.slice(1)
        ]
      })
    ).toThrow("deployment package privateTransferVerifier deployment receipt artifact ref must identify the expected evidence package");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        deploymentTransactions: [
          mainnetCandidate.deploymentTransactions![0]!,
          { ...mainnetCandidate.deploymentTransactions![1]!, txHash: mainnetCandidate.deploymentTransactions![0]!.txHash },
          ...mainnetCandidate.deploymentTransactions!.slice(2)
        ]
      })
    ).toThrow("mainnet deployment package deployment transaction hashes must be unique");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        sourceVerificationRecords: [
          { ...mainnetCandidate.sourceVerificationRecords![0]!, address: addresses.withdrawVerifier },
          ...mainnetCandidate.sourceVerificationRecords!.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification record address must match deployment package address");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        sourceVerificationRecords: [
          { ...mainnetCandidate.sourceVerificationRecords![0]!, explorerUrl: `https://mega.etherscan.io/address/${addresses.withdrawVerifier}#code` },
          ...mainnetCandidate.sourceVerificationRecords!.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification explorer URL must match deployed address");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        sourceVerificationRecords: [
          { ...mainnetCandidate.sourceVerificationRecords![0]!, verified: false },
          ...mainnetCandidate.sourceVerificationRecords!.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification record must be verified");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-deployment.md"
      })
    ).toThrow("deployment package mainnet owner approval ref must live under docs/evidence/owner-approval");
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        relayerOpsRecordPath: "docs/evidence/mainnet-readiness/mainnet-gas-evidence.md"
      })
    ).toThrow("deployment package mainnet relayer ops record path must identify the expected evidence package");
  });

  it("rejects mainnet admin roles that reuse the deployment deployer address", () => {
    const mainnetPredictedAddressEvidence = requirePredictedAddressEvidence(mainnetCandidate);
    const deployer = mainnetPredictedAddressEvidence.deployer;
    const addressesWithDeployerFeeController = {
      ...mainnetCandidate.addresses,
      feeController: deployer
    };

    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        addresses: addressesWithDeployerFeeController,
        constructorArgs: {
          ...mainnetCandidate.constructorArgs,
          shieldedPool: [
            addressesWithDeployerFeeController.verifierAdapter,
            addressesWithDeployerFeeController.feeController,
            addressesWithDeployerFeeController.poseidon2
          ]
        },
        predictedAddressEvidence: {
          ...mainnetPredictedAddressEvidence,
          contracts: mainnetPredictedAddressEvidence.contracts.map((contract) =>
            contract.label === "feeController" ? { ...contract, expectedAddress: deployer } : contract
          )
        }
      })
    ).toThrow("mainnet deployment package admin roles cannot use deployer address");
  });

  it("accepts a review-ready deployed MegaETH mainnet evidence package while launch blockers remain", () => {
    const { predictedAddressEvidence: _predictedAddressEvidence, ...deployedWithoutPrediction } = {
      ...mainnetCandidate,
      status: "review-ready",
      addressMode: "deployed",
      guardedUsersBlocked: true,
      productionPrivacyClaimsBlocked: true,
      blockedUntil: ["mainnet-gas-evidence-recorded", "runtime-config-approved"]
    } satisfies DeploymentPackageCandidate;

    expect(assertDeploymentPackageReady(deployedWithoutPrediction)).toBe(deployedWithoutPrediction);

    const partialSourceVerification = {
      ...deployedWithoutPrediction,
      sourceVerificationRecords: [
        ...deployedWithoutPrediction.sourceVerificationRecords!.slice(0, -1),
        {
          ...deployedWithoutPrediction.sourceVerificationRecords![deployedWithoutPrediction.sourceVerificationRecords!.length - 1]!,
          verified: false
        }
      ]
    } satisfies DeploymentPackageCandidate;

    expect(assertDeploymentPackageReady(partialSourceVerification)).toBe(partialSourceVerification);
  });

  it("rejects mainnet packages with testnet predicted address evidence", () => {
    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        predictedAddressEvidence: requirePredictedAddressEvidence(candidate)
      })
    ).toThrow("mainnet deployment package predicted address salt contains testnet material");
  });

  it("blocks broadcast defaults and repository private keys", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, broadcast: true as false })).toThrow(
      "deployment package scaffold must not broadcast by default"
    );
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        privateKeysInRepo: true as false
      })
    ).toThrow("deployment package must not place private keys in repo");
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        signerPolicy: { ...candidate.signerPolicy, privateKeysInRepo: true as false }
      })
    ).toThrow("deployment package must not place private keys in repo");
  });

  it("requires unique nonzero addresses and constructor records", () => {
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        addresses: { ...candidate.addresses, shieldedPool: "0x0000000000000000000000000000000000000000" }
      })
    ).toThrow("deployment package requires nonzero shieldedPool");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        addresses: { ...candidate.addresses, shieldedPool: candidate.addresses.verifierAdapter }
      })
    ).toThrow("deployment package addresses must be unique");

    expect(() => assertDeploymentPackageReady({ ...candidate, constructorArgsRecorded: false })).toThrow(
      "deployment package must record constructor arguments"
    );

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        constructorArgs: { ...candidate.constructorArgs, verifierAdapter: [candidate.addresses.privateTransferVerifier] }
      })
    ).toThrow("deployment package verifier adapter constructor args length mismatch");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        constructorArgs: { ...candidate.constructorArgs, verifierAdapter: [candidate.addresses.withdrawVerifier, candidate.addresses.privateTransferVerifier] }
      })
    ).toThrow("deployment package verifier adapter constructor args order mismatch");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        constructorArgs: { ...candidate.constructorArgs, shieldedPool: [candidate.addresses.verifierAdapter] }
      })
    ).toThrow("deployment package shieldedPool constructor args length mismatch");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        constructorArgs: {
          ...candidate.constructorArgs,
          shieldedPool: [candidate.addresses.verifierAdapter, candidate.addresses.poseidon2, candidate.addresses.feeController]
        }
      })
    ).toThrow("deployment package shieldedPool constructor args order mismatch");
  });

  it("rejects v1.2 component address reuse, including the legacy v1.1 pool address", () => {
    const addressesWithLegacyPool = {
      ...mainnetCandidate.addresses,
      shieldedPool: FORBIDDEN_LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_ADDRESS as `0x${string}`
    };

    expect(() =>
      assertDeploymentPackageReady({
        ...mainnetCandidate,
        addresses: addressesWithLegacyPool,
        constructorArgs: {
          ...mainnetCandidate.constructorArgs,
          shieldedPool: [
            addressesWithLegacyPool.verifierAdapter,
            addressesWithLegacyPool.feeController,
            addressesWithLegacyPool.poseidon2
          ]
        },
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(mainnetCandidate),
          contracts: requirePredictedAddressEvidence(mainnetCandidate).contracts.map((contract) =>
            contract.label === "shieldedPool"
              ? { ...contract, expectedAddress: addressesWithLegacyPool.shieldedPool }
              : contract
          )
        },
        deploymentTransactions: mainnetCandidate.deploymentTransactions!.map((record) =>
          record.contract === "shieldedPool" ? { ...record, address: addressesWithLegacyPool.shieldedPool } : record
        ),
        sourceVerificationRecords: mainnetCandidate.sourceVerificationRecords!.map((record) => {
          if (record.contract !== "shieldedPool") {
            return record;
          }
          return {
            ...record,
            address: addressesWithLegacyPool.shieldedPool,
            explorerUrl: `https://mega.etherscan.io/address/${addressesWithLegacyPool.shieldedPool}#code`
          };
        })
      })
    ).toThrow("deployment package shieldedPool address must not reuse legacy ShieldedPoolDepth20 address as the active NullarkPool deployment target");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        addresses: {
          ...candidate.addresses,
          feeController: candidate.addresses.poseidon2
        }
      })
    ).toThrow("deployment package addresses must be unique");
  });

  it("rejects legacy emergencyGuardian role fields for the no-guardian Nullark v1.1 path", () => {
    expect(() =>
      assertDeploymentPackageReleaseCandidate({
        ...mainnetCandidate,
        status: "release-candidate",
        releaseCandidate: {
          productVersion: "Nullark v1.1",
          mainnet4326Blocked: true,
          deploymentApproved: false,
          signingApproved: false,
          broadcastApproved: false,
          realFundsApproved: false,
          guardedUsersBlocked: true,
          productionPrivacyClaimsBlocked: true,
          blockedStateEvidenceRef: "docs/evidence/mainnet-readiness/nullark-v1.1-deployment-source-verification-required-inputs.md"
        },
        mainnet4326Blocked: true,
        deploymentApproved: false,
        signingApproved: false,
        realFundsApproved: false,
        guardedUsersBlocked: true,
        productionPrivacyClaimsBlocked: true,
        addressMode: "deployed",
        addresses: {
          ...mainnetCandidate.addresses,
          emergencyGuardian: "0x7777777777777777777777777777777777777777"
        } as typeof mainnetCandidate.addresses & { emergencyGuardian: `0x${string}` },
        blockedUntil: ["final owner approval is not recorded"]
      })
    ).toThrow("deployment package must not include emergencyGuardian for the no-guardian Nullark v1.1 path");
  });

  it("requires predicted CREATE2 address evidence before deployment", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, addressMode: "deployed" })).toThrow(
      "deployed address mode is only valid after MegaETH mainnet broadcast"
    );
    expect(() => assertDeploymentPackageReady({ ...mainnetCandidate, addressMode: "deployed", deploymentTransactions: [] })).toThrow(
      "mainnet deployment package requires deployment transaction records for every deployed contract"
    );
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(candidate),
          deployer: "0x0000000000000000000000000000000000000000"
        }
      })
    ).toThrow("deployment package requires nonzero predicted address deployer");
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(candidate),
          initCodeHash: "replace-me"
        }
      })
    ).toThrow("deployment package requires valid predicted address init code hash");
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(candidate),
          derivationCommand: "cast send 0xabc"
        }
      })
    ).toThrow("deployment package predicted address derivation command contains blocked signing, broadcast, or mainnet material");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(candidate),
          contracts: predictedContracts.slice(1)
        }
      })
    ).toThrow("deployment package predicted address evidence must include every expected address");

    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        predictedAddressEvidence: {
          ...requirePredictedAddressEvidence(candidate),
          contracts: [
            { ...predictedContracts[0]!, expectedAddress: addresses.withdrawVerifier },
            ...predictedContracts.slice(1)
          ]
        }
      })
    ).toThrow("deployment package predicted address evidence mismatches privateTransferVerifier");
  });

  it("requires dry-run and read-only commands without broadcast, signing, or mainnet material", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, deploymentDryRunCommand: "" })).toThrow(
      "deployment package requires valid deployment dry-run command"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, postDeployReadOnlyCheckCommand: "" })).toThrow(
      "deployment package requires valid post-deploy read-only check command"
    );
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        signerPolicy: { ...candidate.signerPolicy, broadcastDefault: true as false }
      })
    ).toThrow("deployment package scaffold must not broadcast by default");
    expect(() => assertDeploymentPackageReady({ ...candidate, deploymentDryRunCommand: "forge script Deploy --broadcast" })).toThrow(
      "deployment package requires a dry-run command without broadcast"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, deploymentDryRunCommand: "cast send 0xabc" })).toThrow(
      "deployment package deployment dry-run command contains blocked signing, broadcast, or mainnet material"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, deploymentDryRunCommand: "mega sendRawTransaction 0xabc" })).toThrow(
      "deployment package deployment dry-run command contains blocked signing, broadcast, or mainnet material"
    );
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        postDeployReadOnlyCheckCommand: "cast send 0x1111111111111111111111111111111111111111 --rpc-url https://mainnet.megaeth.com/rpc"
      })
    ).toThrow("deployment package post-deploy read-only check command contains blocked signing, broadcast, or mainnet material");
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        deploymentDryRunCommand:
          "forge script contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot.megaeth.com/rpc --private-key $DEPLOYER_PRIVATE_KEY"
      })
    ).toThrow("deployment package deployment dry-run command contains blocked signing, broadcast, or mainnet material");
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        signerPolicy: { ...candidate.signerPolicy, signerDescription: "Use PRIVATE_KEY from env" }
      })
    ).toThrow("deployment package signer policy description contains blocked signing, broadcast, or mainnet material");
    expect(() => assertDeploymentPackageReady({ ...candidate, noMainnetConfigPresent: false })).toThrow(
      "deployment package must not include mainnet config"
    );
  });

  it("rejects legacy Depth20 deployment or verification command targets", () => {
    expect(() =>
      assertDeploymentPackageReady({
        ...candidate,
        deploymentDryRunCommand:
          "forge script contracts/script/DeployMegaEthTestnetDepth20.s.sol:DeployMegaEthTestnetDepth20 --root contracts --rpc-url https://carrot.megaeth.com/rpc"
      })
    ).toThrow("deployment package deployment dry-run command must not reference legacy Depth20 pool artifacts");

    expect(() =>
      assertDeploymentPackageReleaseCandidate({
        ...mainnetCandidate,
        status: "release-candidate",
        releaseCandidate: {
          productVersion: "Nullark v1.1",
          mainnet4326Blocked: true,
          deploymentApproved: false,
          signingApproved: false,
          broadcastApproved: false,
          realFundsApproved: false,
          guardedUsersBlocked: true,
          productionPrivacyClaimsBlocked: true,
          blockedStateEvidenceRef: "docs/evidence/mainnet-readiness/nullark-v1.1-deployment-source-verification-required-inputs.md"
        },
        mainnet4326Blocked: true,
        deploymentApproved: false,
        signingApproved: false,
        realFundsApproved: false,
        guardedUsersBlocked: true,
        productionPrivacyClaimsBlocked: true,
        addressMode: "deployed",
        postDeployReadOnlyCheckCommand:
          "forge script contracts/script/VerifyMegaEthMainnetDepth20.s.sol:VerifyMegaEthMainnetDepth20 --root contracts --rpc-url https://mainnet.megaeth.com/rpc",
        fundingOrder: {
          ...mainnetCandidate.fundingOrder!,
          fundingTargets: [
            {
              label: "deployment-deployer",
              address: "0x9999999999999999999999999999999999999999",
              purpose: "Gas for final Safe and contract deployment broadcasts"
            },
            mainnetCandidate.fundingOrder!.fundingTargets[1]!
          ]
        },
        blockedUntil: [
          "final owner approval is not recorded",
          "deployment-deployer maxBalanceWei funding cap is not recorded",
          "approvedSignerOrSafeAddress signer Safe address is not recorded"
        ]
      })
    ).toThrow("deployment package post-deploy read-only check command must not reference legacy Depth20 pool artifacts");
  });

  it("rejects local, dev, placeholder, or quarantined evidence references", () => {
    expect(() =>
      assertDeploymentPackageReady({ ...candidate, verifierPromotionRecordPath: "contracts/test/generated/UNTRUSTED_LOCAL/manifest.json" })
    ).toThrow("deployment package verifier promotion record path cannot reference local or quarantined artifacts");

    expect(() => assertDeploymentPackageReady({ ...candidate, trustedSetupRecordPath: "circuits/build/provenance/manifest.json" })).toThrow(
      "deployment package trusted setup record path cannot reference local or quarantined artifacts"
    );

    expect(() => assertDeploymentPackageReady({ ...candidate, gasEvidenceReportPath: "docs/evidence/local-gas-report.json" })).toThrow(
      "deployment package gas evidence report path cannot reference local or quarantined artifacts"
    );

    expect(() => assertDeploymentPackageReady({ ...candidate, verifierPromotionRecordPath: "docs/evidence/example-verifier.json" })).toThrow(
      "deployment package requires valid verifier promotion record path"
    );
  });

  it("requires artifact reference paths", () => {
    expect(() => assertDeploymentPackageReady({ ...candidate, verifierPromotionRecordPath: "" })).toThrow(
      "deployment package requires valid verifier promotion record path"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, trustedSetupRecordPath: "" })).toThrow(
      "deployment package requires valid trusted setup record path"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, gasEvidencePlanPath: "" })).toThrow(
      "deployment package requires valid gas evidence plan path"
    );
    expect(() => assertDeploymentPackageReady({ ...candidate, slitherReportPath: "" })).toThrow(
      "deployment package requires valid slither report path"
    );
  });
});
