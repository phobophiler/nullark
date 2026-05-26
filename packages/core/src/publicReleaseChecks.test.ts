import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error publicReleaseChecks is a Node ESM release script tested through Vitest.
import { validatePublicReleaseBoundary } from "./publicReleaseChecks.mjs";

const tempRoots: string[] = [];

describe("public release boundary hash and evidence gates", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts public runtime approvals only when SDK evidence and package-pinned hashes match artifacts", () => {
    const root = createPublicReleaseFixture();

    expect(validatePublicReleaseBoundary(root)).toEqual([]);
  });

  it("rejects a stale public-artifacts/current.json hash in SDK runtime evidence and package-pinned constants", () => {
    const staleHash = "0".repeat(64);
    const root = createPublicReleaseFixture({
      sdkCurrentHash: staleHash,
      packagePinnedCurrentHash: staleHash
    });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("packages/sdk/runtime/current.json promotionEvidence for public-artifacts/current.json hash mismatch"),
        expect.stringContaining(
          "packages/sdk/src/runtime/current.ts PACKAGE_PINNED_V12_PROMOTION_EVIDENCE for public-artifacts/current.json hash mismatch"
        )
      ])
    );
  });

  it("rejects approval booleans flipped true when hash-checked public evidence is missing", () => {
    const root = createPublicReleaseFixture({ omitTrustedSetupRecord: true });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining([
        "public-artifacts/current.json mainnetValueMovingApproved=true requires hash-checked apps/web/public/proving/trusted-setup-record.json",
        "public-artifacts/current.json guardedUsersApproved=true requires hash-checked apps/web/public/proving/trusted-setup-record.json"
      ])
    );
  });

  it("rejects approval booleans flipped true when the trusted setup evidence hash is stale", () => {
    const root = createPublicReleaseFixture({
      currentTrustedSetupHash: "1".repeat(64)
    });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining(["public-artifacts/current.json artifacts.trustedSetupRecordSha256 must match apps/web/public/proving/trusted-setup-record.json"])
    );
  });

  it("rejects approval booleans without scoped public approval metadata", () => {
    const root = createPublicReleaseFixture({ omitCurrentApprovalEvidence: true });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining(["public-artifacts/current.json approval booleans require approvalEvidence metadata"])
    );
  });

  it("rejects stale proof source hashes in trusted setup evidence", () => {
    const root = createPublicReleaseFixture({
      withdrawSourceHash: "0".repeat(64)
    });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("apps/web/public/proving/trusted-setup-record.json:artifacts.withdraw.sourcePath hash mismatch")
      ])
    );
  });

  it("rejects stale artifact hashes published in public-artifacts/current.json", () => {
    const root = createPublicReleaseFixture({
      currentWithdrawWasmHash: "0".repeat(64)
    });

    expect(validatePublicReleaseBoundary(root)).toEqual(
      expect.arrayContaining([expect.stringContaining("public-artifacts/current.json:artifacts.withdrawWasmSha256 hash mismatch")])
    );
  });
});

