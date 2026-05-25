import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STAGE_B_PUBLIC_INPUT_ORDER } from "./proofs.js";
import {
  REQUIRED_VERIFIER_CIRCUITS,
  REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER,
  REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS,
  V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER,
  V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH,
  V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH,
  VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
  VERIFIER_PROMOTION_TESTNET_CHAIN_ID,
  assertV12TrustedSetupProverPromotionReady,
  assertVerifierPromotionRecordPromoted,
  assertVerifierPromotionRecordReleaseCandidate,
  assertVerifierPromotionRecordReviewReady,
  assertVerifierPromotionReady,
  type TrustedSetupVerifierPromotionRecord,
  type V12TrustedSetupCircuitName,
  type V12TrustedSetupProverPromotionRecord,
  type VerifierPromotionCandidate,
  type VerifierPromotionCircuitRecord
} from "./verifierPromotion.js";
import { sha256String } from "./v12UnlinkableSchemas.js";

const hash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hash2 = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const stageAMissingStageBPublicInputOrder = REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER.slice(0, 10);
const swappedStageBHashPublicInputOrder = [
  ...REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER.slice(0, 10),
  "encryptedNoteHash",
  "proofContextHash"
] as const;

const candidate: VerifierPromotionCandidate = {
  trustedSetupSource: "project-specific-ceremony",
  chainId: VERIFIER_PROMOTION_TESTNET_CHAIN_ID,
  circuitSourceHashes: [hash],
  r1csHashes: [hash],
  witnessCalculatorHashes: [hash],
  provingKeyHashes: [hash],
  verificationKeyHashes: [hash],
  generatedSolidityVerifierHashes: [hash],
  adapterSourceHash: hash,
  publicInputOrder: REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER,
  verifierAddresses: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"],
  generatedVerifierPath: "contracts/src/verifiers/generated/phase1/Verifier.sol",
  reproducibleBuildCommand: "npm run circuits:trusted-build",
  ownerApprovalRecorded: true,
  circuitReviewComplete: true,
  externalSecurityReviewComplete: true,
  noHighOrCriticalFindings: true
};

const circuitRecord = (name: (typeof REQUIRED_VERIFIER_CIRCUITS)[number], hashValue = hash): VerifierPromotionCircuitRecord => ({
  name,
  generatedVerifierContractName: name === "private_transfer" ? "Groth16PrivateTransferVerifier" : "Groth16WithdrawVerifier",
  sourcePath: `circuits/${name}.circom`,
  sourceHash: hashValue,
  dependencyHashes: [hash, hash2],
  r1csHash: hashValue,
  wasmHash: hashValue,
  symHash: hashValue,
  zkeyHash: hashValue,
  vkeyHash: hashValue,
  provingKeyHash: hashValue,
  verificationKeyHash: hashValue,
  generatedSolidityVerifierHash: hashValue,
  generatedVerifierPath: `contracts/src/verifiers/generated/phase1/${name}.sol`,
  publicInputOrder: REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER
});

const promotionRecord: TrustedSetupVerifierPromotionRecord = {
  recordVersion: 1,
  status: "review-ready",
  trustedSetupSource: "project-specific-ceremony",
  chainId: VERIFIER_PROMOTION_TESTNET_CHAIN_ID,
  mainnet4326Blocked: true,
  deploymentApproved: false,
  signingApproved: false,
  broadcastApproved: false,
  privateKeysIncluded: false,
  realFundsApproved: false,
  guardedUsersBlocked: true,
  productionPrivacyClaimsBlocked: true,
  productionRelayerOperationApproved: false,
  trustedSetupProvenanceRef: "docs/evidence/trusted-setup-verifier-promotion.record.json",
  trustedSetupProvenanceArtifactRef: "docs/evidence/mainnet-readiness/trusted-setup/provenance.json",
  trustedSetupProvenanceArtifactHash: hash,
  ptauSource: "project ceremony transcript 2026-05-02",
  powersOfTauHash: hash,
  powersOfTauArtifactRef: "docs/evidence/mainnet-readiness/trusted-setup/powers-of-tau.json",
  ceremonyTranscriptHashes: [hash],
  ceremonyTranscriptArtifactRefs: ["docs/evidence/mainnet-readiness/trusted-setup/ceremony-transcript-1.json"],
  contributionHashes: [hash, hash2],
  contributionArtifactRefs: [
    "docs/evidence/mainnet-readiness/trusted-setup/contribution-1.json",
    "docs/evidence/mainnet-readiness/trusted-setup/contribution-2.json"
  ],
  circuits: [circuitRecord("private_transfer"), circuitRecord("withdraw", hash2)],
  adapterSourcePath: "contracts/src/verifiers/ActionRoutingGroth16Verifier.sol",
  adapterSourceHash: hash,
  adapterExpectedPublicInputOrder: REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER,
  adapterRouting: {
    privateTransferCircuit: "private_transfer",
    withdrawCircuit: "withdraw"
  },
  reproducibleBuildCommand: "npm run circuits:trusted-build",
  commandLogHash: hash,
  toolchainVersions: ["node 22.19.0", "circom 2.1.6", "snarkjs 0.7.x", "solc 0.8.26"],
  reviewPacketPath: "docs/evidence/security-review/verifier-promotion-packet.md",
  circuitReview: {
    status: "pending",
    reference: "docs/evidence/security-review/circuit-review.md",
    reviewer: "Circuit Review Desk",
    openHighOrCriticalFindings: 0
  },
  contractReview: {
    status: "pending",
    reference: "docs/evidence/security-review/contract-review.md",
    reviewer: "Contract Review Desk",
    openHighOrCriticalFindings: 0
  },
  trustedSetupReview: {
    status: "pending",
    reference: "docs/evidence/security-review/trusted-setup-review.md",
    reviewer: "Trusted Setup Review Desk",
    openHighOrCriticalFindings: 0
  },
  issueDisposition: {
    status: "pending",
    reference: "docs/evidence/security-review/issue-disposition.md",
    reviewer: "Issue Disposition Desk",
    openHighOrCriticalFindings: 0
  },
  blockedUntil: ["external-security-review", "owner-approval", "deployment"]
};

