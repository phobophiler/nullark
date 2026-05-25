export type Sha256Hash = `sha256:${string}`;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type V12SchemaDescriptor = {
  readonly name: string;
  readonly version: string;
  readonly domain: string;
  readonly order: readonly string[];
};

export type V12EncryptedOutputNoteSchemaDescriptor = V12SchemaDescriptor & {
  readonly presence: "always-present";
  readonly shape: "fixed";
  readonly padding: {
    readonly required: true;
    readonly strategy: "fixed-shape-padded-envelope";
    readonly fields: readonly string[];
  };
  readonly fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: true;
    readonly padded?: true;
  }[];
};

export const V12_UNLINKABLE_SCHEMA_VERSION = "1.2" as const;

export const V12_SPEND_PUBLIC_INPUT_ORDER = Object.freeze([
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
] as const);

export const V12_DEPOSIT_PUBLIC_INPUT_ORDER = Object.freeze([
  "commitment",
  "amount",
  "chainId",
  "verifyingContract",
  "depositContextHash",
  "encryptedDepositNoteHash"
] as const);

export const V12_SPEND_PUBLIC_INPUT_COUNT = V12_SPEND_PUBLIC_INPUT_ORDER.length;
export const V12_DEPOSIT_PUBLIC_INPUT_COUNT = V12_DEPOSIT_PUBLIC_INPUT_ORDER.length;

export const V12_FORBIDDEN_SPEND_PUBLIC_INPUTS = Object.freeze([
  "spentCommitment",
  "oldNoteAmount",
  "noteAmount",
  "outputAmount",
  "isFullWithdrawal",
  "isPartialWithdrawal"
] as const);

export type V12SpendPublicInputName = (typeof V12_SPEND_PUBLIC_INPUT_ORDER)[number];
export type V12DepositPublicInputName = (typeof V12_DEPOSIT_PUBLIC_INPUT_ORDER)[number];
export type V12ForbiddenSpendPublicInputName = (typeof V12_FORBIDDEN_SPEND_PUBLIC_INPUTS)[number];

export const V12_SPEND_PUBLIC_INPUT_INDEX = Object.freeze(
  Object.fromEntries(V12_SPEND_PUBLIC_INPUT_ORDER.map((name, index) => [name, index]))
) as Readonly<Record<V12SpendPublicInputName, number>>;

export const V12_DEPOSIT_PUBLIC_INPUT_INDEX = Object.freeze(
  Object.fromEntries(V12_DEPOSIT_PUBLIC_INPUT_ORDER.map((name, index) => [name, index]))
) as Readonly<Record<V12DepositPublicInputName, number>>;

export const V12_DEPOSIT_PUBLIC_INPUTS_SCHEMA = Object.freeze({
  name: "NullarkV12DepositPublicInputs",
  version: V12_UNLINKABLE_SCHEMA_VERSION,
  domain: "nullark.v1.2.deposit-public-inputs",
  order: V12_DEPOSIT_PUBLIC_INPUT_ORDER
} as const satisfies V12SchemaDescriptor);

export const V12_SPEND_PUBLIC_INPUTS_SCHEMA = Object.freeze({
  name: "NullarkV12SpendPublicInputs",
  version: V12_UNLINKABLE_SCHEMA_VERSION,
  domain: "nullark.v1.2.spend-public-inputs",
  order: V12_SPEND_PUBLIC_INPUT_ORDER
} as const satisfies V12SchemaDescriptor);

export const V12_PROOF_CONTEXT_SCHEMA = Object.freeze({
  name: "NullarkV12ProofContext",
  version: V12_UNLINKABLE_SCHEMA_VERSION,
  domain: "nullark.v1.2.proof-context",
  order: Object.freeze([
    "domainSeparator",
    "version",
    "chainId",
    "verifyingContract",
    "root",
    "nullifier",
    "outputCommitment",
    "destination",
    "grossAmount",
    "fee",
    "encryptedOutputNoteHash",
    "relayerPolicyHash",
    "treeSnapshotHash",
    "deadlineOrZero"
  ] as const)
} as const satisfies V12SchemaDescriptor);

export const V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA = Object.freeze({
  name: "NullarkEncryptedOutputNote",
  version: "2",
  domain: "nullark.encrypted-output-note.v2",
  order: Object.freeze([
    "domainSeparator",
    "version",
    "chainId",
    "verifyingContract",
    "outputCommitment",
    "proofContextHash",
    "ephemeralPublicKey",
    "nonce",
    "ciphertext",
    "ciphertextByteLength",
    "paddingBytes",
    "paddingByteLength",
    "paddedCiphertextByteLength"
  ] as const),
  presence: "always-present",
  shape: "fixed",
  padding: Object.freeze({
    required: true,
    strategy: "fixed-shape-padded-envelope",
    fields: Object.freeze(["paddingBytes", "paddingByteLength", "paddedCiphertextByteLength"] as const)
  }),
  fields: Object.freeze([
    { name: "domainSeparator", type: "bytes32", required: true },
    { name: "version", type: "uint16", required: true },
    { name: "chainId", type: "uint256", required: true },
    { name: "verifyingContract", type: "address", required: true },
    { name: "outputCommitment", type: "bytes32", required: true },
    { name: "proofContextHash", type: "bytes32", required: true },
    { name: "ephemeralPublicKey", type: "bytes", required: true },
    { name: "nonce", type: "bytes24", required: true },
    { name: "ciphertext", type: "bytes", required: true, padded: true },
    { name: "ciphertextByteLength", type: "uint32", required: true },
    { name: "paddingBytes", type: "bytes", required: true, padded: true },
    { name: "paddingByteLength", type: "uint32", required: true },
    { name: "paddedCiphertextByteLength", type: "uint32", required: true }
  ] as const)
} as const satisfies V12EncryptedOutputNoteSchemaDescriptor);

