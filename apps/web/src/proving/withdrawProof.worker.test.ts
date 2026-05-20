import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestnetProductRuntimeConfig, setProductRuntimeConfigForTests } from "../product/productRuntimeConfig.js";
import { assertTrustedProverArtifacts } from "./withdrawProof.worker.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setProductRuntimeConfigForTests(mainnetRuntimeConfigForTests());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setProductRuntimeConfigForTests(null);
  delete (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname;
  vi.restoreAllMocks();
});

describe("withdraw proof worker artifact trust", () => {
  it("rejects superseded trusted setup records even when manifest metadata and artifact hashes match", async () => {
    const bundle = await trustedManifest({
      status: "historical-superseded-not-v1.1-mainnet-blocked",
      publicInputOrder: nullarkV1_1PublicInputOrder.slice(0, 10),
      supersededBy: "public-artifacts/current.json"
    });
    mockFetch(bundle.routes);

    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:should-not-be-created");

    await expect(assertTrustedProverArtifacts()).rejects.toThrow("superseded-trusted-setup-record");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong chain", { chainId: 6343 as const }, "prover-manifest-deployment-mismatch"],
    ["wrong pool", { pool: "0x9999999999999999999999999999999999999999" }, "prover-manifest-deployment-mismatch"],
    ["wrong verifier", { verifier: "0x1111111111111111111111111111111111111111" }, "prover-manifest-deployment-mismatch"],
    ["draft status", { status: "draft-review-required" }, "trusted-setup-record-not-approved"],
    [
      "missing 12-input public input order",
      { publicInputOrder: nullarkV1_1PublicInputOrder.slice(0, 10) },
      "trusted-setup-public-input-order-mismatch"
    ]
  ])("rejects trusted setup provenance with %s", async (_label, overrides, expectedReason) => {
    const bundle = await trustedManifest(overrides);
    mockFetch(bundle.routes);

    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:should-not-be-created");

    await expect(assertTrustedProverArtifacts()).rejects.toThrow(expectedReason);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects local-untrusted manifests even when artifact hashes match", async () => {
    const wasmHash = await sha256Text("wasm-bytes");
    const zkeyHash = await sha256Text("zkey-bytes");
    mockFetch({
      "/proving/withdraw-artifacts.manifest.json": jsonResponse({
        trustLevel: "blocked-local-untrusted",
        artifacts: {
          withdrawWasm: {
            path: "/proving/withdraw.wasm",
            sha256: wasmHash
          },
          withdrawFinalZkey: {
            path: "/proving/withdraw_final.zkey",
            sha256: zkeyHash
          }
        }
      }),
      "/proving/withdraw.wasm": bytesResponse("wasm-bytes"),
      "/proving/withdraw_final.zkey": bytesResponse("zkey-bytes")
    });

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => "blob:local-wasm")
      .mockImplementationOnce(() => "blob:local-zkey");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(assertTrustedProverArtifacts()).rejects.toThrow("untrusted-prover-artifacts");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("allows untrusted artifact hash validation for explicit testnet config", async () => {
    setProductRuntimeConfigForTests(createTestnetProductRuntimeConfig());
    (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname = "nullark-testnet.example";
    const wasmHash = await sha256Text("wasm-bytes");
    const zkeyHash = await sha256Text("zkey-bytes");
    const fetchMock = mockFetch(localUntrustedManifestRoutes({ wasmHash, zkeyHash }));

    vi.spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => "blob:local-dev-wasm")
      .mockImplementationOnce(() => "blob:local-dev-zkey");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const artifacts = await assertTrustedProverArtifacts();

    expect(artifacts.wasmUrl).toBe("blob:local-dev-wasm");
    expect(artifacts.zkeyUrl).toBe("blob:local-dev-zkey");
    expect(fetchMock.mock.calls.some(([url]) => url === "/proving/trusted-setup-record.json")).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/proving/withdraw.wasm")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/proving/withdraw_final.zkey")).toHaveLength(1);
  });

  it("does not allow the local-untrusted bypass on MegaETH mainnet 4326", async () => {
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      chainId: 4326,
      allowUntrustedLocalDevProver: true,
      allowLocalDevProofServiceFallback: false
    });
    (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname = "localhost";
    const wasmHash = await sha256Text("wasm-bytes");
    const zkeyHash = await sha256Text("zkey-bytes");
    mockFetch(localUntrustedManifestRoutes({ wasmHash, zkeyHash }));

    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:should-not-be-created");

    await expect(assertTrustedProverArtifacts()).rejects.toThrow("untrusted-prover-artifacts");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects trusted manifests without public trust metadata", async () => {
    const bundle = await trustedManifest({ approvedBy: undefined, approvedAt: undefined });
    mockFetch(bundle.routes);

    await expect(assertTrustedProverArtifacts()).rejects.toThrow("missing-public-trust-metadata");
  });

  it("rejects fetched wasm or zkey bytes whose hashes differ from the manifest", async () => {
    const bundle = await trustedManifest();
    mockFetch({
      ...bundle.routes,
      "/proving/withdraw.wasm": bytesResponse("different-wasm")
    });

    await expect(assertTrustedProverArtifacts()).rejects.toThrow("Prover artifact hash mismatch: withdraw wasm.");
  });

  it("returns object URLs backed by the exact artifact bytes that passed hash verification", async () => {
    const bundle = await trustedManifest();
    const fetchMock = mockFetch(bundle.routes);

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => "blob:verified-wasm")
      .mockImplementationOnce(() => "blob:verified-zkey");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const artifacts = await assertTrustedProverArtifacts();

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(artifacts.wasmUrl).toBe("blob:verified-wasm");
    expect(artifacts.zkeyUrl).toBe("blob:verified-zkey");
    expect(artifacts.wasmUrl).not.toBe("/proving/withdraw.wasm");
    expect(artifacts.zkeyUrl).not.toBe("/proving/withdraw_final.zkey");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/proving/withdraw.wasm")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/proving/withdraw_final.zkey")).toHaveLength(1);

    artifacts.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:verified-wasm");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:verified-zkey");
  });

  it("binds worker fetch when validating trusted prover artifacts", async () => {
    const bundle = await trustedManifest();
    const fetchMock = mockWorkerScopeFetch(bundle.routes);

    vi.spyOn(URL, "createObjectURL")
      .mockImplementationOnce(() => "blob:worker-wasm")
      .mockImplementationOnce(() => "blob:worker-zkey");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const artifacts = await assertTrustedProverArtifacts();

    expect(artifacts.wasmUrl).toBe("blob:worker-wasm");
    expect(artifacts.zkeyUrl).toBe("blob:worker-zkey");
    expect(fetchMock).toHaveBeenCalled();
  });
});

