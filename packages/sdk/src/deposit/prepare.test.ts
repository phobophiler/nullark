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
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "encryptedNote", type: "bytes" }
    ],
    outputs: []
  }
] as const;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const providedProof = "0x1234" as const;

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
    expect(decoded.args[0]).toBe("0x");
    expect(decoded.args[2]).toBe(prepared.encryptedNote);
    const publicInputs = [...decoded.args[1]];
    expect(publicInputs).toHaveLength(6);
    expect(publicInputs).toEqual([
      prepared.commitment,
      toBytes32(10000000000000000n),
      toBytes32(6343n),
      addressToBytes32(runtime.pool),
      expect.stringMatching(/^0x[0-9a-f]{64}$/),
      expect.stringMatching(/^0x[0-9a-f]{64}$/)
    ]);
    expect(publicInputs[4]).not.toBe(ZERO_BYTES32);
    expect(publicInputs[5]).not.toBe(ZERO_BYTES32);
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
    expect(JSON.stringify(prepared.publicEvidence)).not.toContain(prepared.spendMaterial.ownerCommitment);
    expect(JSON.stringify(prepared.publicEvidence)).not.toContain(prepared.spendMaterial.blinding);
    expect(JSON.stringify(publicInputs)).not.toContain(prepared.spendMaterial.noteSecret);
    expect(JSON.stringify(publicInputs)).not.toContain(prepared.spendMaterial.ownerCommitment);
    expect(JSON.stringify(publicInputs)).not.toContain(prepared.spendMaterial.blinding);

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

  it("uses provided v1.2 deposit proof bytes when public inputs match the generated note", async () => {
    let seed = 1;
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const prepared = await prepareDepositNote({
      runtime,
      walletSignature,
      amountWei: "10000000000000000",
      now: "2026-05-20T00:00:00.000Z",
      randomBytes: (length) => Uint8Array.from({ length }, () => seed++),
      depositProof: ({ publicInputs }) => ({ proof: providedProof, publicInputs })
    });

    const decoded = decodeFunctionData({ abi: depositAbi, data: prepared.transaction.data });
    expect(decoded.args[0]).toBe(providedProof);
    expect(decoded.args[1][0]).toBe(prepared.commitment);
    expect(decoded.args[2]).toBe(prepared.encryptedNote);
  });

  it.each([
    {
      name: "wrong length",
      mutate: (publicInputs: readonly `0x${string}`[]) => publicInputs.slice(0, 5),
      message: "Expected deposit proof publicInputs to contain exactly 6 bytes32 values."
    },
    {
      name: "wrong commitment",
      mutate: (publicInputs: readonly `0x${string}`[]) => replacePublicInput(publicInputs, 0, toBytes32(2n)),
      message: "Deposit proof commitment does not match the prepared note."
    },
    {
      name: "wrong amount",
      mutate: (publicInputs: readonly `0x${string}`[]) => replacePublicInput(publicInputs, 1, toBytes32(1n)),
      message: "Deposit proof amount does not match the prepared note."
    },
    {
      name: "wrong chain",
      mutate: (publicInputs: readonly `0x${string}`[]) => replacePublicInput(publicInputs, 2, toBytes32(4326n)),
      message: "Deposit proof is not bound to the active MegaETH chain."
    },
    {
      name: "wrong verifying contract",
      mutate: (publicInputs: readonly `0x${string}`[]) =>
        replacePublicInput(publicInputs, 3, addressToBytes32("0x000000000000000000000000000000000000dEaD")),
      message: "Deposit proof is not bound to this shielded pool."
    },
    {
      name: "wrong deposit context hash",
      mutate: (publicInputs: readonly `0x${string}`[]) => replacePublicInput(publicInputs, 4, toBytes32(4n)),
      message: "Deposit proof context hash does not match the prepared note."
    },
    {
      name: "wrong encrypted note hash",
      mutate: (publicInputs: readonly `0x${string}`[]) => replacePublicInput(publicInputs, 5, toBytes32(5n)),
      message: "Deposit proof encrypted note hash does not match the prepared note."
    }
  ])("rejects v1.2 deposit proof public inputs with $name", async ({ mutate, message }) => {
    let seed = 1;
    await expect(
      prepareDepositNote({
        runtime: getRuntimeForNetwork("megaeth-testnet"),
        walletSignature,
        amountWei: "10000000000000000",
        now: "2026-05-20T00:00:00.000Z",
        randomBytes: (length) => Uint8Array.from({ length }, () => seed++),
        depositProof: ({ publicInputs }) => ({ proof: providedProof, publicInputs: mutate(publicInputs) })
      })
    ).rejects.toThrow(message);
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

function replacePublicInput(
  publicInputs: readonly `0x${string}`[],
  index: number,
  value: `0x${string}`
): `0x${string}`[] {
  const mutated = [...publicInputs];
  mutated[index] = value;
  return mutated;
}

function toBytes32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function addressToBytes32(address: string): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}
