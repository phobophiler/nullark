import { describe, expect, it } from "vitest";
import {
  assertRuntimeState,
  assertCurrentRuntime,
  getCurrentRuntime,
  getLegacyV11MainnetRuntime,
  getRuntimeForNetwork,
  getRuntimeForRecoveryKitV1,
  type NullarkCurrentRuntime,
  MEGAETH_MAINNET_CHAIN_ID,
  readRuntimeWithdrawalFeeStateFromPool,
  resolveRuntimeWithdrawalFeeState
} from "./current.js";

const v12Addresses = {
  pool: "0x1234567890abcdef1234567890abcdef12345678",
  depositVerifier: "0x2234567890abcdef1234567890abcdef12345678",
  privateTransferVerifier: "0x234567890abcdef1234567890abcdef123456789",
  withdrawVerifier: "0x34567890abcdef1234567890abcdef1234567890",
  verifierAdapter: "0x4567890abcdef1234567890abcdef12345678901",
  poseidon2: "0x567890abcdef1234567890abcdef123456789012",
  feeController: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
} as const;

const v12Groth16PublicInputOrder = [
  "root",
  "nullifier",
  "outputCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "proofContextHash",
  "encryptedOutputNoteHash"
] as const;

function v12Candidate(v1_1: NullarkCurrentRuntime, overrides: Partial<NullarkCurrentRuntime> = {}): NullarkCurrentRuntime {
  return {
    ...v1_1,
    schema: "nullark-sdk-runtime-v1-2-candidate-v1",
    productVersion: "nullark-v1.2-fee-governance",
    pool: v12Addresses.pool,
    depositVerifier: v12Addresses.depositVerifier,
    privateTransferVerifier: v12Addresses.privateTransferVerifier,
    withdrawVerifier: v12Addresses.withdrawVerifier,
    verifierAdapter: v12Addresses.verifierAdapter,
    poseidon2: v12Addresses.poseidon2,
    feeController: v12Addresses.feeController,
    withdrawVerifierBytecodeHash: `0x${"8".repeat(64)}`,
    withdrawalFeeBps: 33,
    maxWithdrawalFeeBps: 100,
    feePolicy: {
      activeFeeBps: 33,
      maxFeeBps: 100,
      pendingFeeState: {
        pendingFeeBps: 50,
        pendingFeeActivationTime: "2026-06-01T00:00:00.000Z",
        source: "on-chain-feeBps"
      }
    },
    v1_2Readiness: {
      approvedForMainnet: false,
      ownerApprovedPromotion: false
    },
    proverManifest: { path: "/proving/v1-2/withdraw-artifacts.manifest.json", sha256: "a".repeat(64) },
    trustedSetupRecord: { path: "/proving/v1-2/trusted-setup-record.json", sha256: "b".repeat(64) },
    artifacts: {
      withdrawWasm: { path: "/proving/v1-2/withdraw.wasm", sha256: "c".repeat(64) },
      withdrawFinalZkey: { path: "/proving/v1-2/withdraw_final.zkey", sha256: "d".repeat(64) }
    },
    groth16PublicInputOrder: v12Groth16PublicInputOrder,
    ...overrides
  };
}

function v11Runtime(): NullarkCurrentRuntime {
  return {
    schema: "nullark-sdk-runtime-current-v1",
    productVersion: "nullark-v1.1-mainnet",
    environment: "megaeth-mainnet",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    poolContractName: "NullarkPool",
    pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
    poolDeploymentBlock: "0xf98a11",
    merkleTreeDepth: 20,
    withdrawalFeeBps: 33,
    relayerEndpoint: "https://relayer.nullark.com/transaction",
    relayerEndpointLabel: "Machine/API endpoint",
    privateTransferVerifier: "0x0C78dE1615892205908810bF0129f10165346B57",
    withdrawVerifier: "0x9023FAfB13320D4A34AAD6C25E0411862b0E3397",
    verifierAdapter: "0x311d92DAc355F239B039C4298A7f374E09E23e52",
    withdrawVerifierBytecodeHash: "0x9a20d11112ee8b3c57677de4ba84eccf3928cb8aec734a21a1df5770086ad4f6",
    withdrawSelector: "0x678d8506",
    proverManifest: {
      path: "/proving/withdraw-artifacts.manifest.json",
      sha256: "b4514173425aa34d6092e4b024341ed5a5696a8528c98f7a971521c69822a1a7"
    },
    trustedSetupRecord: {
      path: "/proving/trusted-setup-record.json",
      sha256: "7cf2ba6c7d482179a5a246ad4fa0ab7c4bbebb6a48108d0fe0963b8a364c825e"
    },
    artifacts: {
      withdrawWasm: {
        path: "/proving/withdraw.wasm",
        sha256: "10da6305ea99967b6945f968b2df93c839f5a8d78221baff800250474b207dc2"
      },
      withdrawFinalZkey: {
        path: "/proving/withdraw_final.zkey",
        sha256: "86a9f5c3b4833dd38b9bdd21fa5412593572223961568d3ff2862116c6ca2a96"
      }
    },
    artifactResolution: {
      mode: "https-base-url",
      baseUrl: "https://nullark.com"
    },
    groth16PublicInputOrder: [
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
    ]
  };
}

