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
import { deriveNoteCommitment, deriveNullifier } from "../notes/poseidon.js";
import {
  importRecoveryKitV1ToSpendableNote
} from "../recovery/recoveryKit.js";
import type {
  NullarkCurrentRuntime,
  NullarkWithdrawPublicInputName,
  RuntimeFeeReadContractClient,
  RuntimeWithdrawalFeeState
} from "../runtime/current.js";
import {
  NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2,
  assertRuntime,
  readRuntimeWithdrawalFeeStateFromPool,
  resolveRuntimeWithdrawalFeeState
} from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";
import { buildUnlockPrivateBalanceTypedData } from "../wallet/unlock.js";
import { encodeNullifierLookupCalldata } from "../withdraw/calldata.js";
import {
  createV12UnlinkableWithdrawalPlan,
  createWithdrawalPlan,
  type WithdrawalPlan,
  type WithdrawalProofBundle
} from "../withdraw/plan.js";

export type NullarkRoute = "relayer" | "wallet";

/**
 * Secret-bearing local prover boundary.
 *
 * This callback receives the selected recovered note, including spend material
 * needed to build a withdrawal proof. It must run in-process or inside another
 * trusted local app environment. Do not implement this callback as a remote
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
  proofContextShape: "v1.1" | "v1.2-fee-governance";
  route: NullarkRoute;
}) => Promise<
  WithdrawalProofBundle & {
    encryptedChangeNote?: HexString;
    changeCommitment?: HexString;
    encryptedOutputNote?: HexString;
    outputCommitment?: HexString;
  }
>;

export type NullarkClientOptions = {
  runtime: NullarkCurrentRuntime;
  wallet: string;
  signer: SignerProvider;
  fetchImpl?: typeof fetch;
  randomBytes?: (length: number) => Uint8Array;
  recoverWalletNotes?: (input: { wallet: HexString }) => Promise<RecoveredWalletNote[]>;
  recoveryKitNullifierStatus?: (input: { nullifier: HexString }) => Promise<boolean>;
  localWithdrawalProver?: LocalWithdrawalProver;
  runtimeFeeReadClient?: RuntimeFeeReadContractClient;
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
    importRecoveryKit: (input: { serializedKit: string }) => Promise<PrintableRecoveredNoteSummary>;
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
      maxFeeWei?: string;
      minNetAmountWei?: string;
    }) => Promise<PreparedNullarkWithdrawal>;
  };

  private readonly runtime: NullarkCurrentRuntime;
  private readonly wallet: HexString;
  private readonly signer: SignerProvider;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly randomBytes: ((length: number) => Uint8Array) | undefined;
  private readonly recoverWalletNotesAdapter: ((input: { wallet: HexString }) => Promise<RecoveredWalletNote[]>) | undefined;
  private readonly recoveryKitNullifierStatus:
    | ((input: { nullifier: HexString }) => Promise<boolean>)
    | undefined;
  private readonly localWithdrawalProver?: NullarkClientOptions["localWithdrawalProver"];
  private readonly runtimeFeeReadClient: RuntimeFeeReadContractClient | undefined;
  private recoveredNotes: RecoveredWalletNote[] = [];

  constructor(options: NullarkClientOptions) {
    this.runtime = assertRuntime(options.runtime);
    this.wallet = assertWallet(options.wallet);
    this.signer = options.signer;
    this.fetchImpl = options.fetchImpl;
    this.randomBytes = options.randomBytes;
    this.recoverWalletNotesAdapter = options.recoverWalletNotes;
    this.recoveryKitNullifierStatus = options.recoveryKitNullifierStatus;
    this.localWithdrawalProver = options.localWithdrawalProver;
    this.runtimeFeeReadClient = options.runtimeFeeReadClient;
    this.notes = {
      prepare: (input) => this.prepareNote(input),
      recover: () => this.recoverNotes(),
      importRecoveryKit: (input) => this.importRecoveryKit(input)
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

  private async importRecoveryKit(input: { serializedKit: string }): Promise<PrintableRecoveredNoteSummary> {
    const note = await importRecoveryKitV1ToSpendableNote({
      serializedKit: input.serializedKit,
      runtime: this.runtime,
      deriveCommitment: async (spendMaterial) =>
        deriveNoteCommitment({
          assetId: spendMaterial.assetId,
          noteAmountWei: spendMaterial.noteAmountWei,
          ownerCommitment: spendMaterial.ownerCommitment,
          noteSecret: spendMaterial.noteSecret
        }),
      deriveNullifier: async ({ spendMaterial, leafIndex, chainId, pool }) =>
        deriveNullifier({
          noteSecret: spendMaterial.noteSecret,
          leafIndex,
          chainId,
          verifyingContract: pool
        }),
      isNullifierSpent: (nullifier) => this.isRecoveryKitNullifierSpent(nullifier)
    });
    const recovered = this.assertRecoveredNote(note);
    this.recoveredNotes = [
      ...this.recoveredNotes.filter((candidate) => candidate.summary.id !== recovered.summary.id),
      recovered
    ];
    return recovered.summary;
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
    maxFeeWei?: string;
    minNetAmountWei?: string;
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

    const feeState = await this.resolveWithdrawalFeeState();
    const proofRuntime = runtimeWithWithdrawalFeeState(this.runtime, feeState);
    const grossAmount = BigInt(input.amountWei);
    const fee = (grossAmount * BigInt(feeState.activeFeeBps)) / 10_000n;
    const netAmount = grossAmount - fee;
    if (input.maxFeeWei !== undefined && fee > parseDecimalWei(input.maxFeeWei, "Expected maximum fee as decimal wei.")) {
      throw new Error("withdrawal fee exceeds user maximum");
    }
    if (
      input.minNetAmountWei !== undefined &&
      netAmount < parseDecimalWei(input.minNetAmountWei, "Expected minimum net amount as decimal wei.")
    ) {
      throw new Error("withdrawal net amount is below user minimum");
    }
    const feeWei = fee.toString();
    const netAmountWei = netAmount.toString();
    const proof = await this.localWithdrawalProver({
      runtime: proofRuntime,
      note,
      destination,
      grossAmountWei: input.amountWei,
      feeWei,
      netAmountWei,
      proofContextShape: feeState.source === "on-chain-feeBps" ? "v1.2-fee-governance" : "v1.1",
      route: input.route
    });
    assertWithdrawalProofMatchesRuntime(proof, note, proofRuntime, destination, input.amountWei, feeWei);
    const plan = createWithdrawalPlanForRuntime({
      runtime: proofRuntime,
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      nullifier: proof.nullifier,
      currentRoot: proof.currentRoot,
      destination,
      grossAmountWei: input.amountWei,
      minNetAmountWei: netAmountWei,
      maxFeeWei: feeWei,
      encryptedChangeNote: proof.encryptedChangeNote,
      changeCommitment: proof.changeCommitment,
      encryptedOutputNote: proof.encryptedOutputNote,
      outputCommitment: proof.outputCommitment
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

  private resolveWithdrawalFeeState(): Promise<RuntimeWithdrawalFeeState> | RuntimeWithdrawalFeeState {
    if (!this.runtime.feePolicy) {
      return resolveRuntimeWithdrawalFeeState(this.runtime);
    }
    if (!this.runtimeFeeReadClient) {
      throw new Error("withdrawals.prepare requires a runtime fee read client for v1.2 fee-governed runtime.");
    }
    return readRuntimeWithdrawalFeeStateFromPool(this.runtime, this.runtimeFeeReadClient);
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

  private async isRecoveryKitNullifierSpent(nullifier: HexString): Promise<boolean> {
    if (this.recoveryKitNullifierStatus) {
      return this.recoveryKitNullifierStatus({ nullifier });
    }
    const rpc = makeRpcClient(this.runtime.rpcUrl, this.fetchImpl ?? fetch);
    const chainIdHex = await rpc<string>("eth_chainId", []);
    if (BigInt(chainIdHex) !== BigInt(this.runtime.chainId)) {
      throw new Error("Recovery kit status RPC is not connected to the active MegaETH chain.");
    }
    const result = await rpc<string>("eth_call", [
      {
        to: this.runtime.pool,
        data: encodeNullifierLookupCalldata(nullifier)
      },
      "latest"
    ]);
    return BigInt(assertHexRpcResult(result, "recovery kit nullifier status")) !== 0n;
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

function runtimeWithWithdrawalFeeState(runtime: NullarkCurrentRuntime, feeState: RuntimeWithdrawalFeeState): NullarkCurrentRuntime {
  if (!runtime.feePolicy) {
    return runtime;
  }
  return {
    ...runtime,
    withdrawalFeeBps: feeState.activeFeeBps,
    maxWithdrawalFeeBps: feeState.maxFeeBps,
    feePolicy: {
      ...runtime.feePolicy,
      activeFeeBps: feeState.activeFeeBps,
      maxFeeBps: feeState.maxFeeBps,
      pendingFeeState: {
        pendingFeeBps: feeState.pendingFeeBps ?? null,
        pendingFeeActivationTime: feeState.pendingFeeActivationTime ?? null,
        source: "on-chain-feeBps"
      }
    }
  };
}

function parseDecimalWei(value: string, message: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(message);
  }
  return BigInt(value);
}

function createWithdrawalPlanForRuntime(input: {
  runtime: NullarkCurrentRuntime;
  proof: HexString;
  publicInputs: readonly HexString[];
  nullifier: HexString;
  currentRoot: HexString;
  destination: HexString;
  grossAmountWei: string;
  minNetAmountWei: string;
  maxFeeWei: string;
  encryptedChangeNote?: HexString | undefined;
  changeCommitment?: HexString | undefined;
  encryptedOutputNote?: HexString | undefined;
  outputCommitment?: HexString | undefined;
}): WithdrawalPlan {
  if (!isV12UnlinkableRuntime(input.runtime)) {
    return createWithdrawalPlan(input);
  }

  if (input.encryptedOutputNote === undefined) {
    throw new Error("v1.2 withdrawal prover must return encryptedOutputNote.");
  }

  return createV12UnlinkableWithdrawalPlan({
    runtime: input.runtime,
    proof: input.proof,
    publicInputs: input.publicInputs,
    nullifier: input.nullifier,
    currentRoot: input.currentRoot,
    destination: input.destination,
    grossAmountWei: input.grossAmountWei,
    minNetAmountWei: input.minNetAmountWei,
    maxFeeWei: input.maxFeeWei,
    encryptedOutputNote: input.encryptedOutputNote,
    outputCommitment: input.outputCommitment
  });
}

function assertWithdrawalProofMatchesRuntime(
  proof: WithdrawalProofBundle,
  note: RecoveredWalletNote,
  runtime: NullarkCurrentRuntime,
  destination: HexString,
  grossAmountWei: string,
  expectedFeeWei: string
): void {
  const publicInputOrder = runtime.groth16PublicInputOrder;
  if (proof.publicInputs.length !== publicInputOrder.length) {
    throw new Error("Withdrawal proof public input count does not match the active runtime.");
  }

  const proofRoot = publicInputValue(proof, publicInputOrder, "root");
  if (proofRoot.toLowerCase() !== proof.currentRoot.toLowerCase()) {
    throw new Error("Withdrawal proof root does not match the current pool root.");
  }

  const proofNullifier = publicInputValue(proof, publicInputOrder, "nullifier");
  if (proofNullifier.toLowerCase() !== proof.nullifier.toLowerCase()) {
    throw new Error("Withdrawal nullifier does not match public inputs.");
  }

  const proofDestination = publicInputValue(proof, publicInputOrder, "destination");
  if (bytes32ToEvmAddress(proofDestination).toLowerCase() !== destination.toLowerCase()) {
    throw new Error("Withdrawal destination does not match public inputs.");
  }

  const proofGrossAmount = publicInputValue(proof, publicInputOrder, "grossAmount");
  if (BigInt(proofGrossAmount) !== BigInt(grossAmountWei)) {
    throw new Error("Withdrawal amount does not match public inputs.");
  }

  const proofFee = proof.publicInputs[publicInputIndex(publicInputOrder, "fee")];
  try {
    if (typeof proofFee !== "string" || BigInt(proofFee) !== BigInt(expectedFeeWei)) {
      throw new Error("mismatch");
    }
  } catch {
    throw new Error("Withdrawal proof fee does not match the active runtime fee.");
  }

  const proofChainId = publicInputValue(proof, publicInputOrder, "chainId");
  if (BigInt(proofChainId) !== BigInt(runtime.chainId)) {
    throw new Error("Withdrawal proof is not bound to the active MegaETH chain.");
  }

  const proofVerifyingContract = publicInputValue(proof, publicInputOrder, "verifyingContract");
  if (bytes32ToEvmAddress(proofVerifyingContract).toLowerCase() !== runtime.pool.toLowerCase()) {
    throw new Error("Withdrawal proof is not bound to this shielded pool.");
  }

  const proofContextHash = publicInputValue(proof, publicInputOrder, "proofContextHash");
  if (proofContextHash === `0x${"0".repeat(64)}`) {
    throw new Error("Withdrawal proof must bind a nonzero proof context hash.");
  }

  const encryptedNoteHashName = isV12UnlinkableRuntime(runtime) ? "encryptedOutputNoteHash" : "encryptedNoteHash";
  const encryptedNoteHash = publicInputValue(proof, publicInputOrder, encryptedNoteHashName);
  if (encryptedNoteHash === `0x${"0".repeat(64)}`) {
    throw new Error("Withdrawal proof must bind a nonzero encrypted note hash.");
  }

  if (isV12UnlinkableRuntime(runtime)) {
    return;
  }

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

function isV12UnlinkableRuntime(runtime: NullarkCurrentRuntime): boolean {
  return (
    runtime.schema === "nullark-sdk-runtime-v1-2-candidate-v1" &&
    runtime.productVersion.startsWith("nullark-v1.2") &&
    runtime.groth16PublicInputOrder.length === NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2.length &&
    runtime.groth16PublicInputOrder.every((name, index) => name === NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2[index])
  );
}

function publicInputValue(
  proof: WithdrawalProofBundle,
  publicInputOrder: readonly NullarkWithdrawPublicInputName[],
  name: NullarkWithdrawPublicInputName
): HexString {
  const value = proof.publicInputs[publicInputIndex(publicInputOrder, name)];
  if (typeof value !== "string" || !isHexBytes32(value)) {
    throw new Error(`Withdrawal proof ${name} public input must be bytes32.`);
  }
  return value;
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

function bytes32ToEvmAddress(value: string): HexString {
  return `0x${value.slice(-40).toLowerCase()}`;
}

type JsonRpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

function makeRpcClient(rpcUrl: string, fetchImpl: typeof fetch): <T>(method: string, params: unknown[]) => Promise<T> {
  let id = 0;
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    id += 1;
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    if (!response.ok) {
      throw new Error(`Recovery kit status RPC returned HTTP ${response.status}.`);
    }
    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new Error(body.error.message ?? "Recovery kit status RPC error.");
    }
    if (body.result === undefined) {
      throw new Error("Recovery kit status RPC returned no result.");
    }
    return body.result;
  };
}

function assertHexRpcResult(value: string, label: string): HexString {
  if (!isHexString(value)) {
    throw new Error(`Expected ${label} hex result.`);
  }
  return value as HexString;
}
