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

  if (scripts["mainnet:readiness:validate"] || scripts["mainnet:readiness:v1-2:validate"]) {
    issues.push("public package.json must not expose private mainnet readiness validators");
  }

  validateCurrentPublicRuntime(root, issues);
  validatePublicProvingArtifacts(root, issues);
  validatePublicRuntimeMetadata(root, issues);

  return issues;
}

function validateCurrentPublicRuntime(root, issues) {
  const currentPath = "public-artifacts/current.json";
  if (!fs.existsSync(path.join(root, currentPath))) return;
  const current = readJson(root, currentPath, issues);
  if (!current) return;

  if (current.chainId !== 4326) {
    issues.push(`${currentPath} must remain bound to MegaETH mainnet chain ID 4326`);
  }
  if (current.mainnetValueMovingApproved !== true) {
    issues.push(`${currentPath} must reflect current truth: mainnetValueMovingApproved=true`);
  }
  if (current.guardedUsersApproved !== true) {
    issues.push(`${currentPath} must reflect current truth: guardedUsersApproved=true`);
  }
  if (current.privacyClaimsApproved !== false) {
    issues.push(`${currentPath} must keep production privacy claims disabled until separately approved`);
  }
  if (current.remainingBlockers && current.remainingBlockers.length !== 0) {
    issues.push(`${currentPath} must not publish stale release blockers for the current public runtime`);
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
    if (trustedSetup.mainnetOperatorDecisions?.mainnetValueMovingApproved !== true) {
      issues.push(`${trustedSetupPath} must approve mainnet value movement for the current public release`);
    }
    if (trustedSetup.mainnetOperatorDecisions?.guardedUsersApproved !== true) {
      issues.push(`${trustedSetupPath} must approve guarded users for the current public release`);
    }
    if (trustedSetup.mainnetOperatorDecisions?.productionPrivacyClaimsApproved !== false) {
      issues.push(`${trustedSetupPath} must keep production privacy claims disabled until separately approved`);
    }

    const withdraw = trustedSetup.artifacts?.withdraw ?? {};
    validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.withdraw.r1csArtifactRef`, withdraw.r1csArtifactRef, withdraw.r1csHash);
    validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.withdraw.wasmArtifactRef`, withdraw.wasmArtifactRef, withdraw.wasmHash);
    validateArtifactRef(root, issues, `${trustedSetupPath}:artifacts.withdraw.zkeyArtifactRef`, withdraw.zkeyArtifactRef, withdraw.zkeyHash);
    validateArtifactRef(
      root,
      issues,
      `${trustedSetupPath}:artifacts.withdraw.verificationKeyArtifactRef`,
      withdraw.verificationKeyArtifactRef,
      withdraw.verificationKeyHash
    );
  }
}

function validatePublicRuntimeMetadata(root, issues) {
  const publicMetadataFiles = [
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
