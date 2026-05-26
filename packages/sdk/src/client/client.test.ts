import { describe, expect, it } from "vitest";
import { getCurrentRuntime, getRuntimeForNetwork } from "../runtime/current.js";
import type { HexString } from "../types.js";
import { deriveNoteCommitment } from "../notes/poseidon.js";
import type { RecoveredWalletNote } from "../notes/recover.js";
import { createRecoveryKitV1, serializeRecoveryKitV1 } from "../recovery/recoveryKit.js";
import { decodeV12UnlinkableWithdrawOutputNoteCalldata } from "../withdraw/calldata.js";
import { Nullark } from "./client.js";

const bytes32 = (byte: string): HexString => `0x${byte.repeat(32)}`;
const wallet = "0x1111111111111111111111111111111111111111";
const destination = "0x000000000000000000000000000000000000dEaD";
const walletSignature = `0x${"11".repeat(65)}` as const;
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
const v11Groth16PublicInputOrder = [
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

function uint256Bytes32(value: string | number | bigint): HexString {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function addressBytes32(address: string): HexString {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function runtimeFeeReadClient(input?: {
  activeFeeBps?: bigint;
  maxFeeBps?: bigint;
  pendingFeeBps?: bigint;
  pendingFeeActivationTime?: bigint;
  calls?: string[];
}) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      input?.calls?.push(functionName);
      switch (functionName) {
        case "feeBps":
          return input?.activeFeeBps ?? 50n;
        case "MAX_FEE_BPS":
          return input?.maxFeeBps ?? 100n;
        case "pendingFeeBps":
          return input?.pendingFeeBps ?? 75n;
        case "pendingFeeActivationTime":
          return input?.pendingFeeActivationTime ?? 1_780_272_000n;
        default:
          throw new Error(`unexpected fee state read ${functionName}`);
      }
    }
  };
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

function v12Runtime(overrides: Record<string, unknown> = {}) {
  return {
    ...getRuntimeForNetwork("megaeth-testnet"),
    schema: "nullark-sdk-runtime-v1-2-candidate-v1" as const,
    productVersion: "nullark-v1.2-fee-governance-test",
    feeController: "0x4444444444444444444444444444444444444444" as const,
    maxWithdrawalFeeBps: 100,
    groth16PublicInputOrder: v12Groth16PublicInputOrder,
    feePolicy: {
      activeFeeBps: 50,
      maxFeeBps: 100,
      pendingFeeState: {
        pendingFeeBps: 75,
        pendingFeeActivationTime: "2026-06-01T00:00:00.000Z",
        source: "on-chain" as const
      }
    },
    v1_2Readiness: {
      approvedForMainnet: false,
      ownerApprovedPromotion: false
    },
    ...overrides
  };
}

function v11Runtime(overrides: Record<string, unknown> = {}) {
  const runtime = { ...getRuntimeForNetwork("megaeth-testnet") };
  delete runtime.maxWithdrawalFeeBps;
  delete runtime.feeController;
  delete runtime.feePolicy;
  delete runtime.v1_2Readiness;
  return {
    ...runtime,
    schema: "nullark-sdk-runtime-current-v1" as const,
    productVersion: "nullark-v1.1-test",
    withdrawalFeeBps: 33,
    groth16PublicInputOrder: v11Groth16PublicInputOrder,
    ...overrides
  };
}

function v12PublicInputs(input: {
  runtime: { chainId: number; pool: string };
  root: HexString;
  nullifier: HexString;
  destination: string;
  grossAmountWei: string;
  feeWei: string;
  outputCommitment?: HexString;
  verifyingContract?: string;
  chainId?: number;
  proofContextHash?: HexString;
  encryptedOutputNoteHash?: HexString;
}): HexString[] {
  return [
    input.root,
    input.nullifier,
    input.outputCommitment ?? bytes32("00"),
    addressBytes32(input.destination),
    uint256Bytes32(input.grossAmountWei),
    uint256Bytes32(input.feeWei),
    uint256Bytes32(input.chainId ?? input.runtime.chainId),
    addressBytes32(input.verifyingContract ?? input.runtime.pool),
    input.proofContextHash ?? bytes32("08"),
    input.encryptedOutputNoteHash ?? bytes32("09")
  ];
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

  it("imports a recovery kit as a spendable note without wallet recovery", async () => {
    const runtime = v12Runtime();
    const note = recoveredNote({ id: "note_kit_unused", amountWei: "200000", pool: runtime.pool, chainId: runtime.chainId });
    const derivedCommitment = await deriveNoteCommitment({
      assetId: note.spendMaterial.assetId,
      noteAmountWei: note.spendMaterial.noteAmountWei,
      ownerCommitment: note.spendMaterial.ownerCommitment,
      noteSecret: note.spendMaterial.noteSecret
    });
    note.summary.commitment = derivedCommitment;
    note.spendMaterial.commitment = derivedCommitment;
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial: note.spendMaterial,
      transactionHash: note.summary.transactionHash,
      leafIndex: note.summary.leafIndex
    });
    let walletRecoveryCalls = 0;
    let proverNote: RecoveredWalletNote | undefined;
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => {
        walletRecoveryCalls += 1;
        return [];
      },
      recoveryKitNullifierStatus: async () => false,
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async ({ grossAmountWei, feeWei, note, destination }) => {
        proverNote = note;
        const root = bytes32("01");
        const outputCommitment = bytes32("0c");
        return {
          proof: "0x1234",
          publicInputs: v12PublicInputs({
            runtime,
            root,
            nullifier: note.nullifier,
            destination,
            grossAmountWei,
            feeWei,
            outputCommitment
          }),
          nullifier: note.nullifier,
          currentRoot: root,
          outputCommitment,
          encryptedOutputNote: "0xabcd"
        };
      }
    });

    const imported = await nullark.notes.importRecoveryKit({ serializedKit: serializeRecoveryKitV1(kit) });
    const balance = await nullark.balance.read();
    const withdrawal = await nullark.withdrawals.prepare({
      noteId: imported.id,
      amountWei: "100000",
      destination,
      route: "relayer"
    });

    expect(walletRecoveryCalls).toBe(0);
    expect(imported).toMatchObject({
      commitment: note.summary.commitment,
      amountWei: note.summary.amountWei,
      spent: false
    });
    expect(balance.spendableCount).toBe(1);
    expect(balance.notes[0]?.id).toBe(imported.id);
    expect(proverNote?.summary.id).toBe(imported.id);
    expect(withdrawal.plan.pool).toBe(runtime.pool);
    expect(JSON.stringify(imported)).not.toMatch(/wallet|discovery|tag/i);
  });

  it("imports a mainnet recovery kit with explicit RootAccepted evidence and no wallet connection", async () => {
    const runtime = getCurrentRuntime();
    const note = recoveredNote({
      id: "note_mainnet_kit",
      amountWei: "200000",
      pool: runtime.pool,
      chainId: runtime.chainId
    });
    const derivedCommitment = await deriveNoteCommitment({
      assetId: note.spendMaterial.assetId,
      noteAmountWei: note.spendMaterial.noteAmountWei,
      ownerCommitment: note.spendMaterial.ownerCommitment,
      noteSecret: note.spendMaterial.noteSecret
    });
    note.summary.commitment = derivedCommitment;
    note.spendMaterial.commitment = derivedCommitment;
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial: note.spendMaterial,
      transactionHash: note.summary.transactionHash,
      leafIndex: note.summary.leafIndex,
      blockNumber: "0x10152de"
    });
    let walletRecoveryCalls = 0;
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => {
        walletRecoveryCalls += 1;
        return [];
      },
      recoveryKitNullifierStatus: async () => false,
      runtimeFeeReadClient: runtimeFeeReadClient()
    });

    const imported = await nullark.notes.importRecoveryKit({
      serializedKit: serializeRecoveryKitV1(kit),
      rootAcceptedEvidence: {
        status: "verified-root-accepted",
        chainId: runtime.chainId,
        pool: runtime.pool,
        runtimeId: runtime.productVersion,
        commitment: derivedCommitment,
        leafIndex: note.summary.leafIndex,
        root: bytes32("77"),
        latestCheckedBlock: "0x10152de"
      }
    });

    expect(walletRecoveryCalls).toBe(0);
    expect(imported).toMatchObject({
      commitment: note.summary.commitment,
      amountWei: note.summary.amountWei,
      spent: false
    });
  });

  it("prepares a withdrawal with explicit route and rejects missing or mismatched prover output", async () => {
    const runtime = v12Runtime();
    const note = recoveredNote({ id: "note_exit_1", amountWei: "200000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async ({ grossAmountWei, feeWei, note, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const outputCommitment = bytes32("0c");
        const publicInputs = v12PublicInputs({ runtime, root, nullifier, destination, grossAmountWei, feeWei, outputCommitment });
        expect(publicInputs).not.toContain(note.summary.commitment);
        expect(publicInputs).not.toContain(uint256Bytes32(note.summary.amountWei));
        return {
          proof: "0x1234",
          publicInputs,
          nullifier,
          currentRoot: root,
          outputCommitment,
          encryptedOutputNote: "0xabcd"
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
    expect(withdrawal.feeWei).toBe("500");
    expect(withdrawal.netAmountWei).toBe("99500");
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
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async ({ grossAmountWei, feeWei, note, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const publicInputs = v12PublicInputs({
          runtime,
          root,
          nullifier,
          destination,
          grossAmountWei,
          feeWei,
          verifyingContract: "0x0000000000000000000000000000000000000001"
        });
        return {
          proof: "0x1234",
          publicInputs,
          nullifier,
          currentRoot: root
        };
      }
    });
    await badProver.notes.recover();
    await expect(
      badProver.withdrawals.prepare({ noteId: "note_exit_1", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("shielded pool");

    const staleFeeProver = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async ({ grossAmountWei, note, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const staleV1_1FeeWei = "330";
        return {
          proof: "0x1234",
          publicInputs: [
            ...v12PublicInputs({ runtime, root, nullifier, destination, grossAmountWei, feeWei: staleV1_1FeeWei })
          ],
          nullifier,
          currentRoot: root
        };
      }
    });
    await staleFeeProver.notes.recover();
    await expect(
      staleFeeProver.withdrawals.prepare({ noteId: "note_exit_1", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("active runtime fee");
  });

  it("refreshes v1.2 withdrawal fees from the configured pool before proving", async () => {
    const runtime = v12Runtime({
      withdrawalFeeBps: 33,
      feePolicy: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeState: {
          pendingFeeBps: null,
          pendingFeeActivationTime: null,
          source: "on-chain-feeBps" as const
        }
      }
    });
    const calls: string[] = [];
    let proverRuntimeFeeBps: number | undefined;
    const note = recoveredNote({ id: "note_live_fee", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient({
        activeFeeBps: 40n,
        maxFeeBps: 100n,
        pendingFeeBps: 0n,
        pendingFeeActivationTime: 0n,
        calls
      }),
      localWithdrawalProver: async ({ runtime, grossAmountWei, feeWei, note, destination }) => {
        proverRuntimeFeeBps = runtime.feePolicy?.activeFeeBps;
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        const outputCommitment = bytes32("0c");
        return {
          proof: "0x1234",
          publicInputs: [
            ...v12PublicInputs({ runtime, root, nullifier, destination, grossAmountWei, feeWei, outputCommitment })
          ],
          nullifier,
          currentRoot: root,
          outputCommitment,
          encryptedOutputNote: "0xabcd"
        };
      }
    });
    await nullark.notes.recover();

    const withdrawal = await nullark.withdrawals.prepare({
      noteId: "note_live_fee",
      amountWei: "100000",
      destination,
      route: "relayer"
    });

    expect(calls).toEqual(["feeBps", "MAX_FEE_BPS", "pendingFeeBps", "pendingFeeActivationTime"]);
    expect(withdrawal.feeWei).toBe("400");
    expect(withdrawal.netAmountWei).toBe("99600");
    expect(proverRuntimeFeeBps).toBe(40);

    const missingFeeClient = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      localWithdrawalProver: async () => {
        throw new Error("prover should not be called without a runtime fee read client");
      }
    });
    await missingFeeClient.notes.recover();
    await expect(
      missingFeeClient.withdrawals.prepare({ noteId: "note_live_fee", amountWei: "100000", destination, route: "relayer" })
    ).rejects.toThrow("runtime fee read client");
  });

  it("uses v1.2 output-note prover fields instead of legacy change-note fields", async () => {
    const runtime = v12Runtime();
    const outputCommitment = bytes32("0c");
    const encryptedOutputNote = "0xabcd" as const;
    const note = recoveredNote({ id: "note_v12_output", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async ({ runtime, grossAmountWei, feeWei, destination }) => {
        const nullifier = bytes32("aa");
        const root = bytes32("01");
        return {
          proof: "0x1234",
          publicInputs: v12PublicInputs({ runtime, root, nullifier, destination, grossAmountWei, feeWei, outputCommitment }),
          nullifier,
          currentRoot: root,
          outputCommitment,
          encryptedOutputNote
        };
      }
    });
    await nullark.notes.recover();

    const withdrawal = await nullark.withdrawals.prepare({
      noteId: "note_v12_output",
      amountWei: "90000",
      destination,
      route: "relayer"
    });

    const decoded = decodeV12UnlinkableWithdrawOutputNoteCalldata(withdrawal.plan.calldata);
    expect(decoded.encryptedOutputNote).toBe(encryptedOutputNote);
    expect(decoded).not.toHaveProperty("encryptedChangeNote");
    expect(decoded.publicInputs[2]).toBe(outputCommitment);
    expect(decoded.publicInputs).not.toContain(note.summary.commitment);
    expect(decoded.publicInputs).not.toContain(uint256Bytes32(note.summary.amountWei));
  });

  it("keeps v1.1 withdrawal fees static without reading pool fee governance state", async () => {
    const runtime = v11Runtime();
    const calls: string[] = [];
    const note = recoveredNote({ id: "note_static_fee", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient({ activeFeeBps: 99n, calls }),
      localWithdrawalProver: async ({ runtime, grossAmountWei, feeWei, note, destination }) => {
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
            uint256Bytes32(note.summary.amountWei),
            bytes32("08"),
            bytes32("09")
          ],
          nullifier,
          currentRoot: root
        };
      }
    });
    await nullark.notes.recover();

    const withdrawal = await nullark.withdrawals.prepare({
      noteId: "note_static_fee",
      amountWei: "100000",
      destination,
      route: "wallet"
    });

    expect(calls).toEqual([]);
    expect(withdrawal.feeWei).toBe("330");
    expect(withdrawal.netAmountWei).toBe("99670");
  });

  it("rejects stale user fee bounds before proving against active runtime fee", async () => {
    const runtime = v12Runtime();
    const note = recoveredNote({ id: "note_stale_bounds", amountWei: "100000", pool: runtime.pool, chainId: runtime.chainId });
    const nullark = new Nullark({
      runtime,
      wallet,
      signer: { signTypedData: async () => walletSignature },
      recoverWalletNotes: async () => [note],
      runtimeFeeReadClient: runtimeFeeReadClient(),
      localWithdrawalProver: async () => {
        throw new Error("prover should not be called for stale user bounds");
      }
    });
    await nullark.notes.recover();

    await expect(
      nullark.withdrawals.prepare({
        noteId: "note_stale_bounds",
        amountWei: "100000",
        destination,
        route: "relayer",
        maxFeeWei: "330"
      })
    ).rejects.toThrow("withdrawal fee exceeds user maximum");
    await expect(
      nullark.withdrawals.prepare({
        noteId: "note_stale_bounds",
        amountWei: "100000",
        destination,
        route: "relayer",
        minNetAmountWei: "99670"
      })
    ).rejects.toThrow("withdrawal net amount is below user minimum");
  });

  it("rejects spent notes and prover output that is not bound to the selected note", async () => {
    const runtime = v11Runtime();
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
