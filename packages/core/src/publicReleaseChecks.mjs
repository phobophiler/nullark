#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

export function scanTextForCommittedSecrets(text, filePath = "unknown") {
  const findings = [];
  const patterns = [
    {
      label: "raw private key assignment",
      regex: /\b(?:privateKey|private_key|PRIVATE_KEY)\b\s*[:=]\s*["']?0x[0-9a-fA-F]{64}\b/g
    },
    {
      label: "mnemonic assignment",
      regex: /\b(?:mnemonic|MNEMONIC|seedPhrase|seed_phrase)\b\s*[:=]\s*["'][a-z]+(?:\s+[a-z]+){11,}["']/g
    },
    {
      label: "plaintext keystore password assignment",
      regex: /\b(?:KEYSTORE_PASSWORD|keystorePassword|keystore_password|CAST_UNSAFE_PASSWORD)\b\s*[:=]\s*["'][^"'\n]{8,}["']/g
    },
    {
      label: "ethereum keystore crypto payload",
      regex: /"crypto"\s*:\s*\{[\s\S]{0,2000}"ciphertext"\s*:\s*"[0-9a-fA-F]{64,}"/g
    }
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      findings.push({
        filePath,
        label: pattern.label,
        line: lineNumberForOffset(text, match.index ?? 0)
      });
    }
  }

  return findings;
}

export function validateTrackedSecretHygiene(root = repoRoot) {
  const trackedFiles = listTrackedFiles(root);
  const findings = [];
  for (const filePath of trackedFiles) {
    if (shouldSkipPath(filePath)) continue;
    const absolutePath = path.join(root, filePath);
    if (!fs.existsSync(absolutePath)) continue;
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size > 2_000_000) continue;
    const text = fs.readFileSync(absolutePath, "utf8");
    findings.push(...scanTextForCommittedSecrets(text, filePath));
  }
  return findings;
}

export function validatePublicReleaseBoundary(root = repoRoot) {
  const trackedFiles = listTrackedFiles(root);
  const trackedSet = new Set(trackedFiles);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const issues = [];

  const requiredPublicFiles = [
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "apps/web/.env.example",
    ".github/workflows/public-release.yml",
    ".github/workflows/dependency-audit.yml",
    "services/relayer-worker/wrangler.example.toml",
    "public-artifacts/current.json",
    "public-artifacts/evidence/mainnet-readiness/gas/stage-c-deadline-volatile-compute-limit.json",
    "apps/web/public/proving/withdraw-artifacts.manifest.json",
    "apps/web/public/proving/trusted-setup-record.json",
    "docs/security/dependency-audit.md"
  ];

  const forbiddenTrackedFiles = [
    ".env",
    ".env.local",
    ".env.mainnet.local",
    ".env.mainnet.rotation.local",
    "services/relayer-worker/wrangler.toml",
    "services/relayer-worker/wrangler.mainnet.toml",
    "apps/web/wrangler.pages.mainnet.toml",
    "apps/web/wrangler.pages.testnet-nullark.toml"
  ];

  const forbiddenTrackedPrefixes = [
    "docs/evidence/owner-approval/",
    "docs/evidence/mainnet-readiness/admin/",
    "docs/evidence/mainnet-readiness/v1-2/",
    "docs/evidence/mainnet-readiness/deployment-receipts/",
    "docs/evidence/mainnet-readiness/gas/",
    "docs/evidence/mainnet-readiness/live-smoke/",
    "docs/evidence/mainnet-readiness/source-verification/",
    "evidence/mainnet-readiness/v1-2/",
    "public-artifacts/contracts/"
  ];

  for (const file of requiredPublicFiles) {
    if (!trackedSet.has(file) || !fs.existsSync(path.join(root, file))) {
      issues.push(`missing required public release file: ${file}`);
    }
  }

  for (const file of forbiddenTrackedFiles) {
    if (trackedSet.has(file)) {
      issues.push(`private or environment-specific file must not be tracked: ${file}`);
    }
  }

  for (const file of trackedFiles) {
    for (const prefix of forbiddenTrackedPrefixes) {
      if (file.startsWith(prefix)) {
        issues.push(`private operator evidence must stay out of public repo: ${file}`);
      }
    }
  }

  const scripts = packageJson.scripts ?? {};
  for (const scriptName of ["public:verify", "public:boundary:validate", "secret-hygiene:validate", "dependency-audit"]) {
    if (typeof scripts[scriptName] !== "string" || scripts[scriptName].length === 0) {
      issues.push(`package.json must expose public release script: ${scriptName}`);
    }
  }
  validateProductionReadinessCommand(scripts, issues);

  if (scripts["mainnet:readiness:validate"] || scripts["mainnet:readiness:v1-2:validate"]) {
    issues.push("public package.json must not expose private mainnet readiness validators");
  }

  validateCurrentPublicRuntime(root, issues);
  validatePublicProvingArtifacts(root, issues);
  validatePublicRuntimeMetadata(root, issues);
  validatePublicMegaEthEvidence(root, issues);
  validatePublicReleaseHashSync(root, issues);
  validatePublicApprovalEvidenceBinding(root, issues);

  return issues;
}

function validateProductionReadinessCommand(scripts, issues) {
  const script = scripts["production:readiness:verify"];
  if (typeof script !== "string" || script.length === 0) {
    issues.push("package.json must expose explicit production readiness script: production:readiness:verify");
    return;
  }

  const requiredGates = [
    "public:boundary:validate",
    "production:private-evidence:validate",
    "secret-hygiene:validate",
    "dependency-audit",
    "test",
    "typecheck",
    "docs:check",
    "docs:test:browser",
    "contracts:test",
    "contracts:slither",
    "contracts:test:real-proof",
    "circuits:test"
  ];
  for (const gate of requiredGates) {
    if (!script.includes(gate)) {
      issues.push(`production:readiness:verify must include ${gate}`);
    }
  }
}

function validateCurrentPublicRuntime(root, issues) {
  const currentPath = "public-artifacts/current.json";
  if (!fs.existsSync(path.join(root, currentPath))) return;
  const current = readJson(root, currentPath, issues);
  if (!current) return;

  if (current.chainId !== 4326) {
    issues.push(`${currentPath} must remain bound to MegaETH mainnet chain ID 4326`);
  }
  for (const field of [
    "productionRelayerApproved",
    "mainnetValueMovingApproved",
    "automatedValueMovementApprovedByThisRecord",
    "guardedUsersApproved"
  ]) {
    if (typeof current[field] !== "boolean") {
      issues.push(`${currentPath} ${field} must be an explicit boolean`);
    }
  }
  if (current.privacyClaimsApproved !== false) {
    issues.push(`${currentPath} must keep production privacy claims disabled until separately approved`);
  }
  if (current.remainingBlockers && current.remainingBlockers.length !== 0) {
    issues.push(`${currentPath} must not publish stale release blockers for the current public runtime`);
  }
  if (current.depositVerifier && !current.artifacts?.depositWasmSha256) {
    issues.push(`${currentPath} must pin deposit prover artifact hashes when publishing depositVerifier`);
  }
  if (current.privateTransferVerifier && !current.artifacts?.privateTransferWasmSha256) {
    issues.push(`${currentPath} must pin private-transfer prover artifact hashes when publishing privateTransferVerifier`);
  }
}

function validatePublicProvingArtifacts(root, issues) {
  const manifestPath = "apps/web/public/proving/withdraw-artifacts.manifest.json";
  const trustedSetupPath = "apps/web/public/proving/trusted-setup-record.json";
  const manifest = readJson(root, manifestPath, issues);
  const trustedSetup = readJson(root, trustedSetupPath, issues);

  if (manifest) {
    for (const [name, artifact] of Object.entries(manifest.artifacts ?? {})) {
      validateArtifactRef(root, issues, `${manifestPath}:artifacts.${name}.source`, artifact.source, artifact.sha256);
    }
  }

  if (trustedSetup) {
    if (trustedSetup.status !== "approved-for-mainnet") {
      issues.push(`${trustedSetupPath} must remain approved-for-mainnet for the current public release`);
    }
    if (trustedSetup.mainnetOperatorDecisions?.productionPrivacyClaimsApproved !== false) {
      issues.push(`${trustedSetupPath} must keep production privacy claims disabled until separately approved`);
    }

    const artifacts = trustedSetup.artifacts ?? {};
    const current = readJson(root, "public-artifacts/current.json", issues);
    const requiredArtifactNames = ["withdraw"];
    if (current?.depositVerifier) requiredArtifactNames.push("deposit");
    if (current?.privateTransferVerifier) requiredArtifactNames.push("privateTransfer");
    for (const name of requiredArtifactNames) {
      if (!artifacts[name]) {
        issues.push(`${trustedSetupPath}:artifacts.${name} is required for the current public runtime`);
      }
    }
    for (const [name, artifact] of Object.entries(artifacts)) {
      validateTrustedSetupProofArtifact(root, issues, trustedSetupPath, name, artifact);
    }
  }
}

function validateTrustedSetupProofArtifact(root, issues, trustedSetupPath, name, artifact) {
  validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.${name}.sourcePath`, artifact.sourcePath, artifact.sourceHash);
  validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.${name}.r1csArtifactRef`, artifact.r1csArtifactRef, artifact.r1csHash);
  validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.${name}.wasmArtifactRef`, artifact.wasmArtifactRef, artifact.wasmHash);
  validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.${name}.zkeyArtifactRef`, artifact.zkeyArtifactRef, artifact.zkeyHash);
  validateArtifactRef(
    root,
    issues,
    `${trustedSetupPath}:artifacts.${name}.verificationKeyArtifactRef`,
    artifact.verificationKeyArtifactRef,
    artifact.verificationKeyHash
  );
  validateArtifactRef(
    root,
    issues,
    `${trustedSetupPath}:artifacts.${name}.generatedSolidityVerifierPath`,
    artifact.generatedSolidityVerifierPath,
    artifact.generatedSolidityVerifierHash
  );
}

