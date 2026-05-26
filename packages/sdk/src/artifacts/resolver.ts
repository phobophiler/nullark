import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NullarkCurrentRuntime } from "../runtime/current.js";

export type ResolvedProverArtifacts = {
  mode: "https-base-url" | "local-artifact-dir" | "package-embedded";
  manifest: string;
  trustedSetupRecord: string;
  withdrawWasm: string;
  withdrawFinalZkey: string;
};

export type ProverArtifactBindingStatus =
  | { trusted: true; artifactTrustMode?: NonNullable<NullarkCurrentRuntime["artifactTrustMode"]> | "mainnet-trusted-setup" }
  | { trusted: false; reason: string };

type ManifestArtifact = {
  path: string;
  sha256: string;
};

type TrustedSetupRecordSummary = {
  path: string;
  sha256: string;
  chainId: number;
  pool: string;
  verifier: string;
  verifierBytecodeHash: string;
  approvedBy?: string;
  approvedAt?: string;
};

type TrustedProverManifest = {
  schema?: string;
  trustLevel?: string;
  trustedSetupRecord?: TrustedSetupRecordSummary;
  artifacts?: {
    withdrawWasm?: ManifestArtifact;
    withdrawFinalZkey?: ManifestArtifact;
  };
  pool?: string;
  verifier?: string;
  verifierBytecodeHash?: string;
};

type TrustedSetupRecord = {
  schema?: string;
  trustLevel?: string;
  status?: string;
  supersededBy?: unknown;
  approvedBy?: string;
  approvedAt?: string;
  chainId?: number;
  pool?: string;
  verifier?: string;
  verifierBytecodeHash?: string;
  publicInputOrder?: readonly string[];
  wasmSha256?: string;
  zkeySha256?: string;
  artifacts?: {
    withdraw?: {
      wasmHash?: string;
      zkeyHash?: string;
    };
  };
};

export type ResolveProverArtifactsOptions =
  | { mode?: "runtime-default" }
  | { mode: "https-base-url"; baseUrl: string }
  | { mode: "local-artifact-dir"; artifactDir: string }
  | { mode: "package-embedded"; baseUrl: string };

export function resolveProverArtifacts(
  runtime: NullarkCurrentRuntime,
  options: ResolveProverArtifactsOptions = { mode: "runtime-default" }
): ResolvedProverArtifacts {
  const mode = options.mode === "runtime-default" || options.mode === undefined ? runtime.artifactResolution.mode : options.mode;
  const source =
    mode === runtime.artifactResolution.mode && (options.mode === "runtime-default" || options.mode === undefined)
      ? runtime.artifactResolution
      : options;

  if (mode === "https-base-url") {
    const baseUrl = "baseUrl" in source ? source.baseUrl : "";
    return {
      mode,
      manifest: resolveHttpsArtifactUrl(baseUrl, runtime.proverManifest.path),
      trustedSetupRecord: resolveHttpsArtifactUrl(baseUrl, runtime.trustedSetupRecord.path),
      withdrawWasm: resolveHttpsArtifactUrl(baseUrl, runtime.artifacts.withdrawWasm.path),
      withdrawFinalZkey: resolveHttpsArtifactUrl(baseUrl, runtime.artifacts.withdrawFinalZkey.path)
    };
  }

  if (mode === "local-artifact-dir") {
    const artifactDir = "artifactDir" in source ? source.artifactDir : "";
    return {
      mode,
      manifest: resolveLocalArtifactPath(artifactDir, runtime.proverManifest.path),
      trustedSetupRecord: resolveLocalArtifactPath(artifactDir, runtime.trustedSetupRecord.path),
      withdrawWasm: resolveLocalArtifactPath(artifactDir, runtime.artifacts.withdrawWasm.path),
      withdrawFinalZkey: resolveLocalArtifactPath(artifactDir, runtime.artifacts.withdrawFinalZkey.path)
    };
  }

  if (mode === "package-embedded") {
    const baseUrl = "baseUrl" in source ? source.baseUrl : "";
    return {
      mode,
      manifest: resolvePackageArtifactUrl(baseUrl, runtime.proverManifest.path),
      trustedSetupRecord: resolvePackageArtifactUrl(baseUrl, runtime.trustedSetupRecord.path),
      withdrawWasm: resolvePackageArtifactUrl(baseUrl, runtime.artifacts.withdrawWasm.path),
      withdrawFinalZkey: resolvePackageArtifactUrl(baseUrl, runtime.artifacts.withdrawFinalZkey.path)
    };
  }

  throw new Error("Unsupported Nullark artifact resolution mode.");
}