const requireCircuit = (
  record: TrustedSetupVerifierPromotionRecord,
  name: (typeof REQUIRED_VERIFIER_CIRCUITS)[number]
): VerifierPromotionCircuitRecord => {
  const circuit = record.circuits.find((candidateCircuit) => candidateCircuit.name === name);
  if (!circuit) {
    throw new Error(`missing ${name} circuit fixture`);
  }
  return circuit;
};

const releaseCandidateRecord: TrustedSetupVerifierPromotionRecord = {
  ...promotionRecord,
  status: "release-candidate",
  trustedSetupSource: "local-untrusted-development",
  trustedSetupProvenanceRef: "circuits/build/provenance/manifest.json",
  trustedSetupProvenanceArtifactRef: "circuits/build/provenance/manifest.json",
  ptauSource: "locally generated by snarkjs powersoftau new bn128 13; quarantined local development evidence only",
  powersOfTauArtifactRef: "circuits/build/groth16/powersoftau/pot13_final.ptau",
  ceremonyTranscriptArtifactRefs: ["circuits/build/provenance/manifest.json#groth16.commands"],
  contributionArtifactRefs: [
    "circuits/build/groth16/private_transfer/private_transfer_final.zkey",
    "circuits/build/groth16/withdraw/withdraw_final.zkey"
  ],
  circuits: [
    {
      ...circuitRecord("private_transfer"),
      generatedVerifierPath: "circuits/build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16PrivateTransferVerifier.sol"
    },
    {
      ...circuitRecord("withdraw", hash2),
      generatedVerifierPath: "circuits/build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16WithdrawVerifier.sol"
    }
  ],
  quarantine: {
    manifestPath: "circuits/build/provenance/manifest.json",
    manifestStatus: "local-groth16-artifacts-quarantined",
    manifestPublicInputs: REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER,
    trustedVerifierGenerated: false,
    deploymentAuthorized: false,
    realFundsAllowed: false,
    verifierOutputDirectory: "build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET",
    reviewReadyExpectedFailure: "local untrusted setup artifacts cannot be promoted",
    stageCForbidden: true
  }
};

const publicInputOrderHash = "98ae722255351a03402cd3ad1cdf9a65d5ca270f5c11b7ad48322ff0fc77f110";
const depositPublicInputOrderHash = "e27e4ffa491a6d61a5f537b72b30510ecf0458730b195a8b294ed788ccdc4b83";
const v11BrowserManifestHash = "b4514173425aa34d6092e4b024341ed5a5696a8528c98f7a971521c69822a1a7";
const v11TrustedSetupRecordHash = "7cf2ba6c7d482179a5a246ad4fa0ab7c4bbebb6a48108d0fe0963b8a364c825e";

const v12Artifact = (name: string, hashValue = hash) => ({
  path: `docs/evidence/mainnet-readiness/v1-2/artifacts/${name}.json`,
  sha256: hashValue
});

const v12CircuitArtifact = (
  circuitName: V12TrustedSetupCircuitName,
  publicInputOrder: readonly string[],
  publicInputOrderHashValue: string,
  hashValue = hash
) => ({
  publicInputOrder,
  publicInputOrderHash: publicInputOrderHashValue,
  generatedVerifierHash: hashValue,
  artifacts: Object.fromEntries(
    REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS.map((artifactName) => [
      artifactName,
      v12Artifact(`${circuitName}-${artifactName}`, hashValue)
    ])
  )
});

const v12ReviewGate = (referenceName: string) => ({
  status: "complete" as const,
  reference: `docs/evidence/mainnet-readiness/v1-2/reviews/${referenceName}.md`,
  reviewer: `${referenceName} review desk`,
  openHighOrCriticalFindings: 0
});

