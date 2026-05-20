import type { SignerProvider } from "../adapters/index.js";
import {
  prepareDepositNote,
  type PreparedDepositNote
} from "../deposit/prepare.js";
import {
  recoverWalletNotesFromChain,
  toPrintableNoteSummaries,
  type PrintableRecoveredNoteSummary,
  type RecoveredWalletNote
} from "../notes/recover.js";
import type { NullarkCurrentRuntime, NullarkWithdrawPublicInputName } from "../runtime/current.js";
import { assertRuntime } from "../runtime/current.js";
import { isEvmAddress, type HexString } from "../types.js";
import { buildUnlockPrivateBalanceTypedData } from "../wallet/unlock.js";
import { createWithdrawalPlan, type WithdrawalPlan, type WithdrawalProofBundle } from "../withdraw/plan.js";

export type NullarkRoute = "relayer" | "wallet";

/**
 * Secret-bearing local prover boundary.
 *
 * This callback receives the selected recovered note, including spend material
 * needed to build a withdrawal proof. It must run in-process or inside another
 * user-controlled local environment. Do not implement this callback as a remote
 * API call unless the remote trust boundary is redesigned to avoid receiving
 * note secrets.
 */
export type LocalWithdrawalProver = (input: {
  runtime: NullarkCurrentRuntime;
  note: RecoveredWalletNote;
  destination: HexString;
  grossAmountWei: string;
  feeWei: string;
  netAmountWei: string;
  route: NullarkRoute;
}) => Promise<WithdrawalProofBundle & { encryptedChangeNote?: HexString; changeCommitment?: HexString }>;

export type NullarkClientOptions = {
  runtime: NullarkCurrentRuntime;
  wallet: string;
  signer: SignerProvider;
  fetchImpl?: typeof fetch;
  randomBytes?: (length: number) => Uint8Array;
  recoverWalletNotes?: (input: { wallet: HexString }) => Promise<RecoveredWalletNote[]>;
  localWithdrawalProver?: LocalWithdrawalProver;
};

export type NullarkPrivateBalance = {
  totalAmountWei: string;
  spendableCount: number;
  recoveredCount: number;
  notes: PrintableRecoveredNoteSummary[];
};

export type PreparedNullarkNote = Omit<PreparedDepositNote, "spendMaterial">;

export type PreparedNullarkWithdrawal = {
  route: NullarkRoute;
  note: PrintableRecoveredNoteSummary;
  grossAmountWei: string;
  feeWei: string;
  netAmountWei: string;
  plan: WithdrawalPlan;
  publicEvidence: {
    kind: "withdrawal-prepared";
    chainId: number;
    pool: HexString;
    noteId: string;
    destination: HexString;
    grossAmountWei: string;
    route: NullarkRoute;
    rawProofIncluded: false;
    fullCalldataIncluded: false;
    noteSecretsIncluded: false;
  };
};

export class Nullark {
  readonly notes: {
    prepare: (input: { amountWei: string; now?: string }) => Promise<PreparedNullarkNote>;
    recover: () => Promise<PrintableRecoveredNoteSummary[]>;
  };

  readonly balance: {
    read: () => Promise<NullarkPrivateBalance>;
  };

  readonly withdrawals: {
    prepare: (input: {
      noteId: string;
      amountWei: string;
      destination: string;
      route: NullarkRoute;
    }) => Promise<PreparedNullarkWithdrawal>;
  };

  private readonly runtime: NullarkCurrentRuntime;
  private readonly wallet: HexString;
  private readonly signer: SignerProvider;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly randomBytes: ((length: number) => Uint8Array) | undefined;
  private readonly recoverWalletNotesAdapter: ((input: { wallet: HexString }) => Promise<RecoveredWalletNote[]>) | undefined;
  private readonly localWithdrawalProver?: NullarkClientOptions["localWithdrawalProver"];
  private recoveredNotes: RecoveredWalletNote[] = [];

  constructor(options: NullarkClientOptions) {
    this.runtime = assertRuntime(options.runtime);
    this.wallet = assertWallet(options.wallet);
    this.signer = options.signer;
    this.fetchImpl = options.fetchImpl;
    this.randomBytes = options.randomBytes;
    this.recoverWalletNotesAdapter = options.recoverWalletNotes;
    this.localWithdrawalProver = options.localWithdrawalProver;
    this.notes = {
      prepare: (input) => this.prepareNote(input),
      recover: () => this.recoverNotes()
    };
    this.balance = {
      read: () => this.readBalance()
    };
    this.withdrawals = {
      prepare: (input) => this.prepareWithdrawal(input)
    };
  }

  private async prepareNote(input: { amountWei: string; now?: string }): Promise<PreparedNullarkNote> {
    const issuedAt = input.now ?? new Date().toISOString();
    const walletSignature = await this.signer.signTypedData(
      buildUnlockPrivateBalanceTypedData({
        wallet: this.wallet,
        chainId: this.runtime.chainId,
        pool: this.runtime.pool,
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt
      })
    );
    const prepared = await prepareDepositNote({
      runtime: this.runtime,
      walletSignature,
      amountWei: input.amountWei,
      now: issuedAt,
      ...(this.randomBytes ? { randomBytes: this.randomBytes } : {})
    });
    const { spendMaterial: _spendMaterial, ...publicPrepared } = prepared;
    return publicPrepared;
  }

