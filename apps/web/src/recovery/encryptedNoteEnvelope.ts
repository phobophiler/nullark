import {
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  ZERO_BYTES32,
  createEncryptedNoteV1,
  createProofContextV1,
  createRelayerPolicyV1,
  hashEncryptedNoteV1,
  hashProofContextV1,
  hashRelayerPolicyV1
} from "@nullark/core";

export type HexString = `0x${string}`;

export type EncryptedNoteV1Action = "deposit" | "private-transfer" | "withdraw" | "withdraw-change";

export type EncryptedNoteV1 = {
  version: 1;
  chainId: 6343 | 4326;
  pool: HexString;
  action: EncryptedNoteV1Action;
  commitment: HexString;
  leafIndex: string;
  amount: string;
  assetConvention: "native-eth-v1";
  recipientCiphertext: HexString;
  senderRecoveryCiphertext: HexString;
  nonceOrCounter: HexString | string;
  associatedDataHash: HexString;
};

export type EncryptedNoteV1CheckContext = {
  chainId?: 6343 | 4326;
  pool?: HexString;
  action?: EncryptedNoteV1Action;
  commitment?: HexString;
  leafIndex?: string;
  supportedAmountsWei?: readonly (bigint | string)[];
};

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

export type StageBRelayerPolicyInput = {
  relayer: HexString;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  deadlineOrZero: bigint;
};

export type StageBWithdrawPublicExitPreflightInput = {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  root: HexString;
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  fee: bigint;
  noteAmount: bigint;
  relayerPolicy: StageBRelayerPolicyInput;
  changeCommitment?: HexString;
  encryptedChangeNote?: HexString;
};

export type StageBWithdrawPublicExitHashes = {
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  proofContextHash: HexString;
};

export type StageBWithdrawPublicExitPreflightCheck = StageBWithdrawPublicExitPreflightInput & {
  encryptedNoteHash: HexString;
  proofContextHash: HexString;
  relayerPolicyHash?: HexString;
};

export type StageCWithdrawChangeNotePreflightInput = {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  root: HexString;
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  fee: bigint;
  noteAmount: bigint;
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
  relayerPolicy: StageBRelayerPolicyInput;
  outputCommitments?: readonly HexString[];
  encryptedChangeNotes?: readonly HexString[];
  changeAmounts?: readonly bigint[];
};

export type StageCWithdrawChangeNoteHashes = {
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  proofContextHash: HexString;
};

export type StageCWithdrawChangeNotePreflightCheck = StageCWithdrawChangeNotePreflightInput & {
  encryptedNoteHash: HexString;
  proofContextHash: HexString;
  relayerPolicyHash?: HexString;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const WALLET_KEY_INFO_PREFIX = "wallet-recovery-v";
export const NULLARK_RECOVERY_APP_ID = "nullark" as const;
export const LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID = "shielded-balance-transfers" as const;
export type RecoveryAppId =
  | typeof NULLARK_RECOVERY_APP_ID
  | typeof LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID;
export const ENCRYPTED_NOTE_V1_HASH_SCOPE = "client-indexer-relayer-only";
export const ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES = 2048;
export const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506" as const;

const ENCRYPTED_NOTE_V1_FIELDS = [
  "version",
  "chainId",
  "pool",
  "action",
  "commitment",
  "leafIndex",
  "amount",
  "assetConvention",
  "recipientCiphertext",
  "senderRecoveryCiphertext",
  "nonceOrCounter",
  "associatedDataHash"
] as const;
const ENCRYPTED_NOTE_V1_ACTIONS = new Set<EncryptedNoteV1Action>([
  "deposit",
  "private-transfer",
  "withdraw",
  "withdraw-change"
]);
const DEFAULT_SUPPORTED_AMOUNTS_WEI = new Set(MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI.map((amount) => amount.toString()));
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const EVEN_HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})+$/;
const UINT_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

export function makeRecoveryAssociatedData(input: RecoveryAssociatedData): Uint8Array {
  return textEncoder.encode(JSON.stringify(input));
}

export async function deriveWalletRecoveryKey(input: {
  walletSignature: HexString;
  chainId: number;
  pool: HexString;
  appId: RecoveryAppId;
  recoveryVersion: 1;
}): Promise<CryptoKey> {
  const signatureBytes = hexToBytes(input.walletSignature);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(signatureBytes),
    "HKDF",
    false,
    ["deriveBits"]
  );

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

  return crypto.subtle.importKey("raw", asArrayBuffer(new Uint8Array(recoveryKeyMaterial)), "HKDF", false, [
    "deriveBits"
  ]);
}

