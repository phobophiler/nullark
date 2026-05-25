import { keccak256 } from "viem";
import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";
import type { RecoveredWalletNote } from "../notes/recover.js";
import type { SpendMaterialPlaintext } from "./encryptedNoteEnvelope.js";

export const RECOVERY_KIT_V1_DOMAIN = "RECOVERY_KIT_V1" as const;
export const RECOVERY_KIT_V1_CHECKSUM_ALGORITHM = "keccak256-canonical-json-v1" as const;
export const RECOVERY_KIT_V1_SCHEMA_DESCRIPTOR = Object.freeze({
  name: "NullarkRecoveryKit",
  version: "1",
  domain: "nullark.v1.recovery-kit",
  encoding: "canonical-json-v1",
  checksumAlgorithm: RECOVERY_KIT_V1_CHECKSUM_ALGORITHM,
  fieldOrder: Object.freeze([
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
  ] as const),
  fields: Object.freeze([
    { name: "domain", type: "literal:RECOVERY_KIT_V1", required: true },
    { name: "version", type: "literal:1", required: true },
    { name: "recoveryKitSchemaHash", type: "sha256:canonical-schema-descriptor", required: true },
    { name: "checksumAlgorithm", type: "literal:keccak256-canonical-json-v1", required: true },
    { name: "chainId", type: "positive-safe-integer", required: true },
    { name: "poolAddress", type: "evm-address", required: true },
    { name: "runtimeId", type: "non-empty-string", required: true },
    { name: "noteVersion", type: "literal:spend-material-v1", required: true },
    { name: "amount", type: "positive-decimal-wei", required: true },
    { name: "assetId", type: "bytes32", required: true },
    { name: "ownerCommitment", type: "bytes32", required: true },
    { name: "noteSecret", type: "bytes32", required: true },
    { name: "blinding", type: "bytes32", required: true },
    { name: "commitment", type: "bytes32", required: true },
    { name: "txHashHint", type: "bytes32", required: true },
    { name: "blockNumberHint", type: "hex-block-quantity|null", required: true },
    { name: "leafIndexHint", type: "non-negative-safe-integer", required: true },
    { name: "createdAt", type: "non-empty-string", required: true },
    { name: "checksum", type: "bytes32-keccak256-canonical-json-without-checksum", required: true }
  ] as const),
  parserRules: Object.freeze([
    "reject-unknown-or-missing-fields",
    "reject-public-wallet-linked-discovery-tags",
    "verify-recoveryKitSchemaHash-before-checksum",
    "verify-checksum-over-all-fields-except-checksum",
    "verify-runtime-chain-pool-runtimeId",
    "derive-commitment-from-witness",
    "derive-nullifier-for-spend-status"
  ] as const)
} as const);
export const RECOVERY_KIT_V1_SCHEMA_HASH =
  "sha256:b7935a0848b972e16be5790040136f50712e84e44c272079170192b9a56d18d8" as const;

export type RecoveryKitV1 = {
  domain: typeof RECOVERY_KIT_V1_DOMAIN;
  version: 1;
  recoveryKitSchemaHash: typeof RECOVERY_KIT_V1_SCHEMA_HASH;
  checksumAlgorithm: typeof RECOVERY_KIT_V1_CHECKSUM_ALGORITHM;
  chainId: number;
  poolAddress: HexString;
  runtimeId: string;
  noteVersion: "spend-material-v1";
  amount: string;
  assetId: HexString;
  ownerCommitment: HexString;
  noteSecret: HexString;
  blinding: HexString;
  commitment: HexString;
  txHashHint: HexString;
  blockNumberHint: HexString | null;
  leafIndexHint: number;
  createdAt: string;
  checksum: HexString;
};

export type RecoveryKitImportInput = {
  serializedKit: string;
  runtime: NullarkCurrentRuntime;
  deriveCommitment: (spendMaterial: SpendMaterialPlaintext) => Promise<HexString>;
  deriveNullifier: (input: {
    spendMaterial: SpendMaterialPlaintext;
    leafIndex: number;
    chainId: number;
    pool: HexString;
  }) => Promise<HexString>;
  isNullifierSpent: (nullifier: HexString) => Promise<boolean>;
};

export type RecoveryKitSpendStatus = {
  commitment: HexString;
  leafIndex: number;
  nullifier: HexString;
  spent: boolean;
};

export type RecoveryKitSpendableNote = RecoveredWalletNote & {
  recoveryRoute: "recovery-kit";
  spendStatus: RecoveryKitSpendStatus;
};