  private async recoverNotes(): Promise<PrintableRecoveredNoteSummary[]> {
    const notes = this.recoverWalletNotesAdapter
      ? await this.recoverWalletNotesAdapter({ wallet: this.wallet })
      : await recoverWalletNotesFromChain({
          runtime: this.runtime,
          wallet: this.wallet,
          signer: this.signer,
          ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {})
        });
    this.recoveredNotes = notes.map((note) => this.assertRecoveredNote(note));
    return toPrintableNoteSummaries(this.recoveredNotes);
  }

  private async readBalance(): Promise<NullarkPrivateBalance> {
    if (this.recoveredNotes.length === 0) {
      await this.recoverNotes();
    }
    const spendable = this.recoveredNotes.filter((note) => !note.summary.spent);
    const total = spendable.reduce((sum, note) => sum + BigInt(note.summary.amountWei), 0n);
    return {
      totalAmountWei: total.toString(),
      spendableCount: spendable.length,
      recoveredCount: this.recoveredNotes.length,
      notes: toPrintableNoteSummaries(spendable)
    };
  }

  private async prepareWithdrawal(input: {
    noteId: string;
    amountWei: string;
    destination: string;
    route: NullarkRoute;
  }): Promise<PreparedNullarkWithdrawal> {
    if (!this.localWithdrawalProver) {
      throw new Error("withdrawals.prepare requires a local withdrawal prover adapter.");
    }
    const destination = assertAddress(input.destination, "Expected withdrawal destination to be an EVM address.");
    if (input.route !== "relayer" && input.route !== "wallet") {
      throw new Error("Expected withdrawal route to be relayer or wallet.");
    }
    const note = this.recoveredNotes.find((candidate) => candidate.summary.id === input.noteId);
    if (!note) {
      throw new Error("Recovered note id is not available. Call notes.recover() first.");
    }
    if (note.summary.spent) {
      throw new Error("Recovered note is already spent.");
    }
    if (!/^[0-9]+$/.test(input.amountWei) || BigInt(input.amountWei) <= 0n) {
      throw new Error("Expected withdrawal amount as positive decimal wei.");
    }
    if (BigInt(input.amountWei) > BigInt(note.summary.amountWei)) {
      throw new Error("Withdrawal amount exceeds the selected recovered note.");
    }

    const feeWei = ((BigInt(input.amountWei) * BigInt(this.runtime.withdrawalFeeBps)) / 10_000n).toString();
    const netAmountWei = (BigInt(input.amountWei) - BigInt(feeWei)).toString();
    const proof = await this.localWithdrawalProver({
      runtime: this.runtime,
      note,
      destination,
      grossAmountWei: input.amountWei,
      feeWei,
      netAmountWei,
      route: input.route
    });
    assertWithdrawalProofTargetsRecoveredNote(proof, note, this.runtime.groth16PublicInputOrder);
    const plan = createWithdrawalPlan({
      runtime: this.runtime,
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      nullifier: proof.nullifier,
      currentRoot: proof.currentRoot,
      destination,
      grossAmountWei: input.amountWei,
      minNetAmountWei: netAmountWei,
      maxFeeWei: feeWei,
      encryptedChangeNote: proof.encryptedChangeNote,
      changeCommitment: proof.changeCommitment
    });

    return {
      route: input.route,
      note: note.summary,
      grossAmountWei: input.amountWei,
      feeWei,
      netAmountWei,
      plan,
      publicEvidence: {
        kind: "withdrawal-prepared",
        chainId: this.runtime.chainId,
        pool: this.runtime.pool,
        noteId: note.summary.id,
        destination,
        grossAmountWei: input.amountWei,
        route: input.route,
        rawProofIncluded: false,
        fullCalldataIncluded: false,
        noteSecretsIncluded: false
      }
    };
  }

  private assertRecoveredNote(note: RecoveredWalletNote): RecoveredWalletNote {
    if (note.spendMaterial.chainId !== this.runtime.chainId || note.spendMaterial.pool.toLowerCase() !== this.runtime.pool.toLowerCase()) {
      throw new Error("Recovered note is not bound to the active runtime.");
    }
    if (note.summary.commitment.toLowerCase() !== note.spendMaterial.commitment.toLowerCase()) {
      throw new Error("Recovered note summary does not match spend material.");
    }
    if (note.summary.amountWei !== note.spendMaterial.noteAmountWei) {
      throw new Error("Recovered note summary amount does not match spend material.");
    }
    return note;
  }
}

function assertWallet(value: string): HexString {
  return assertAddress(value, "Expected Nullark wallet to be an EVM address.");
}

function assertAddress(value: string, message: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error(message);
  }
  return value as HexString;
}

function assertWithdrawalProofTargetsRecoveredNote(
  proof: WithdrawalProofBundle,
  note: RecoveredWalletNote,
  publicInputOrder: readonly NullarkWithdrawPublicInputName[]
): void {
  const proofSpentCommitment = proof.publicInputs[publicInputIndex(publicInputOrder, "spentCommitment")];
  if (
    typeof proofSpentCommitment !== "string" ||
    proofSpentCommitment.toLowerCase() !== note.summary.commitment.toLowerCase()
  ) {
    throw new Error("Withdrawal proof is not bound to the selected recovered note commitment.");
  }

  const proofNoteAmount = proof.publicInputs[publicInputIndex(publicInputOrder, "noteAmount")];
  try {
    if (typeof proofNoteAmount !== "string" || BigInt(proofNoteAmount) !== BigInt(note.summary.amountWei)) {
      throw new Error("mismatch");
    }
  } catch {
    throw new Error("Withdrawal proof is not bound to the selected recovered note amount.");
  }
}

function publicInputIndex(
  publicInputOrder: readonly NullarkWithdrawPublicInputName[],
  name: NullarkWithdrawPublicInputName
): number {
  const index = publicInputOrder.indexOf(name);
  if (index === -1) {
    throw new Error(`Nullark runtime is missing Groth16 public input ${name}.`);
  }
  return index;
}
