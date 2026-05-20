#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const current = JSON.parse(fs.readFileSync(path.join(repoRoot, "public-artifacts/current.json"), "utf8"));
const paths = current.paths ?? {};
const artifacts = current.artifacts ?? {};

const checks = [
  ["browserProverManifest", paths.browserProverManifest, artifacts.proverManifestSha256],
  ["trustedSetupRecord", paths.trustedSetupRecord, artifacts.trustedSetupRecordSha256],
  ["withdrawWasm", paths.withdrawWasm, artifacts.withdrawWasmSha256],
  ["withdrawFinalZkey", paths.withdrawFinalZkey, artifacts.withdrawFinalZkeySha256]
];

const blockers = [];
for (const [label, relPath, expected] of checks) {
  if (typeof relPath !== "string" || typeof expected !== "string") {
    blockers.push(`${label} is missing path or sha256`);
    continue;
  }
  const absolute = path.join(repoRoot, relPath);
  if (!absolute.startsWith(repoRoot + path.sep)) {
    blockers.push(`${label} path escapes repository root`);
    continue;
  }
  if (!fs.existsSync(absolute)) {
    blockers.push(`${label} file is missing: ${relPath}`);
    continue;
  }
  const actual = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  if (actual !== expected) {
    blockers.push(`${label} sha256 mismatch: expected ${expected}, got ${actual}`);
  }
}

if (blockers.length > 0) {
  console.error(`public artifact validation failed:\n- ${blockers.join("\n- ")}`);
  process.exit(1);
}

console.log("public artifact validation passed");
