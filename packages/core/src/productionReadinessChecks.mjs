#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const PUBLIC_RUNTIME_PATH = "public-artifacts/current.json";
const PRIVATE_EVIDENCE_PREFIX = "evidence/mainnet-readiness/v1-2";
const AGGREGATE_READINESS_PATH = `${PRIVATE_EVIDENCE_PREFIX}/aggregate-readiness.approved.json`;
const LAUNCH_APPROVAL_PATH = `${PRIVATE_EVIDENCE_PREFIX}/launch-approval.approved.json`;
const REQUIRED_PRIVATE_LANES = [
  "public-runtime-current-state",
  "deployment-package",
  "source-verification-package",
  "trusted-setup-prover-promotion",
  "custody-record",
  "fee-governance-gas-log-storage",
  "relayer-runtime-policy",
  "frontend-prover-indexer-recovery",
  "negative-vectors",
  "formal-security-core",
  "incident-control",
  "launch-approval"
];

export function validatePrivateProductionEvidence(options = {}) {
  const publicRoot = options.publicRoot ?? repoRoot;
  const privateRoot = options.privateRoot ?? process.env.NULLARK_PRIVATE_ROOT;
  const issues = [];

  if (!privateRoot) {
    return ["set NULLARK_PRIVATE_ROOT to the private Nullark evidence checkout before running production readiness"];
  }
  if (!fs.existsSync(privateRoot)) {
    return [
      "missing private production evidence root",
      "set NULLARK_PRIVATE_ROOT to the private Nullark evidence checkout before running production readiness"
    ];
  }

  const publicRuntime = readJson(path.join(publicRoot, PUBLIC_RUNTIME_PATH), `${PUBLIC_RUNTIME_PATH} public runtime`, issues);
  const aggregate = readJson(path.join(privateRoot, AGGREGATE_READINESS_PATH), AGGREGATE_READINESS_PATH, issues);
  const launch = readJson(path.join(privateRoot, LAUNCH_APPROVAL_PATH), LAUNCH_APPROVAL_PATH, issues);
  if (!publicRuntime || !aggregate || !launch) {
    return issues;
  }

  validateCommonPrivateRecord(aggregate, "aggregate readiness", "nullark-v1-2-aggregate-readiness-v1", issues);
  validateCommonPrivateRecord(launch, "launch approval", "nullark-v1-2-launch-approval-v1", issues);
  validateAggregateReadiness(privateRoot, aggregate, issues);
  validateLaunchApproval(publicRuntime, launch, issues);
  validatePublicRuntimeClaims(publicRuntime, launch, issues);

  return issues;
}

function validateCommonPrivateRecord(record, label, expectedSchema, issues) {
  if (record.schema !== expectedSchema) {
    issues.push(`${label} schema must be ${expectedSchema}`);
  }
  if (record.productVersion !== "nullark-v1.2-fee-governance") {
    issues.push(`${label} productVersion must be nullark-v1.2-fee-governance`);
  }
  if (record.chainId !== 4326 || record.environment !== "megaeth-mainnet" || record.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
    issues.push(`${label} must target MegaETH mainnet chain 4326 and https://mainnet.megaeth.com/rpc`);
  }
  if (record.status !== "approved-for-mainnet") {
    issues.push(`${label} status must be approved-for-mainnet`);
  }
  if (record.mainnet4326Blocked !== false) {
    issues.push(`${label} mainnet4326Blocked must be false`);
  }
  if (!Array.isArray(record.blockedUntil) || record.blockedUntil.length !== 0) {
    issues.push(`${label} blockedUntil must be empty`);
  }
  if (Array.isArray(record.exactBlockers) && record.exactBlockers.length > 0) {
    issues.push(`${label} exactBlockers must be empty for production readiness`);
  }
}

function validateAggregateReadiness(privateRoot, aggregate, issues) {
  const laneRefs = Array.isArray(aggregate.laneRefs) ? aggregate.laneRefs : [];
  const laneNames = new Set(laneRefs.map((entry) => entry?.lane).filter(Boolean));
  for (const lane of REQUIRED_PRIVATE_LANES) {
    if (!laneNames.has(lane)) {
      issues.push(`aggregate readiness is missing private lane: ${lane}`);
    }
  }
  for (const entry of laneRefs) {
    validatePrivateRef(privateRoot, entry, `aggregate readiness lane ${entry?.lane ?? "unknown"}`, issues);
    if (entry?.status !== "approved-for-mainnet") {
      issues.push(`aggregate readiness lane ${entry?.lane ?? "unknown"} status must be approved-for-mainnet`);
    }
  }
  for (const entry of aggregate.evidenceRefs ?? []) {
    validatePrivateRef(privateRoot, entry, `aggregate readiness evidence ${entry?.label ?? "unknown"}`, issues);
  }
}

