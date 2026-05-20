#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const DEFAULT_EXCLUDED_PATHS = new Set(["scripts/validate/no-secrets.mjs"]);

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
  const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function shouldSkipPath(filePath) {
  return (
    DEFAULT_EXCLUDED_PATHS.has(filePath) ||
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

if (process.argv[1] === import.meta.filename) {
  const findings = validateTrackedSecretHygiene();
  if (findings.length === 0) {
    console.log("tracked secret hygiene scan passed");
    process.exit(0);
  }

  console.error("tracked secret hygiene scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.label}`);
  }
  process.exit(1);
}
