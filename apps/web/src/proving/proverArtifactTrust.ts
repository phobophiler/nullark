import { V12_SPEND_PUBLIC_INPUT_ORDER } from "@nullark/core";
import type { WithdrawProofPublicInputSchema } from "./browserWithdrawProver.js";

export type ProductProverDeployment = {
  chainId: 6343 | 4326;
  pool: `0x${string}`;
  verifier: `0x${string}`;
  verifierBytecodeHash: `0x${string}`;
};

export type ProductProverTrustStatus =
  | { trusted: true }
  | { trusted: false; reason: string };

export type TrustedProverManifest = {
  artifacts: {
    withdrawWasm: ManifestArtifact;
    withdrawFinalZkey: ManifestArtifact;
  };
};

export type TrustedProverManifestStatus =
  | { trusted: true; manifest: TrustedProverManifest }
  | { trusted: false; reason: string };

const NULLARK_V1_1_PUBLIC_INPUT_ORDER = [
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
] as const;

export async function loadProductProverTrustStatus(input: {
  manifestUrl?: string;
  deployment: ProductProverDeployment;
  publicInputSchema?: WithdrawProofPublicInputSchema;
  fetchImpl?: typeof fetch;
}): Promise<ProductProverTrustStatus> {
  const trustedManifestStatus = await loadTrustedProverManifest(input);
  if (!trustedManifestStatus.trusted) {
    return trustedManifestStatus;
  }

  return verifyFetchedArtifactHashes(trustedManifestStatus.manifest, resolveFetchImpl(input.fetchImpl));
}

export async function loadTrustedProverManifest(input: {
  manifestUrl?: string;
  deployment: ProductProverDeployment;
  publicInputSchema?: WithdrawProofPublicInputSchema;
  fetchImpl?: typeof fetch;
}): Promise<TrustedProverManifestStatus> {
  const fetchImpl = resolveFetchImpl(input.fetchImpl);
  const response = await fetchImpl(input.manifestUrl ?? "/proving/withdraw-artifacts.manifest.json", { cache: "no-store" });
  if (!response.ok) {
    return { trusted: false, reason: "missing-prover-manifest" };
  }

  const manifest = await response.json();
  if (manifest.trustLevel !== "trusted-setup-recorded") {
    return { trusted: false, reason: "untrusted-prover-artifacts" };
  }

  const recordSummary = manifest.trustedSetupRecord;
  if (!hasTrustedSetupRecordPointer(recordSummary)) {
    return { trusted: false, reason: "missing-trusted-setup-record" };
  }

  if (!hasArtifactHashes(manifest)) {
    return { trusted: false, reason: "missing-artifact-hashes" };
  }

  if (!hasPublicTrustMetadata(recordSummary)) {
    return { trusted: false, reason: "missing-public-trust-metadata" };
  }

  const trustedSetupStatus = await verifyTrustedSetupRecord({
    recordSummary,
    manifest,
    deployment: input.deployment,
    publicInputSchema: input.publicInputSchema ?? "v1.1",
    fetchImpl
  });
  if (!trustedSetupStatus.trusted) {
    return trustedSetupStatus;
  }

  return { trusted: true, manifest };
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }
  return ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch;
}

function hasArtifactHashes(manifest: unknown): manifest is { artifacts: { withdrawWasm: ManifestArtifact; withdrawFinalZkey: ManifestArtifact } } {
  const maybeManifest = manifest as { artifacts?: { withdrawWasm?: unknown; withdrawFinalZkey?: unknown } };
  return [maybeManifest.artifacts?.withdrawWasm, maybeManifest.artifacts?.withdrawFinalZkey].every(
    (artifact) =>
      typeof artifact === "object" &&
      artifact !== null &&
      typeof (artifact as Record<string, unknown>).path === "string" &&
      typeof (artifact as Record<string, unknown>).sha256 === "string" &&
      /^[0-9a-f]{64}$/.test((artifact as Record<string, unknown>).sha256 as string)
  );
}