export async function verifyLocalArtifactHashes(
  runtime: NullarkCurrentRuntime,
  artifacts: ResolvedProverArtifacts
): Promise<void> {
  if (artifacts.mode !== "local-artifact-dir") {
    throw new Error("Local artifact hash verification requires local artifact paths.");
  }

  await assertFileSha256(artifacts.manifest, runtime.proverManifest.sha256, "prover manifest");
  await assertFileSha256(artifacts.trustedSetupRecord, runtime.trustedSetupRecord.sha256, "trusted setup record");
  await assertFileSha256(artifacts.withdrawWasm, runtime.artifacts.withdrawWasm.sha256, "withdraw wasm");
  await assertFileSha256(artifacts.withdrawFinalZkey, runtime.artifacts.withdrawFinalZkey.sha256, "withdraw final zkey");
}

export async function verifyLocalProverArtifacts(
  runtime: NullarkCurrentRuntime,
  artifacts: ResolvedProverArtifacts
): Promise<ProverArtifactBindingStatus> {
  try {
    if (runtime.artifactTrustMode === "testnet-local-dev-untrusted") {
      await verifyLocalUntrustedArtifactHashes(runtime, artifacts);
      return { trusted: true, artifactTrustMode: "testnet-local-dev-untrusted" };
    }
    await verifyLocalArtifactHashes(runtime, artifacts);
    const [manifestText, trustedSetupRecordText] = await Promise.all([
      readFile(artifacts.manifest, "utf8"),
      readFile(artifacts.trustedSetupRecord, "utf8")
    ]);
    return verifyProverArtifactBinding({
      runtime,
      manifest: manifestText,
      trustedSetupRecord: trustedSetupRecordText
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { trusted: false, reason: "missing-local-artifact" };
    }
    return { trusted: false, reason: error instanceof Error ? error.message : "artifact-verification-failed" };
  }
}

export async function verifyLocalUntrustedArtifactHashes(
  runtime: NullarkCurrentRuntime,
  artifacts: ResolvedProverArtifacts
): Promise<void> {
  if (artifacts.mode !== "local-artifact-dir") {
    throw new Error("Local artifact hash verification requires local artifact paths.");
  }

  await assertFileSha256(artifacts.manifest, runtime.proverManifest.sha256, "prover manifest");
  await assertFileSha256(artifacts.withdrawWasm, runtime.artifacts.withdrawWasm.sha256, "withdraw wasm");
  await assertFileSha256(artifacts.withdrawFinalZkey, runtime.artifacts.withdrawFinalZkey.sha256, "withdraw final zkey");
}

export function verifyProverArtifactBinding(input: {
  runtime: NullarkCurrentRuntime;
  manifest: string | TrustedProverManifest;
  trustedSetupRecord: string | TrustedSetupRecord;
}): ProverArtifactBindingStatus {
  const manifestText = typeof input.manifest === "string" ? input.manifest : null;
  const trustedSetupRecordText = typeof input.trustedSetupRecord === "string" ? input.trustedSetupRecord : null;
  const manifestParse = parseJsonLike<TrustedProverManifest>(input.manifest, "invalid-prover-manifest");
  if (!manifestParse.ok) {
    return { trusted: false, reason: manifestParse.reason };
  }
  const trustedSetupRecordParse = parseJsonLike<TrustedSetupRecord>(
    input.trustedSetupRecord,
    "invalid-trusted-setup-record"
  );
  if (!trustedSetupRecordParse.ok) {
    return { trusted: false, reason: trustedSetupRecordParse.reason };
  }
  const manifest = manifestParse.value;
  const trustedSetupRecord = trustedSetupRecordParse.value;

  if (manifestText && sha256Hex(manifestText) !== input.runtime.proverManifest.sha256) {
    return { trusted: false, reason: "prover-manifest-hash-mismatch" };
  }
  if (trustedSetupRecordText && sha256Hex(trustedSetupRecordText) !== input.runtime.trustedSetupRecord.sha256) {
    return { trusted: false, reason: "trusted-setup-record-hash-mismatch" };
  }
  if (manifest.trustLevel !== "trusted-setup-recorded") {
    return { trusted: false, reason: "untrusted-prover-artifacts" };
  }
  if (!hasTrustedSetupRecordPointer(manifest.trustedSetupRecord)) {
    return { trusted: false, reason: "missing-trusted-setup-record" };
  }
  if (!hasArtifactHashes(manifest)) {
    return { trusted: false, reason: "missing-artifact-hashes" };
  }
  if (!hasPublicTrustMetadata(manifest.trustedSetupRecord)) {
    return { trusted: false, reason: "missing-public-trust-metadata" };
  }
  if (
    manifest.trustedSetupRecord.path !== input.runtime.trustedSetupRecord.path ||
    parseSha256(manifest.trustedSetupRecord.sha256) !== input.runtime.trustedSetupRecord.sha256 ||
    manifest.trustedSetupRecord.chainId !== input.runtime.chainId ||
    normalizeAddress(manifest.trustedSetupRecord.pool) !== normalizeAddress(input.runtime.pool) ||
    normalizeAddress(manifest.trustedSetupRecord.verifier) !== normalizeAddress(input.runtime.withdrawVerifier) ||
    String(manifest.trustedSetupRecord.verifierBytecodeHash ?? "").toLowerCase() !==
      input.runtime.withdrawVerifierBytecodeHash.toLowerCase()
  ) {
    return { trusted: false, reason: "prover-manifest-deployment-mismatch" };
  }
  if (
    manifest.artifacts.withdrawWasm.path !== input.runtime.artifacts.withdrawWasm.path ||
    manifest.artifacts.withdrawWasm.sha256 !== input.runtime.artifacts.withdrawWasm.sha256 ||
    manifest.artifacts.withdrawFinalZkey.path !== input.runtime.artifacts.withdrawFinalZkey.path ||
    manifest.artifacts.withdrawFinalZkey.sha256 !== input.runtime.artifacts.withdrawFinalZkey.sha256 ||
    normalizeAddress(manifest.pool) !== normalizeAddress(input.runtime.pool) ||
    normalizeAddress(manifest.verifier) !== normalizeAddress(input.runtime.withdrawVerifier) ||
    String(manifest.verifierBytecodeHash ?? "").toLowerCase() !== input.runtime.withdrawVerifierBytecodeHash.toLowerCase()
  ) {
    return { trusted: false, reason: "prover-manifest-runtime-mismatch" };
  }
  if (trustedSetupRecord.supersededBy || String(trustedSetupRecord.status ?? "").toLowerCase().includes("superseded")) {
    return { trusted: false, reason: "superseded-trusted-setup-record" };
  }
  if (
    trustedSetupRecord.schema !== "trusted-setup-verifier-promotion-v1" ||
    trustedSetupRecord.trustLevel !== "trusted-setup-recorded" ||
    trustedSetupRecord.status !== "approved-for-mainnet"
  ) {
    return { trusted: false, reason: "trusted-setup-record-not-approved" };
  }
  if (!hasPublicTrustMetadata(trustedSetupRecord)) {
    return { trusted: false, reason: "missing-public-trust-metadata" };
  }
  if (!publicInputOrderMatches(trustedSetupRecord.publicInputOrder, input.runtime.groth16PublicInputOrder)) {
    return { trusted: false, reason: "trusted-setup-public-input-order-mismatch" };
  }
  if (
    trustedSetupRecord.chainId !== input.runtime.chainId ||
    normalizeAddress(trustedSetupRecord.pool) !== normalizeAddress(input.runtime.pool) ||
    normalizeAddress(trustedSetupRecord.verifier) !== normalizeAddress(input.runtime.withdrawVerifier) ||
    String(trustedSetupRecord.verifierBytecodeHash ?? "").toLowerCase() !==
      input.runtime.withdrawVerifierBytecodeHash.toLowerCase()
  ) {
    return { trusted: false, reason: "trusted-setup-deployment-mismatch" };
  }
  const recordWasmSha256 = parseSha256(trustedSetupRecord.wasmSha256) ?? parseSha256(trustedSetupRecord.artifacts?.withdraw?.wasmHash);
  const recordZkeySha256 = parseSha256(trustedSetupRecord.zkeySha256) ?? parseSha256(trustedSetupRecord.artifacts?.withdraw?.zkeyHash);
  if (
    recordWasmSha256 !== input.runtime.artifacts.withdrawWasm.sha256 ||
    recordZkeySha256 !== input.runtime.artifacts.withdrawFinalZkey.sha256
  ) {
    return { trusted: false, reason: "trusted-setup-artifact-hash-mismatch" };
  }

  return { trusted: true, artifactTrustMode: input.runtime.artifactTrustMode ?? "mainnet-trusted-setup" };
}

function resolveHttpsArtifactUrl(baseUrl: string, artifactPath: string): string {
  const base = assertHttpsBaseUrl(baseUrl);
  const safePath = assertAppRelativeArtifactPath(artifactPath);
  return new URL(safePath.slice(1), ensureTrailingSlash(base)).toString();
}

function resolvePackageArtifactUrl(baseUrl: string, artifactPath: string): string {
  if (!baseUrl) {
    throw new Error("Package-embedded artifact resolution requires an explicit package artifact base URL.");
  }
  return new URL(publicProvingRelativePath(artifactPath), ensureTrailingSlash(baseUrl)).toString();
}

function resolveLocalArtifactPath(artifactDir: string, artifactPath: string): string {
  if (!artifactDir || artifactDir.trim() !== artifactDir) {
    throw new Error("Local artifact resolution requires an explicit artifact directory.");
  }
  return path.join(artifactDir, publicProvingRelativePath(artifactPath));
}

function assertHttpsBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Artifact base URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Artifact base URL must use HTTPS.");
  }
  return parsed.toString();
}