function createPublicReleaseFixture(
  options: {
    sdkCurrentHash?: string;
    packagePinnedCurrentHash?: string;
    currentTrustedSetupHash?: string;
    omitTrustedSetupRecord?: boolean;
    omitCurrentApprovalEvidence?: boolean;
    withdrawSourceHash?: string;
    currentWithdrawWasmHash?: string;
  } = {}
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nullark-public-release-"));
  tempRoots.push(root);

  const wasmHash = writeBinary(root, "public-artifacts/proving/v1.2/withdraw.wasm", "wasm");
  const zkeyHash = writeBinary(root, "public-artifacts/proving/v1.2/withdraw.zkey", "zkey");
  const r1csHash = writeBinary(root, "public-artifacts/proving/v1.2/withdraw.r1cs", "r1cs");
  const vkeyHash = writeJson(root, "public-artifacts/proving/v1.2/withdraw.vkey.json", { verifyingKey: true });
  const withdrawSourceHash = writeText(root, "circuits/withdraw_v1_2.circom", "withdraw source\n");
  const withdrawGeneratedHash = writeText(
    root,
    "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol",
    "contract Groth16WithdrawVerifier {}\n"
  );
  const depositSourceHash = writeText(root, "circuits/deposit_v1_2.circom", "deposit source\n");
  const depositR1csHash = writeBinary(root, "public-artifacts/proving/v1.2/deposit.r1cs", "deposit-r1cs");
  const depositWasmHash = writeBinary(root, "public-artifacts/proving/v1.2/deposit.wasm", "deposit-wasm");
  const depositZkeyHash = writeBinary(root, "public-artifacts/proving/v1.2/deposit.zkey", "deposit-zkey");
  const depositVkeyHash = writeJson(root, "public-artifacts/proving/v1.2/deposit.vkey.json", { verifyingKey: "deposit" });
  const depositGeneratedHash = writeText(
    root,
    "contracts/src/verifiers/generated/mainnet/Groth16DepositVerifier.sol",
    "contract Groth16DepositVerifier {}\n"
  );
  const privateTransferSourceHash = writeText(root, "circuits/private_transfer_v1_2.circom", "private transfer source\n");
  const privateTransferR1csHash = writeBinary(root, "public-artifacts/proving/v1.2/private_transfer.r1cs", "private-r1cs");
  const privateTransferWasmHash = writeBinary(root, "public-artifacts/proving/v1.2/private_transfer.wasm", "private-wasm");
  const privateTransferZkeyHash = writeBinary(root, "public-artifacts/proving/v1.2/private_transfer.zkey", "private-zkey");
  const privateTransferVkeyHash = writeJson(root, "public-artifacts/proving/v1.2/private_transfer.vkey.json", { verifyingKey: "privateTransfer" });
  const privateTransferGeneratedHash = writeText(
    root,
    "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol",
    "contract Groth16PrivateTransferVerifier {}\n"
  );
  const trustedSetupPath = "apps/web/public/proving/trusted-setup-record.json";
  const manifestPath = "apps/web/public/proving/withdraw-artifacts.manifest.json";
  writeBinary(root, "apps/web/public/proving/withdraw.wasm", "wasm");
  writeBinary(root, "apps/web/public/proving/withdraw_final.zkey", "zkey");
  writeBinary(root, "apps/web/public/proving/deposit.wasm", "deposit-wasm");
  writeBinary(root, "apps/web/public/proving/deposit_final.zkey", "deposit-zkey");
  writeBinary(root, "apps/web/public/proving/private_transfer.wasm", "private-wasm");
  writeBinary(root, "apps/web/public/proving/private_transfer_final.zkey", "private-zkey");

  const manifestHash = writeJson(root, manifestPath, {
    schema: "browser-withdraw-prover-artifacts-v1",
    artifacts: {
      withdrawWasm: { source: "public-artifacts/proving/v1.2/withdraw.wasm", sha256: wasmHash },
      withdrawFinalZkey: { source: "public-artifacts/proving/v1.2/withdraw.zkey", sha256: zkeyHash }
    }
  });

  let trustedSetupHash = "2".repeat(64);
  if (!options.omitTrustedSetupRecord) {
    trustedSetupHash = writeJson(root, trustedSetupPath, {
      status: "approved-for-mainnet",
      hashBoundToFinalArtifacts: true,
      publicRuntime: { currentRef: "public-artifacts/current.json" },
      mainnetOperatorDecisions: {
        productionRelayerApproved: true,
        automatedValueMovementApprovedByThisRecord: true,
        mainnetValueMovingApproved: true,
        guardedUsersApproved: true,
        productionPrivacyClaimsApproved: false
      },
      artifacts: {
        deposit: {
          sourcePath: "circuits/deposit_v1_2.circom",
          sourceHash: depositSourceHash,
          r1csArtifactRef: "public-artifacts/proving/v1.2/deposit.r1cs",
          r1csHash: depositR1csHash,
          wasmArtifactRef: "public-artifacts/proving/v1.2/deposit.wasm",
          wasmHash: depositWasmHash,
          zkeyArtifactRef: "public-artifacts/proving/v1.2/deposit.zkey",
          zkeyHash: depositZkeyHash,
          verificationKeyArtifactRef: "public-artifacts/proving/v1.2/deposit.vkey.json",
          verificationKeyHash: depositVkeyHash,
          generatedSolidityVerifierPath: "contracts/src/verifiers/generated/mainnet/Groth16DepositVerifier.sol",
          generatedSolidityVerifierHash: depositGeneratedHash
        },
        privateTransfer: {
          sourcePath: "circuits/private_transfer_v1_2.circom",
          sourceHash: privateTransferSourceHash,
          r1csArtifactRef: "public-artifacts/proving/v1.2/private_transfer.r1cs",
          r1csHash: privateTransferR1csHash,
          wasmArtifactRef: "public-artifacts/proving/v1.2/private_transfer.wasm",
          wasmHash: privateTransferWasmHash,
          zkeyArtifactRef: "public-artifacts/proving/v1.2/private_transfer.zkey",
          zkeyHash: privateTransferZkeyHash,
          verificationKeyArtifactRef: "public-artifacts/proving/v1.2/private_transfer.vkey.json",
          verificationKeyHash: privateTransferVkeyHash,
          generatedSolidityVerifierPath: "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol",
          generatedSolidityVerifierHash: privateTransferGeneratedHash
        },
        withdraw: {
          sourcePath: "circuits/withdraw_v1_2.circom",
          sourceHash: options.withdrawSourceHash ?? withdrawSourceHash,
          r1csArtifactRef: "public-artifacts/proving/v1.2/withdraw.r1cs",
          r1csHash,
          wasmArtifactRef: "public-artifacts/proving/v1.2/withdraw.wasm",
          wasmHash,
          zkeyArtifactRef: "public-artifacts/proving/v1.2/withdraw.zkey",
          zkeyHash,
          verificationKeyArtifactRef: "public-artifacts/proving/v1.2/withdraw.vkey.json",
          verificationKeyHash: vkeyHash,
          generatedSolidityVerifierPath: "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol",
          generatedSolidityVerifierHash: withdrawGeneratedHash
        }
      }
    });
  }

  const currentRecord = {
    schema: "nullark-public-runtime-current-v1",
    productVersion: "nullark-v1.2-fee-governance",
    runtimeId: "nullark-v1.2-mainnet",
    network: "megaeth-mainnet",
    chainId: 4326,
    mainnet4326Blocked: false,
    pool: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8",
    depositVerifier: "0x1111111111111111111111111111111111111111",
    privateTransferVerifier: "0x2222222222222222222222222222222222222222",
    withdrawVerifier: "0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92",
    withdrawSelector: "0x678d8506",
    relayerEndpoint: "https://relayer.nullark.com/transaction",
    productionRelayerApproved: true,
    approvedWithdrawalRelayer: "0x8684bCb6D1deCb9b89733E7120625947615Cc14F",
    mainnetValueMovingApproved: true,
    automatedValueMovementApprovedByThisRecord: true,
    privacyClaimsApproved: false,
    guardedUsersApproved: true,
    remainingBlockers: [],
    artifacts: {
      proverManifestSha256: manifestHash,
      trustedSetupRecordSha256: options.currentTrustedSetupHash ?? trustedSetupHash,
      depositWasmSha256: depositWasmHash,
      depositFinalZkeySha256: depositZkeyHash,
      privateTransferWasmSha256: privateTransferWasmHash,
      privateTransferFinalZkeySha256: privateTransferZkeyHash,
      withdrawWasmSha256: options.currentWithdrawWasmHash ?? wasmHash,
      withdrawFinalZkeySha256: zkeyHash
    },
    paths: {
      browserProverManifest: manifestPath,
      trustedSetupRecord: trustedSetupPath,
      depositWasm: "public-artifacts/proving/v1.2/deposit.wasm",
      depositFinalZkey: "public-artifacts/proving/v1.2/deposit.zkey",
      privateTransferWasm: "public-artifacts/proving/v1.2/private_transfer.wasm",
      privateTransferFinalZkey: "public-artifacts/proving/v1.2/private_transfer.zkey",
      withdrawWasm: "public-artifacts/proving/v1.2/withdraw.wasm",
      withdrawFinalZkey: "public-artifacts/proving/v1.2/withdraw.zkey"
    }
  };
  if (!options.omitCurrentApprovalEvidence) {
    Object.assign(currentRecord, {
      approvalEvidence: {
        publicApprovalSource: {
          path: trustedSetupPath,
          sha256: options.currentTrustedSetupHash ?? trustedSetupHash,
          status: "approved-for-mainnet"
        },
        approvedRuntimeBinding: {
          chainId: 4326,
          pool: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8",
          withdrawVerifier: "0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92",
          withdrawSelector: "0x678d8506",
          relayerEndpoint: "https://relayer.nullark.com/transaction",
          approvedWithdrawalRelayer: "0x8684bCb6D1deCb9b89733E7120625947615Cc14F"
        },
        evidenceVisibility: {
          trustedSetupRecord: "public-hash-pinned",
          operatorEvidence: "private-not-in-public-checkout",
          liveSmokeEvidence: "private-not-in-public-checkout",
          guardedUserRolloutEvidence: "private-not-in-public-checkout"
        },
        requiresPrivateOperatorEvidenceForOperationalReliance: true
      },
      approvalSemantics: {
        publicRecordDoesNotProve: [
          "operator key custody",
          "relayer funding status",
          "production readiness from a local checkout",
          "production privacy claims"
        ]
      }
    });
  }
  const currentHash = writeJson(root, "public-artifacts/current.json", currentRecord);

  const sdkCurrentHash = options.sdkCurrentHash ?? currentHash;
  writeJson(root, "packages/sdk/runtime/current.json", {
    schema: "nullark-sdk-runtime-v1-2-candidate-v1",
    productVersion: "nullark-v1.2-fee-governance",
    environment: "megaeth-mainnet",
    chainId: 4326,
    v1_2Readiness: {
      approvedForMainnet: true,
      ownerApprovedPromotion: true,
      promotionEvidence: [
        { path: trustedSetupPath, sha256: trustedSetupHash, status: "approved-for-mainnet" },
        { path: "public-artifacts/current.json", sha256: sdkCurrentHash, status: "approved-for-mainnet" }
      ]
    }
  });
  writeText(
    root,
    "packages/sdk/src/runtime/current.ts",
    `const PACKAGE_PINNED_V12_PROMOTION_EVIDENCE = [
  { path: "${trustedSetupPath}", sha256: "${trustedSetupHash}", kind: "ready-validator-output" },
  { path: "public-artifacts/current.json", sha256: "${options.packagePinnedCurrentHash ?? currentHash}", kind: "public-runtime-state" }
];
`
  );

  writeRequiredPublicFiles(root);
  trackFixture(root);
  return root;
}