function validatePublicMegaEthEvidence(root, issues) {
  const currentPath = "public-artifacts/current.json";
  const current = readJson(root, currentPath, issues);
  if (!current || current.chainId !== 4326 || current.remainingBlockers?.length !== 0) {
    return;
  }

  const volatileEvidencePath = "public-artifacts/evidence/mainnet-readiness/gas/stage-c-deadline-volatile-compute-limit.json";
  const evidence = readJson(root, volatileEvidencePath, issues);
  if (!evidence) {
    issues.push(`${currentPath} remainingBlockers=[] requires public MegaETH volatile metadata evidence`);
    return;
  }
  if (
    evidence.chainId !== 4326 ||
    evidence.rpcUrl !== "https://mainnet.megaeth.com/rpc" ||
    evidence.status !== "reviewed-accepted" ||
    evidence.computeGasCap !== "20000000" ||
    evidence.volatileField !== "block.timestamp"
  ) {
    issues.push(`${volatileEvidencePath} must approve the MegaETH mainnet block.timestamp compute-cap path`);
  }
}

function validatePublicRuntimeMetadata(root, issues) {
  const publicMetadataFiles = [
    "packages/sdk/src/runtime/current.ts",
    "packages/sdk/runtime/current.json",
    "public-artifacts/current.json",
    "apps/web/.env.example"
  ];
  for (const filePath of publicMetadataFiles) {
    const absolutePath = path.join(root, filePath);
    if (!fs.existsSync(absolutePath)) continue;
    const text = fs.readFileSync(absolutePath, "utf8");
    if (/docs\/evidence\/mainnet-readiness\/(?:admin|v1-2)\//.test(text)) {
      issues.push(`${filePath} must not publish private mainnet readiness evidence paths`);
    }
    if (/public-artifacts\/contracts\//.test(text)) {
      issues.push(`${filePath} must not publish private contract broadcast-gate artifact paths`);
    }
  }
}

