import { encodeFunctionData } from "viem";
import type { PreparedTransactionRequest } from "../adapters/index.js";
import { deriveNoteCommitment } from "../notes/poseidon.js";
import {
  encryptSpendMaterialEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  makeRecoveryAssociatedData,
  NULLARK_RECOVERY_APP_ID,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import { getNullarkRecoveryEpochId } from "../recovery/recover.js";
import { assertRuntime, type NullarkCurrentRuntime } from "../runtime/current.js";
import { isHexString, type HexString } from "../types.js";

export const NULLARK_NATIVE_ETH_ASSET_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

export type DepositTransactionRequest = Omit<PreparedTransactionRequest, "value"> & {
  value: bigint;
};

export type PreparedDepositNote = {
  commitment: HexString;
  encryptedNote: HexString;
  spendMaterial: SpendMaterialPlaintext;
  transaction: DepositTransactionRequest;
  publicEvidence: {
    kind: "deposit-note-prepared";
    chainId: number;
    pool: HexString;
    commitment: HexString;
    amountWei: string;
    encryptedNotePresent: boolean;
    privateKeysIncluded: false;
    noteSecretsIncluded: false;
  };
};

const DEPOSIT_WITH_ENCRYPTED_NOTE_ABI = [
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

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export async function prepareDepositNote(input: {
  runtime: NullarkCurrentRuntime;
  walletSignature: HexString;
  amountWei: string;
  now?: string;
  randomBytes?: (length: number) => Uint8Array;
}): Promise<PreparedDepositNote> {
  const runtime = assertRuntime(input.runtime);
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.walletSignature)) {
    throw new Error("Expected wallet recovery signature bytes.");
  }
  if (!/^[0-9]+$/.test(input.amountWei) || BigInt(input.amountWei) <= 0n) {
    throw new Error("Expected deposit amount as positive decimal wei.");
  }
  const now = input.now ?? new Date().toISOString();
  if (!now || Number.isNaN(Date.parse(now))) {
    throw new Error("Expected deposit creation time.");
  }
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;
  const ownerCommitment = randomField(randomBytes);
  const noteSecret = randomField(randomBytes);
  const blinding = randomField(randomBytes);
  const commitment = await deriveNoteCommitment({
    assetId: NULLARK_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret
  });
  const spendMaterial: SpendMaterialPlaintext = {
    version: "spend-material-v1",
    chainId: runtime.chainId,
    pool: runtime.pool,
    assetId: NULLARK_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret,
    blinding,
    commitment,
    createdAt: now
  };
  const recoveryKey = await deriveWalletRecoveryKey({
    walletSignature: input.walletSignature,
    chainId: runtime.chainId,
    pool: runtime.pool,
    appId: NULLARK_RECOVERY_APP_ID,
    recoveryVersion: 1
  });
  const noteKey = await deriveNoteKey(recoveryKey, {
    commitment,
    epochId: getNullarkRecoveryEpochId(runtime.chainId)
  });
  const encryptedEnvelope = await encryptSpendMaterialEnvelope({
    noteKey,
    plaintext: spendMaterial,
    aad: makeRecoveryAssociatedData({
      chainId: runtime.chainId,
      pool: runtime.pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    })
  });
  const encryptedNote = serializeEncryptedNoteEnvelopeToHex(encryptedEnvelope);
  const transaction: DepositTransactionRequest = {
    chainId: runtime.chainId,
    to: runtime.pool,
    value: BigInt(input.amountWei),
    data: encodeFunctionData({
      abi: DEPOSIT_WITH_ENCRYPTED_NOTE_ABI,
      functionName: "deposit",
      args: [commitment, encryptedNote]
    })
  };

  return {
    commitment,
    encryptedNote,
    spendMaterial,
    transaction,
    publicEvidence: {
      kind: "deposit-note-prepared",
      chainId: runtime.chainId,
      pool: runtime.pool,
      commitment,
      amountWei: input.amountWei,
      encryptedNotePresent: encryptedNote !== "0x",
      privateKeysIncluded: false,
      noteSecretsIncluded: false
    }
  };
}

function randomField(randomBytes: (length: number) => Uint8Array): HexString {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const bytes = randomBytes(32);
    if (bytes.length !== 32) {
      throw new Error("Expected randomBytes(32) to return 32 bytes.");
    }
    const hex = bytesToHex(bytes);
    const value = BigInt(hex);
    if (value > 0n && value < BN254_SCALAR_FIELD) {
      return hex;
    }
  }
  throw new Error("Unable to sample a BN254 field element.");
}

function cryptoRandomBytes(length: number): Uint8Array {
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error("Crypto randomness is unavailable.");
  }
  return cryptoProvider.getRandomValues(new Uint8Array(length));
}

function bytesToHex(bytes: Uint8Array): HexString {
  const value = `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  if (!isHexString(value)) {
    throw new Error("Expected generated bytes to be hex.");
  }
  return value;
}
