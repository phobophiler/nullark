import { describe, expect, it, vi } from "vitest";
import { V12_SPEND_PUBLIC_INPUT_ORDER } from "@nullark/core";
import { loadProductProverTrustStatus } from "./proverArtifactTrust.js";

const deployment = {
  chainId: 6343 as const,
  pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const,
  verifier: "0x1111111111111111111111111111111111111111" as const,
  verifierBytecodeHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as const
};

const mainnetDeployment = {
  ...deployment,
  chainId: 4326 as const,
  pool: "0x4444444444444444444444444444444444444444" as const,
  verifier: "0x5555555555555555555555555555555555555555" as const,
  verifierBytecodeHash: "0x6666666666666666666666666666666666666666666666666666666666666666" as const
};

const nullarkV1_1PublicInputOrder = [
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

describe("product prover artifact trust status", () => {
  it("rejects missing manifests", async () => {
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: vi.fn(async () => new Response("missing", { status: 404 })) as unknown as typeof fetch
    });
    expect(status).toEqual({ trusted: false, reason: "missing-prover-manifest" });
  });

  it("rejects local-untrusted manifests even when artifact hashes match", async () => {
    const wasmSha256 = await sha256Text("wasm-bytes");
    const zkeySha256 = await sha256Text("zkey-bytes");
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes({
        "/proving/withdraw-artifacts.manifest.json": jsonResponse({
          trustLevel: "blocked-local-untrusted",
          artifacts: {
            withdrawWasm: { path: "/proving/withdraw.wasm", sha256: wasmSha256 },
            withdrawFinalZkey: { path: "/proving/withdraw_final.zkey", sha256: zkeySha256 }
          }
        }),
        "/proving/withdraw.wasm": bytesResponse("wasm-bytes"),
        "/proving/withdraw_final.zkey": bytesResponse("zkey-bytes")
      })
    });
    expect(status).toEqual({ trusted: false, reason: "untrusted-prover-artifacts" });
  });

  it("rejects manifests for the wrong pool", async () => {
    const bundle = await trustedManifest({ pool: "0x9999999999999999999999999999999999999999" });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "prover-manifest-deployment-mismatch" });
  });

  it("returns untrusted instead of throwing when the trusted setup record has malformed addresses", async () => {
    const bundle = await trustedManifest({ pool: "not-an-address", verifier: "also-not-an-address" });
    await expect(
      loadProductProverTrustStatus({
        deployment,
        fetchImpl: mockRoutes(bundle.routes)
      })
    ).resolves.toEqual({ trusted: false, reason: "prover-manifest-deployment-mismatch" });
  });

  it("rejects manifests whose trusted setup record hash drifted", async () => {
    const bundle = await trustedManifest({ recordSha256: "0".repeat(64) });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "trusted-setup-record-hash-mismatch" });
  });

  it("rejects manifests whose trusted setup record was superseded", async () => {
    const bundle = await trustedManifest({
      status: "historical-superseded-not-v1.1-mainnet-blocked",
      supersededBy: "public-artifacts/current.json"
    });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "superseded-trusted-setup-record" });
  });

  it("rejects manifests whose trusted setup record has the wrong status", async () => {
    const bundle = await trustedManifest({ status: "draft-review-required" });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "trusted-setup-record-not-approved" });
  });

  it("rejects manifests whose trusted setup record is for the wrong chain", async () => {
    const bundle = await trustedManifest({ chainId: 4326 });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "prover-manifest-deployment-mismatch" });
  });

  it("rejects manifests whose trusted setup record is not exact Nullark v1.1 12-input order", async () => {
    const bundle = await trustedManifest({
      publicInputOrder: nullarkV1_1PublicInputOrder.slice(0, 10)
    });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "trusted-setup-public-input-order-mismatch" });
  });

  it("accepts explicit v1.2 unlinkable manifests only with the 10-input public order", async () => {
    const bundle = await trustedManifest({
      publicInputOrder: V12_SPEND_PUBLIC_INPUT_ORDER
    });
    const status = await loadProductProverTrustStatus({
      deployment,
      publicInputSchema: "v1.2-unlinkable",
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: true });
  });

  it("rejects old 12-input v1.2 artifact provenance that exposes spentCommitment and noteAmount", async () => {
    const bundle = await trustedManifest();
    const status = await loadProductProverTrustStatus({
      deployment,
      publicInputSchema: "v1.2-unlinkable",
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "trusted-setup-public-input-order-mismatch" });
  });

  it("rejects manifests whose trusted setup record artifact hashes drift from the browser artifacts", async () => {
    const bundle = await trustedManifest({ recordWasmSha256: "0".repeat(64) });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "trusted-setup-artifact-hash-mismatch" });
  });

  it("rejects manifests whose fetched artifact bytes do not match the declared hashes", async () => {
    const bundle = await trustedManifest();
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes({
        ...bundle.routes,
        "/proving/withdraw.wasm": bytesResponse("tampered-wasm")
      })
    });
    expect(status).toEqual({ trusted: false, reason: "hash-mismatch-withdraw-wasm" });
  });

  it("rejects trusted manifests without public trust metadata", async () => {
    const bundle = await trustedManifest({ approvedBy: undefined, approvedAt: undefined });
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: false, reason: "missing-public-trust-metadata" });
  });

  it("accepts trusted manifests for the exact deployment", async () => {
    const bundle = await trustedManifest();
    const status = await loadProductProverTrustStatus({
      deployment,
      fetchImpl: mockRoutes(bundle.routes)
    });
    expect(status).toEqual({ trusted: true });
  });

  it("accepts trusted manifests bound to MegaETH mainnet 4326", async () => {
    const bundle = await trustedManifest({
      chainId: 4326,
      pool: mainnetDeployment.pool,
      verifier: mainnetDeployment.verifier,
      verifierBytecodeHash: mainnetDeployment.verifierBytecodeHash,
      wasmBytes: "mainnet-wasm-bytes",
      zkeyBytes: "mainnet-zkey-bytes"
    });
    const status = await loadProductProverTrustStatus({
      deployment: mainnetDeployment,
      fetchImpl: mockRoutes(bundle.routes)
    });

    expect(status).toEqual({ trusted: true });
  });
});

