import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOCAL_SANDBOX_EVIDENCE_BLOCKED_MAINNET_CHAIN_ID,
  LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS,
  LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
  NULLARK_CURRENT_V11_MAINNET_POOL,
  assertNullarkV12FrontendProverIndexerRecoveryEvidence,
  assertLocalUntrustedSandboxEvidence,
  assertLocalUntrustedSandboxArtifactIntegrity,
  type NullarkV12FrontendProverIndexerRecoveryEvidenceRecord,
  type LocalUntrustedSandboxEvidenceRecord
} from "./localSandboxEvidence.js";
import { assertDeploymentPackageReady, type DeploymentPackageCandidate } from "./deploymentPackage.js";
import { encodeStageBPublicInputs } from "./proofs.js";
import { V12_SPEND_PUBLIC_INPUT_ORDER } from "./v12UnlinkableSchemas.js";
import { assertVerifierPromotionRecordReviewReady, type TrustedSetupVerifierPromotionRecord } from "./verifierPromotion.js";

const hash = `sha256:${"a".repeat(64)}`;
const addresses = {
  privateTransferVerifier: "0x1111111111111111111111111111111111111111",
  withdrawVerifier: "0x2222222222222222222222222222222222222222",
  verifierAdapter: "0x3333333333333333333333333333333333333333",
  shieldedPool: "0x4444444444444444444444444444444444444444",
  poseidon2: "0x5555555555555555555555555555555555555555",
  feeController: "0x6666666666666666666666666666666666666666",
  emergencyGuardian: "0x7777777777777777777777777777777777777777"
} as const;

const noGuardianAddresses = {
  privateTransferVerifier: addresses.privateTransferVerifier,
  withdrawVerifier: addresses.withdrawVerifier,
  verifierAdapter: addresses.verifierAdapter,
  shieldedPool: addresses.shieldedPool,
  poseidon2: addresses.poseidon2,
  feeController: addresses.feeController
} as const;

const predictedContracts = Object.entries(addresses).map(([label, expectedAddress], index) => ({
  label: label as keyof typeof addresses,
  expectedAddress,
  deployer: "0x9999999999999999999999999999999999999999" as const,
  salt: `shielded-v1-${label}`,
  initCodeHash: `sha256:${String(index + 1).repeat(64)}`,
  derivationCommand: `forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --sig derive${label} --rpc-url https://carrot.megaeth.com/rpc`
}));

const noGuardianPredictedContracts = Object.entries(noGuardianAddresses).map(([label, expectedAddress], index) => ({
  label: label as keyof typeof noGuardianAddresses,
  expectedAddress,
  deployer: "0x9999999999999999999999999999999999999999" as const,
  salt: `shielded-v1-${label}`,
  initCodeHash: `sha256:${String(index + 1).repeat(64)}`,
  derivationCommand: `forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --sig derive${label} --rpc-url https://carrot.megaeth.com/rpc`
}));

const sandboxRecord: LocalUntrustedSandboxEvidenceRecord = {
  recordVersion: 1,
  status: "local-untrusted-sandbox",
  purpose: "sandbox-only",
  trustedSetupSource: "local-untrusted-development",
  chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
  mainnet4326Blocked: true,
  deploymentApproved: false,
  signingApproved: false,
  privateKeysIncludedInEvidence: false,
  realFundsApproved: false,
  guardedUsersBlocked: true,
  productionPrivacyClaimsBlocked: true,
  cannotSatisfyPromotion: true,
  cannotSatisfyDeployment: true,
  cannotSatisfyGuardedUsers: true,
  localPotLabel: "pot13",
  localArtifactRoot: "circuits/build/local-untrusted-pot13",
  artifacts: [
    {
      label: "private-transfer-local-zkey",
      path: "circuits/build/local-untrusted-pot13/private_transfer.zkey",
      hash
    }
  ],
  credential: {
    envPath: ".env.local",
    keystoreAccount: "sandbox-redacted-keystore-account",
    publicAddress: "0x1111111111111111111111111111111111111111",
    keystorePasswordStoredInGitignoredEnv: true,
    rawPrivateKeyStored: false,
    privateKeyPrinted: false,
    envFileMode: "0600"
  },
  notes: "Local untrusted sandbox evidence only."
};