function validateLaunchApproval(publicRuntime, launch, issues) {
  if (launch.finalOwnerApprovalRef === "private-owner-approval-record-not-in-public-repo" || !isSha256(launch.finalOwnerApprovalSha256)) {
    issues.push("launch approval requires a concrete final owner approval ref and sha256");
  }
  const runtime = launch.v1_2Runtime ?? {};
  const expectedRuntime = {
    productVersion: publicRuntime.productVersion,
    runtimeId: publicRuntime.runtimeId,
    chainId: publicRuntime.chainId,
    pool: publicRuntime.pool
  };
  for (const [field, expected] of Object.entries(expectedRuntime)) {
    if (runtime[field] !== expected) {
      issues.push(`launch approval v1_2Runtime.${field} must match ${PUBLIC_RUNTIME_PATH}`);
    }
  }

  const requiredTrueFields = [
    "approvesDeployment",
    "approvesSigning",
    "approvesFunding",
    "approvesRelayerEnablement",
    "approvesGuardedUsers"
  ];
  for (const field of requiredTrueFields) {
    if (launch[field] !== true) {
      issues.push(`launch approval ${field} must be true for production readiness`);
    }
  }
  if (launch.approvesPrivacyClaims !== false) {
    issues.push("launch approval must keep production privacy claims separately disabled");
  }
  if (launch.fundingLimits?.approvesFunding !== true || launch.fundingLimits?.status !== "approved") {
    issues.push("launch approval fundingLimits must approve bounded production funding");
  }
  if (
    launch.signingLimits?.approvesSigning !== true ||
    launch.signingLimits?.approvesBroadcast !== true ||
    launch.signingLimits?.status !== "approved"
  ) {
    issues.push("launch approval signingLimits must approve bounded signing and broadcast");
  }
  if (launch.guardedUserPolicy?.guardedUsersApproved !== true || launch.guardedUserPolicy?.status !== "approved") {
    issues.push("launch approval guardedUserPolicy must approve guarded users");
  }
  if (launch.privacyCopyStatus?.productionPrivacyClaimsApproved !== false) {
    issues.push("launch approval privacyCopyStatus must leave production privacy claims disabled");
  }
}

function validatePublicRuntimeClaims(publicRuntime, launch, issues) {
  const claimMap = [
    ["productionRelayerApproved", "approvesRelayerEnablement"],
    ["mainnetValueMovingApproved", "approvesSigning"],
    ["automatedValueMovementApprovedByThisRecord", "approvesSigning"],
    ["guardedUsersApproved", "approvesGuardedUsers"]
  ];
  for (const [publicField, launchField] of claimMap) {
    if (publicRuntime[publicField] === true && launch[launchField] !== true) {
      issues.push(`${PUBLIC_RUNTIME_PATH} ${publicField}=true requires private launch approval ${launchField}=true`);
    }
  }
  if (publicRuntime.privacyClaimsApproved === true) {
    issues.push(`${PUBLIC_RUNTIME_PATH} privacyClaimsApproved=true is not allowed by current production readiness policy`);
  }
}

function validatePrivateRef(privateRoot, entry, label, issues) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    issues.push(`${label} must be an object`);
    return;
  }
  if (typeof entry.path !== "string" || entry.path.length === 0 || path.isAbsolute(entry.path) || entry.path.includes("..")) {
    issues.push(`${label} must use a repo-relative path without traversal`);
    return;
  }
  if (!isSha256(entry.sha256)) {
    issues.push(`${label} must include lowercase sha256`);
    return;
  }
  const filePath = path.join(privateRoot, entry.path);
  if (!fs.existsSync(filePath)) {
    issues.push(`${label} points to missing private evidence: ${entry.path}`);
    return;
  }
  const actual = sha256File(filePath);
  if (actual !== normalizeSha256(entry.sha256)) {
    issues.push(`${label} sha256 mismatch for ${entry.path}: expected ${normalizeSha256(entry.sha256)}, got ${actual}`);
  }
}

function readJson(filePath, label, issues) {
  if (!fs.existsSync(filePath)) {
    issues.push(`missing ${label}: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issues.push(`${label} must be valid JSON: ${error.message}`);
    return null;
  }
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/.test(normalizeSha256(value));
}

function normalizeSha256(value) {
  return String(value ?? "").replace(/^sha256:/i, "").replace(/^0x/i, "").toLowerCase();
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runCli() {
  if (!process.argv.includes("--private-evidence")) {
    console.error("usage: node packages/core/src/productionReadinessChecks.mjs --private-evidence");
    process.exit(1);
  }
  const issues = validatePrivateProductionEvidence();
  if (issues.length === 0) {
    console.log("private production evidence validation passed");
    return;
  }
  console.error("private production evidence validation failed:");
  for (const issue of [...new Set(issues)]) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
