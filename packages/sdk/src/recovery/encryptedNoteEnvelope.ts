import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";

export type EncryptedNoteV1Action = "deposit" | "private-transfer" | "withdraw" | "withdraw-change" | "withdraw-output";

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

export type EncryptedOutputNoteV2Envelope = {
  version: 2;
  domain: typeof ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN;
  chainId: 4326 | 6343;
  verifyingContract: HexString;
  action: "withdraw-output";
  outputCommitment: HexString;
  proofContextHash: HexString;
  ephemeralPublicKey: HexString;
  nonce: HexString;
  ciphertext: HexString;
  ciphertextByteLength: number;
  paddingBytes: HexString;
  paddingByteLength: number;
  paddedCiphertextByteLength: number;
};

export type EncryptedOutputNoteV2CheckContext = {
  chainId?: 4326 | 6343;
  verifyingContract?: HexString;
  outputCommitment?: HexString;
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
export const ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN = "nullark.encrypted-output-note.v2" as const;
export const ENCRYPTED_OUTPUT_NOTE_V2_PADDED_CIPHERTEXT_BYTES = 256;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const ZERO_BYTES24 = `0x${"0".repeat(48)}` as const;
const ENCRYPTED_OUTPUT_NOTE_V2_FIELDS = [
  "version",
  "domain",
  "chainId",
  "verifyingContract",
  "action",
  "outputCommitment",
  "proofContextHash",
  "ephemeralPublicKey",
  "nonce",
  "ciphertext",
  "ciphertextByteLength",
  "paddingBytes",
  "paddingByteLength",
  "paddedCiphertextByteLength"
] as const;

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

export function createEncryptedOutputNoteV2Envelope(input: {
  chainId: 4326 | 6343;
  verifyingContract: HexString;
  outputCommitment: HexString;
  ciphertext: HexString;
  ephemeralPublicKey?: HexString;
  nonce?: HexString;
  paddedCiphertextByteLength?: number;
}): EncryptedOutputNoteV2Envelope {
  const ciphertext = requireNonEmptyEvenHex(input.ciphertext, "Encrypted output note V2 ciphertext");
  const paddedCiphertextByteLength = input.paddedCiphertextByteLength ?? ENCRYPTED_OUTPUT_NOTE_V2_PADDED_CIPHERTEXT_BYTES;
  const ciphertextByteLength = hexByteLength(ciphertext);
  if (ciphertextByteLength > paddedCiphertextByteLength) {
    throw new Error("Encrypted output note V2 ciphertext exceeds fixed padded length.");
  }
  const paddingByteLength = paddedCiphertextByteLength - ciphertextByteLength;

  return {
    version: 2,
    domain: ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN,
    chainId: requireMegaEthChainId(input.chainId),
    verifyingContract: requireAddress(input.verifyingContract, "Encrypted output note V2 verifying contract"),
    action: "withdraw-output",
    outputCommitment: requireBytes32(input.outputCommitment, "Encrypted output note V2 output commitment"),
    proofContextHash: ZERO_BYTES32,
    ephemeralPublicKey: input.ephemeralPublicKey
      ? requireBytes32(input.ephemeralPublicKey, "Encrypted output note V2 ephemeral public key")
      : ZERO_BYTES32,
    nonce: input.nonce ? requireBytes24(input.nonce, "Encrypted output note V2 nonce") : ZERO_BYTES24,
    ciphertext,
    ciphertextByteLength,
    paddingBytes: `0x${"00".repeat(paddingByteLength)}`,
    paddingByteLength,
    paddedCiphertextByteLength
  };
}

export function serializeEncryptedOutputNoteV2EnvelopeToHex(envelope: EncryptedOutputNoteV2Envelope): HexString {
  return bytesToHex(textEncoder.encode(JSON.stringify(validateEncryptedOutputNoteV2Envelope(envelope))));
}

export function parseEncryptedOutputNoteV2EnvelopeFromHex(
  value: string,
  checks: EncryptedOutputNoteV2CheckContext = {}
): EncryptedOutputNoteV2Envelope {
  if (!isHexString(value)) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  try {
    return validateEncryptedOutputNoteV2Envelope(
      JSON.parse(textDecoder.decode(hexToBytes(value))) as EncryptedOutputNoteV2Envelope,
      checks
    );
  } catch {
    throw new Error("Invalid encrypted output note V2 envelope.");
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

function validateEncryptedOutputNoteV2Envelope(
  value: EncryptedOutputNoteV2Envelope,
  checks: EncryptedOutputNoteV2CheckContext = {}
): EncryptedOutputNoteV2Envelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  const envelope = value as Record<string, unknown>;
  for (const key of Object.keys(envelope)) {
    if (!(ENCRYPTED_OUTPUT_NOTE_V2_FIELDS as readonly string[]).includes(key)) {
      throw new Error("Invalid encrypted output note V2 envelope.");
    }
  }
  const normalized: EncryptedOutputNoteV2Envelope = {
    version: requireLiteral(envelope.version, 2),
    domain: requireLiteral(envelope.domain, ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN),
    chainId: requireMegaEthChainId(envelope.chainId),
    verifyingContract: requireAddress(envelope.verifyingContract, "Encrypted output note V2 verifying contract"),
    action: requireLiteral(envelope.action, "withdraw-output"),
    outputCommitment: requireBytes32(envelope.outputCommitment, "Encrypted output note V2 output commitment"),
    proofContextHash: requireBytes32(envelope.proofContextHash, "Encrypted output note V2 proof context hash"),
    ephemeralPublicKey: requireBytes32(envelope.ephemeralPublicKey, "Encrypted output note V2 ephemeral public key"),
    nonce: requireBytes24(envelope.nonce, "Encrypted output note V2 nonce"),
    ciphertext: requireNonEmptyEvenHex(envelope.ciphertext, "Encrypted output note V2 ciphertext"),
    ciphertextByteLength: requireNonnegativeSafeInteger(envelope.ciphertextByteLength),
    paddingBytes: requireEvenHex(envelope.paddingBytes, "Encrypted output note V2 padding bytes"),
    paddingByteLength: requireNonnegativeSafeInteger(envelope.paddingByteLength),
    paddedCiphertextByteLength: requireNonnegativeSafeInteger(envelope.paddedCiphertextByteLength)
  };

  if (hexByteLength(normalized.ciphertext) !== normalized.ciphertextByteLength) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (hexByteLength(normalized.paddingBytes) !== normalized.paddingByteLength) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (normalized.ciphertextByteLength + normalized.paddingByteLength !== normalized.paddedCiphertextByteLength) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (normalized.paddedCiphertextByteLength !== ENCRYPTED_OUTPUT_NOTE_V2_PADDED_CIPHERTEXT_BYTES) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (!/^0x(?:00)*$/.test(normalized.paddingBytes)) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (checks.chainId !== undefined && normalized.chainId !== checks.chainId) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (
    checks.verifyingContract !== undefined &&
    normalized.verifyingContract.toLowerCase() !== checks.verifyingContract.toLowerCase()
  ) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  if (
    checks.outputCommitment !== undefined &&
    normalized.outputCommitment.toLowerCase() !== checks.outputCommitment.toLowerCase()
  ) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }

  return normalized;
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

function requireLiteral<T extends string | number>(value: unknown, expected: T): T {
  if (value !== expected) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  return expected;
}

function requireMegaEthChainId(value: unknown): 4326 | 6343 {
  if (value !== 4326 && value !== 6343) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  return value;
}

function requireAddress(value: unknown, label: string): HexString {
  if (typeof value !== "string" || !isEvmAddress(value)) {
    throw new Error(`${label} must be an EVM address.`);
  }
  return value.toLowerCase() as HexString;
}

function requireBytes32(value: unknown, label: string): HexString {
  if (typeof value !== "string" || !isHexBytes32(value)) {
    throw new Error(`${label} must be bytes32 hex.`);
  }
  return value.toLowerCase() as HexString;
}

function requireBytes24(value: unknown, label: string): HexString {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{48}$/.test(value)) {
    throw new Error(`${label} must be bytes24 hex.`);
  }
  return value.toLowerCase() as HexString;
}

function requireEvenHex(value: unknown, label: string): HexString {
  if (typeof value !== "string" || !isHexString(value)) {
    throw new Error(`${label} must be even-length hex bytes.`);
  }
  return value.toLowerCase() as HexString;
}

function requireNonEmptyEvenHex(value: unknown, label: string): HexString {
  const hex = requireEvenHex(value, label);
  if (hex === "0x") {
    throw new Error(`${label} must be nonempty even-length hex bytes.`);
  }
  return hex;
}

function requireNonnegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Invalid encrypted output note V2 envelope.");
  }
  return value as number;
}

function hexByteLength(value: HexString): number {
  return (value.length - 2) / 2;
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