const frontendEvidenceRecord: NullarkV12FrontendProverIndexerRecoveryEvidenceRecord = {
  schema: "nullark-v1-2-frontend-prover-indexer-recovery-v1",
  productVersion: "nullark-v1.2-fee-governance",
  lane: "frontend-prover-indexer-recovery",
  status: "approved-for-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  environment: "megaeth-mainnet",
  approvesDeployment: false,
  approvesSigning: false,
  approvesFunding: false,
  approvesRelayerEnablement: false,
  approvesGuardedUsers: false,
  approvesPrivacyClaims: false,
  runtimeLabels: {
    v1_1: "nullark-v1.1-mainnet",
    v1_2: "nullark-v1.2-fee-governance"
  },
  activeFeeDisplay: {
    status: "passed",
    source: "on-chain-feeBps",
    feeBps: 50,
    maxFeeBps: 100
  },
  pendingFeeDisplay: {
    status: "passed",
    visible: true,
    appliesBeforeActivation: false,
    pendingFeeBps: 75,
    pendingFeeActivationTime: "1779400000"
  },
  proofFeeSource: {
    status: "passed",
    source: "active-on-chain-feeBps",
    formula: "floor(grossAmount * feeBps / 10000)",
    activeFeeBpsReadBeforeProof: true,
    activeFeeBpsRecheckedBeforeSubmit: true,
    recheckedBeforeSubmit: true,
    staleFeeVectorRejected: true,
    staleFeeRejectedBeforeSubmit: true,
    maxFeeAmountEnforced: true,
    minNetAmountEnforced: true
  },
  artifactSelectionRules: {
    selectsByRuntimeLabel: true,
    selectsByChainPoolVerifierAndBytecode: true,
    v1_1ArtifactsNotUsedForV1_2: true,
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    runtimeLabel: "nullark-v1.2-fee-governance",
    pool: "0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9",
    verifier: "0x4b2a8C9d7F11E39b66A0A2eAc599D912b3CEf6a0",
    verifierBytecodeHash: `0x${"8".repeat(64)}`,
    testnetFallbackAllowed: false,
    browserManifestSha256: `sha256:${"9".repeat(64)}`,
    trustedSetupRecordSha256: `sha256:${"c".repeat(64)}`,
    withdrawWasmSha256: `sha256:${"d".repeat(64)}`,
    withdrawZkeySha256: `sha256:${"e".repeat(64)}`
  },
  v1_1WithdrawalPreservation: {
    withdrawalsPreserved: true,
    pool: NULLARK_CURRENT_V11_MAINNET_POOL,
    withdrawSelector: "0x678d8506",
    proverManifestSha256: "sha256:b4514173425aa34d6092e4b024341ed5a5696a8528c98f7a971521c69822a1a7",
    trustedSetupRecordSha256: "sha256:7cf2ba6c7d482179a5a246ad4fa0ab7c4bbebb6a48108d0fe0963b8a364c825e",
    routesRecoveredNotesToOriginalPool: true
  },
  recoveryIndexerRuntimeDistinction: {
    status: "passed",
    distinguishesByChainPoolRuntime: true,
    merkleDepthPerRuntime: true,
    scansAllHistoricalPools: true,
    withdrawalRoutesToNoteOriginalPool: true,
    recoveredNotesRouteByOriginalPool: true,
    originalPoolRoutingEvidence: true,
    noTestnetFallback: true,
    testnetFallbackAllowed: false,
    sparseOrCheckpointedPathGeneration: true,
    chainIds: [4326]
  }
};