export async function deriveNoteKey(
  recoveryKey: CryptoKey,
  input: { commitment: HexString; epochId: string }
): Promise<CryptoKey> {
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

  return crypto.subtle.importKey(
    "raw",
    asArrayBuffer(new Uint8Array(noteKeyMaterial)),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSpendMaterialEnvelope(input: {
  noteKey: CryptoKey;
  plaintext: SpendMaterialPlaintext;
  aad: Uint8Array;
}): Promise<EncryptedNoteEnvelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = textEncoder.encode(JSON.stringify(input.plaintext));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: asArrayBuffer(input.aad) },
    input.noteKey,
    encodedPlaintext
  );

  return {
    version: 1,
    algorithm: "AES-GCM-256",
    kdf: "HKDF-SHA-256",
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(new Uint8Array(encrypted))
  };
}

export function serializeEncryptedNoteEnvelopeToHex(envelope: EncryptedNoteEnvelope): HexString {
  const validatedEnvelope = validateEncryptedNoteEnvelope(envelope);
  return bytesToHex(
    textEncoder.encode(
      JSON.stringify({
        version: validatedEnvelope.version,
        algorithm: validatedEnvelope.algorithm,
        kdf: validatedEnvelope.kdf,
        nonce: validatedEnvelope.nonce,
        ciphertext: validatedEnvelope.ciphertext
      })
    )
  );
}

export function parseEncryptedNoteEnvelopeFromHex(hex: HexString): EncryptedNoteEnvelope {
  const decoded = textDecoder.decode(hexToBytes(hex));
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Encrypted note envelope is not valid JSON.");
  }

  return validateEncryptedNoteEnvelope(parsed);
}

export function serializeEncryptedNoteV1ToHex(envelope: EncryptedNoteV1): HexString {
  const validatedEnvelope = validateEncryptedNoteV1Envelope(envelope);
  return bytesToHex(textEncoder.encode(serializeEncryptedNoteV1Json(validatedEnvelope)));
}

export function parseEncryptedNoteV1FromHex(hex: HexString, checks: EncryptedNoteV1CheckContext = {}): EncryptedNoteV1 {
  const decoded = textDecoder.decode(hexToBytes(hex));
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("EncryptedNoteV1 envelope is not valid JSON.");
  }

  return validateEncryptedNoteV1Envelope(parsed, checks);
}

export function validateEncryptedNoteV1Envelope(
  value: unknown,
  checks: EncryptedNoteV1CheckContext = {}
): EncryptedNoteV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("EncryptedNoteV1 envelope JSON must be an object.");
  }

  const rawEnvelope = value as Record<string, unknown>;
  for (const key of Object.keys(rawEnvelope)) {
    if (!(ENCRYPTED_NOTE_V1_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`EncryptedNoteV1 envelope has unexpected field ${key}.`);
    }
  }

  const envelope: EncryptedNoteV1 = {
    version: requireEncryptedNoteV1Version(rawEnvelope.version),
    chainId: requireEncryptedNoteV1ChainId(rawEnvelope.chainId),
    pool: requireAddress(rawEnvelope.pool, "pool"),
    action: requireEncryptedNoteV1Action(rawEnvelope.action),
    commitment: requireBytes32(rawEnvelope.commitment, "commitment"),
    leafIndex: requireUintDecimal(rawEnvelope.leafIndex, "leafIndex", { allowZero: true }),
    amount: requireUintDecimal(rawEnvelope.amount, "amount", { allowZero: false }),
    assetConvention: requireNativeEthAssetConvention(rawEnvelope.assetConvention),
    recipientCiphertext: requireBoundedHexBytes(rawEnvelope.recipientCiphertext, "recipientCiphertext"),
    senderRecoveryCiphertext: requireBoundedHexBytes(rawEnvelope.senderRecoveryCiphertext, "senderRecoveryCiphertext"),
    nonceOrCounter: requireNonceOrCounter(rawEnvelope.nonceOrCounter),
    associatedDataHash: requireBytes32(rawEnvelope.associatedDataHash, "associatedDataHash")
  };

  assertEncryptedNoteV1Checks(envelope, checks);

  if (textEncoder.encode(serializeEncryptedNoteV1Json(envelope)).byteLength > ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES) {
    throw new Error(`EncryptedNoteV1 envelope must be at most ${ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES} bytes.`);
  }

  return envelope;
}

