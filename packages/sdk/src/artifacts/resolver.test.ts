import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCurrentRuntime, getRuntimeForNetwork } from "../runtime/current.js";
import { resolveProverArtifacts, verifyLocalProverArtifacts, verifyProverArtifactBinding } from "./resolver.js";

const PROVING_ARTIFACT_DIR = fileURLToPath(new URL("../../../../apps/web/public/proving", import.meta.url));

describe("artifact resolver", () => {
  it("resolves the current runtime through an explicit HTTPS base URL", () => {
    const artifacts = resolveProverArtifacts(getCurrentRuntime(), {
      mode: "https-base-url",
      baseUrl: "https://nullark.com"
    });

    expect(artifacts).toEqual({
      mode: "https-base-url",
      manifest: "https://nullark.com/proving/withdraw-artifacts.manifest.json",
      trustedSetupRecord: "https://nullark.com/proving/trusted-setup-record.json",
      withdrawWasm: "https://nullark.com/proving/withdraw.wasm",
      withdrawFinalZkey: "https://nullark.com/proving/withdraw_final.zkey"
    });
  });

  it("maps app-relative artifact paths into an explicit local artifact directory", () => {
    const artifacts = resolveProverArtifacts(getCurrentRuntime(), {
      mode: "local-artifact-dir",
      artifactDir: "/tmp/nullark-proving"
    });

    expect(artifacts.manifest).toBe("/tmp/nullark-proving/withdraw-artifacts.manifest.json");
    expect(artifacts.trustedSetupRecord).toBe("/tmp/nullark-proving/trusted-setup-record.json");
    expect(artifacts.withdrawWasm).toBe("/tmp/nullark-proving/withdraw.wasm");
    expect(artifacts.withdrawFinalZkey).toBe("/tmp/nullark-proving/withdraw_final.zkey");
  });

  it("preserves nested public proving paths for v1.2 testnet local artifact resolution", () => {
    const artifacts = resolveProverArtifacts(getRuntimeForNetwork("megaeth-testnet"), {
      mode: "local-artifact-dir",
      artifactDir: "/tmp/nullark-proving"
    });

    expect(artifacts.manifest).toBe("/tmp/nullark-proving/v1-2-testnet/withdraw-artifacts.manifest.json");
    expect(artifacts.withdrawWasm).toBe("/tmp/nullark-proving/v1-2-testnet/withdraw.wasm");
    expect(artifacts.withdrawFinalZkey).toBe("/tmp/nullark-proving/v1-2-testnet/withdraw_final.zkey");
  });

  it("rejects non-HTTPS artifact base URLs", () => {
    expect(() =>
      resolveProverArtifacts(getCurrentRuntime(), { mode: "https-base-url", baseUrl: "http://nullark.com" })
    ).toThrow("HTTPS");
  });

  it("rejects package-embedded resolution without an explicit package artifact base URL", () => {
    expect(() => resolveProverArtifacts(getCurrentRuntime(), { mode: "package-embedded", baseUrl: "" })).toThrow(
      "requires an explicit package artifact base URL"
    );
  });

  it("verifies manifest and trusted setup binding against the sanitized runtime", () => {
    const runtime = getCurrentRuntime();
    const trustedSetupRecord = JSON.stringify({
      schema: "trusted-setup-verifier-promotion-v1",
      trustLevel: "trusted-setup-recorded",
      status: "approved-for-mainnet",
      approvedBy: "0x000000000000000000000000000000000000dEaD",
      approvedAt: "2026-05-20T00:00:00.000Z",
      chainId: runtime.chainId,
      pool: runtime.pool,
      verifier: runtime.withdrawVerifier,
      verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash,
      publicInputOrder: runtime.groth16PublicInputOrder,
      wasmSha256: runtime.artifacts.withdrawWasm.sha256,
      zkeySha256: runtime.artifacts.withdrawFinalZkey.sha256
    });
    const trustedSetupRecordSha256 = createHash("sha256").update(trustedSetupRecord).digest("hex");
    const manifest = {
      schema: "browser-withdraw-prover-artifacts-v1",
      trustLevel: "trusted-setup-recorded",
      trustedSetupRecord: {
        path: runtime.trustedSetupRecord.path,
        sha256: trustedSetupRecordSha256,
        chainId: runtime.chainId,
        pool: runtime.pool,
        verifier: runtime.withdrawVerifier,
        verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash,
        approvedBy: "0x000000000000000000000000000000000000dEaD",
        approvedAt: "2026-05-20T00:00:00.000Z"
      },
      artifacts: {
        withdrawWasm: runtime.artifacts.withdrawWasm,
        withdrawFinalZkey: runtime.artifacts.withdrawFinalZkey
      },
      pool: runtime.pool,
      verifier: runtime.withdrawVerifier,
      verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash
    };

    expect(
      verifyProverArtifactBinding({
        runtime: {
          ...runtime,
          trustedSetupRecord: { ...runtime.trustedSetupRecord, sha256: trustedSetupRecordSha256 }
        },
        manifest,
        trustedSetupRecord
      }).trusted
    ).toBe(true);
  });

  it("rejects artifact bindings with wrong public input order", () => {
    const runtime = getCurrentRuntime();
    const trustedSetupRecord = {
      schema: "trusted-setup-verifier-promotion-v1",
      trustLevel: "trusted-setup-recorded",
      status: "approved-for-mainnet",
      approvedBy: "0x000000000000000000000000000000000000dEaD",
      approvedAt: "2026-05-20T00:00:00.000Z",
      chainId: runtime.chainId,
      pool: "0x000000000000000000000000000000000000bEEF",
      verifier: runtime.withdrawVerifier,
      verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash,
      publicInputOrder: [...runtime.groth16PublicInputOrder].reverse(),
      wasmSha256: runtime.artifacts.withdrawWasm.sha256,
      zkeySha256: runtime.artifacts.withdrawFinalZkey.sha256
    };
    const manifest = {
      schema: "browser-withdraw-prover-artifacts-v1",
      trustLevel: "trusted-setup-recorded",
      trustedSetupRecord: {
        path: runtime.trustedSetupRecord.path,
        sha256: runtime.trustedSetupRecord.sha256,
        chainId: runtime.chainId,
        pool: runtime.pool,
        verifier: runtime.withdrawVerifier,
        verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash,
        approvedBy: "0x000000000000000000000000000000000000dEaD",
        approvedAt: "2026-05-20T00:00:00.000Z"
      },
      artifacts: {
        withdrawWasm: runtime.artifacts.withdrawWasm,
        withdrawFinalZkey: runtime.artifacts.withdrawFinalZkey
      },
      pool: runtime.pool,
      verifier: runtime.withdrawVerifier,
      verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash
    };

    expect(
      verifyProverArtifactBinding({
        runtime,
        manifest,
        trustedSetupRecord
      })
    ).toEqual({ trusted: false, reason: "trusted-setup-public-input-order-mismatch" });
  });

  it("returns an untrusted status instead of throwing on invalid manifest JSON", () => {
    expect(
      verifyProverArtifactBinding({
        runtime: getCurrentRuntime(),
        manifest: "{not json",
        trustedSetupRecord: "{}"
      })
    ).toEqual({ trusted: false, reason: "invalid-prover-manifest" });
  });

  it("does not expose local filesystem paths when local artifacts are missing", async () => {
    const status = await verifyLocalProverArtifacts(
      getCurrentRuntime(),
      resolveProverArtifacts(getCurrentRuntime(), {
        mode: "local-artifact-dir",
        artifactDir: "/tmp/does-not-exist-nullark"
      })
    );

    expect(status).toEqual({ trusted: false, reason: "missing-local-artifact" });
  });

  it("does not require a mainnet trusted setup record for explicit testnet local-dev artifacts", async () => {
      const artifactDir = await mkdtemp(path.join(tmpdir(), "nullark-testnet-artifacts-"));
    try {
      const sourceDir = PROVING_ARTIFACT_DIR;
      await mkdir(path.join(artifactDir, "v1-2-testnet"));
      await copyFile(
        path.join(sourceDir, "v1-2-testnet", "withdraw-artifacts.manifest.json"),
        path.join(artifactDir, "v1-2-testnet", "withdraw-artifacts.manifest.json")
      );
      await copyFile(
        path.join(sourceDir, "v1-2-testnet", "withdraw.wasm"),
        path.join(artifactDir, "v1-2-testnet", "withdraw.wasm")
      );
      await copyFile(
        path.join(sourceDir, "v1-2-testnet", "withdraw_final.zkey"),
        path.join(artifactDir, "v1-2-testnet", "withdraw_final.zkey")
      );

      const runtime = getRuntimeForNetwork("megaeth-testnet");
      const status = await verifyLocalProverArtifacts(
        runtime,
        resolveProverArtifacts(runtime, {
          mode: "local-artifact-dir",
          artifactDir
        })
      );

      expect(status).toEqual({ trusted: true, artifactTrustMode: "testnet-local-dev-untrusted" });
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
