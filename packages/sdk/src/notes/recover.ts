import type { SignerProvider } from "../adapters/index.js";
import {
  decodeNoteEventLog,
  fetchNoteEventLogs,
  type DecodedNoteEventLog
} from "../recovery/logs.js";
import {
  recoverSpendMaterialFromDecodedNoteEvents,
  type RecoveredSpendMaterial
} from "../recovery/recover.js";
import type { SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";
import { WALLET_RECOVERY_SCOPE_ISSUED_AT, buildUnlockPrivateBalanceTypedData } from "../wallet/unlock.js";
import { encodeNullifierLookupCalldata } from "../withdraw/calldata.js";
import {
  deriveNoteCommitment,
  deriveNullifier,
  type NoteCommitmentInput,
  type NullifierInput
} from "./poseidon.js";

export type PrintableRecoveredNoteSummary = {
  id: string;
  commitment: HexString;
  amountWei: string;
  spent: boolean;
  leafIndex: number;
  transactionHash: HexString;
};

export type RecoveredWalletNote = {
  summary: PrintableRecoveredNoteSummary;
  spendMaterial: SpendMaterialPlaintext;
  nullifier: HexString;
};

export async function recoverWalletNotesFromChain(input: {
  runtime: NullarkCurrentRuntime;
  wallet: string;
  signer: SignerProvider;
  deriveCommitment?: (plaintext: SpendMaterialPlaintext) => Promise<HexString>;
  deriveNullifier?: (input: {
    spendMaterial: SpendMaterialPlaintext;
    leafIndex: number;
    chainId: number;
    pool: HexString;
  }) => Promise<HexString>;
  fetchImpl?: typeof fetch;
  issuedAt?: string;
  logChunkSize?: bigint | number;
}): Promise<RecoveredWalletNote[]> {
  const wallet = assertWallet(input.wallet);
  const fetchImpl = input.fetchImpl ?? fetch;
  const issuedAt = input.issuedAt ?? WALLET_RECOVERY_SCOPE_ISSUED_AT;
  const walletSignature = await input.signer.signTypedData(
    buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: input.runtime.chainId,
      pool: input.runtime.pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
    })
  );
  const logs =
    input.logChunkSize === undefined
      ? await fetchNoteEventLogs({
          runtime: input.runtime,
          fetchImpl
        })
      : await fetchNoteEventLogs({
          runtime: input.runtime,
          fetchImpl,
          logChunkSize: input.logChunkSize
        });
  const decodedEvents = logs.map(decodeNoteEventLog).filter((event): event is DecodedNoteEventLog => event !== null);
  const recovered = await recoverSpendMaterialFromDecodedNoteEvents({
    walletSignature,
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    events: decodedEvents,
    deriveCommitment: input.deriveCommitment ?? deriveCommitmentFromSpendMaterial
  });

  const notes: RecoveredWalletNote[] = [];
  for (const entry of recovered) {
    const nullifier = await (input.deriveNullifier ?? deriveNullifierFromSpendMaterial)({
      spendMaterial: entry.plaintext,
      leafIndex: entry.event.leafIndex,
      chainId: input.runtime.chainId,
      pool: input.runtime.pool
    });
    if (!isHexBytes32(nullifier)) {
      throw new Error("Recovered note nullifier must be bytes32.");
    }
    const spent = await isNullifierSpent({
      runtime: input.runtime,
      fetchImpl,
      nullifier
    });
    notes.push({
      summary: toPrintableSummary(entry, spent),
      spendMaterial: entry.plaintext,
      nullifier
    });
  }

  return notes;
}

function deriveCommitmentFromSpendMaterial(plaintext: SpendMaterialPlaintext): Promise<HexString> {
  return deriveNoteCommitment({
    assetId: plaintext.assetId,
    noteAmountWei: plaintext.noteAmountWei,
    ownerCommitment: plaintext.ownerCommitment,
    noteSecret: plaintext.noteSecret
  } satisfies NoteCommitmentInput);
}

function deriveNullifierFromSpendMaterial(input: {
  spendMaterial: SpendMaterialPlaintext;
  leafIndex: number;
  chainId: number;
  pool: HexString;
}): Promise<HexString> {
  return deriveNullifier({
    noteSecret: input.spendMaterial.noteSecret,
    leafIndex: input.leafIndex,
    chainId: input.chainId,
    verifyingContract: input.pool
  } satisfies NullifierInput);
}

export function toPrintableNoteSummaries(notes: readonly RecoveredWalletNote[]): PrintableRecoveredNoteSummary[] {
  return notes.map((note) => note.summary);
}

async function isNullifierSpent(input: {
  runtime: NullarkCurrentRuntime;
  fetchImpl: typeof fetch;
  nullifier: HexString;
}): Promise<boolean> {
  const result = await rpcRequest<string>(input.fetchImpl, input.runtime.rpcUrl, "eth_call", [
    {
      to: input.runtime.pool,
      data: encodeNullifierLookupCalldata(input.nullifier)
    },
    "latest"
  ]);
  if (!isHexString(result)) {
    throw new Error("Expected nullifier lookup eth_call result.");
  }
  return BigInt(result) !== 0n;
}

async function rpcRequest<T>(fetchImpl: typeof fetch, rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) {
    throw new Error(`MegaETH RPC ${method} returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `MegaETH RPC ${method} failed.`);
  }
  if (body.result === undefined) {
    throw new Error(`MegaETH RPC ${method} returned no result.`);
  }
  return body.result;
}

function toPrintableSummary(entry: RecoveredSpendMaterial, spent: boolean): PrintableRecoveredNoteSummary {
  return {
    id: `note_${entry.event.commitment.slice(2, 10)}_${entry.event.leafIndex.toString()}`,
    commitment: entry.event.commitment,
    amountWei: entry.plaintext.noteAmountWei,
    spent,
    leafIndex: entry.event.leafIndex,
    transactionHash: entry.event.transactionHash
  };
}

function assertWallet(value: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error("Expected wallet address for note recovery.");
  }
  return value as HexString;
}