function validatePublicReleaseHashSync(root, issues) {
  const currentPath = "public-artifacts/current.json";
  const sdkRuntimePath = "packages/sdk/runtime/current.json";
  const sdkConstantsPath = "packages/sdk/src/runtime/current.ts";
  const currentAbsolutePath = path.join(root, currentPath);

  if (!fs.existsSync(currentAbsolutePath)) {
    return;
  }

  const actualCurrentHash = sha256File(currentAbsolutePath);
  const current = readJson(root, currentPath, issues);
  if (current) {
    validateCurrentArtifactHashes(root, current, issues);
  }
  const sdkRuntime = readJson(root, sdkRuntimePath, issues);
  const promotionEvidence = Array.isArray(sdkRuntime?.v1_2Readiness?.promotionEvidence)
    ? sdkRuntime.v1_2Readiness.promotionEvidence
    : [];
  if (sdkRuntime?.v1_2Readiness?.approvedForMainnet === true || sdkRuntime?.v1_2Readiness?.ownerApprovedPromotion === true) {
    if (promotionEvidence.length === 0) {
      issues.push(`${sdkRuntimePath} must include hash-bound promotionEvidence before claiming v1.2 mainnet approval`);
    }
  }

  const sdkCurrentEvidence = promotionEvidence.find((entry) => entry?.path === currentPath);
  if (!sdkCurrentEvidence) {
    issues.push(`${sdkRuntimePath} v1_2Readiness.promotionEvidence must pin ${currentPath}`);
  } else if (normalizeSha256(sdkCurrentEvidence.sha256) !== actualCurrentHash) {
    issues.push(
      `${sdkRuntimePath} promotionEvidence for ${currentPath} hash mismatch: expected ${normalizeSha256(
        sdkCurrentEvidence.sha256
      )}, got ${actualCurrentHash}`
    );
  }

  for (const evidence of promotionEvidence) {
    if (!evidence?.path) {
      issues.push(`${sdkRuntimePath} promotionEvidence entries must include path`);
      continue;
    }
    if (!evidence.sha256) {
      issues.push(`${sdkRuntimePath} promotionEvidence for ${evidence.path} is missing sha256`);
      continue;
    }
    validateArtifactRef(root, issues, `${sdkRuntimePath}:v1_2Readiness.promotionEvidence.${evidence.path}`, evidence.path, evidence.sha256);
  }

  const packagePinnedEvidence = readPackagePinnedPromotionEvidence(root, sdkConstantsPath, issues);
  const pinnedCurrentEvidence = packagePinnedEvidence.find((entry) => entry.path === currentPath);
  if (!pinnedCurrentEvidence) {
    issues.push(`${sdkConstantsPath} PACKAGE_PINNED_V12_PROMOTION_EVIDENCE must pin ${currentPath}`);
  } else if (normalizeSha256(pinnedCurrentEvidence.sha256) !== actualCurrentHash) {
    issues.push(
      `${sdkConstantsPath} PACKAGE_PINNED_V12_PROMOTION_EVIDENCE for ${currentPath} hash mismatch: expected ${normalizeSha256(
        pinnedCurrentEvidence.sha256
      )}, got ${actualCurrentHash}`
    );
  }

  for (const pinned of packagePinnedEvidence) {
    validateArtifactRef(root, issues, `${sdkConstantsPath}:PACKAGE_PINNED_V12_PROMOTION_EVIDENCE.${pinned.path}`, pinned.path, pinned.sha256);
  }
}