describe("local untrusted sandbox evidence", () => {
  it("accepts local untrusted sandbox evidence with hard negative assertions", () => {
    expect(assertLocalUntrustedSandboxEvidence(sandboxRecord)).toBe(sandboxRecord);
  });

  it("accepts the checked local untrusted sandbox evidence record", () => {
    const recordPath = path.resolve(process.cwd(), "test-fixtures/evidence/local-untrusted-sandbox-artifacts.json");
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as LocalUntrustedSandboxEvidenceRecord;

    expect(assertLocalUntrustedSandboxEvidence(record)).toBe(record);
  });

  it("accepts artifact integrity for an isolated local untrusted sandbox evidence record", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-sandbox-evidence-"));
    const artifactPath = path.join(repoRoot, "circuits/build/local-untrusted-pot13/artifact.txt");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, "isolated local artifact");
    const artifactHash = `sha256:${createHash("sha256").update("isolated local artifact").digest("hex")}`;
    const record = {
      ...sandboxRecord,
      localArtifactRoot: "circuits/build/local-untrusted-pot13",
      artifacts: [{ label: "isolated-local-artifact", path: "circuits/build/local-untrusted-pot13/artifact.txt", hash: artifactHash }]
    };

    expect(assertLocalUntrustedSandboxArtifactIntegrity(record, { repoRoot })).toBe(record);
  });

  it("rejects stale local artifact hashes with a clear mismatch error", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-sandbox-evidence-"));
    const artifactPath = path.join(repoRoot, "circuits/build/local/artifact.txt");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, "current artifact");
    const currentHash = `sha256:${createHash("sha256").update("current artifact").digest("hex")}`;
    const staleHash = `sha256:${"b".repeat(64)}`;

    expect(currentHash).not.toBe(staleHash);
    expect(() =>
      assertLocalUntrustedSandboxArtifactIntegrity(
        {
          ...sandboxRecord,
          localArtifactRoot: "circuits/build/local",
          artifacts: [{ label: "local-artifact", path: "circuits/build/local/artifact.txt", hash: staleHash }]
        },
        { repoRoot }
      )
    ).toThrow("local-artifact artifact hash mismatch");
  });

  it("requires provenance manifests to record the 12 verifier public inputs", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-sandbox-evidence-"));
    const manifestPath = path.join(repoRoot, "circuits/build/provenance/manifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const staleManifest = {
      publicInputs: LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS.slice(0, 8)
    };
    const manifestJson = `${JSON.stringify(staleManifest, null, 2)}\n`;
    fs.writeFileSync(manifestPath, manifestJson);
    const manifestHash = `sha256:${createHash("sha256").update(manifestJson).digest("hex")}`;

    expect(() =>
      assertLocalUntrustedSandboxArtifactIntegrity(
        {
          ...sandboxRecord,
          localArtifactRoot: "circuits/build/provenance",
          artifacts: [{ label: "provenance-manifest", path: "circuits/build/provenance/manifest.json", hash: manifestHash }]
        },
        { repoRoot }
      )
    ).toThrow("provenance manifest public inputs must match");
  });

  it("requires provenance manifests to record the v1.2 unlinkable withdraw public input order separately", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-sandbox-evidence-"));
    const manifestPath = path.join(repoRoot, "circuits/build/provenance/manifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const manifest = {
      publicInputs: [...LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS],
      publicInputsByCircuit: {
        private_transfer: [...LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS],
        withdraw: [...LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS]
      }
    };
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(manifestPath, manifestJson);
    const manifestHash = `sha256:${createHash("sha256").update(manifestJson).digest("hex")}`;

    expect(() =>
      assertLocalUntrustedSandboxArtifactIntegrity(
        {
          ...sandboxRecord,
          localArtifactRoot: "circuits/build/provenance",
          artifacts: [{ label: "provenance-manifest", path: "circuits/build/provenance/manifest.json", hash: manifestHash }]
        },
        { repoRoot }
      )
    ).toThrow(`provenance manifest withdraw_v1_2 public inputs must match ${V12_SPEND_PUBLIC_INPUT_ORDER.join(",")}`);
  });

  it("keeps the expected provenance public-input order aligned with proof encoding", () => {
    const root = `0x${"01".repeat(32)}` as const;
    const nullifier = `0x${"02".repeat(32)}` as const;
    const newCommitment = `0x${"03".repeat(32)}` as const;
    const destination = "0x0404040404040404040404040404040404040404" as const;
    const verifyingContract = "0x0606060606060606060606060606060606060606" as const;
    const spentCommitment = `0x${"07".repeat(32)}` as const;
    const proofContextHash = `0x${"08".repeat(32)}` as const;
    const encryptedNoteHash = `0x${"09".repeat(32)}` as const;
    const privateTransferInputs = encodeStageBPublicInputs({
      base: {
        kind: "private-transfer",
        root,
        nullifier,
        newCommitment,
        chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
        verifyingContract,
        spentCommitment,
        noteAmount: 8n
      },
      proofContextHash,
      encryptedNoteHash
    });
    const withdrawalInputs = encodeStageBPublicInputs({
      base: {
        kind: "withdrawal",
        root,
        nullifier,
        destination,
        grossAmount: 5n,
        fee: 1n,
        chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
        verifyingContract,
        spentCommitment,
        noteAmount: 8n
      },
      proofContextHash,
      encryptedNoteHash
    });

    const encodedInterface = [
      privateTransferInputs[0] === withdrawalInputs[0] ? "root" : undefined,
      privateTransferInputs[1] === withdrawalInputs[1] ? "nullifier" : undefined,
      privateTransferInputs[2] !== withdrawalInputs[2] ? "newCommitment" : undefined,
      privateTransferInputs[3] !== withdrawalInputs[3] ? "destination" : undefined,
      privateTransferInputs[4] !== withdrawalInputs[4] ? "grossAmount" : undefined,
      privateTransferInputs[5] !== withdrawalInputs[5] ? "fee" : undefined,
      privateTransferInputs[6] === withdrawalInputs[6] ? "chainId" : undefined,
      privateTransferInputs[7] === withdrawalInputs[7] ? "verifyingContract" : undefined,
      privateTransferInputs[8] === withdrawalInputs[8] ? "spentCommitment" : undefined,
      privateTransferInputs[9] === withdrawalInputs[9] ? "noteAmount" : undefined,
      privateTransferInputs[10] === withdrawalInputs[10] ? "proofContextHash" : undefined,
      privateTransferInputs[11] === withdrawalInputs[11] ? "encryptedNoteHash" : undefined
    ];

    expect(privateTransferInputs).toHaveLength(LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS.length);
    expect(withdrawalInputs).toHaveLength(LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS.length);
    expect(encodedInterface).toEqual([...LOCAL_SANDBOX_EXPECTED_PUBLIC_INPUTS]);
  });

  it("rejects the template as filled local untrusted sandbox evidence", () => {
    const templatePath = path.resolve(process.cwd(), "test-fixtures/evidence/local-untrusted-sandbox-artifacts.template.json");
    const template = JSON.parse(fs.readFileSync(templatePath, "utf8")) as LocalUntrustedSandboxEvidenceRecord;

    expect(() => assertLocalUntrustedSandboxEvidence(template)).toThrow("local sandbox evidence must be sandbox-only");
  });

  it("blocks mainnet, approval flags, private-key evidence, and gate satisfaction claims", () => {
    expect(() =>
      assertLocalUntrustedSandboxEvidence({ ...sandboxRecord, chainId: LOCAL_SANDBOX_EVIDENCE_BLOCKED_MAINNET_CHAIN_ID })
    ).toThrow("local sandbox evidence cannot target MegaETH mainnet 4326");
    expect(() => assertLocalUntrustedSandboxEvidence({ ...sandboxRecord, deploymentApproved: true as false })).toThrow(
      "local sandbox evidence cannot approve deployment, signing, or real funds"
    );
    expect(() => assertLocalUntrustedSandboxEvidence({ ...sandboxRecord, privateKeysIncludedInEvidence: true as false })).toThrow(
      "local sandbox evidence must not include private keys"
    );
    expect(() => assertLocalUntrustedSandboxEvidence({ ...sandboxRecord, cannotSatisfyPromotion: false as true })).toThrow(
      "local sandbox evidence must not satisfy promotion, deployment, or guarded-user gates"
    );
  });

  it("requires clearly local artifact paths and gitignored credential handling", () => {
    expect(() =>
      assertLocalUntrustedSandboxEvidence({
        ...sandboxRecord,
        artifacts: [{ label: "zkey", path: "docs/evidence/trusted.zkey", hash }]
      })
    ).toThrow("local sandbox evidence zkey artifact path must be clearly local or untrusted");

    expect(() =>
      assertLocalUntrustedSandboxEvidence({
        ...sandboxRecord,
        credential: { ...sandboxRecord.credential!, rawPrivateKeyStored: true as false }
      })
    ).toThrow("local sandbox credential must use keystore plus gitignored 0600 env metadata and must not store or print raw private keys");
  });

  it("cannot be used as verifier promotion evidence", () => {
    const promotion = {
      recordVersion: 1,
      status: "review-ready",
      trustedSetupSource: "local-untrusted-development",
      chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID
    } as TrustedSetupVerifierPromotionRecord;

    expect(() => assertVerifierPromotionRecordReviewReady(promotion)).toThrow("local untrusted setup artifacts cannot be promoted");
  });

  it("cannot be referenced as deployment evidence", () => {
    const deployment = {
      recordVersion: 1,
      status: "review-ready",
      chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
      rpcUrl: "https://carrot.megaeth.com/rpc",
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
        salt: "shielded-v1-megaeth-testnet",
        initCodeHash: hash,
        derivationCommand: "forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --rpc-url https://carrot.megaeth.com/rpc",
        contracts: noGuardianPredictedContracts
      },
      addresses: noGuardianAddresses,
      signerPolicy: {
        privateKeysInRepo: false,
        broadcastDefault: false,
        signerDescription: "External signer only after approval."
      },
      constructorArgs: {
        privateTransferVerifier: [],
        withdrawVerifier: [],
        verifierAdapter: [addresses.privateTransferVerifier, addresses.withdrawVerifier],
        shieldedPool: [addresses.verifierAdapter, addresses.feeController, addresses.poseidon2]
      },
      verifierPromotionRecordPath: "docs/evidence/local-untrusted-sandbox-artifacts.json",
      trustedSetupRecordPath: "docs/evidence/trusted-setup-verifier-promotion.record.json",
      gasEvidencePlanPath: "docs/evidence/megaeth-testnet-gas-plan.json",
      slitherReportPath: "docs/slither-analysis.md",
      deploymentDryRunCommand:
        "forge script contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot.megaeth.com/rpc",
      postDeployReadOnlyCheckCommand:
        "forge script contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot.megaeth.com/rpc",
      constructorArgsRecorded: true,
      noMainnetConfigPresent: true
    } as unknown as DeploymentPackageCandidate;

    expect(() => assertDeploymentPackageReady(deployment)).toThrow(
      "deployment package verifier promotion record path cannot reference local or quarantined artifacts"
    );
  });
});