function hasTrustedSetupRecordPointer(record: unknown): record is TrustedSetupRecordSummary {
  const maybeRecord = record as {
    path?: unknown;
    sha256?: unknown;
  };
  return (
    typeof maybeRecord?.path === "string" &&
    maybeRecord.path.length > 0 &&
    parseSha256(maybeRecord.sha256) !== null
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

async function verifyTrustedSetupRecord(input: {
  recordSummary: TrustedSetupRecordSummary;
  manifest: {
    artifacts: {
      withdrawWasm: ManifestArtifact;
      withdrawFinalZkey: ManifestArtifact;
    };
  };
  deployment: ProductProverDeployment;
  publicInputSchema: WithdrawProofPublicInputSchema;
  fetchImpl: typeof fetch;
}): Promise<ProductProverTrustStatus> {
  const response = await input.fetchImpl(input.recordSummary.path, { cache: "no-store" });
  if (!response.ok) {
    return { trusted: false, reason: "missing-trusted-setup-record" };
  }

  const recordText = await response.text();
  const actualRecordSha256 = await sha256Hex(new TextEncoder().encode(recordText));
  if (actualRecordSha256 !== parseSha256(input.recordSummary.sha256)) {
    return { trusted: false, reason: "trusted-setup-record-hash-mismatch" };
  }

  let record: TrustedSetupRecord;
  try {
    record = JSON.parse(recordText) as TrustedSetupRecord;
  } catch {
    return { trusted: false, reason: "invalid-trusted-setup-record" };
  }

  if (record.supersededBy || String(record.status ?? "").toLowerCase().includes("superseded")) {
    return { trusted: false, reason: "superseded-trusted-setup-record" };
  }

  if (record.schema !== "trusted-setup-verifier-promotion-v1" || record.trustLevel !== "trusted-setup-recorded") {
    return { trusted: false, reason: "trusted-setup-record-not-approved" };
  }

  if (record.status !== "approved-for-mainnet") {
    return { trusted: false, reason: "trusted-setup-record-not-approved" };
  }

  if (!hasPublicTrustMetadata(record)) {
    return { trusted: false, reason: "missing-public-trust-metadata" };
  }

  if (!publicInputOrderMatches(record.publicInputOrder, input.publicInputSchema)) {
    return { trusted: false, reason: "trusted-setup-public-input-order-mismatch" };
  }

  if (
    record.chainId !== input.deployment.chainId ||
    normalizeAddress(record.pool) !== normalizeAddress(input.deployment.pool) ||
    normalizeAddress(record.verifier) !== normalizeAddress(input.deployment.verifier) ||
    String(record.verifierBytecodeHash ?? "").toLowerCase() !== input.deployment.verifierBytecodeHash.toLowerCase()
  ) {
    return { trusted: false, reason: "prover-manifest-deployment-mismatch" };
  }

  const recordWasmSha256 = parseSha256(record.wasmSha256) ?? parseSha256(record.artifacts?.withdraw?.wasmHash);
  const recordZkeySha256 = parseSha256(record.zkeySha256) ?? parseSha256(record.artifacts?.withdraw?.zkeyHash);
  if (
    recordWasmSha256 !== input.manifest.artifacts.withdrawWasm.sha256 ||
    recordZkeySha256 !== input.manifest.artifacts.withdrawFinalZkey.sha256
  ) {
    return { trusted: false, reason: "trusted-setup-artifact-hash-mismatch" };
  }

  return { trusted: true };
}

async function verifyFetchedArtifactHashes(
  manifest: {
    artifacts: {
      withdrawWasm: ManifestArtifact;
      withdrawFinalZkey: ManifestArtifact;
    };
  },
  fetchImpl: typeof fetch
): Promise<ProductProverTrustStatus> {
  for (const [label, artifact] of [
    ["withdraw wasm", manifest.artifacts.withdrawWasm],
    ["withdraw zkey", manifest.artifacts.withdrawFinalZkey]
  ] as const) {
    const response = await fetchImpl(artifact.path, { cache: "no-store" });
    if (!response.ok) {
      return { trusted: false, reason: `missing-${label.replace(" ", "-")}` };
    }
    const actualSha256 = await sha256Hex(await response.arrayBuffer());
    if (actualSha256 !== artifact.sha256) {
      return { trusted: false, reason: `hash-mismatch-${label.replace(" ", "-")}` };
    }
  }

  return { trusted: true };
}

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeAddress(address: unknown): string {
  return /^0x[0-9a-fA-F]{40}$/.test(String(address)) ? String(address).toLowerCase() : "";
}

function parseSha256(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function publicInputOrderMatches(value: unknown, publicInputSchema: WithdrawProofPublicInputSchema): boolean {
  const expected =
    publicInputSchema === "v1.2-unlinkable"
      ? V12_SPEND_PUBLIC_INPUT_ORDER
      : NULLARK_V1_1_PUBLIC_INPUT_ORDER;
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

type ManifestArtifact = {
  path: string;
  sha256: string;
};

type TrustedSetupRecordSummary = {
  path: string;
  sha256: string;
  approvedBy?: unknown;
  approvedAt?: unknown;
};

type TrustedSetupRecord = {
  schema?: unknown;
  trustLevel?: unknown;
  status?: unknown;
  supersededBy?: unknown;
  chainId?: unknown;
  pool?: unknown;
  verifier?: unknown;
  verifierBytecodeHash?: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
  publicInputOrder?: unknown;
  wasmSha256?: unknown;
  zkeySha256?: unknown;
  artifacts?: {
    withdraw?: {
      wasmHash?: unknown;
      zkeyHash?: unknown;
    };
  };
};
