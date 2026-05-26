import { encodeAbiParameters, toEventHash } from "viem";
import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import {
  NULLARK_RECOVERY_APP_ID,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import { getNullarkRecoveryEpochId } from "../recovery/recover.js";
import { encodeNullifierLookupCalldata } from "../withdraw/calldata.js";
import { deriveNoteCommitment, deriveNullifier } from "./poseidon.js";
import { recoverWalletNotesFromChain, toPrintableNoteSummaries } from "./recover.js";

const wallet = "0x1111111111111111111111111111111111111111" as const;
const walletSignature = `0x${"42".repeat(65)}` as const;
const commitment = `0x${"11".repeat(32)}` as const;
const nullifier = `0x${"77".repeat(32)}` as const;
const txHash = `0x${"22".repeat(32)}` as const;
const depositTopic = toEventHash("DepositNoteCreated(bytes32,uint256,bytes,uint16)");

describe("wallet note recovery workflow", () => {
  it("recovers notes through a signer adapter and returns redaction-safe printable summaries", async () => {
    const runtime = getCurrentRuntime();
    const plaintext: SpendMaterialPlaintext = {
      version: "spend-material-v1",
      chainId: runtime.chainId,
      pool: runtime.pool,
      assetId: `0x${"01".repeat(32)}`,
      noteAmountWei: "10001",
      ownerCommitment: `0x${"02".repeat(32)}`,
      noteSecret: `0x${"03".repeat(32)}`,
      blinding: `0x${"04".repeat(32)}`,
      commitment,
      createdAt: "2026-05-20T00:00:00.000Z"
    };
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: runtime.chainId,
      pool: runtime.pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: getNullarkRecoveryEpochId(runtime.chainId)
    });
    const encrypted = serializeEncryptedNoteEnvelopeToHex(
      await encryptSpendMaterialEnvelope({
        noteKey,
        plaintext,
        aad: makeRecoveryAssociatedData({
          chainId: runtime.chainId,
          pool: runtime.pool,
          action: "deposit",
          commitment,
          encryptionVersion: 1
        })
      })
    );
    const signerCalls: unknown[] = [];
    const recovered = await recoverWalletNotesFromChain({
      runtime,
      wallet,
      signer: {
        async signTypedData(typedData) {
          signerCalls.push(typedData);
          return walletSignature;
        }
      },
      deriveCommitment: async () => commitment,
      deriveNullifier: async () => nullifier,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; id: number; params?: unknown[] };
        if (body.method === "eth_blockNumber") {
          return jsonRpc(body.id, runtime.poolDeploymentBlock);
        }
        if (body.method === "eth_getLogs") {
          return jsonRpc(body.id, [
            {
              address: runtime.pool,
              topics: [depositTopic, commitment, `0x${"0".repeat(63)}7`],
              data: encodeAbiParameters(
                [
                  { name: "encryptedNote", type: "bytes" },
                  { name: "encryptionVersion", type: "uint16" }
                ],
                [encrypted, 1]
              ),
              transactionHash: txHash
            }
          ]);
        }
        if (body.method === "eth_call") {
          const call = body.params?.[0] as { to?: string; data?: string };
          expect(call).toEqual({ to: runtime.pool, data: encodeNullifierLookupCalldata(nullifier) });
          return jsonRpc(body.id, `0x${"0".repeat(64)}`);
        }
        throw new Error(`unexpected method ${body.method}`);
      }
    });

    expect(signerCalls).toHaveLength(1);
    expect(JSON.stringify(signerCalls[0])).toContain("UnlockShieldedSpendRecovery");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.summary).toEqual({
      id: `note_${commitment.slice(2, 10)}_7`,
      commitment,
      amountWei: "10001",
      spent: false,
      leafIndex: 7,
      transactionHash: txHash
    });
    expect(recovered[0]?.spendMaterial.noteSecret).toBe(plaintext.noteSecret);

    const printable = toPrintableNoteSummaries(recovered);
    expect(printable).toEqual([recovered[0]?.summary]);
    expect(JSON.stringify(printable)).not.toContain(plaintext.noteSecret);
    expect(JSON.stringify(printable)).not.toContain(plaintext.blinding);
    expect(JSON.stringify(printable)).not.toContain(walletSignature);
  });

  it("uses SDK Poseidon derivation by default", async () => {
    const runtime = getCurrentRuntime();
    const noteSecret = `0x02${"22".repeat(31)}` as const;
    const plaintext: SpendMaterialPlaintext = {
      version: "spend-material-v1",
      chainId: runtime.chainId,
      pool: runtime.pool,
      assetId: `0x${"00".repeat(31)}01`,
      noteAmountWei: "123456789000000000",
      ownerCommitment: noteSecret,
      noteSecret,
      blinding: `0x${"04".repeat(32)}`,
      commitment: await deriveNoteCommitment({
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "123456789000000000",
        ownerCommitment: noteSecret,
        noteSecret
      }),
      createdAt: "2026-05-20T00:00:00.000Z"
    };
    const expectedNullifier = await deriveNullifier({
      noteSecret,
      leafIndex: 7,
      chainId: runtime.chainId,
      verifyingContract: runtime.pool
    });
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: runtime.chainId,
      pool: runtime.pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment: plaintext.commitment,
      epochId: getNullarkRecoveryEpochId(runtime.chainId)
    });
    const encrypted = serializeEncryptedNoteEnvelopeToHex(
      await encryptSpendMaterialEnvelope({
        noteKey,
        plaintext,
        aad: makeRecoveryAssociatedData({
          chainId: runtime.chainId,
          pool: runtime.pool,
          action: "deposit",
          commitment: plaintext.commitment,
          encryptionVersion: 1
        })
      })
    );

    const recovered = await recoverWalletNotesFromChain({
      runtime,
      wallet,
      signer: {
        async signTypedData() {
          return walletSignature;
        }
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; id: number; params?: unknown[] };
        if (body.method === "eth_blockNumber") {
          return jsonRpc(body.id, runtime.poolDeploymentBlock);
        }
        if (body.method === "eth_getLogs") {
          return jsonRpc(body.id, [
            {
              address: runtime.pool,
              topics: [depositTopic, plaintext.commitment, `0x${"0".repeat(63)}7`],
              data: encodeAbiParameters(
                [
                  { name: "encryptedNote", type: "bytes" },
                  { name: "encryptionVersion", type: "uint16" }
                ],
                [encrypted, 1]
              ),
              transactionHash: txHash
            }
          ]);
        }
        if (body.method === "eth_call") {
          const call = body.params?.[0] as { data?: string };
          expect(call.data).toBe(encodeNullifierLookupCalldata(expectedNullifier));
          return jsonRpc(body.id, `0x${"0".repeat(64)}`);
        }
        throw new Error(`unexpected method ${body.method}`);
      }
    });

    expect(recovered[0]?.summary.commitment).toBe(plaintext.commitment);
    expect(recovered[0]?.nullifier).toBe(expectedNullifier);
  });
});

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