function validateCurrentArtifactHashes(root, current, issues) {
  const currentPath = "public-artifacts/current.json";
  const pairs = [
    ["artifacts.proverManifestSha256", current.artifacts?.proverManifestSha256, "paths.browserProverManifest", current.paths?.browserProverManifest],
    ["artifacts.trustedSetupRecordSha256", current.artifacts?.trustedSetupRecordSha256, "paths.trustedSetupRecord", current.paths?.trustedSetupRecord],
    ["artifacts.depositWasmSha256", current.artifacts?.depositWasmSha256, "paths.depositWasm", current.paths?.depositWasm],
    ["artifacts.depositFinalZkeySha256", current.artifacts?.depositFinalZkeySha256, "paths.depositFinalZkey", current.paths?.depositFinalZkey],
    [
      "artifacts.privateTransferWasmSha256",
      current.artifacts?.privateTransferWasmSha256,
      "paths.privateTransferWasm",
      current.paths?.privateTransferWasm
    ],
    [
      "artifacts.privateTransferFinalZkeySha256",
      current.artifacts?.privateTransferFinalZkeySha256,
      "paths.privateTransferFinalZkey",
      current.paths?.privateTransferFinalZkey
    ],
    ["artifacts.withdrawWasmSha256", current.artifacts?.withdrawWasmSha256, "paths.withdrawWasm", current.paths?.withdrawWasm],
    ["artifacts.withdrawFinalZkeySha256", current.artifacts?.withdrawFinalZkeySha256, "paths.withdrawFinalZkey", current.paths?.withdrawFinalZkey]
  ];

  for (const [hashField, expectedHash, pathField, artifactPath] of pairs) {
    if (expectedHash === undefined && artifactPath === undefined) {
      continue;
    }
    if (expectedHash === undefined || artifactPath === undefined) {
      issues.push(`${currentPath} ${hashField} and ${pathField} must be present together`);
      continue;
    }
    validateArtifactRef(root, issues, `${currentPath}:${hashField}`, artifactPath, expectedHash);
  }
}