describe("v1.2 frontend/prover/indexer/recovery evidence", () => {
  it("accepts mainnet-bound v1.2 frontend/prover/indexer/recovery evidence without approving gated actions", () => {
    expect(assertNullarkV12FrontendProverIndexerRecoveryEvidence(frontendEvidenceRecord)).toBe(frontendEvidenceRecord);
  });

  it("rejects testnet fallback and non-mainnet chain binding", () => {
    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
        rpcUrl: "https://carrot.megaeth.com/rpc",
        environment: "megaeth-testnet"
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must target MegaETH mainnet chain 4326 and RPC");

    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        artifactSelectionRules: {
          ...frontendEvidenceRecord.artifactSelectionRules,
          chainId: LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID,
          rpcUrl: "https://carrot.megaeth.com/rpc",
          testnetFallbackAllowed: true
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must bind prover artifacts to mainnet chain, v1.2 pool, verifier, bytecode, and no testnet fallback");
  });

  it("rejects v1.1 pool or artifact reuse as v1.2 prover selection", () => {
    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        artifactSelectionRules: {
          ...frontendEvidenceRecord.artifactSelectionRules,
          pool: NULLARK_CURRENT_V11_MAINNET_POOL
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must bind prover artifacts to mainnet chain, v1.2 pool, verifier, bytecode, and no testnet fallback");

    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        artifactSelectionRules: {
          ...frontendEvidenceRecord.artifactSelectionRules,
          browserManifestSha256: "sha256:b4514173425aa34d6092e4b024341ed5a5696a8528c98f7a971521c69822a1a7"
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must prove runtime-selected v1.2 prover artifacts without v1.1 artifact reuse");
  });

  it("requires active on-chain feeBps proof generation and pre-submit recheck", () => {
    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        proofFeeSource: {
          ...frontendEvidenceRecord.proofFeeSource,
          activeFeeBpsReadBeforeProof: false,
          activeFeeBpsRecheckedBeforeSubmit: false
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must prove browser proof generation uses active on-chain feeBps and rechecks before submit");
  });

  it("rejects stale fee gaps and missing user bounds", () => {
    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        proofFeeSource: {
          ...frontendEvidenceRecord.proofFeeSource,
          staleFeeRejectedBeforeSubmit: false,
          maxFeeAmountEnforced: false
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must prove stale fee rejection and user maxFeeAmount/minNetAmount enforcement");
  });

  it("requires recovered-note routing to the original pool with no testnet fallback", () => {
    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        v1_1WithdrawalPreservation: {
          ...frontendEvidenceRecord.v1_1WithdrawalPreservation,
          routesRecoveredNotesToOriginalPool: false
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must preserve v1.1 withdrawals and route recovered notes to their original pool");

    expect(() =>
      assertNullarkV12FrontendProverIndexerRecoveryEvidence({
        ...frontendEvidenceRecord,
        recoveryIndexerRuntimeDistinction: {
          ...frontendEvidenceRecord.recoveryIndexerRuntimeDistinction,
          chainIds: [4326, LOCAL_SANDBOX_EVIDENCE_TESTNET_CHAIN_ID],
          originalPoolRoutingEvidence: false,
          noTestnetFallback: false,
          testnetFallbackAllowed: true
        }
      })
    ).toThrow("v1.2 frontend/prover/indexer/recovery evidence must prove recovery/indexer distinguishes v1.1 and v1.2 by chain, pool, runtime, and Merkle depth");
  });
});