describe("current runtime", () => {
  it("loads the promoted MegaETH mainnet v1.2 runtime", () => {
    const runtime = getCurrentRuntime();

    expect(runtime.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(runtime.rpcUrl).toBe("https://mainnet.megaeth.com/rpc");
    expect(runtime.schema).toBe("nullark-sdk-runtime-v1-2-candidate-v1");
    expect(runtime.productVersion).toBe("nullark-v1.2-fee-governance");
    expect(runtime.pool).toBe("0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8");
    expect(runtime.relayerEndpoint).toBe("https://relayer.nullark.com/transaction");
    expect(runtime.withdrawSelector).toBe("0x678d8506");
    expect(runtime.depositVerifier).toBe("0x1c62f992d1B2499f0E4CE3DecD4c0833d3B7C691");
    expect(runtime.withdrawVerifier).toBe("0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92");
    expect(runtime.withdrawVerifierBytecodeHash).toBe("0x613190065f23e69c6dcd8d75796b8aa20c060a5f51b312cf82c11424443bfdca");
    expect(runtime.poseidon2).toBe("0x962dB28fe5Ae5737FdE62F438309cFFDefE8C182");
    expect(runtime.groth16PublicInputOrder).toEqual(v12Groth16PublicInputOrder);
    expect(resolveRuntimeWithdrawalFeeState(runtime)).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 100,
      source: "on-chain-feeBps"
    });
  });

  it("preserves the legacy v1.1 mainnet runtime for recovery-kit imports after v1.2 promotion", () => {
    const current = getCurrentRuntime();
    const legacy = getLegacyV11MainnetRuntime();

    expect(current.productVersion).toBe("nullark-v1.2-fee-governance");
    expect(legacy.productVersion).toBe("nullark-v1.1-mainnet");
    expect(legacy.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(legacy.pool).toBe("0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15");
    expect(legacy.pool).not.toBe(current.pool);
    expect(legacy.groth16PublicInputOrder).toEqual([
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
    ]);

    expect(
      getRuntimeForRecoveryKitV1({
        chainId: legacy.chainId,
        poolAddress: legacy.pool,
        runtimeId: legacy.productVersion
      })
    ).toEqual(legacy);
    expect(
      getRuntimeForRecoveryKitV1({
        chainId: current.chainId,
        poolAddress: current.pool,
        runtimeId: current.productVersion
      })
    ).toEqual(current);
  });

  it("rejects ambiguous recovery-kit runtime selection", () => {
    const current = getCurrentRuntime();
    const legacy = getLegacyV11MainnetRuntime();

    expect(() =>
      getRuntimeForRecoveryKitV1({
        chainId: current.chainId,
        poolAddress: legacy.pool,
        runtimeId: current.productVersion
      })
    ).toThrow("No Nullark SDK runtime matches recovery kit");
  });

  it("loads the explicit Nullark MegaETH testnet runtime", () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");

    expect(runtime.environment).toBe("megaeth-testnet-nullark");
    expect(runtime.chainId).toBe(6343);
    expect(runtime.rpcUrl).toBe("https://carrot.megaeth.com/rpc");
    expect(runtime.schema).toBe("nullark-sdk-runtime-v1-2-candidate-v1");
    expect(runtime.productVersion).toBe("nullark-v1.2-testnet-rehearsal");
    expect(runtime.pool).toBe("0xEc61D863700DeF260E7BABA634FAa24AEC81f29e");
    expect(runtime.merkleTreeDepth).toBe(20);
    expect(runtime.withdrawVerifier).toBe("0x9710F0853688c0ef58e826Cd1Bb0024b3D29bC72");
    expect(runtime.privateTransferVerifier).toBe("0x1b2C53Df63D67b1562ac578C8E0d468B89575794");
    expect(runtime.verifierAdapter).toBe("0xb95A581f672779eC61DCa838aA452C46E4c9EB40");
    expect(runtime.withdrawVerifierBytecodeHash).toBe("0x4927cf479baf49196aa232f61fd697e41ef4a379064f298c3805964a61cf59fb");
    expect(runtime.groth16PublicInputOrder).toEqual(v12Groth16PublicInputOrder);
    expect(resolveRuntimeWithdrawalFeeState(runtime)).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 100,
      source: "on-chain-feeBps"
    });
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

  it("accepts an explicit staged v1.1 and v1.2 runtime state with pending fee metadata", () => {
    const v1_1 = v11Runtime();
    const state = assertRuntimeState({
      schema: "nullark-sdk-runtime-state-v1",
      currentRuntime: "v1_1",
      defaultDepositRuntime: "v1_1",
      mainnet4326Blocked: true,
      v1_1,
      v1_2: v12Candidate(v1_1)
    });

    expect(state.currentRuntime).toBe("v1_1");
    expect(state.v1_2.productVersion).toBe("nullark-v1.2-fee-governance");
    expect(state.v1_2.groth16PublicInputOrder).toEqual(v12Groth16PublicInputOrder);
    expect(state.v1_2.groth16PublicInputOrder).not.toContain("spentCommitment");
    expect(state.v1_2.groth16PublicInputOrder).not.toContain("noteAmount");
    expect(state.v1_2.feePolicy?.pendingFeeState?.pendingFeeBps).toBe(50);
    expect(resolveRuntimeWithdrawalFeeState(state.v1_2)).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 100,
      pendingFeeBps: 50,
      pendingFeeActive: false,
      source: "on-chain-feeBps"
    });
    expect(resolveRuntimeWithdrawalFeeState(v1_1)).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 33,
      source: "runtime-static-v1.1"
    });
  });

  it("reads staged v1.2 withdrawal fee state from the configured pool", async () => {
    const v1_1 = v11Runtime();
    const v1_2 = v12Candidate(v1_1);
    const calls: string[] = [];
    const feeState = await readRuntimeWithdrawalFeeStateFromPool(v1_2, {
      async readContract({ address, functionName }) {
        expect(address).toBe(v12Addresses.pool);
        calls.push(functionName);
        if (functionName === "feeBps") return 40n;
        if (functionName === "MAX_FEE_BPS") return 100n;
        if (functionName === "pendingFeeBps") return 75n;
        if (functionName === "pendingFeeActivationTime") return 1_781_481_600n;
        throw new Error(`unexpected read: ${functionName}`);
      }
    });

    expect(calls.sort()).toEqual(["MAX_FEE_BPS", "feeBps", "pendingFeeActivationTime", "pendingFeeBps"].sort());
    expect(feeState).toEqual({
      activeFeeBps: 40,
      maxFeeBps: 100,
      pendingFeeBps: 75,
      pendingFeeActivationTime: "2026-06-15T00:00:00.000Z",
      pendingFeeActive: false,
      source: "on-chain-feeBps"
    });
  });

  it("keeps v1.1 withdrawal fee state static instead of reading the pool", async () => {
    const v1_1 = v11Runtime();
    const feeState = await readRuntimeWithdrawalFeeStateFromPool(v1_1, {
      async readContract() {
        throw new Error("v1.1 should not read on-chain fee state");
      }
    });

    expect(feeState).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 33,
      source: "runtime-static-v1.1"
    });
  });

  it("rejects incoherent on-chain v1.2 pending fee state", async () => {
    const v1_1 = v11Runtime();
    const v1_2 = v12Candidate(v1_1);

    await expect(
      readRuntimeWithdrawalFeeStateFromPool(v1_2, {
        async readContract({ functionName }) {
          if (functionName === "feeBps") return 40n;
          if (functionName === "MAX_FEE_BPS") return 100n;
          if (functionName === "pendingFeeBps") return 75n;
          if (functionName === "pendingFeeActivationTime") return 0n;
          throw new Error(`unexpected read: ${functionName}`);
        }
      })
    ).rejects.toThrow("pending withdrawal fee state must pair fee bps with activation time");
  });

  it("forces v1.2 current and default runtime claims back to v1.1 without approved promotion evidence", () => {
    const v1_1 = v11Runtime();

    const state = assertRuntimeState({
      schema: "nullark-sdk-runtime-state-v1",
      currentRuntime: "v1_2",
      defaultDepositRuntime: "v1_2",
      mainnet4326Blocked: true,
      v1_1,
      v1_2: v12Candidate(v1_1)
    });

    expect(state.currentRuntime).toBe("v1_1");
    expect(state.defaultDepositRuntime).toBe("v1_1");
  });

  it("marks staged v1.2 as blocked draft and not advertised without final readiness evidence", () => {
    const v1_1 = v11Runtime();

    const state = assertRuntimeState({
      schema: "nullark-sdk-runtime-state-v1",
      currentRuntime: "v1_1",
      defaultDepositRuntime: "v1_1",
      mainnet4326Blocked: true,
      v1_1,
      v1_2: v12Candidate(v1_1)
    });

    expect(state.v1_2Status).toEqual({
      status: "draft-blocked",
      advertised: false,
      ready: false,
      finalReadinessEvidencePinned: false,
      reason: "v1.2 remains blocked until package-pinned final readiness and owner promotion evidence is present."
    });
  });

  it("rejects self-attested v1.2 promotion evidence instead of treating it as ready", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_2",
        defaultDepositRuntime: "v1_2",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          v1_2Readiness: {
            approvedForMainnet: true,
            ownerApprovedPromotion: true,
            promotionEvidence: [
              {
                path: "public-artifacts/v1-2/runtime-state.approved.json",
                sha256: "e".repeat(64),
                status: "approved-for-mainnet"
              }
            ]
          }
        })
      })
    ).toThrow("v1.2 readiness approval requires package-pinned final readiness evidence");
  });

  it("rejects v1.2 promotion evidence unless every package-pinned evidence row is present", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_2",
        defaultDepositRuntime: "v1_2",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          v1_2Readiness: {
            approvedForMainnet: true,
            ownerApprovedPromotion: true,
            promotionEvidence: [
              {
                path: "apps/web/public/proving/trusted-setup-record.json",
                sha256: "e9a7f78a293cc7c48888356f4e05edea756408adfcaed626d77faa98dfc7ff58",
                status: "approved-for-mainnet"
              }
            ]
          }
        })
      })
    ).toThrow("v1.2 readiness approval requires package-pinned final readiness evidence");
  });

  it("rejects v1.2 current runtime claims while promotion evidence is still blocked", () => {
    const v1_1 = v11Runtime();
    const blockedCurrentClaim = v12Candidate(v1_1);
    delete blockedCurrentClaim.v1_2Readiness;

    expect(() => assertCurrentRuntime(blockedCurrentClaim)).toThrow("package-pinned v1.2 mainnet runtime");
  });

  it("rejects v1.2 approval metadata attached to the static v1.1 current runtime", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertCurrentRuntime({
        ...v1_1,
        v1_2Readiness: {
          approvedForMainnet: true,
          ownerApprovedPromotion: true,
          promotionEvidence: [
            {
              path: "evidence/mainnet-readiness/v1-2/runtime-approved.json",
              sha256: "e".repeat(64),
              status: "approved-for-mainnet"
            }
          ]
        }
      })
    ).toThrow("current runtime must not carry v1.2 promotion approval metadata");
  });

  it("rejects v1.2 candidates that reuse the v1.1 pool address", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, { pool: v1_1.pool })
      })
    ).toThrow("v1.2 candidate runtime must be distinct from v1.1");
  });

  it("rejects placeholder v1.2 feeController even when the pool is distinct", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          feeController: "0x4444444444444444444444444444444444444444"
        })
      })
    ).toThrow("non-placeholder feeController address");
  });

  it("rejects v1.2 candidates with chain or RPC mismatches", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          chainId: 6343,
          rpcUrl: "https://carrot.megaeth.com/rpc"
        })
      })
    ).toThrow("mainnet runtime must target MegaETH mainnet 4326");
  });

  it("rejects v1.2 runtime fee policy above the immutable 100 bps cap", () => {
    const v1_1 = v11Runtime();
    const v1_2 = {
      ...v12Candidate(v1_1),
      maxWithdrawalFeeBps: 101,
      feePolicy: {
        activeFeeBps: 33,
        maxFeeBps: 101,
        pendingFeeState: {
          pendingFeeBps: 101,
          pendingFeeActivationTime: "2026-06-01T00:00:00.000Z",
          source: "on-chain-feeBps" as const
        }
      }
    };

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2
      })
    ).toThrow("v1.2 immutable max fee bps");
  });

  it("rejects placeholder v1.2 pool or feeController publication addresses", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          pool: "0x3333333333333333333333333333333333333333",
          feeController: "0x4444444444444444444444444444444444444444"
        })
      })
    ).toThrow("non-placeholder pool address");
  });

  it("rejects a v1.2 candidate that republishes v1.1 artifact hashes without approved promotion evidence", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: true,
        v1_1,
        v1_2: v12Candidate(v1_1, {
          proverManifest: v1_1.proverManifest
        })
      })
    ).toThrow("cannot reuse v1.1 artifact hashes without approved promotion evidence");
  });

  it("rejects unblocked publication of a staged v1.2 sidecar even when deposits still default to v1.1", () => {
    const v1_1 = v11Runtime();

    expect(() =>
      assertRuntimeState({
        schema: "nullark-sdk-runtime-state-v1",
        currentRuntime: "v1_1",
        defaultDepositRuntime: "v1_1",
        mainnet4326Blocked: false,
        v1_1,
        v1_2: v12Candidate(v1_1)
      })
    ).toThrow("must remain mainnet-blocked until approved promotion evidence exists");
  });
});
