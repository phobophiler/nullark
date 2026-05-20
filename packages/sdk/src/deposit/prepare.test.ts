import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { recoverSpendMaterialFromDecodedNoteEvents } from "../recovery/recover.js";
import { getRuntimeForNetwork } from "../runtime/current.js";
import { deriveNoteCommitment } from "../notes/poseidon.js";
import { prepareDepositNote } from "./prepare.js";

const walletSignature = `0x${"11".repeat(65)}` as const;
const depositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "encryptedNote", type: "bytes" }
    ],
    outputs: []
  }
] as const;

describe("deposit preparation", () => {
  it("builds a recoverable encrypted testnet deposit without exposing private material in public evidence", async () => {
    let seed = 1;
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const prepared = await prepareDepositNote({
      runtime,
      walletSignature,
      amountWei: "10000000000000000",
      now: "2026-05-20T00:00:00.000Z",
      randomBytes: (length) => Uint8Array.from({ length }, () => seed++)
    });

    expect(prepared.transaction).toMatchObject({
      chainId: 6343,
      to: runtime.pool,
      value: 10000000000000000n
    });
    const decoded = decodeFunctionData({ abi: depositAbi, data: prepared.transaction.data });
    expect(decoded.functionName).toBe("deposit");
    expect(decoded.args).toEqual([prepared.commitment, prepared.encryptedNote]);
    expect(prepared.encryptedNote).toMatch(/^0x[0-9a-f]+$/);
    expect(prepared.publicEvidence).toEqual({
      kind: "deposit-note-prepared",
      chainId: 6343,
      pool: runtime.pool,
      commitment: prepared.commitment,
      amountWei: "10000000000000000",
      encryptedNotePresent: true,
      privateKeysIncluded: false,
      noteSecretsIncluded: false
    });
    expect(JSON.stringify(prepared.publicEvidence)).not.toContain(prepared.spendMaterial.noteSecret);

    const recovered = await recoverSpendMaterialFromDecodedNoteEvents({
      walletSignature,
      chainId: runtime.chainId,
      pool: runtime.pool,
      events: [
        {
          action: "deposit",
          commitment: prepared.commitment,
          leafIndex: 7,
          encryptedNote: prepared.encryptedNote,
          encryptionVersion: 1,
          nullifier: null,
          transactionHash: `0x${"22".repeat(32)}`
        }
      ],
      deriveCommitment: (plaintext) =>
        deriveNoteCommitment({
          assetId: plaintext.assetId,
          noteAmountWei: plaintext.noteAmountWei,
          ownerCommitment: plaintext.ownerCommitment,
          noteSecret: plaintext.noteSecret
        })
    });

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.plaintext.commitment).toBe(prepared.commitment);
  });

  it("rejects unsupported runtime bindings before preparing note material", async () => {
    await expect(
      prepareDepositNote({
        runtime: {
          ...getRuntimeForNetwork("megaeth-testnet"),
          chainId: 1
        } as never,
        walletSignature,
        amountWei: "10000000000000000"
      })
    ).rejects.toThrow("testnet runtime must target MegaETH testnet 6343");
  });
});
