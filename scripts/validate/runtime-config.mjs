#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const currentPath = path.join(repoRoot, "public-artifacts/current.json");
const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));

const required = {
  schema: "nullark-public-runtime-current-v1",
  network: "megaeth-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  withdrawSelector: "0x678d8506",
  productionRelayerApproved: true,
  liveSmokeEvidenceApproved: true,
  mainnetValueMovingApproved: true,
  guardedUsersApproved: false,
  privacyClaimsApproved: false
};

const blockers = [];
for (const [key, expected] of Object.entries(required)) {
  if (current[key] !== expected) {
    blockers.push(`${key} expected ${JSON.stringify(expected)} got ${JSON.stringify(current[key])}`);
  }
}

for (const key of ["pool", "privateTransferVerifier", "withdrawVerifier", "verifierAdapter"]) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(current[key] ?? ""))) {
    blockers.push(`${key} must be an EVM address`);
  }
}

for (const [key, value] of Object.entries(current.artifacts ?? {})) {
  if (!/^[0-9a-f]{64}$/.test(String(value))) {
    blockers.push(`artifacts.${key} must be a lowercase sha256 hex string`);
  }
}

if (!Array.isArray(current.groth16PublicInputOrder) || current.groth16PublicInputOrder.length !== 12) {
  blockers.push("groth16PublicInputOrder must contain 12 entries");
}

const serialized = JSON.stringify(current);
for (const forbidden of ["docs/evidence", "ownerApproval", "approvedBy", "privateKey", "seed phrase"]) {
  if (serialized.includes(forbidden)) {
    blockers.push(`public runtime must not expose ${forbidden}`);
  }
}

if (blockers.length > 0) {
  console.error(`public runtime config validation failed:\n- ${blockers.join("\n- ")}`);
  process.exit(1);
}

console.log("public runtime config validation passed");