export async function computeEncryptedNoteV1ClientHash(envelope: EncryptedNoteV1): Promise<HexString> {
  const canonicalEnvelope = serializeEncryptedNoteV1Json(validateEncryptedNoteV1Envelope(envelope));
  const scope = textEncoder.encode(`EncryptedNoteV1:${ENCRYPTED_NOTE_V1_HASH_SCOPE}:`);
  const payload = textEncoder.encode(canonicalEnvelope);
  const digestInput = new Uint8Array(scope.length + payload.length);
  digestInput.set(scope, 0);
  digestInput.set(payload, scope.length);
  const digest = await crypto.subtle.digest("SHA-256", asArrayBuffer(digestInput));

  return bytesToHex(new Uint8Array(digest));
}

export function computeStageBWithdrawPublicExitHashes(
  input: StageBWithdrawPublicExitPreflightInput
): StageBWithdrawPublicExitHashes {
  const selector = input.selector ?? PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR;
  const encryptedNoteHash = hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector,
      nullifier: input.nullifier,
      commitment: ZERO_BYTES32,
      noteAmount: input.noteAmount,
      encryptedNote: "0x"
    })
  ) as HexString;
  const relayerPolicyHash = hashRelayerPolicyV1(createRelayerPolicyV1(input.relayerPolicy)) as HexString;
  const proofContextHash = hashProofContextV1(
    createProofContextV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector,
      root: input.root,
      nullifier: input.nullifier,
      destination: input.destination,
      grossAmount: input.grossAmount,
      fee: input.fee,
      encryptedNoteHash,
      relayerPolicyHash,
      deadlineOrZero: input.relayerPolicy.deadlineOrZero
    })
  ) as HexString;

  return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
}

export function validateStageBWithdrawPublicExitPreflight(input: StageBWithdrawPublicExitPreflightCheck): string[] {
  const errors: string[] = [];
  const selector = input.selector ?? PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR;

  if (selector !== PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR) {
    errors.push("Public-exit selector must be the withdraw relayer-policy selector.");
  }
  if (input.changeCommitment !== undefined && input.changeCommitment.toLowerCase() !== ZERO_BYTES32) {
    errors.push("Public-exit preflight does not support change-note commitments.");
  }
  if (input.encryptedChangeNote !== undefined && input.encryptedChangeNote !== "0x") {
    errors.push("Public-exit preflight does not support encrypted change notes.");
  }

  const hashes = computeStageBWithdrawPublicExitHashes({ ...input, selector });
  if (hashes.encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("Public-exit encryptedNoteHash does not match wallet preflight.");
  }
  if (input.relayerPolicyHash !== undefined && hashes.relayerPolicyHash.toLowerCase() !== input.relayerPolicyHash.toLowerCase()) {
    errors.push("Public-exit relayerPolicyHash does not match wallet preflight.");
  }
  if (hashes.proofContextHash.toLowerCase() !== input.proofContextHash.toLowerCase()) {
    errors.push("Public-exit proofContextHash does not match wallet preflight.");
  }

  return errors;
}

export function computeStageCWithdrawChangeNoteHashes(
  input: StageCWithdrawChangeNotePreflightInput
): StageCWithdrawChangeNoteHashes {
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;
  const encryptedNoteHash = hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector,
      nullifier: input.nullifier,
      commitment: input.changeCommitment,
      noteAmount: input.changeAmount,
      encryptedNote: input.encryptedChangeNote
    })
  ) as HexString;
  const relayerPolicyHash = hashRelayerPolicyV1(createRelayerPolicyV1(input.relayerPolicy)) as HexString;
  const proofContextHash = hashProofContextV1(
    createProofContextV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector,
      root: input.root,
      nullifier: input.nullifier,
      destination: input.destination,
      grossAmount: input.grossAmount,
      fee: input.fee,
      encryptedNoteHash,
      relayerPolicyHash,
      deadlineOrZero: input.relayerPolicy.deadlineOrZero
    })
  ) as HexString;

  return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
}