const v12TrustedSetupProverPromotionRecord: V12TrustedSetupProverPromotionRecord = {
  schema: "nullark-v1-2-trusted-setup-prover-promotion-v1",
  productVersion: "nullark-v1.2-fee-governance",
  scope: "nullark-v1.2-fee-governance",
  lane: "trusted-setup-prover-promotion",
  status: "approved-for-mainnet",
  chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
  environment: "megaeth-mainnet",
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  mainnet4326Blocked: false,
  ownerApprovalRef: "docs/evidence/mainnet-readiness/v1-2/owner-approval/trusted-setup-prover-promotion.md",
  ownerApprovalSha256: hash,
  currentV1_1ApprovalRef: {
    publicRuntimeRef: "public-artifacts/current.json",
    proverManifestSha256: v11BrowserManifestHash,
    trustedSetupRecordSha256: v11TrustedSetupRecordHash,
    pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
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
      label: "v1.2 trusted setup final evidence",
      path: "docs/evidence/mainnet-readiness/v1-2/final-trusted-setup-prover-promotion.json",
      sha256: hash
    }
  ],
  artifactBoundary: "new-v1.2-artifacts",
  circuitApproach: "contract-enforced-fee-formula",
  publicInputOrder: V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER,
  publicInputOrderChangeAcknowledged: true,
  generatedVerifierHash: null,
  adapterBinding: {
    chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
    pool: "0x7E34f261A736681459Fe59666E7eCdfe30C74Ad9",
    depositVerifier: "0x1e2208c450431fcAd7DDAaF1B98C99527302f67B",
    privateTransferVerifier: "0x5E05f760Bc11de7d6b46e7568F470B341bAaBe17",
    withdrawVerifier: "0x47Aa6eF2dE37158b92284E99a2D906710516f0B8",
    adapter: "0x64E32216F8471A692600e6f56A0b8E7E76e90a33",
    selector: "0x678d8506",
    routing: {
      deposit: {
        verifier: "depositVerifier",
        publicInputCount: 6,
        publicInputOrderHash: depositPublicInputOrderHash
      },
      privateTransfer: {
        verifier: "privateTransferVerifier",
        publicInputCount: 10,
        publicInputOrderHash
      },
      withdraw: {
        verifier: "withdrawVerifier",
        publicInputCount: 10,
        publicInputOrderHash
      }
    }
  },
  browserManifestHash: hash2,
  artifacts: {
    adapterRuntimeBytecode: v12Artifact("adapter-runtime-bytecode"),
    browserManifest: v12Artifact("browser-manifest", hash2)
  },
  circuitArtifacts: {
    deposit: v12CircuitArtifact(
      "deposit",
      ["commitment", "amount", "chainId", "verifyingContract", "depositContextHash", "encryptedDepositNoteHash"],
      depositPublicInputOrderHash
    ),
    privateTransfer: v12CircuitArtifact("privateTransfer", V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER, publicInputOrderHash),
    withdraw: v12CircuitArtifact("withdraw", V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER, publicInputOrderHash)
  },
  reviews: {
    circuitReview: v12ReviewGate("circuit"),
    contractReview: v12ReviewGate("contract"),
    trustedSetupReview: v12ReviewGate("trusted-setup"),
    issueDisposition: v12ReviewGate("issue-disposition")
  },
  doesNotBroadenV1_1Approval: true,
  blockedUntil: []
};