function assertAppRelativeArtifactPath(value: string): string {
  if (!value.startsWith("/proving/") || value.includes("..") || value.includes("\\") || value.includes("docs/evidence")) {
    throw new Error("Artifact path must be a public app-relative proving path.");
  }
  return value;
}

function publicProvingRelativePath(value: string): string {
  return assertAppRelativeArtifactPath(value).slice("/proving/".length);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

async function assertFileSha256(filePath: string, expected: string, label: string): Promise<void> {
  const bytes = await readFile(filePath);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(`Unexpected ${label} sha256.`);
  }
}

function parseJsonLike<T>(value: string | T, invalidReason: string): { ok: true; value: T } | { ok: false; reason: string } {
  if (typeof value !== "string") {
    return { ok: true, value };
  }
  try {
    return { ok: true, value: JSON.parse(value) as T };
  } catch {
    return { ok: false, reason: invalidReason };
  }
}

function hasArtifactHashes(manifest: TrustedProverManifest): manifest is TrustedProverManifest & {
  artifacts: { withdrawWasm: ManifestArtifact; withdrawFinalZkey: ManifestArtifact };
} {
  return [manifest.artifacts?.withdrawWasm, manifest.artifacts?.withdrawFinalZkey].every(
    (artifact) =>
      typeof artifact?.path === "string" &&
      artifact.path.startsWith("/proving/") &&
      typeof artifact.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(artifact.sha256)
  );
}

function hasTrustedSetupRecordPointer(record: unknown): record is TrustedSetupRecordSummary {
  const maybeRecord = record as Partial<TrustedSetupRecordSummary>;
  return (
    typeof maybeRecord?.path === "string" &&
    maybeRecord.path.startsWith("/proving/") &&
    parseSha256(maybeRecord.sha256) !== null &&
    typeof maybeRecord.chainId === "number" &&
    typeof maybeRecord.pool === "string" &&
    typeof maybeRecord.verifier === "string" &&
    typeof maybeRecord.verifierBytecodeHash === "string"
  );
}

function hasPublicTrustMetadata(record: unknown): boolean {
  const maybeRecord = record as { approvedBy?: unknown; approvedAt?: unknown };
  return (
    typeof maybeRecord.approvedBy === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(maybeRecord.approvedBy) &&
    typeof maybeRecord.approvedAt === "string" &&
    !Number.isNaN(Date.parse(maybeRecord.approvedAt))
  );
}

function publicInputOrderMatches(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function normalizeAddress(value: unknown): string {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value)) ? String(value).toLowerCase() : "";
}

function parseSha256(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
