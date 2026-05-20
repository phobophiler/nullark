import { describe, expect, it } from "vitest";
import { encodeWithdrawBoundedCalldata } from "../withdraw/calldata.js";
import { getRuntimeForNetwork } from "../runtime/current.js";
import type { HexString } from "../types.js";
import type { RecoveredWalletNote } from "../notes/recover.js";
import { Nullark } from "./client.js";

const bytes32 = (byte: string): HexString => `0x${byte.repeat(32)}`;
const wallet = "0x1111111111111111111111111111111111111111";
const destination = "0x000000000000000000000000000000000000dEaD";
const walletSignature = `0x${"11".repeat(65)}` as const;

function uint256Bytes32(value: string | number | bigint): HexString {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function addressBytes32(address: string): HexString {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function recoveredNote(input: {
  id: string;
  amountWei: string;
  pool: string;
  chainId: number;
  spent?: boolean;
}): RecoveredWalletNote {
  return {
    summary: {
      id: input.id,
      commitment: bytes32("07"),
      amountWei: input.amountWei,
      spent: input.spent ?? false,
      leafIndex: 1,
      transactionHash: bytes32("08")
    },
    spendMaterial: {
      version: "spend-material-v1",
      chainId: input.chainId,
      pool: input.pool as HexString,
      assetId: `0x${"00".repeat(31)}01`,
      noteAmountWei: input.amountWei,
      ownerCommitment: bytes32("02"),
      noteSecret: bytes32("03"),
      blinding: bytes32("04"),
      commitment: bytes32("07"),
      createdAt: "2026-05-20T00:00:00.000Z"
    },
    nullifier: bytes32("05")
  };
}

describe("Nullark client", () => {
  it("prepares a recoverable note funding transaction through a signer adapter without note-secret inputs", async () => {
    let seed = 1;
    let signedTypedData: unknown;
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: {
        signTypedData: async (typedData) => {
          signedTypedData = typedData;
          return walletSignature;
        }
      },
      randomBytes: (length) => Uint8Array.from({ length }, () => seed++)
    });

    const prepared = await nullark.notes.prepare({ amountWei: "10000000000000000" });

    expect(prepared.transaction).toMatchObject({
      chainId: 6343,
      to: runtime.pool,
      value: 10000000000000000n
    });
    expect(JSON.stringify(signedTypedData)).toContain("UnlockShieldedSpendRecovery");
    expect(prepared.publicEvidence).toMatchObject({
      kind: "deposit-note-prepared",
      chainId: 6343,
      pool: runtime.pool,
      amountWei: "10000000000000000",
      noteSecretsIncluded: false
    });
    expect(prepared).not.toHaveProperty("spendMaterial");
    expect(JSON.stringify(prepared, (_key, value) => (typeof value === "bigint" ? value.toString() : value))).not.toContain(
      bytes32("03")
    );
  });

  it("recovers wallet notes, rejects notes from the wrong runtime, and derives spendable balance", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const good = recoveredNote({ id: "note_good_1", amountWei: "100", pool: runtime.pool, chainId: runtime.chainId });
    const spent = recoveredNote({
      id: "note_spent_1",
      amountWei: "25",
      pool: runtime.pool,
      chainId: runtime.chainId,
      spent: true
    });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [good, spent]
    });

    const notes = await nullark.notes.recover();
    const balance = await nullark.balance.read();

    expect(notes).toEqual([good.summary, spent.summary]);
    expect(JSON.stringify(notes)).not.toContain(good.spendMaterial.noteSecret);
    expect(balance).toEqual({
      totalAmountWei: "100",
      spendableCount: 1,
      recoveredCount: 2,
      notes: [good.summary]
    });
    expect(JSON.stringify(balance)).not.toContain(good.spendMaterial.noteSecret);

    const wrongPool = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [
        recoveredNote({
          id: "note_wrong_pool",
          amountWei: "100",
          pool: "0x0000000000000000000000000000000000000001",
          chainId: runtime.chainId
        })
      ]
    });

    await expect(wrongPool.notes.recover()).rejects.toThrow("Recovered note is not bound to the active runtime.");

    const wrongChain = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [
        recoveredNote({
          id: "note_wrong_chain",
          amountWei: "100",
          pool: runtime.pool,
          chainId: 4326
        })
      ]
    });
    await expect(wrongChain.notes.recover()).rejects.toThrow("Recovered note is not bound to the active runtime.");
  });

  it("prepares a withdrawal with explicit route and rejects missing or mismatched prover output", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const note = recoveredNote({ id: "note_exit_1", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async ({ grossAmountWei, feeWei, note, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const publicInputs = [
          root,
          nullifier,
          bytes32("00"),
          addressBytes32(destination),
          uint256Bytes32(grossAmountWei),
          uint256Bytes32(feeWei),
          uint256Bytes32(runtime.chainId),
          addressBytes32(runtime.pool),
          note.summary.commitment,
          uint256Bytes32(note.summary.amountWei),
          bytes32("08"),
          bytes32("09")
        ];
        return {
          proof: "0x1234",
          publicInputs,
          nullifier,
          currentRoot: root
        };
      }
    });

    await nullark.notes.recover();
    const withdrawal = await nullark.withdrawals.prepare({
      noteId: "note_exit_1",
      amountWei: "100000",
      destination,
      route: "relayer"
    });

    expect(withdrawal.route).toBe("relayer");
    expect(withdrawal.plan.pool).toBe(runtime.pool);
    expect(withdrawal.plan.relayerRequest.to).toBe(runtime.pool);
    expect(withdrawal.plan.directWalletTransaction.to).toBe(runtime.pool);

    const noProver = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note]
    });
    await noProver.notes.recover();
    await expect(
      noProver.withdrawals.prepare({ noteId: "note_exit_1", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("withdrawals.prepare requires a local withdrawal prover adapter.");

    const badProver = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async ({ grossAmountWei, feeWei, note, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const publicInputs = [
          root,
          nullifier,
          bytes32("00"),
          addressBytes32(destination),
          uint256Bytes32(grossAmountWei),
          uint256Bytes32(feeWei),
          uint256Bytes32(runtime.chainId),
          addressBytes32("0x0000000000000000000000000000000000000001"),
          note.summary.commitment,
          uint256Bytes32(note.summary.amountWei),
          bytes32("08"),
          bytes32("09")
        ];
        return {
          proof: "0x1234",
          publicInputs,
          nullifier,
          currentRoot: root,
          calldata: encodeWithdrawBoundedCalldata({
            proof: "0x1234",
            publicInputs,
            nullifier,
            destination,
            grossAmountWei,
            minNetAmountWei: (BigInt(grossAmountWei) - BigInt(feeWei)).toString(),
            maxFeeWei: feeWei
          })
        };
      }
    });
    await badProver.notes.recover();
    await expect(
      badProver.withdrawals.prepare({ noteId: "note_exit_1", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("shielded pool");
  });

  it("rejects spent notes and prover output that is not bound to the selected note", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const spent = recoveredNote({
      id: "note_spent_exit",
      amountWei: "100000",
      pool: runtime.pool,
      chainId: runtime.chainId,
      spent: true
    });
    const spentClient = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [spent],
      localWithdrawalProver: async () => {
        throw new Error("prover should not be called for spent notes");
      }
    });
    await spentClient.notes.recover();
    await expect(
      spentClient.withdrawals.prepare({ noteId: "note_spent_exit", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("already spent");

    const note = recoveredNote({ id: "note_binding_1", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const mismatchedCommitmentClient = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async ({ grossAmountWei, feeWei, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        return {
          proof: "0x1234",
          publicInputs: [
            root,
            nullifier,
            bytes32("00"),
            addressBytes32(destination),
            uint256Bytes32(grossAmountWei),
            uint256Bytes32(feeWei),
            uint256Bytes32(runtime.chainId),
            addressBytes32(runtime.pool),
            bytes32("0b"),
            uint256Bytes32(note.summary.amountWei),
            bytes32("08"),
            bytes32("09")
          ],
          nullifier,
          currentRoot: root
        };
      }
    });
    await mismatchedCommitmentClient.notes.recover();
    await expect(
      mismatchedCommitmentClient.withdrawals.prepare({
        noteId: "note_binding_1",
        amountWei: "100000",
        destination,
        route: "relayer"
      })
    ).rejects.toThrow("selected recovered note commitment");

    const mismatchedAmountClient = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async ({ grossAmountWei, feeWei, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        return {
          proof: "0x1234",
          publicInputs: [
            root,
            nullifier,
            bytes32("00"),
            addressBytes32(destination),
            uint256Bytes32(grossAmountWei),
            uint256Bytes32(feeWei),
            uint256Bytes32(runtime.chainId),
            addressBytes32(runtime.pool),
            note.summary.commitment,
            uint256Bytes32("99999"),
            bytes32("08"),
            bytes32("09")
          ],
          nullifier,
          currentRoot: root
        };
      }
    });
    await mismatchedAmountClient.notes.recover();
    await expect(
      mismatchedAmountClient.withdrawals.prepare({
        noteId: "note_binding_1",
        amountWei: "100000",
        destination,
        route: "relayer"
      })
    ).rejects.toThrow("selected recovered note amount");
  });

  it("validates withdrawal request state before proving", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const note = recoveredNote({ id: "note_validation_1", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async () => {
        throw new Error("prover should not be called for invalid withdrawal requests");
      }
    });
    await nullark.notes.recover();

    await expect(
      nullark.withdrawals.prepare({ noteId: "missing", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("Recovered note id is not available");
    await expect(
      nullark.withdrawals.prepare({ noteId: "note_validation_1", amountWei: "0", destination, route: "relayer" })
    ).rejects.toThrow("positive decimal wei");
    await expect(
      nullark.withdrawals.prepare({ noteId: "note_validation_1", amountWei: "abc", destination, route: "relayer" })
    ).rejects.toThrow("positive decimal wei");
    await expect(
      nullark.withdrawals.prepare({ noteId: "note_validation_1", amountWei: "100001", destination, route: "relayer" })
    ).rejects.toThrow("exceeds the selected recovered note");
    await expect(
      nullark.withdrawals.prepare({ noteId: "note_validation_1", amountWei: "100000", destination: "not-an-address", route: "relayer" })
    ).rejects.toThrow("destination");
    await expect(
      nullark.withdrawals.prepare({ noteId: "note_validation_1", amountWei: "100000", destination, route: "remote" as never })
    ).rejects.toThrow("route");
  });

  it("rejects recovered note summaries that do not match spend material amounts", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const note = recoveredNote({ id: "note_bad_amount", amountWei: "100", pool: runtime.pool, chainId: runtime.chainId });
    note.spendMaterial.noteAmountWei = "99";
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note]
    });

    await expect(nullark.notes.recover()).rejects.toThrow("Recovered note summary amount does not match spend material.");
  });
});