export function createRecoveryKitV1(input: {
  runtime: NullarkCurrentRuntime;
  spendMaterial: SpendMaterialPlaintext;
  transactionHash: HexString;
  leafIndex: number;
  blockNumber?: HexString | undefined;
}): RecoveryKitV1 {
  const spendMaterial = validateSpendMaterialForRuntime(input.spendMaterial, input.runtime);
  const unsigned = {
    domain: RECOVERY_KIT_V1_DOMAIN,
    version: 1,
    recoveryKitSchemaHash: RECOVERY_KIT_V1_SCHEMA_HASH,
    checksumAlgorithm: RECOVERY_KIT_V1_CHECKSUM_ALGORITHM,
    chainId: input.runtime.chainId,
    poolAddress: input.runtime.pool,
    runtimeId: input.runtime.productVersion,
    noteVersion: spendMaterial.version,
    amount: spendMaterial.noteAmountWei,
    assetId: spendMaterial.assetId,
    ownerCommitment: spendMaterial.ownerCommitment,
    noteSecret: spendMaterial.noteSecret,
    blinding: spendMaterial.blinding,
    commitment: spendMaterial.commitment,
    txHashHint: requireBytes32(input.transactionHash, "Recovery kit transaction hash hint"),
    blockNumberHint: input.blockNumber === undefined ? null : requireBlockQuantity(input.blockNumber),
    leafIndexHint: requireLeafIndex(input.leafIndex),
    createdAt: spendMaterial.createdAt
  } satisfies Omit<RecoveryKitV1, "checksum">;

  return { ...unsigned, checksum: checksumRecoveryKit(unsigned) };
}

export function serializeRecoveryKitV1(kit: RecoveryKitV1): string {
  return JSON.stringify(validateRecoveryKitV1(kit), null, 2);
}

export async function importRecoveryKitV1ToSpendableNote(input: RecoveryKitImportInput): Promise<RecoveryKitSpendableNote> {
  const kit = parseRecoveryKitV1(input.serializedKit);
  assertRecoveryKitMatchesRuntime(kit, input.runtime);
  const spendMaterial = spendMaterialFromRecoveryKit(kit);
  const derivedCommitment = await input.deriveCommitment(spendMaterial);
  if (derivedCommitment.toLowerCase() !== kit.commitment.toLowerCase()) {
    throw new Error("Recovery kit commitment does not match witness material.");
  }
  const nullifier = await input.deriveNullifier({
    spendMaterial,
    leafIndex: kit.leafIndexHint,
    chainId: input.runtime.chainId,
    pool: input.runtime.pool
  });
  if (!isHexBytes32(nullifier)) {
    throw new Error("Recovery kit nullifier must be bytes32.");
  }
  const spent = await input.isNullifierSpent(nullifier);

  return {
    recoveryRoute: "recovery-kit",
    summary: {
      id: `note_${kit.commitment.slice(2, 10)}_${kit.leafIndexHint.toString()}`,
      commitment: kit.commitment,
      amountWei: kit.amount,
      spent,
      leafIndex: kit.leafIndexHint,
      transactionHash: kit.txHashHint
    },
    spendMaterial,
    nullifier,
    spendStatus: {
      commitment: kit.commitment,
      leafIndex: kit.leafIndexHint,
      nullifier,
      spent
    }
  };
}

export async function importRecoveryKitV1ToRecoveredWalletNote(input: RecoveryKitImportInput): Promise<RecoveredWalletNote> {
  return importRecoveryKitV1ToSpendableNote(input);
}

export function parseRecoveryKitV1(value: string): RecoveryKitV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Expected recovery kit JSON.");
  }
  return validateRecoveryKitV1(parsed);
}

function validateRecoveryKitV1(value: unknown): RecoveryKitV1 {
  const kit = value as Partial<RecoveryKitV1> & Record<string, unknown>;
  rejectWalletLinkedDiscoveryFields(kit);
  const expectedKeys = [
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
  ];
  if (!Object.prototype.hasOwnProperty.call(kit, "recoveryKitSchemaHash")) {
    throw new Error("Recovery kit schema hash is required.");
  }
  if (kit.recoveryKitSchemaHash !== RECOVERY_KIT_V1_SCHEMA_HASH) {
    throw new Error("Recovery kit schema hash mismatch.");
  }
  assertExactKeys(kit, expectedKeys);
  if (kit.domain !== RECOVERY_KIT_V1_DOMAIN || kit.version !== 1) {
    throw new Error("Unsupported recovery kit version.");
  }
  if (kit.checksumAlgorithm !== RECOVERY_KIT_V1_CHECKSUM_ALGORITHM) {
    throw new Error("Unsupported recovery kit checksum algorithm.");
  }
  if (typeof kit.chainId !== "number" || !Number.isSafeInteger(kit.chainId) || kit.chainId <= 0) {
    throw new Error("Recovery kit chain ID must be a positive safe integer.");
  }
  if (!isEvmAddress(String(kit.poolAddress))) {
    throw new Error("Recovery kit pool address must be an EVM address.");
  }
  if (typeof kit.runtimeId !== "string" || kit.runtimeId.length === 0) {
    throw new Error("Recovery kit runtime ID is required.");
  }
  if (kit.noteVersion !== "spend-material-v1") {
    throw new Error("Unsupported recovery kit note version.");
  }
  if (typeof kit.amount !== "string" || !/^[0-9]+$/.test(kit.amount) || BigInt(kit.amount) <= 0n) {
    throw new Error("Recovery kit amount must be positive decimal wei.");
  }
  requireBytes32(kit.assetId, "Recovery kit asset ID");
  requireBytes32(kit.ownerCommitment, "Recovery kit owner commitment");
  requireBytes32(kit.noteSecret, "Recovery kit note secret");
  requireBytes32(kit.blinding, "Recovery kit blinding");
  requireBytes32(kit.commitment, "Recovery kit commitment");
  requireBytes32(kit.txHashHint, "Recovery kit transaction hash hint");
  if (kit.blockNumberHint !== null) {
    requireBlockQuantity(kit.blockNumberHint);
  }
  requireLeafIndex(kit.leafIndexHint);
  if (typeof kit.createdAt !== "string" || kit.createdAt.length === 0) {
    throw new Error("Recovery kit creation time is required.");
  }
  const checksum = requireBytes32(kit.checksum, "Recovery kit checksum");
  const { checksum: _checksum, ...unsigned } = kit;
  if (checksum.toLowerCase() !== checksumRecoveryKit(unsigned as Omit<RecoveryKitV1, "checksum">).toLowerCase()) {
    throw new Error("Recovery kit checksum mismatch.");
  }
  return kit as RecoveryKitV1;
}