describe("verifier promotion gate", () => {
  it("accepts a complete testnet verifier promotion candidate", () => {
    expect(assertVerifierPromotionReady(candidate)).toBe(candidate);
  });

  it("blocks local untrusted setup artifacts", () => {
    expect(() =>
      assertVerifierPromotionReady({ ...candidate, trustedSetupSource: "local-untrusted-development" })
    ).toThrow("local untrusted setup artifacts cannot be promoted");
  });

  it("keeps the lightweight promotion candidate helper testnet-only", () => {
    expect(() => assertVerifierPromotionReady({ ...candidate, chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID })).toThrow(
      "use a verifier promotion record for MegaETH mainnet 4326 promotion"
    );
    expect(() => assertVerifierPromotionReady({ ...candidate, chainId: 1 })).toThrow(
      "verifier promotion must target MegaETH testnet 6343"
    );
  });

  it("requires exact public input order and nonzero verifier addresses", () => {
    expect(REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER).toEqual(STAGE_B_PUBLIC_INPUT_ORDER);
    expect(REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER).toEqual([
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
    ]);

    expect(() =>
      assertVerifierPromotionReady({
        ...candidate,
        publicInputOrder: stageAMissingStageBPublicInputOrder
      })
    ).toThrow("verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionReady({
        ...candidate,
        publicInputOrder: swappedStageBHashPublicInputOrder
      })
    ).toThrow("verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionReady({ ...candidate, verifierAddresses: ["0x0000000000000000000000000000000000000000"] })
    ).toThrow("verifier promotion must record nonzero verifier addresses");

    expect(() =>
      assertVerifierPromotionReady({
        ...candidate,
        verifierAddresses: ["0x1111111111111111111111111111111111111111", "0x1111111111111111111111111111111111111111"]
      })
    ).toThrow("verifier promotion requires unique verifier addresses");
  });

  it("rejects quarantined generated verifier paths and missing review approvals", () => {
    expect(() =>
      assertVerifierPromotionReady({
        ...candidate,
        generatedVerifierPath: "contracts/test/generated/UNTRUSTED_LOCAL/Verifier.sol"
      })
    ).toThrow("quarantined generated verifier path cannot be promoted");

    expect(() => assertVerifierPromotionReady({ ...candidate, externalSecurityReviewComplete: false })).toThrow(
      "verifier promotion requires completed reviews with no high or critical findings"
    );
  });

  it("accepts a review-ready trusted setup verifier promotion record before deployment", () => {
    expect(assertVerifierPromotionRecordReviewReady(promotionRecord)).toBe(promotionRecord);
  });

  it("accepts quarantined local v1.1 artifacts only as release-candidate evidence", () => {
    expect(assertVerifierPromotionRecordReleaseCandidate(releaseCandidateRecord)).toBe(releaseCandidateRecord);

    expect(() => assertVerifierPromotionRecordReviewReady(releaseCandidateRecord)).toThrow(
      "local untrusted setup artifacts cannot be promoted"
    );

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        status: "draft"
      })
    ).toThrow("verifier promotion record is not release-candidate evidence");
  });

  it("accepts mainnet-blocked release-candidate records that predate explicit broadcast and relayer safety flags", () => {
    const {
      broadcastApproved: _broadcastApproved,
      guardedUsersBlocked: _guardedUsersBlocked,
      productionRelayerOperationApproved: _productionRelayerOperationApproved,
      ...legacyBlockedReleaseCandidate
    } = releaseCandidateRecord;

    expect(assertVerifierPromotionRecordReleaseCandidate(legacyBlockedReleaseCandidate)).toBe(legacyBlockedReleaseCandidate);

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...legacyBlockedReleaseCandidate,
        broadcastApproved: true as false
      })
    ).toThrow("verifier promotion record cannot approve broadcast; use a deployment package");

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...legacyBlockedReleaseCandidate,
        productionRelayerOperationApproved: true as false
      })
    ).toThrow("verifier promotion record cannot approve production relayer operation; use a relayer ops record");
  });

  it("rejects stale or swapped release-candidate public input orders", () => {
    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        adapterExpectedPublicInputOrder: stageAMissingStageBPublicInputOrder
      })
    ).toThrow("adapter verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        circuits: [
          requireCircuit(releaseCandidateRecord, "private_transfer"),
          {
            ...requireCircuit(releaseCandidateRecord, "withdraw"),
            publicInputOrder: swappedStageBHashPublicInputOrder
          }
        ]
      })
    ).toThrow("withdraw verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        quarantine: {
          ...releaseCandidateRecord.quarantine!,
          manifestPublicInputs: stageAMissingStageBPublicInputOrder
        }
      })
    ).toThrow("quarantine manifest verifier public input order mismatch");
  });

  it("keeps release-candidate evidence testnet-only and launch-blocked", () => {
    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
        mainnet4326Blocked: false
      })
    ).toThrow("release-candidate verifier promotion record must target MegaETH testnet 6343");

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        chainId: 1
      })
    ).toThrow("verifier promotion record must target MegaETH testnet 6343 or mainnet 4326");

    expect(() =>
      assertVerifierPromotionRecordReleaseCandidate({
        ...releaseCandidateRecord,
        deploymentApproved: true
      })
    ).toThrow("verifier promotion record cannot approve deployment, signing, or real funds; use a deployment package");
  });

  it("blocks draft, local setup, wrong chain, and quarantined paths in the record package", () => {
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, status: "draft" })).toThrow(
      "verifier promotion record is still draft"
    );

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        trustedSetupSource: "local-untrusted-development"
      })
    ).toThrow("local untrusted setup artifacts cannot be promoted");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        chainId: 1
      })
    ).toThrow("verifier promotion record must target MegaETH testnet 6343 or mainnet 4326");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        circuits: [
          {
            ...circuitRecord("private_transfer"),
            generatedVerifierPath: "contracts/test/generated/UNTRUSTED_LOCAL/Verifier.sol"
          },
          circuitRecord("withdraw")
        ]
      })
    ).toThrow("verifier promotion private_transfer generated verifier path cannot reference local or quarantined artifacts");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        ceremonyTranscriptArtifactRefs: []
      })
    ).toThrow("verifier promotion requires ceremony transcript artifact refs for every recorded hash");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        trustedSetupProvenanceArtifactHash: "replace-me"
      })
    ).toThrow("invalid trusted setup provenance artifact hash");
  });

  it("requires promoted-grade evidence for mainnet verifier records", () => {
    const mainnetPromoted: TrustedSetupVerifierPromotionRecord = {
      ...promotionRecord,
      chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
      mainnet4326Blocked: false,
      status: "promoted",
      circuitReview: { ...promotionRecord.circuitReview, status: "complete" },
      contractReview: { ...promotionRecord.contractReview, status: "complete" },
      trustedSetupReview: { ...promotionRecord.trustedSetupReview, status: "complete" },
      issueDisposition: { ...promotionRecord.issueDisposition, status: "complete" },
      ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      deployedVerifierAddresses: {
        privateTransferVerifier: "0x1111111111111111111111111111111111111111",
        withdrawVerifier: "0x2222222222222222222222222222222222222222",
        actionRoutingVerifier: "0x3333333333333333333333333333333333333333"
      },
      blockedUntil: []
    };

    expect(
      assertVerifierPromotionRecordReviewReady(mainnetPromoted)
    ).toBe(mainnetPromoted);

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
        mainnet4326Blocked: false
      })
    ).toThrow("mainnet verifier promotion record must be promoted");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...mainnetPromoted,
        mainnet4326Blocked: true
      })
    ).toThrow("mainnet verifier promotion record must unblock MegaETH mainnet 4326");

    const { deployedVerifierAddresses: _deployedVerifierAddresses, ...mainnetWithoutDeployedAddresses } = mainnetPromoted;
    expect(() => assertVerifierPromotionRecordReviewReady(mainnetWithoutDeployedAddresses)).toThrow(
      "mainnet verifier promotion record requires deployed verifier addresses"
    );
  });

  it("keeps deployment, signing, broadcast, relayer, guarded users, real funds, private keys, and production privacy claims blocked", () => {
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, mainnet4326Blocked: false })).toThrow(
      "testnet verifier promotion record must keep mainnet 4326 blocked"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, deploymentApproved: true })).toThrow(
      "verifier promotion record cannot approve deployment, signing, or real funds; use a deployment package"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, signingApproved: true })).toThrow(
      "verifier promotion record cannot approve deployment, signing, or real funds; use a deployment package"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, realFundsApproved: true })).toThrow(
      "verifier promotion record cannot approve deployment, signing, or real funds; use a deployment package"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, broadcastApproved: true as false })).toThrow(
      "verifier promotion record cannot approve broadcast; use a deployment package"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, privateKeysIncluded: true })).toThrow(
      "verifier promotion record cannot include private keys"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, guardedUsersBlocked: false as true })).toThrow(
      "verifier promotion record must keep guarded users blocked"
    );
    expect(() => assertVerifierPromotionRecordReviewReady({ ...promotionRecord, productionPrivacyClaimsBlocked: false })).toThrow(
      "verifier promotion record must block production privacy claims"
    );
    expect(() =>
      assertVerifierPromotionRecordReviewReady({ ...promotionRecord, productionRelayerOperationApproved: true as false })
    ).toThrow("verifier promotion record cannot approve production relayer operation; use a relayer ops record");
  });

  it("requires both circuit records and exact public input order", () => {
    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        circuits: [circuitRecord("private_transfer")]
      })
    ).toThrow("verifier promotion record must include private_transfer and withdraw circuits");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        circuits: [circuitRecord("private_transfer"), circuitRecord("private_transfer")]
      })
    ).toThrow("verifier promotion record missing withdraw circuit");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        circuits: [
          {
            ...circuitRecord("private_transfer"),
            publicInputOrder: stageAMissingStageBPublicInputOrder
          },
          circuitRecord("withdraw")
        ]
      })
    ).toThrow("private_transfer verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        circuits: [
          circuitRecord("private_transfer"),
          {
            ...circuitRecord("withdraw"),
            publicInputOrder: swappedStageBHashPublicInputOrder
          }
        ]
      })
    ).toThrow("withdraw verifier public input order mismatch");
  });

  it("binds reproducible build commands to non-deploying repo artifact scripts", () => {
    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        reproducibleBuildCommand: "forge script DeployMainnet --broadcast"
      })
    ).toThrow("verifier promotion reproducible build command must be a repo npm script for circuit or verifier artifacts");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        reproducibleBuildCommand: "npm run mainnet-deploy -- --private-key $PRIVATE_KEY"
      })
    ).toThrow("verifier promotion reproducible build command cannot include signing, deployment, or secret material");

    expect(() =>
      assertVerifierPromotionReady({
        ...candidate,
        reproducibleBuildCommand: "npm run build"
      })
    ).toThrow("verifier promotion reproducible build command must be a repo npm script for circuit or verifier artifacts");
  });

  it("requires complete toolchain version provenance", () => {
    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        toolchainVersions: ["node 22.19.0", "circom 2.1.6", "solc 0.8.26"]
      })
    ).toThrow("verifier promotion toolchain versions must include snarkjs");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        toolchainVersions: ["node 22.19.0", "circom 2.1.6", "snarkjs 0.7.x"]
      })
    ).toThrow("verifier promotion toolchain versions must include solc");
  });

  it("rejects missing adapter binding, separated review refs, and status/address mismatches", () => {
    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        adapterExpectedPublicInputOrder: ["root", "nullifier"]
      })
    ).toThrow("adapter verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        adapterExpectedPublicInputOrder: swappedStageBHashPublicInputOrder
      })
    ).toThrow("adapter verifier public input order mismatch");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        adapterRouting: {
          privateTransferCircuit: "withdraw",
          withdrawCircuit: "private_transfer"
        }
      })
    ).toThrow("verifier promotion record adapter routing mismatch");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        contractReview: {
          ...promotionRecord.contractReview,
          reference: "replace-me"
        }
      })
    ).toThrow("verifier promotion requires contract review reference");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        trustedSetupReview: {
          ...promotionRecord.trustedSetupReview,
          reviewer: "external-reviewer-tbd"
        }
      })
    ).toThrow("verifier promotion requires trusted setup review reviewer");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promotionRecord,
        deployedVerifierAddresses: {
          privateTransferVerifier: "0x1111111111111111111111111111111111111111",
          withdrawVerifier: "0x2222222222222222222222222222222222222222",
          actionRoutingVerifier: "0x3333333333333333333333333333333333333333"
        }
      })
    ).toThrow("deployed verifier addresses can only be recorded after verifier promotion");
  });

  it("keeps non-mainnet verifier promotion records from being promoted", () => {
    const promotedTestnet: TrustedSetupVerifierPromotionRecord = {
      ...promotionRecord,
      status: "promoted",
      circuitReview: { ...promotionRecord.circuitReview, status: "complete" },
      contractReview: { ...promotionRecord.contractReview, status: "complete" },
      trustedSetupReview: { ...promotionRecord.trustedSetupReview, status: "complete" },
      issueDisposition: { ...promotionRecord.issueDisposition, status: "complete" },
      ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      blockedUntil: []
    };

    expect(() => assertVerifierPromotionRecordPromoted(promotedTestnet)).toThrow(
      "non-mainnet verifier promotion records cannot be promoted"
    );
  });

  it("only promotes mainnet records after complete reviews, owner approval, deployed verifiers, and no blockers", () => {
    const promoted: TrustedSetupVerifierPromotionRecord = {
      ...promotionRecord,
      chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
      mainnet4326Blocked: false,
      status: "promoted",
      circuitReview: { ...promotionRecord.circuitReview, status: "complete" },
      contractReview: { ...promotionRecord.contractReview, status: "complete" },
      trustedSetupReview: { ...promotionRecord.trustedSetupReview, status: "complete" },
      issueDisposition: { ...promotionRecord.issueDisposition, status: "complete" },
      ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      deployedVerifierAddresses: {
        privateTransferVerifier: "0x1111111111111111111111111111111111111111",
        withdrawVerifier: "0x2222222222222222222222222222222222222222",
        actionRoutingVerifier: "0x3333333333333333333333333333333333333333"
      },
      blockedUntil: []
    };

    expect(assertVerifierPromotionRecordPromoted(promoted)).toBe(promoted);

    const { ownerApprovalRef: _ownerApprovalRef, ...promotedWithoutOwnerApproval } = promoted;
    expect(() => assertVerifierPromotionRecordPromoted(promotedWithoutOwnerApproval)).toThrow(
      "verifier promotion requires owner approval ref"
    );

    const { deployedVerifierAddresses: _deployedVerifierAddresses, ...reviewReadyWithoutDeployedAddresses } = {
      ...promoted,
      status: "review-ready"
    } satisfies TrustedSetupVerifierPromotionRecord;
    expect(() => assertVerifierPromotionRecordPromoted(reviewReadyWithoutDeployedAddresses)).toThrow(
      "mainnet verifier promotion record must be promoted"
    );

    expect(() =>
      assertVerifierPromotionRecordPromoted({
        ...promoted,
        blockedUntil: ["legal-review"]
      })
    ).toThrow("mainnet verifier promotion record cannot have remaining blockers");

    expect(() =>
      assertVerifierPromotionRecordPromoted({
        ...promoted,
        issueDisposition: {
          ...promoted.issueDisposition,
          reviewer: "external-reviewer-tbd"
        }
      })
    ).toThrow("verifier promotion requires issue disposition reviewer");

    expect(() =>
      assertVerifierPromotionRecordPromoted({
        ...promoted,
        contractReview: {
          ...promoted.contractReview,
          openHighOrCriticalFindings: 1
        }
      })
    ).toThrow("promoted verifier promotion record requires complete contract review with no high or critical findings");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promoted,
        circuits: [
          {
            ...requireCircuit(promoted, "private_transfer"),
            generatedVerifierPath:
              "circuits/build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16PrivateTransferVerifier.sol"
          },
          requireCircuit(promoted, "withdraw")
        ]
      })
    ).toThrow("verifier promotion private_transfer generated verifier path cannot reference local or quarantined artifacts");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promoted,
        deployedVerifierAddresses: {
          privateTransferVerifier: "0x1111111111111111111111111111111111111111",
          withdrawVerifier: "0x2222222222222222222222222222222222222222",
          actionRoutingVerifier: "0x0000000000000000000000000000000000000000"
        }
      })
    ).toThrow("deployed verifier address record requires nonzero verifier addresses");

    expect(() =>
      assertVerifierPromotionRecordReviewReady({
        ...promoted,
        deployedVerifierAddresses: {
          privateTransferVerifier: "0x1111111111111111111111111111111111111111",
          withdrawVerifier: "0x2222222222222222222222222222222222222222",
          actionRoutingVerifier: "0x1111111111111111111111111111111111111111"
        }
      })
    ).toThrow("deployed verifier address record requires unique verifier addresses");
  });

  it("rejects promoted records with unsafe or missing explicit promotion safety flags", () => {
    const promoted: TrustedSetupVerifierPromotionRecord = {
      ...promotionRecord,
      chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
      mainnet4326Blocked: false,
      status: "promoted",
      circuitReview: { ...promotionRecord.circuitReview, status: "complete" },
      contractReview: { ...promotionRecord.contractReview, status: "complete" },
      trustedSetupReview: { ...promotionRecord.trustedSetupReview, status: "complete" },
      issueDisposition: { ...promotionRecord.issueDisposition, status: "complete" },
      ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
      deployedVerifierAddresses: {
        privateTransferVerifier: "0x1111111111111111111111111111111111111111",
        withdrawVerifier: "0x2222222222222222222222222222222222222222",
        actionRoutingVerifier: "0x3333333333333333333333333333333333333333"
      },
      blockedUntil: []
    };

    const { broadcastApproved: _broadcastApproved, ...missingBroadcastApproval } = promoted;
    expect(() => assertVerifierPromotionRecordPromoted(missingBroadcastApproval)).toThrow(
      "verifier promotion record cannot approve broadcast; use a deployment package"
    );

    expect(() => assertVerifierPromotionRecordPromoted({ ...promoted, broadcastApproved: true as false })).toThrow(
      "verifier promotion record cannot approve broadcast; use a deployment package"
    );

    expect(() => assertVerifierPromotionRecordPromoted({ ...promoted, guardedUsersBlocked: false as true })).toThrow(
      "verifier promotion record must keep guarded users blocked"
    );

    expect(() =>
      assertVerifierPromotionRecordPromoted({ ...promoted, productionRelayerOperationApproved: true as false })
    ).toThrow("verifier promotion record cannot approve production relayer operation; use a relayer ops record");
  });
});