export const V12_ENCRYPTED_OUTPUT_NOTE_HASH_RULE = Object.freeze({
  domain: "nullark.encrypted-output-note.v2",
  version: 2,
  payloadBinding: "keccak256(encryptedOutputNote)",
  hashEncoding: Object.freeze([
    "domainSeparator",
    "version",
    "chainId",
    "verifyingContract",
    "shape",
    "selector",
    "nullifier",
    "outputCommitment",
    "encryptedOutputNoteDigest"
  ] as const)
});

export const V12_RECOVERY_KIT_V1_SCHEMA = Object.freeze({
  name: "NullarkRecoveryKit",
  version: "1",
  domain: "nullark.v1.recovery-kit",
  order: Object.freeze([
    "domain",
    "version",
    "recoveryKitSchemaHash",
    "checksumAlgorithm",
    "chainId",
    "poolAddress",
    "runtimeId",
    "noteVersion",
    "amount",
    "assetId",
    "ownerCommitment",
    "noteSecret",
    "blinding",
    "commitment",
    "txHashHint",
    "blockNumberHint",
    "leafIndexHint",
    "createdAt",
    "checksum"
  ] as const)
} as const satisfies V12SchemaDescriptor);

export const V12_RECOVERY_KIT_V1_SCHEMA_HASH =
  "sha256:b7935a0848b972e16be5790040136f50712e84e44c272079170192b9a56d18d8" as const;

export const V12_WALLET_UNLOCK_SCHEMA = Object.freeze({
  name: "NullarkWalletUnlock",
  version: "1",
  domain: "nullark.v1.wallet-unlock",
  order: Object.freeze([
    "domain",
    "version",
    "chainId",
    "verifyingContract",
    "wallet",
    "purpose",
    "sessionId",
    "issuedAt",
    "expiresAt",
    "nonce"
  ] as const)
} as const satisfies V12SchemaDescriptor);

export const V12_PRIVACY_HINT_POLICY_SCHEMA = Object.freeze({
  name: "NullarkV12PrivacyHintPolicy",
  version: V12_UNLINKABLE_SCHEMA_VERSION,
  domain: "nullark.v1.2.privacy-hint-policy",
  order: Object.freeze([
    "domain",
    "version",
    "localOnly",
    "allowedHintKinds",
    "forbiddenHintKinds",
    "walletLinkedDiscoveryAllowed",
    "futureNullifierLookupAllowed",
    "publicStableWalletTagAllowed"
  ] as const)
} as const satisfies V12SchemaDescriptor);

export const V12_TREE_SNAPSHOT_SCHEMA = Object.freeze({
  name: "NullarkV12TreeSnapshot",
  version: V12_UNLINKABLE_SCHEMA_VERSION,
  domain: "nullark.v1.2.tree-snapshot",
  order: Object.freeze([
    "domain",
    "version",
    "chainId",
    "verifyingContract",
    "root",
    "treeDepth",
    "startLeafIndex",
    "endLeafIndex",
    "leafCount",
    "rangeCommitment",
    "source",
    "generatedAt"
  ] as const)
} as const satisfies V12SchemaDescriptor);

export const V12_SCHEMA_DESCRIPTORS = Object.freeze({
  depositPublicInputs: V12_DEPOSIT_PUBLIC_INPUTS_SCHEMA,
  spendPublicInputs: V12_SPEND_PUBLIC_INPUTS_SCHEMA,
  proofContext: V12_PROOF_CONTEXT_SCHEMA,
  encryptedOutputNoteV2: V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA,
  recoveryKitV1: V12_RECOVERY_KIT_V1_SCHEMA,
  walletUnlock: V12_WALLET_UNLOCK_SCHEMA,
  privacyHintPolicy: V12_PRIVACY_HINT_POLICY_SCHEMA,
  treeSnapshot: V12_TREE_SNAPSHOT_SCHEMA
} as const);

export const V12_SCHEMA_DESCRIPTOR_LIST = Object.freeze(Object.values(V12_SCHEMA_DESCRIPTORS));