function validatePublicApprovalEvidenceBinding(root, issues) {
  const currentPath = "public-artifacts/current.json";
  const trustedSetupPath = "apps/web/public/proving/trusted-setup-record.json";
  const current = readJson(root, currentPath, issues);
  const trustedSetup = readJson(root, trustedSetupPath, issues);
  if (!current) return;

  const approvalClaims = [
    ["productionRelayerApproved", current.productionRelayerApproved],
    ["mainnetValueMovingApproved", current.mainnetValueMovingApproved],
    ["automatedValueMovementApprovedByThisRecord", current.automatedValueMovementApprovedByThisRecord],
    ["guardedUsersApproved", current.guardedUsersApproved]
  ].filter(([, value]) => value === true);

  if (approvalClaims.length === 0 && current.privacyClaimsApproved !== true) {
    return;
  }

  if (!trustedSetup) {
    for (const [field] of approvalClaims) {
      issues.push(`${currentPath} ${field}=true requires hash-checked ${trustedSetupPath}`);
    }
    if (current.privacyClaimsApproved === true) {
      issues.push(`${currentPath} privacyClaimsApproved=true requires hash-checked privacy-claims evidence`);
    }
    return;
  }

  const currentTrustedSetupHash = normalizeSha256(current.artifacts?.trustedSetupRecordSha256);
  const actualTrustedSetupHash = sha256File(path.join(root, trustedSetupPath));
  if (currentTrustedSetupHash !== actualTrustedSetupHash) {
    issues.push(`${currentPath} artifacts.trustedSetupRecordSha256 must match ${trustedSetupPath}`);
  }
  if (trustedSetup.publicRuntime?.currentRef !== currentPath) {
    issues.push(`${trustedSetupPath} publicRuntime.currentRef must point to ${currentPath}`);
  }
  if (trustedSetup.status !== "approved-for-mainnet" || trustedSetup.hashBoundToFinalArtifacts !== true) {
    issues.push(`${trustedSetupPath} must be approved-for-mainnet and hashBoundToFinalArtifacts=true`);
  }

  const decisions = trustedSetup.mainnetOperatorDecisions ?? {};
  const evidenceFieldMap = {
    productionRelayerApproved: "productionRelayerApproved",
    mainnetValueMovingApproved: "mainnetValueMovingApproved",
    automatedValueMovementApprovedByThisRecord: "automatedValueMovementApprovedByThisRecord",
    guardedUsersApproved: "guardedUsersApproved"
  };
  for (const [field] of approvalClaims) {
    const evidenceField = evidenceFieldMap[field];
    if (decisions[evidenceField] !== true) {
      issues.push(`${currentPath} ${field}=true requires ${trustedSetupPath} mainnetOperatorDecisions.${evidenceField}=true`);
    }
  }
  validateCurrentApprovalEvidence(current, trustedSetupPath, currentTrustedSetupHash, issues);

  if (current.privacyClaimsApproved === true) {
    issues.push(`${currentPath} privacyClaimsApproved=true requires a separate hash-checked public privacy-claims artifact`);
  }
}

function validateCurrentApprovalEvidence(current, trustedSetupPath, trustedSetupHash, issues) {
  const currentPath = "public-artifacts/current.json";
  const evidence = current.approvalEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push(`${currentPath} approval booleans require approvalEvidence metadata`);
    return;
  }

  if (evidence.publicApprovalSource?.path !== trustedSetupPath) {
    issues.push(`${currentPath} approvalEvidence.publicApprovalSource.path must be ${trustedSetupPath}`);
  }
  if (normalizeSha256(evidence.publicApprovalSource?.sha256) !== trustedSetupHash) {
    issues.push(`${currentPath} approvalEvidence.publicApprovalSource.sha256 must match artifacts.trustedSetupRecordSha256`);
  }
  if (evidence.publicApprovalSource?.status !== "approved-for-mainnet") {
    issues.push(`${currentPath} approvalEvidence.publicApprovalSource.status must be approved-for-mainnet`);
  }

  const binding = evidence.approvedRuntimeBinding ?? {};
  const expectedBindings = {
    chainId: current.chainId,
    pool: current.pool,
    withdrawVerifier: current.withdrawVerifier,
    withdrawSelector: current.withdrawSelector,
    relayerEndpoint: current.relayerEndpoint,
    approvedWithdrawalRelayer: current.approvedWithdrawalRelayer
  };
  for (const [field, expected] of Object.entries(expectedBindings)) {
    if (binding[field] !== expected) {
      issues.push(`${currentPath} approvalEvidence.approvedRuntimeBinding.${field} must match current ${field}`);
    }
  }

  const visibility = evidence.evidenceVisibility ?? {};
  const privateEvidenceFields = ["operatorEvidence", "liveSmokeEvidence", "guardedUserRolloutEvidence"];
  for (const field of privateEvidenceFields) {
    if (visibility[field] !== "private-not-in-public-checkout") {
      issues.push(`${currentPath} approvalEvidence.evidenceVisibility.${field} must be private-not-in-public-checkout`);
    }
  }
  if (visibility.trustedSetupRecord !== "public-hash-pinned") {
    issues.push(`${currentPath} approvalEvidence.evidenceVisibility.trustedSetupRecord must be public-hash-pinned`);
  }
  if (evidence.requiresPrivateOperatorEvidenceForOperationalReliance !== true) {
    issues.push(`${currentPath} approvalEvidence must require private operator evidence for operational reliance`);
  }

  const semantics = current.approvalSemantics;
  if (!semantics || typeof semantics !== "object" || Array.isArray(semantics)) {
    issues.push(`${currentPath} approval booleans require approvalSemantics metadata`);
    return;
  }
  const notProven = Array.isArray(semantics.publicRecordDoesNotProve) ? semantics.publicRecordDoesNotProve.join("\n") : "";
  for (const phrase of ["operator key custody", "relayer funding status", "production readiness from a local checkout", "production privacy claims"]) {
    if (!notProven.includes(phrase)) {
      issues.push(`${currentPath} approvalSemantics.publicRecordDoesNotProve must include ${phrase}`);
    }
  }
}

