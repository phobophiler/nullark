import { generateBrowserWithdrawProof } from "./browserWithdrawProver.js";
import { getProductRuntimeConfig } from "../product/productRuntimeConfig.js";
import { loadTrustedProverManifest } from "./proverArtifactTrust.js";
import type { ProductRuntimeConfig } from "../product/productRuntimeConfig.js";
import type { WithdrawProofPublicInputSchema } from "./browserWithdrawProver.js";
import type { WithdrawProofWorkerRequest, WithdrawProofWorkerResponse } from "./withdrawProofWorkerClient.js";

const DEFAULT_WASM_URL = "/proving/withdraw.wasm";
const DEFAULT_ZKEY_URL = "/proving/withdraw_final.zkey";
const MANIFEST_URL = "/proving/withdraw-artifacts.manifest.json";
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WithdrawProofWorkerRequest>) => void) | null;
  postMessage: (value: unknown) => void;
};

type TrustedProverArtifacts = {
  wasmUrl: string;
  zkeyUrl: string;
  revoke: () => void;
};

type ProverArtifactPointer = {
  path: string;
  sha256: string;
};

type ProverArtifactPointers = {
  withdrawWasm: ProverArtifactPointer;
  withdrawFinalZkey: ProverArtifactPointer;
};

workerScope.onmessage = async (event: MessageEvent<WithdrawProofWorkerRequest>) => {
  let artifacts: TrustedProverArtifacts | undefined;
  try {
    artifacts = await assertTrustedProverArtifacts(
      event.data.runtimeConfig?.proverManifestUrl,
      event.data.publicInputSchema,
      event.data.runtimeConfig
    );
    const result = await generateBrowserWithdrawProof({
      witness: event.data.witness as Record<string, string | string[] | number | bigint>,
      wasmUrl: artifacts.wasmUrl,
      zkeyUrl: artifacts.zkeyUrl,
      publicInputSchema: event.data.publicInputSchema,
      expectedFeeBps: event.data.expectedFeeBps
    });
    const response: WithdrawProofWorkerResponse = {
      id: event.data.id,
      ok: true,
      proof: result.proof,
      proofCandidates: result.proofCandidates,
      publicInputs: result.publicInputs,
      nullifier: result.publicInputs[1] ?? "0x0"
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: WithdrawProofWorkerResponse = {
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : "Withdrawal proof worker failed."
    };
    workerScope.postMessage(response);
  } finally {
    artifacts?.revoke();
  }
};

export async function assertTrustedProverArtifacts(
  manifestUrl?: string,
  publicInputSchema: WithdrawProofPublicInputSchema = "v1.1",
  runtimeConfig: ProductRuntimeConfig = getProductRuntimeConfig()
): Promise<TrustedProverArtifacts> {
  const resolvedManifestUrl = manifestUrl ?? runtimeConfig.proverManifestUrl ?? MANIFEST_URL;
  const artifactPointers = allowsLocalDevUntrustedProver(runtimeConfig)
    ? await loadLocalDevProverArtifactPointers(resolvedManifestUrl)
    : await loadTrustedProverArtifactPointers(resolvedManifestUrl, runtimeConfig, publicInputSchema);

  const { withdrawWasm, withdrawFinalZkey } = artifactPointers;
  const verifiedWasmBytes = await assertFetchedArtifactHash(withdrawWasm.path, withdrawWasm.sha256, "withdraw wasm");
  const verifiedZkeyBytes = await assertFetchedArtifactHash(withdrawFinalZkey.path, withdrawFinalZkey.sha256, "withdraw zkey");
  const wasmUrl = URL.createObjectURL(new Blob([verifiedWasmBytes], { type: "application/wasm" }));
  const zkeyUrl = URL.createObjectURL(new Blob([verifiedZkeyBytes], { type: "application/octet-stream" }));

  return {
    wasmUrl,
    zkeyUrl,
    revoke: () => {
      URL.revokeObjectURL(wasmUrl);
      URL.revokeObjectURL(zkeyUrl);
    }
  };
}

async function loadTrustedProverArtifactPointers(
  manifestUrl: string,
  runtimeConfig: ProductRuntimeConfig,
  publicInputSchema: WithdrawProofPublicInputSchema
): Promise<ProverArtifactPointers> {
  const trustStatus = await loadTrustedProverManifest({
    manifestUrl,
    publicInputSchema,
    deployment: {
      chainId: runtimeConfig.chainId,
      pool: runtimeConfig.poolAddress,
      verifier: runtimeConfig.withdrawVerifierAddress,
      verifierBytecodeHash: runtimeConfig.withdrawVerifierBytecodeHash
    }
  });
  if (!trustStatus.trusted) {
    throw new Error(`Trusted prover gate blocked browser withdrawal proof generation: ${trustStatus.reason}.`);
  }

  return trustStatus.manifest.artifacts;
}

async function loadLocalDevProverArtifactPointers(manifestUrl: string): Promise<ProverArtifactPointers> {
  const response = await globalThis.fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Prover artifact manifest is unavailable.");
  }
  const manifest = await response.json();
  const { withdrawWasm, withdrawFinalZkey } = manifest.artifacts ?? {};
  for (const artifact of [withdrawWasm, withdrawFinalZkey]) {
    if (!artifact?.path || !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? "")) {
      throw new Error("Prover artifact manifest is missing SHA-256 integrity metadata.");
    }
  }
  return { withdrawWasm, withdrawFinalZkey };
}

function allowsLocalDevUntrustedProver(runtimeConfig: ProductRuntimeConfig): boolean {
  return runtimeConfig.chainId !== 4326 && runtimeConfig.allowUntrustedLocalDevProver;
}

async function assertFetchedArtifactHash(url: string, expectedSha256: string, label: string): Promise<ArrayBuffer> {
  const response = await globalThis.fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Prover artifact is unavailable: ${label}.`);
  }
  const bytes = await response.arrayBuffer();
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Prover artifact hash mismatch: ${label}.`);
  }
  return bytes;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