export const V12_SCHEMA_DESCRIPTOR_HASHES = Object.freeze({
  depositPublicInputs: "sha256:0715130ade10dddad1eedffe4092ef224c7083dd93a267e49dd85c9848c01f1f",
  spendPublicInputs: "sha256:4212309560f544cf3596e72c2c3c3136641c4efaae9166ee87dece340ab872cd",
  proofContext: "sha256:6dc0fb940000c7c9347850918acabf9b2a898def60b325cf211e82d8319c32fe",
  encryptedOutputNoteV2: "sha256:faddbd0f9e353e3ed0841ffda38067c16016d65aef1271348bff7f4312ae9a0e",
  recoveryKitV1: "sha256:4d2be130e549956c3867d925807f2538375c7a9d3c76490b6fc58c79b54293e3",
  walletUnlock: "sha256:e9c935ac2b1461b590a17ac80b19521a865dfa88ca53a67465d488a76e19b780",
  privacyHintPolicy: "sha256:de12e22fae1047ce3de97935ddbf606d975870e6ae9c73ee60930aa822e7a95f",
  treeSnapshot: "sha256:2af98c4e7e77c6d287c212545514d5394d5da491e9defc872a1a171b3a1166e4"
} as const satisfies Readonly<Record<keyof typeof V12_SCHEMA_DESCRIPTORS, Sha256Hash>>);

export function findForbiddenV12SpendPublicInputs(order: readonly string[]): V12ForbiddenSpendPublicInputName[] {
  const forbidden = new Set<string>(V12_FORBIDDEN_SPEND_PUBLIC_INPUTS);
  return Array.from(new Set(order.filter((name) => forbidden.has(name)))) as V12ForbiddenSpendPublicInputName[];
}

export function assertV12SpendPublicInputOrder(order: readonly string[]): typeof V12_SPEND_PUBLIC_INPUT_ORDER {
  const forbiddenInputs = findForbiddenV12SpendPublicInputs(order);

  if (forbiddenInputs.length > 0) {
    throw new Error(`v1.2 spend public inputs include forbidden public fields: ${forbiddenInputs.join(", ")}`);
  }

  if (order.length !== V12_SPEND_PUBLIC_INPUT_COUNT) {
    throw new Error(`v1.2 spend public input order must contain exactly ${V12_SPEND_PUBLIC_INPUT_COUNT} fields`);
  }

  for (const [index, expected] of V12_SPEND_PUBLIC_INPUT_ORDER.entries()) {
    if (order[index] !== expected) {
      throw new Error(`v1.2 spend public input at index ${index} must be ${expected}`);
    }
  }

  return V12_SPEND_PUBLIC_INPUT_ORDER;
}

export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON numbers must be finite");
    }

    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function sha256String(value: string): Sha256Hash {
  return `sha256:${sha256Hex(utf8Bytes(value))}`;
}

export function sha256CanonicalJson(value: CanonicalJsonValue): Sha256Hash {
  return sha256String(canonicalJson(value));
}

export function schemaDescriptorHash(descriptor: V12SchemaDescriptor): Sha256Hash {
  return sha256CanonicalJson(descriptor as unknown as CanonicalJsonValue);
}

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let codePoint = value.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

function sha256Hex(bytes: readonly number[]): string {
  const state: number[] = [...SHA256_INITIAL_STATE];
  const padded = [...bytes, 0x80];
  while ((padded.length % 64) !== 56) {
    padded.push(0);
  }
  const bitLength = bytes.length * 8;
  for (let shift = 56; shift >= 0; shift -= 8) {
    padded.push(Math.floor(bitLength / 2 ** shift) & 0xff);
  }

  const words = new Array<number>(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      words[i] = ((padded[j] ?? 0) << 24) | ((padded[j + 1] ?? 0) << 16) | ((padded[j + 2] ?? 0) << 8) | (padded[j + 3] ?? 0);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight(words[i - 15] ?? 0, 7) ^ rotateRight(words[i - 15] ?? 0, 18) ^ ((words[i - 15] ?? 0) >>> 3);
      const s1 = rotateRight(words[i - 2] ?? 0, 17) ^ rotateRight(words[i - 2] ?? 0, 19) ^ ((words[i - 2] ?? 0) >>> 10);
      words[i] = add32(words[i - 16] ?? 0, s0, words[i - 7] ?? 0, s1);
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = add32(h, s1, ch, SHA256_ROUND_CONSTANTS[i] ?? 0, words[i] ?? 0);
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add32(s0, maj);
      h = g;
      g = f;
      f = e;
      e = add32(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add32(temp1, temp2);
    }
    state[0] = add32(state[0] ?? 0, a);
    state[1] = add32(state[1] ?? 0, b);
    state[2] = add32(state[2] ?? 0, c);
    state[3] = add32(state[3] ?? 0, d);
    state[4] = add32(state[4] ?? 0, e);
    state[5] = add32(state[5] ?? 0, f);
    state[6] = add32(state[6] ?? 0, g);
    state[7] = add32(state[7] ?? 0, h);
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function add32(...values: readonly number[]): number {
  return values.reduce((sum, value) => (sum + value) >>> 0, 0);
}
