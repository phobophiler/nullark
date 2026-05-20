import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";

export type EncryptedNoteV1Action = "deposit" | "private-transfer" | "withdraw" | "withdraw-change";

export type RecoveryAppId = typeof NULLARK_RECOVERY_APP_ID | typeof LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID;

export type SpendMaterialPlaintext = {
  version: "spend-material-v1";
  chainId: number;
  pool: HexString;
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
  blinding: HexString;
  commitment: HexString;
  createdAt: string;
};

export type EncryptedNoteEnvelope = {
  version: 1;
  algorithm: "AES-GCM-256";
  kdf: "HKDF-SHA-256";
  nonce: HexString;
  ciphertext: HexString;
};

export type RecoveryAssociatedData = {
  chainId: number;
  pool: HexString;
  action: EncryptedNoteV1Action;
  commitment: HexString;
  encryptionVersion: 1;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const WALLET_KEY_INFO_PREFIX = "wallet-recovery-v";

export const NULLARK_RECOVERY_APP_ID = "nullark" as const;
export const LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID = "shielded-balance-transfers" as const;

export function makeRecoveryAssociatedData(input: RecoveryAssociatedData): Uint8Array {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new Error("Expected recovery associated data chain ID.");
  }
  if (!isEvmAddress(input.pool)) {
    throw new Error("Expected recovery associated data pool address.");
  }
  if (!isHexBytes32(input.commitment)) {
    throw new Error("Expected recovery associated data commitment.");
  }
  return textEncoder.encode(JSON.stringify(input));
}

export async function deriveWalletRecoveryKey(input: {
  walletSignature: HexString;
  chainId: number;
  pool: HexString;
  appId: RecoveryAppId;
  recoveryVersion: 1;
}): Promise<CryptoKey> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.walletSignature)) {
    throw new Error("Expected wallet recovery signature bytes.");
  }
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new Error("Expected wallet recovery chain ID.");
  }
  if (!isEvmAddress(input.pool)) {
    throw new Error("Expected wallet recovery pool address.");
  }

  const signatureBytes = hexToBytes(input.walletSignature);
  const baseKey = await crypto.subtle.importKey("raw", asArrayBuffer(signatureBytes), "HKDF", false, ["deriveBits"]);
  const recoveryKeyMaterial = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: textEncoder.encode(`${input.appId}:${input.chainId}:${input.pool.toLowerCase()}`),
      info: textEncoder.encode(`${WALLET_KEY_INFO_PREFIX}${input.recoveryVersion}`)
    },
    baseKey,
    256
  );

  return crypto.subtle.importKey("raw", recoveryKeyMaterial, "HKDF", false, ["deriveBits"]);
}

export async function deriveNoteKey(
  recoveryKey: CryptoKey,
  input: { commitment: HexString; epochId: string }
): Promise<CryptoKey> {
  if (!isHexBytes32(input.commitment)) {
    throw new Error("Expected note key commitment.");
  }
  if (!input.epochId) {
    throw new Error("Expected note key recovery epoch.");
  }
  const noteKeyMaterial = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: textEncoder.encode(input.epochId),
      info: textEncoder.encode(`note:${input.commitment.toLowerCase()}`)
    },
    recoveryKey,
    256
  );

  return crypto.subtle.importKey("raw", noteKeyMaterial, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt"
  ]);
}

export async function encryptSpendMaterialEnvelope(input: {
  noteKey: CryptoKey;
  plaintext: SpendMaterialPlaintext;
  aad: Uint8Array;
}): Promise<EncryptedNoteEnvelope> {
  const plaintext = validateSpendMaterialPlaintext(input.plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: asArrayBuffer(input.aad) },
    input.noteKey,
    textEncoder.encode(JSON.stringify(plaintext))
  );

  return {
    version: 1,
    algorithm: "AES-GCM-256",
    kdf: "HKDF-SHA-256",
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(new Uint8Array(encrypted))
  };
}

export async function decryptEncryptedNoteEnvelope(input: {
  noteKey: CryptoKey;
  encrypted: EncryptedNoteEnvelope;
  aad: Uint8Array;
}): Promise<SpendMaterialPlaintext> {
  const encrypted = validateEncryptedNoteEnvelope(input.encrypted);
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(hexToBytes(encrypted.nonce)),
        additionalData: asArrayBuffer(input.aad)
      },
      input.noteKey,
      asArrayBuffer(hexToBytes(encrypted.ciphertext))
    );
    return validateSpendMaterialPlaintext(JSON.parse(textDecoder.decode(decrypted)) as SpendMaterialPlaintext);
  } catch {
    throw new Error("Failed to decrypt encrypted note envelope.");
  }
}

export function serializeEncryptedNoteEnvelopeToHex(envelope: EncryptedNoteEnvelope): HexString {
  const validatedEnvelope = validateEncryptedNoteEnvelope(envelope);
  return bytesToHex(textEncoder.encode(JSON.stringify(validatedEnvelope)));
}

export function parseEncryptedNoteEnvelopeFromHex(value: string): EncryptedNoteEnvelope {
  if (!isHexString(value)) {
    throw new Error("Expected encrypted note envelope hex.");
  }
  try {
    return validateEncryptedNoteEnvelope(JSON.parse(textDecoder.decode(hexToBytes(value))) as EncryptedNoteEnvelope);
  } catch {
    throw new Error("Invalid encrypted note envelope.");
  }
}

function validateEncryptedNoteEnvelope(value: EncryptedNoteEnvelope): EncryptedNoteEnvelope {
  if (
    value.version !== 1 ||
    value.algorithm !== "AES-GCM-256" ||
    value.kdf !== "HKDF-SHA-256" ||
    !isHexString(value.nonce) ||
    hexToBytes(value.nonce).length !== 12 ||
    !isHexString(value.ciphertext) ||
    value.ciphertext === "0x"
  ) {
    throw new Error("Invalid encrypted note envelope.");
  }
  return value;
}

function validateSpendMaterialPlaintext(value: SpendMaterialPlaintext): SpendMaterialPlaintext {
  if (value.version !== "spend-material-v1") {
    throw new Error("Unsupported spend material version.");
  }
  if (!Number.isSafeInteger(value.chainId) || value.chainId <= 0) {
    throw new Error("Invalid spend material chain ID.");
  }
  if (!isEvmAddress(value.pool)) {
    throw new Error("Invalid spend material pool.");
  }
  for (const [label, field] of [
    ["asset ID", value.assetId],
    ["owner commitment", value.ownerCommitment],
    ["note secret", value.noteSecret],
    ["blinding", value.blinding],
    ["commitment", value.commitment]
  ] as const) {
    if (!isHexBytes32(field)) {
      throw new Error(`Invalid spend material ${label}.`);
    }
  }
  if (!/^[0-9]+$/.test(value.noteAmountWei) || BigInt(value.noteAmountWei) <= 0n) {
    throw new Error("Invalid spend material amount.");
  }
  if (!value.createdAt || Number.isNaN(Date.parse(value.createdAt))) {
    throw new Error("Invalid spend material creation time.");
  }
  return value;
}

function hexToBytes(value: string): Uint8Array {
  if (!isHexString(value)) {
    throw new Error("Expected hex bytes.");
  }
  const hex = value.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): HexString {
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