function mockFetch(routes: Record<string, Response>) {
  const fetchMock = vi.fn(async (url) => {
    const path = String(url);
    return routes[path]?.clone() ?? new Response("missing", { status: 404 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function mockWorkerScopeFetch(routes: Record<string, Response>) {
  const fetchMock = vi.fn(async function (this: unknown, url: RequestInfo | URL) {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");
    }
    const path = String(url);
    return routes[path]?.clone() ?? new Response("missing", { status: 404 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function bytesResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function localUntrustedManifestRoutes(input: { wasmHash: string; zkeyHash: string }): Record<string, Response> {
  return {
    "/proving/withdraw-artifacts.manifest.json": jsonResponse({
      trustLevel: "blocked-local-untrusted",
      artifacts: {
        withdrawWasm: {
          path: "/proving/withdraw.wasm",
          sha256: input.wasmHash
        },
        withdrawFinalZkey: {
          path: "/proving/withdraw_final.zkey",
          sha256: input.zkeyHash
        }
      }
    }),
    "/proving/withdraw.wasm": bytesResponse("wasm-bytes"),
    "/proving/withdraw_final.zkey": bytesResponse("zkey-bytes")
  };
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const mainnetDeployment = {
  chainId: 4326,
  pool: "0x1111111111111111111111111111111111111111",
  verifier: "0x24f47b9ab5a6bc39461388C542ceF1a38CB701Fc",
  verifierBytecodeHash: "0x04775b44acf2b6521157dfb868cfd845240225d74908b74188d099c1c749a018"
} as const;

function mainnetRuntimeConfigForTests() {
  return {
    chainId: mainnetDeployment.chainId,
    chainIdHex: "0x10e6",
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    networkName: "MegaETH mainnet",
    networkBadge: "MAINNET",
    walletChainName: "MegaETH Mainnet",
    poolAddress: mainnetDeployment.pool,
    poolDeploymentBlockHex: "0xec757f",
    merkleTreeDepth: 20,
    proverManifestUrl: "/proving/withdraw-artifacts.manifest.json",
    relayerEndpoint: "https://relayer.nullark.com/transaction",
    withdrawVerifierAddress: mainnetDeployment.verifier,
    withdrawVerifierBytecodeHash: mainnetDeployment.verifierBytecodeHash,
    allowUntrustedLocalDevProver: false,
    allowLocalDevProofServiceFallback: false,
    mainnetValueMovingApproved: false,
    guardedUsersApproved: false,
    productionPrivacyClaimsApproved: false
  } as const;
}

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

async function trustedManifest(
  overrides: Partial<{
    chainId: 4326 | 6343;
    pool: string;
    verifier: string;
    verifierBytecodeHash: string;
    wasmBytes: string;
    zkeyBytes: string;
    status: string;
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
  const recordPath = "/proving/trusted-setup-record.json";
  const record = {
    schema: "trusted-setup-verifier-promotion-v1",
    trustLevel: "trusted-setup-recorded",
    status: overrides.status ?? "approved-for-mainnet",
    ...(Object.hasOwn(overrides, "supersededBy") ? { supersededBy: overrides.supersededBy } : {}),
    chainId: overrides.chainId ?? mainnetDeployment.chainId,
    pool: overrides.pool ?? mainnetDeployment.pool,
    verifier: overrides.verifier ?? mainnetDeployment.verifier,
    verifierBytecodeHash: overrides.verifierBytecodeHash ?? mainnetDeployment.verifierBytecodeHash,
    approvedBy: Object.hasOwn(overrides, "approvedBy")
      ? overrides.approvedBy
      : "0x3333333333333333333333333333333333333333",
    approvedAt: Object.hasOwn(overrides, "approvedAt") ? overrides.approvedAt : "2026-05-02T00:00:00.000Z",
    publicInputOrder: overrides.publicInputOrder ?? [...nullarkV1_1PublicInputOrder],
    wasmSha256,
    zkeySha256
  };
  const recordBody = JSON.stringify(record);
  const recordSha256 = await sha256Text(recordBody);
  return {
    routes: {
      "/proving/withdraw-artifacts.manifest.json": jsonResponse({
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
      }),
      [recordPath]: new Response(recordBody, { status: 200 }),
      "/proving/withdraw.wasm": bytesResponse(wasmBytes),
      "/proving/withdraw_final.zkey": bytesResponse(zkeyBytes)
    }
  };
}