export function validateStageCWithdrawChangeNotePreflight(input: StageCWithdrawChangeNotePreflightCheck): string[] {
  const errors: string[] = [];
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;

  if (selector !== STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    errors.push("Private-change withdrawal selector must be the bounded private-change selector.");
  }
  if (!BYTES32_PATTERN.test(input.changeCommitment) || input.changeCommitment.toLowerCase() === ZERO_BYTES32) {
    errors.push("Private change commitment must be a nonzero bytes32 value.");
  }
  if (!EVEN_HEX_PATTERN.test(input.encryptedChangeNote)) {
    errors.push("Private change ciphertext must be nonempty even-length hex bytes.");
  }
  if (EVEN_HEX_PATTERN.test(input.encryptedChangeNote) && (input.encryptedChangeNote.length - 2) / 2 > ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES) {
    errors.push(`Private change ciphertext must be at most ${ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES} bytes.`);
  }
  if (input.changeAmount <= 0n) {
    errors.push("Private change amount must be positive.");
  }
  if (input.fee > input.grossAmount) {
    errors.push("Private-change withdrawal fee cannot exceed gross amount.");
  }
  if (input.noteAmount !== input.grossAmount + input.changeAmount) {
    errors.push("Private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount.");
  }

  const outputCommitments = input.outputCommitments ?? [input.changeCommitment];
  const encryptedChangeNotes = input.encryptedChangeNotes ?? [input.encryptedChangeNote];
  const changeAmounts = input.changeAmounts ?? [input.changeAmount];
  if (outputCommitments.length !== 1 || encryptedChangeNotes.length !== 1 || changeAmounts.length !== 1) {
    errors.push("Private-change withdrawal supports exactly one private change output.");
  } else {
    if (outputCommitments[0]?.toLowerCase() !== input.changeCommitment.toLowerCase()) {
      errors.push("Private change commitment order does not match.");
    }
    if (encryptedChangeNotes[0]?.toLowerCase() !== input.encryptedChangeNote.toLowerCase()) {
      errors.push("Private change ciphertext order does not match.");
    }
    if (changeAmounts[0] !== input.changeAmount) {
      errors.push("Private change amount order does not match.");
    }
  }

  const hashes = computeStageCWithdrawChangeNoteHashes({ ...input, selector });
  if (hashes.encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("Private change encryptedNoteHash does not match wallet preflight.");
  }
  if (input.relayerPolicyHash !== undefined && hashes.relayerPolicyHash.toLowerCase() !== input.relayerPolicyHash.toLowerCase()) {
    errors.push("Private-change withdrawal relayerPolicyHash does not match wallet preflight.");
  }
  if (hashes.proofContextHash.toLowerCase() !== input.proofContextHash.toLowerCase()) {
    errors.push("Private-change withdrawal proofContextHash does not match wallet preflight.");
  }

  return errors;
}

export async function decryptEncryptedNoteEnvelope(input: {
  noteKey: CryptoKey;
  encrypted: EncryptedNoteEnvelope;
  aad: Uint8Array;
}): Promise<SpendMaterialPlaintext> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(hexToBytes(input.encrypted.nonce)),
        additionalData: asArrayBuffer(input.aad)
      },
      input.noteKey,
      asArrayBuffer(hexToBytes(input.encrypted.ciphertext))
    );

    return JSON.parse(textDecoder.decode(decrypted)) as SpendMaterialPlaintext;
  } catch {
    throw new Error("Encrypted note authentication failed.");
  }
}

function serializeEncryptedNoteV1Json(envelope: EncryptedNoteV1): string {
  return JSON.stringify({
    version: envelope.version,
    chainId: envelope.chainId,
    pool: envelope.pool,
    action: envelope.action,
    commitment: envelope.commitment,
    leafIndex: envelope.leafIndex,
    amount: envelope.amount,
    assetConvention: envelope.assetConvention,
    recipientCiphertext: envelope.recipientCiphertext,
    senderRecoveryCiphertext: envelope.senderRecoveryCiphertext,
    nonceOrCounter: envelope.nonceOrCounter,
    associatedDataHash: envelope.associatedDataHash
  });
}

function requireEncryptedNoteV1Version(value: unknown): 1 {
  if (value !== 1) {
    throw new Error("Unsupported EncryptedNoteV1 envelope version.");
  }

  return 1;
}

function requireEncryptedNoteV1ChainId(value: unknown): 6343 | 4326 {
  if (value !== 6343 && value !== 4326) {
    throw new Error("EncryptedNoteV1 chainId must be MegaETH testnet 6343 or mainnet 4326.");
  }

  return value;
}

function requireEncryptedNoteV1Action(value: unknown): EncryptedNoteV1Action {
  if (typeof value !== "string" || !ENCRYPTED_NOTE_V1_ACTIONS.has(value as EncryptedNoteV1Action)) {
    throw new Error("EncryptedNoteV1 action must be deposit, private-transfer, withdraw, or withdraw-change.");
  }

  return value as EncryptedNoteV1Action;
}