function writeRequiredPublicFiles(root: string): void {
  writeText(root, "README.md", "public fixture\n");
  writeText(root, "LICENSE", "MIT\n");
  writeText(root, "SECURITY.md", "security\n");
  writeText(root, "CONTRIBUTING.md", "contributing\n");
  writeText(root, "apps/web/.env.example", "PUBLIC_FIXTURE=1\n");
  writeText(root, ".github/workflows/public-release.yml", "name: public-release\n");
  writeText(root, ".github/workflows/dependency-audit.yml", "name: dependency-audit\n");
  writeText(root, "services/relayer-worker/wrangler.example.toml", "# example\n");
  writeText(root, "docs/security/dependency-audit.md", "audit\n");
  writeJson(root, "public-artifacts/evidence/mainnet-readiness/gas/stage-c-deadline-volatile-compute-limit.json", {
    schema: "nullark-public-megaeth-volatile-metadata-evidence-v1",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    status: "reviewed-accepted",
    volatileField: "block.timestamp",
    computeGasCap: "20000000"
  });
  writeJson(root, "package.json", {
    scripts: {
      "public:verify": "npm run public:boundary:validate && npm run secret-hygiene:validate && npm test && npm run typecheck && npm run docs:check && npm run contracts:test",
      "public:boundary:validate": "node packages/core/src/publicReleaseChecks.mjs --public-boundary",
      "secret-hygiene:validate": "node packages/core/src/publicReleaseChecks.mjs",
      "dependency-audit": "npm audit --omit=dev",
      "production:private-evidence:validate": "node packages/core/src/productionReadinessChecks.mjs --private-evidence",
      "production:readiness:verify":
        "npm run public:boundary:validate && npm run production:private-evidence:validate && npm run secret-hygiene:validate && npm run dependency-audit && npm test && npm run typecheck && npm run docs:check && npm run docs:test:browser && npm run contracts:test && npm run contracts:slither && npm run contracts:test:real-proof && npm run circuits:test"
    }
  });
}

function writeJson(root: string, relativePath: string, value: unknown): string {
  return writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBinary(root: string, relativePath: string, value: string): string {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, Buffer.from(value));
  return sha256File(absolutePath);
}

function writeText(root: string, relativePath: string, value: string): string {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value);
  return sha256File(absolutePath);
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function trackFixture(root: string): void {
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
}