function readPackagePinnedPromotionEvidence(root, filePath, issues) {
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) {
    issues.push(`${filePath} is required for package-pinned promotion evidence hash sync`);
    return [];
  }
  const text = fs.readFileSync(absolutePath, "utf8");
  const declaration = text.match(/PACKAGE_PINNED_V12_PROMOTION_EVIDENCE[\s\S]*?=\s*\[([\s\S]*?)\]\s*;/);
  if (!declaration) {
    issues.push(`${filePath} must define PACKAGE_PINNED_V12_PROMOTION_EVIDENCE`);
    return [];
  }

  const entries = [];
  for (const block of declaration[1].matchAll(/\{([\s\S]*?)\}/g)) {
    const pathMatch = block[1].match(/path:\s*"([^"]+)"/);
    const shaMatch = block[1].match(/sha256:\s*"([^"]+)"/);
    if (!pathMatch || !shaMatch) {
      issues.push(`${filePath} PACKAGE_PINNED_V12_PROMOTION_EVIDENCE entries must include path and sha256`);
      continue;
    }
    entries.push({ path: pathMatch[1], sha256: shaMatch[1] });
  }
  if (entries.length === 0) {
    issues.push(`${filePath} PACKAGE_PINNED_V12_PROMOTION_EVIDENCE must include at least one entry`);
  }
  return entries;
}

function validateArtifactRef(root, issues, label, filePath, expectedHash) {
  if (!filePath) {
    issues.push(`${label} is missing`);
    return;
  }
  if (!expectedHash) {
    issues.push(`${label} is missing sha256`);
    return;
  }
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) {
    issues.push(`${label} points to missing artifact: ${filePath}`);
    return;
  }

  const actualHash = sha256File(absolutePath);
  const normalizedExpectedHash = normalizeSha256(expectedHash);
  if (actualHash !== normalizedExpectedHash) {
    issues.push(`${label} hash mismatch for ${filePath}: expected ${normalizedExpectedHash}, got ${actualHash}`);
  }
}

function readJson(root, filePath, issues) {
  const absolutePath = path.join(root, filePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    issues.push(`${filePath} must be valid JSON: ${error.message}`);
    return null;
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeSha256(value) {
  return String(value).replace(/^sha256:/i, "").replace(/^0x/i, "").toLowerCase();
}

function listTrackedFiles(root) {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldSkipPath(filePath) {
  return (
    filePath.includes("node_modules/") ||
    filePath.includes("contracts/lib/") ||
    filePath.endsWith(".lock") ||
    filePath.endsWith(".png") ||
    filePath.endsWith(".jpg") ||
    filePath.endsWith(".wasm") ||
    filePath.endsWith(".zkey")
  );
}

function lineNumberForOffset(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function runCli() {
  if (process.argv.includes("--public-boundary")) {
    const issues = validatePublicReleaseBoundary();
    if (issues.length === 0) {
      console.log("public release boundary validation passed");
      return;
    }

    console.error("public release boundary validation failed:");
    for (const issue of [...new Set(issues)]) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  const findings = validateTrackedSecretHygiene();
  if (findings.length === 0) {
    console.log("tracked secret hygiene scan passed");
    return;
  }

  console.error("tracked secret hygiene scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.label}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