function requireNativeEthAssetConvention(value: unknown): "native-eth-v1" {
  if (value !== "native-eth-v1") {
    throw new Error("EncryptedNoteV1 assetConvention must be native-eth-v1.");
  }

  return "native-eth-v1";
}

function requireAddress(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be an EVM address.`);
  }

  return value.toLowerCase() as HexString;
}

function requireBytes32(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be bytes32 hex.`);
  }

  return value.toLowerCase() as HexString;
}

function requireBoundedHexBytes(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string" || !EVEN_HEX_PATTERN.test(value)) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be nonempty even-length hex bytes.`);
  }

  if ((value.length - 2) / 2 > ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be at most ${ENCRYPTED_NOTE_V1_MAX_SERIALIZED_BYTES} bytes.`);
  }

  return value.toLowerCase() as HexString;
}

function requireUintDecimal(
  value: unknown,
  fieldName: string,
  options: { allowZero: boolean }
): string {
  if (typeof value !== "string" || !UINT_DECIMAL_PATTERN.test(value)) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be an unambiguous decimal uint256 string.`);
  }

  if (!options.allowZero && BigInt(value) === 0n) {
    throw new Error(`EncryptedNoteV1 ${fieldName} must be positive.`);
  }

  return value;
}

function requireNonceOrCounter(value: unknown): HexString | string {
  if (typeof value !== "string") {
    throw new Error("EncryptedNoteV1 nonceOrCounter must be bytes32 hex or decimal uint256 string.");
  }

  if (BYTES32_PATTERN.test(value)) {
    return value.toLowerCase() as HexString;
  }

  if (UINT_DECIMAL_PATTERN.test(value)) {
    return value;
  }

  throw new Error("EncryptedNoteV1 nonceOrCounter must be bytes32 hex or decimal uint256 string.");
}

function assertEncryptedNoteV1Checks(envelope: EncryptedNoteV1, checks: EncryptedNoteV1CheckContext): void {
  const supportedAmounts = new Set(
    (checks.supportedAmountsWei ?? [...DEFAULT_SUPPORTED_AMOUNTS_WEI]).map((amount) => amount.toString())
  );

  if (!supportedAmounts.has(envelope.amount)) {
    throw new Error("EncryptedNoteV1 amount must be a supported fixed native ETH denomination.");
  }

  if (checks.chainId !== undefined && envelope.chainId !== checks.chainId) {
    throw new Error("EncryptedNoteV1 chainId does not match the active chain.");
  }

  if (checks.pool !== undefined && envelope.pool !== checks.pool.toLowerCase()) {
    throw new Error("EncryptedNoteV1 pool does not match the configured pool.");
  }

  if (checks.action !== undefined && envelope.action !== checks.action) {
    throw new Error("EncryptedNoteV1 action does not match the event type.");
  }

  if (checks.commitment !== undefined && envelope.commitment !== checks.commitment.toLowerCase()) {
    throw new Error("EncryptedNoteV1 commitment does not match the event commitment.");
  }

  if (checks.leafIndex !== undefined && envelope.leafIndex !== checks.leafIndex) {
    throw new Error("EncryptedNoteV1 leafIndex does not match the event leaf index.");
  }
}

function validateEncryptedNoteEnvelope(value: unknown): EncryptedNoteEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Encrypted note envelope JSON must be an object.");
  }

  const envelope = value as Record<string, unknown>;

  if (envelope.version !== 1) {
    throw new Error("Unsupported encrypted note envelope version.");
  }

  if (envelope.algorithm !== "AES-GCM-256") {
    throw new Error("Unsupported encrypted note envelope algorithm.");
  }

  if (envelope.kdf !== "HKDF-SHA-256") {
    throw new Error("Unsupported encrypted note envelope KDF.");
  }

  if (typeof envelope.nonce !== "string" || !/^0x[0-9a-fA-F]{24}$/.test(envelope.nonce)) {
    throw new Error("Encrypted note envelope nonce must be 12 bytes.");
  }

  if (typeof envelope.ciphertext !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(envelope.ciphertext)) {
    throw new Error("Encrypted note envelope ciphertext must be even-length hex.");
  }

  return {
    version: 1,
    algorithm: "AES-GCM-256",
    kdf: "HKDF-SHA-256",
    nonce: envelope.nonce as HexString,
    ciphertext: envelope.ciphertext as HexString
  };
}

function hexToBytes(value: HexString): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error("Expected even-length hex string.");
  }

  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): HexString {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as const;
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
