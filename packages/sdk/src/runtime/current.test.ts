import { describe, expect, it } from "vitest";
import {
  assertCurrentRuntime,
  getCurrentRuntime,
  getRuntimeForNetwork,
  MEGAETH_MAINNET_CHAIN_ID
} from "./current.js";

describe("current runtime", () => {
  it("loads the sanitized MegaETH mainnet runtime", () => {
    const runtime = getCurrentRuntime();

    expect(runtime.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(runtime.rpcUrl).toBe("https://mainnet.megaeth.com/rpc");
    expect(runtime.pool).toBe("0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15");
    expect(runtime.relayerEndpoint).toBe("https://relayer.nullark.com/transaction");
    expect(runtime.withdrawSelector).toBe("0x678d8506");
    expect(runtime.groth16PublicInputOrder).toHaveLength(12);
    expect(JSON.stringify(runtime)).not.toContain("docs/evidence");
  });

  it("loads the explicit Nullark MegaETH testnet runtime", () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");

    expect(runtime.environment).toBe("megaeth-testnet-nullark");
    expect(runtime.chainId).toBe(6343);
    expect(runtime.rpcUrl).toBe("https://carrot.megaeth.com/rpc");
    expect(runtime.pool).toBe("0xfd41bc6473c969d5284B4C01284bD4A50c176f4d");
    expect(runtime.merkleTreeDepth).toBe(20);
    expect(runtime.withdrawVerifier).toBe("0x1E2dE0CE5861E55F1159184F102Ad2a99C5bA46b");
    expect(runtime.artifactTrustMode).toBe("testnet-local-dev-untrusted");
    expect(JSON.stringify(runtime)).not.toContain("docs/evidence");
  });

  it("fails closed when private operation paths leak into runtime", () => {
    const runtime = getCurrentRuntime();

    expect(() =>
      assertCurrentRuntime({
        ...runtime,
        proverManifest: {
          ...runtime.proverManifest,
          path: "docs/evidence/mainnet-readiness/current-manifest.json"
        }
      })
    ).toThrow("private operation paths");
  });

  it("fails closed on the legacy non-stage-C selector", () => {
    const runtime = getCurrentRuntime();

    expect(() => assertCurrentRuntime({ ...runtime, withdrawSelector: "0xc7787d0f" })).toThrow(
      "proof-bound withdrawal selector"
    );
  });

  it("fails closed when the Groth16 public input order changes", () => {
    const runtime = getCurrentRuntime();

    expect(() =>
      assertCurrentRuntime({
        ...runtime,
        groth16PublicInputOrder: [
          "root",
          "nullifier",
          "newCommitment",
          "destination",
          "grossAmount",
          "fee",
          "chainId",
          "verifyingContract",
          "noteAmount",
          "spentCommitment",
          "proofContextHash",
          "encryptedNoteHash"
        ]
      })
    ).toThrow("Groth16 public input order");
  });
});