function assertRecoveryKitMatchesRuntime(kit: RecoveryKitV1, runtime: NullarkCurrentRuntime): void {
  if (kit.chainId !== runtime.chainId) {
    throw new Error("Recovery kit is not for the active MegaETH chain.");
  }
  if (kit.poolAddress.toLowerCase() !== runtime.pool.toLowerCase()) {
    throw new Error("Recovery kit is not for the active pool.");
  }
  if (kit.runtimeId !== runtime.productVersion) {
    throw new Error("Recovery kit is not for the active runtime.");
  }
}

function spendMaterialFromRecoveryKit(kit: RecoveryKitV1): SpendMaterialPlaintext {
  return {
    version: kit.noteVersion,
    chainId: kit.chainId,
    pool: kit.poolAddress,
    assetId: kit.assetId,
    noteAmountWei: kit.amount,
    ownerCommitment: kit.ownerCommitment,
    noteSecret: kit.noteSecret,
    blinding: kit.blinding,
    commitment: kit.commitment,
    createdAt: kit.createdAt
  };
}

function validateSpendMaterialForRuntime(
  spendMaterial: SpendMaterialPlaintext,
  runtime: NullarkCurrentRuntime
): SpendMaterialPlaintext {
  if (spendMaterial.chainId !== runtime.chainId || spendMaterial.pool.toLowerCase() !== runtime.pool.toLowerCase()) {
    throw new Error("Recovery kit spend material is not bound to the active runtime.");
  }
  requireBytes32(spendMaterial.assetId, "Recovery kit asset ID");
  requireBytes32(spendMaterial.ownerCommitment, "Recovery kit owner commitment");
  requireBytes32(spendMaterial.noteSecret, "Recovery kit note secret");
  requireBytes32(spendMaterial.blinding, "Recovery kit blinding");
  requireBytes32(spendMaterial.commitment, "Recovery kit commitment");
  if (!/^[0-9]+$/.test(spendMaterial.noteAmountWei) || BigInt(spendMaterial.noteAmountWei) <= 0n) {
    throw new Error("Recovery kit amount must be positive decimal wei.");
  }
  return spendMaterial;
}

function checksumRecoveryKit(unsigned: Omit<RecoveryKitV1, "checksum">): HexString {
  return keccak256(new TextEncoder().encode(canonicalJson(unsigned))) as HexString;
}

function rejectWalletLinkedDiscoveryFields(value: Record<string, unknown>): void {
  const forbiddenFields = new Set([
    "walletAddress",
    "ownerAddress",
    "discoveryTag",
    "walletTag",
    "publicDiscoveryTag",
    "stableDiscoveryTag",
    "walletLinkedDiscoveryTag"
  ]);
  for (const key of Object.keys(value)) {
    if (forbiddenFields.has(key) || /wallet|discovery|tag/i.test(key)) {
      throw new Error("Recovery kit must not contain public wallet-linked discovery tags.");
    }
  }
}

function assertExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("Recovery kit has unsupported or missing fields.");
  }
}

function requireBytes32(value: unknown, label: string): HexString {
  if (typeof value !== "string" || !isHexBytes32(value)) {
    throw new Error(`${label} must be bytes32 hex.`);
  }
  return value as HexString;
}

function requireBlockQuantity(value: unknown): HexString {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error("Recovery kit block number hint must be a hex block quantity.");
  }
  return value as HexString;
}

function requireLeafIndex(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error("Recovery kit leaf index hint must be a non-negative safe integer.");
  }
  return Number(value);
}

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Recovery kit canonical JSON number must be finite.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