function mockRoutes(routes: Record<string, Response>): typeof fetch {
  return vi.fn(async (url) => {
    const response = routes[String(url)];
    return response?.clone() ?? new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function bytesResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function trustedManifest(
  overrides: Partial<{
    chainId: 6343 | 4326;
    pool: string;
    verifier: string;
    verifierBytecodeHash: string;
    wasmBytes: string;
    zkeyBytes: string;
    recordPath: string;
    recordSha256: string;
    recordWasmSha256: string;
    recordZkeySha256: string;
    status: string;
    trustLevel: string;
    supersededBy: string;
    publicInputOrder: readonly string[];
    approvedBy: string | undefined;
    approvedAt: string | undefined;
  }> = {}
) {
  const wasmBytes = overrides.wasmBytes ?? "wasm-bytes";
  const zkeyBytes = overrides.zkeyBytes ?? "zkey-bytes";
  const wasmSha256 = await sha256Text(wasmBytes);
  const zkeySha256 = await sha256Text(zkeyBytes);
  const recordPath = overrides.recordPath ?? "/proving/trusted-setup-record.json";
  const record = {
    schema: "trusted-setup-verifier-promotion-v1",
    trustLevel: overrides.trustLevel ?? "trusted-setup-recorded",
    status: overrides.status ?? "approved-for-mainnet",
    ...(Object.hasOwn(overrides, "supersededBy") ? { supersededBy: overrides.supersededBy } : {}),
    chainId: overrides.chainId ?? 6343,
    pool: overrides.pool ?? deployment.pool,
    verifier: overrides.verifier ?? deployment.verifier,
    verifierBytecodeHash: overrides.verifierBytecodeHash ?? deployment.verifierBytecodeHash,
    approvedBy: Object.hasOwn(overrides, "approvedBy")
      ? overrides.approvedBy
      : "0x3333333333333333333333333333333333333333",
    approvedAt: Object.hasOwn(overrides, "approvedAt") ? overrides.approvedAt : "2026-05-02T00:00:00.000Z",
    publicInputOrder: overrides.publicInputOrder ?? [...nullarkV1_1PublicInputOrder],
    wasmSha256: overrides.recordWasmSha256 ?? wasmSha256,
    zkeySha256: overrides.recordZkeySha256 ?? zkeySha256
  };
  const recordBody = JSON.stringify(record);
  const recordSha256 = overrides.recordSha256 ?? (await sha256Text(recordBody));
  const manifest = {
    trustLevel: "trusted-setup-recorded",
    trustedSetupRecord: {
      path: recordPath,
      sha256: recordSha256,
      chainId: record.chainId,
      pool: record.pool,
      verifier: record.verifier,
      verifierBytecodeHash: record.verifierBytecodeHash,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt
    },
    artifacts: {
      withdrawWasm: {
        path: "/proving/withdraw.wasm",
        sha256: wasmSha256
      },
      withdrawFinalZkey: {
        path: "/proving/withdraw_final.zkey",
        sha256: zkeySha256
      }
    }
  };

  return {
    routes: {
      "/proving/withdraw-artifacts.manifest.json": jsonResponse(manifest),
      [recordPath]: new Response(recordBody, { status: 200 }),
      "/proving/withdraw.wasm": bytesResponse(wasmBytes),
      "/proving/withdraw_final.zkey": bytesResponse(zkeyBytes)
    }
  };
}