describe("Nullark v1.2 trusted setup/prover promotion gate", () => {
  it("keeps the checked-in trusted setup lane record explicit about the v1.2 public-input order change", () => {
    const recordPath = path.resolve(
      process.cwd(),
      "../../apps/web/public/proving/trusted-setup-record.json"
    );
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
      publicInputOrder?: readonly string[];
      publicInputOrderChangeAcknowledged?: boolean;
    };

    expect(record.publicInputOrder).toEqual(V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER);
    expect(record.publicInputOrderChangeAcknowledged).toBe(true);
  });

  it("accepts only a complete non-authorizing v1.2 mainnet artifact-promotion record", () => {
    expect(assertV12TrustedSetupProverPromotionReady(v12TrustedSetupProverPromotionRecord)).toBe(
      v12TrustedSetupProverPromotionRecord
    );
  });

  it("rejects stale v1.1/v1.2-linkable 12-input artifact promotion records", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        publicInputOrder: REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER
      })
    ).toThrow("v1.2 trusted setup/prover promotion circuitApproach and publicInputOrder must be coherent for v1.2 fee governance");
  });

  it("rejects blocked or pre-readiness records instead of treating blockers as approval evidence", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        status: "pre-readiness-evidence",
        mainnet4326Blocked: true,
        blockedUntil: ["final artifact promotion evidence is absent"]
      })
    ).toThrow("v1.2 trusted setup/prover promotion must be approved-for-mainnet before readiness");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        blockedUntil: ["adapter binding missing"]
      })
    ).toThrow("v1.2 trusted setup/prover promotion cannot have remaining blockers");
  });

  it("rejects null, zero, placeholder, reused, or mismatched adapter binding addresses", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          chain: 1
        }
      })
    ).toThrow(
      "v1.2 trusted setup/prover promotion adapterBinding must bind chain, pool, deposit/privateTransfer/withdraw verifiers, adapter, and selector"
    );

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          privateTransferVerifier: null
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must reject null, zero, or placeholder addresses");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          pool: null
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must reject null, zero, or placeholder addresses");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          withdrawVerifier: "0x1111111111111111111111111111111111111111"
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must reject null, zero, or placeholder addresses");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          adapter: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must reject null, zero, or placeholder addresses");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          adapter: v12TrustedSetupProverPromotionRecord.adapterBinding!.pool!
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must use distinct v1.2 addresses");
  });

  it("requires per-circuit adapter routing and public-input hashes to match the declared order", () => {
    const { routing: _routing, ...bindingWithoutRouting } = v12TrustedSetupProverPromotionRecord.adapterBinding!;
    const v11PublicInputOrderHash = sha256String(JSON.stringify(REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER));
    const v12DepositPublicInputOrderHash = sha256String(
      JSON.stringify(["commitment", "amount", "chainId", "verifyingContract", "depositContextHash", "encryptedDepositNoteHash"])
    );
    const v12PublicInputOrderHash = sha256String(JSON.stringify(V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER));

    expect(v12DepositPublicInputOrderHash).toBe(`sha256:${V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH}`);
    expect(v12PublicInputOrderHash).toBe(`sha256:${V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH}`);
    expect(v12PublicInputOrderHash).not.toBe(v11PublicInputOrderHash);

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: bindingWithoutRouting
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must route deposit, privateTransfer, and withdraw verifiers by public-input shape");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        publicInputOrder: swappedStageBHashPublicInputOrder
      })
    ).toThrow(
      "v1.2 trusted setup/prover promotion circuitApproach and publicInputOrder must be coherent for v1.2 fee governance"
    );

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          routing: {
            ...v12TrustedSetupProverPromotionRecord.adapterBinding!.routing,
            deposit: {
              ...v12TrustedSetupProverPromotionRecord.adapterBinding!.routing!.deposit!,
              publicInputOrderHash
            }
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must route deposit, privateTransfer, and withdraw verifiers by public-input shape");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        adapterBinding: {
          ...v12TrustedSetupProverPromotionRecord.adapterBinding,
          publicInputOrderHash
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion adapterBinding must use per-circuit public-input order hashes");

    const {
      publicInputOrderChangeAcknowledged: _publicInputOrderChangeAcknowledged,
      ...recordWithoutOrderChangeAcknowledgement
    } = v12TrustedSetupProverPromotionRecord;
    expect(() => assertV12TrustedSetupProverPromotionReady(recordWithoutOrderChangeAcknowledgement)).toThrow(
      "v1.2 trusted setup/prover promotion must explicitly acknowledge the v1.2 public-input order change"
    );
  });

  it("requires every v1.2 circuit, proving, verifier, adapter, and browser manifest hash", () => {
    for (const artifactName of ["adapterRuntimeBytecode", "browserManifest"] as const) {
      const artifacts = { ...v12TrustedSetupProverPromotionRecord.artifacts! };
      delete artifacts[artifactName];
      expect(() =>
        assertV12TrustedSetupProverPromotionReady({
          ...v12TrustedSetupProverPromotionRecord,
          artifacts
        })
      ).toThrow("v1.2 trusted setup/prover promotion must include hash-bound per-circuit verifier artifacts plus adapter and browser-manifest artifacts");
    }

    for (const circuitName of ["deposit", "privateTransfer", "withdraw"] as const) {
      const circuitArtifacts = { ...v12TrustedSetupProverPromotionRecord.circuitArtifacts! };
      delete circuitArtifacts[circuitName];
      expect(() =>
        assertV12TrustedSetupProverPromotionReady({
          ...v12TrustedSetupProverPromotionRecord,
          circuitArtifacts
        })
      ).toThrow("v1.2 trusted setup/prover promotion must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts");
    }

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        circuitArtifacts: {
          ...v12TrustedSetupProverPromotionRecord.circuitArtifacts,
          privateTransfer: {
            ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.privateTransfer!,
            artifacts: {
              ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.privateTransfer!.artifacts,
              r1cs: {
                ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.privateTransfer!.artifacts!.r1cs!,
                sha256: "replace-me"
              }
            }
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        circuitArtifacts: {
          ...v12TrustedSetupProverPromotionRecord.circuitArtifacts,
          withdraw: {
            ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!,
            generatedVerifierHash: hash2
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion withdraw generatedVerifierHash must match its generatedVerifier artifact");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        generatedVerifierHash: hash2
      })
    ).toThrow("v1.2 trusted setup/prover promotion must use per-circuit generated verifier hashes");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        circuitArtifacts: {
          ...v12TrustedSetupProverPromotionRecord.circuitArtifacts,
          deposit: {
            ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.deposit!,
            publicInputOrder: V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion deposit publicInputOrder must match its v1.2 circuit statement");
  });

  it("rejects withdraw-shaped v1.2 promotion records that do not hash-bind all generated verifiers", () => {
    const {
      circuitArtifacts: _circuitArtifacts,
      ...recordWithoutCircuitArtifacts
    } = v12TrustedSetupProverPromotionRecord;

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...recordWithoutCircuitArtifacts,
        generatedVerifierHash: hash,
        adapterBinding: {
          chainId: VERIFIER_PROMOTION_MAINNET_CHAIN_ID,
          pool: "0x7E34f261A736681459Fe59666E7eCdfe30C74Ad9",
          depositVerifier: "0x1e2208c450431fcAd7DDAaF1B98C99527302f67B",
          privateTransferVerifier: "0x5E05f760Bc11de7d6b46e7568F470B341bAaBe17",
          withdrawVerifier: "0x47Aa6eF2dE37158b92284E99a2D906710516f0B8",
          adapter: "0x64E32216F8471A692600e6f56A0b8E7E76e90a33",
          selector: "0x678d8506",
          routing: { ...v12TrustedSetupProverPromotionRecord.adapterBinding!.routing! }
        },
        artifacts: {
          adapterRuntimeBytecode: v12Artifact("adapter-runtime-bytecode"),
          browserManifest: v12Artifact("browser-manifest", hash2)
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion must use per-circuit generated verifier hashes");
  });

  it("rejects obvious placeholder artifact hashes even when they are sha256-shaped", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        circuitArtifacts: {
          ...v12TrustedSetupProverPromotionRecord.circuitArtifacts,
          withdraw: {
            ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!,
            artifacts: {
              ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!.artifacts,
              zkey: {
                ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!.artifacts!.zkey!,
                sha256: `sha256:${"1".repeat(64)}`
              }
            }
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts");
  });

  it("rejects local-only, template, or quarantined artifact references", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        circuitArtifacts: {
          ...v12TrustedSetupProverPromotionRecord.circuitArtifacts,
          withdraw: {
            ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!,
            artifacts: {
              ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!.artifacts,
              wasm: {
                ...v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!.artifacts!.wasm!,
                path: "circuits/build/withdraw/withdraw.wasm"
              }
            }
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion withdraw wasm artifact cannot reference local or quarantined artifacts");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        evidenceRefs: [
          {
            ...v12TrustedSetupProverPromotionRecord.evidenceRefs![0]!,
            path: "docs/evidence/mainnet-readiness/v1-2/template-trusted-setup-evidence.json"
          }
        ]
      })
    ).toThrow("v1.2 trusted setup/prover promotion evidence ref cannot reference draft, template, local, or quarantined artifacts");
  });

  it("rejects v1.1 artifact hash reuse without structured v1.2 compatibility proof", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        browserManifestHash: v11BrowserManifestHash,
        artifacts: {
          ...v12TrustedSetupProverPromotionRecord.artifacts,
          browserManifest: v12Artifact("browser-manifest", `sha256:${v11BrowserManifestHash}`)
        }
      })
    ).toThrow(
      "v1.2 trusted setup/prover promotion must not reuse v1.1 artifact hashes without structured compatibility proof"
    );

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        artifactBoundary: "byte-for-byte-v1.1-compatible"
      })
    ).toThrow("v1.2 trusted setup/prover promotion requires structured compatibility proof for v1.1 artifact reuse");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/v1-1/owner-approval/trusted-setup-prover-promotion.md"
      })
    ).toThrow("v1.2 trusted setup/prover promotion owner approval ref cannot reference local or quarantined artifacts");
  });

  it("requires compatibility proof hashes to match the declared v1.2 artifacts and public-input hash", () => {
    const completeProof = {
      status: "complete",
      reference: "docs/evidence/mainnet-readiness/v1-2/compatibility/prover-artifacts.md",
      sha256: hash,
      publicInputOrderHash,
      publicInputOrderHashes: {
        deposit: depositPublicInputOrderHash,
        privateTransfer: publicInputOrderHash,
        withdraw: publicInputOrderHash
      },
      perArtifactHashes: {
        adapterRuntimeBytecode: v12TrustedSetupProverPromotionRecord.artifacts!.adapterRuntimeBytecode!.sha256,
        browserManifest: v12TrustedSetupProverPromotionRecord.artifacts!.browserManifest!.sha256
      },
      perCircuitArtifactHashes: {
        deposit: Object.fromEntries(
          REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS.map((artifactName) => [
            artifactName,
            v12TrustedSetupProverPromotionRecord.circuitArtifacts!.deposit!.artifacts![artifactName]!.sha256
          ])
        ),
        privateTransfer: Object.fromEntries(
          REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS.map((artifactName) => [
            artifactName,
            v12TrustedSetupProverPromotionRecord.circuitArtifacts!.privateTransfer!.artifacts![artifactName]!.sha256
          ])
        ),
        withdraw: Object.fromEntries(
          REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS.map((artifactName) => [
            artifactName,
            v12TrustedSetupProverPromotionRecord.circuitArtifacts!.withdraw!.artifacts![artifactName]!.sha256
          ])
        )
      }
    };

    expect(
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        artifactBoundary: "byte-for-byte-v1.1-compatible",
        compatibilityProof: completeProof
      })
    ).toBeTruthy();

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        artifactBoundary: "byte-for-byte-v1.1-compatible",
        compatibilityProof: {
          ...completeProof,
          publicInputOrderHash: hash2
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion requires structured compatibility proof for v1.1 artifact reuse");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        artifactBoundary: "byte-for-byte-v1.1-compatible",
        compatibilityProof: {
          ...completeProof,
          perCircuitArtifactHashes: {
            ...completeProof.perCircuitArtifactHashes,
            privateTransfer: {
              ...completeProof.perCircuitArtifactHashes.privateTransfer,
              generatedVerifier: hash2
            }
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion requires structured compatibility proof for v1.1 artifact reuse");
  });

  it("requires completed review gates with no high or critical findings", () => {
    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        reviews: {
          ...v12TrustedSetupProverPromotionRecord.reviews!,
          trustedSetupReview: {
            ...v12TrustedSetupProverPromotionRecord.reviews!.trustedSetupReview!,
            status: "pending"
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion requires complete trusted setup review with no high or critical findings");

    expect(() =>
      assertV12TrustedSetupProverPromotionReady({
        ...v12TrustedSetupProverPromotionRecord,
        reviews: {
          ...v12TrustedSetupProverPromotionRecord.reviews!,
          contractReview: {
            ...v12TrustedSetupProverPromotionRecord.reviews!.contractReview!,
            openHighOrCriticalFindings: 1
          }
        }
      })
    ).toThrow("v1.2 trusted setup/prover promotion requires complete contract review with no high or critical findings");
  });
});
