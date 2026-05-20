import {
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  isSupportedFixedDenomination,
  spendablePublicExitAmountsForNote,
  splitIntoFixedDenominations
} from "@nullark/core";
import { encodeFunctionData } from "viem";

export type HexString = `0x${string}`;

export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export const MEGAETH_TESTNET_CHAIN_ID_HEX = "0x18c7";
export const MEGAETH_TESTNET_RPC_URL = "https://carrot.megaeth.com/rpc";
export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export const MEGAETH_MAINNET_RPC_URL = "https://mainnet.megaeth.com/rpc";
export const SHIELDED_POOL_ADDRESS = "0xce4D91A6D10AAfAB3e420e3764C139244057C8E1";
export const LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS = "0x54af9d54b4edD062daD5581670E9E5f73048c87b";
export const MAINNET_SHIELDED_POOL_ADDRESS = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
export const EXPECTED_WITHDRAW_VERIFIER_ADDRESS = "0xdb0DD9B551E899Ed131DFaBEfebba2265D8670b1";
export const EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH =
  "0x88e64996f72b151b2476f312ef48072751319d48b94872305d71d6a0633fe2b0";
export const FIRST_SANDBOX_COMMITMENT =
  "0x0d1492c034698ab1acb66c38bfee13aa7487d77b3a388e4b91c46aad85325043";
export const EXPECTED_ROOT_AFTER_FIRST_DEPOSIT =
  "0x14eb43136d3c01235935d0ef38287b308a95acc664400312da766d89b0423d07";
export const TEST_DEPOSIT_VALUE_WEI = 5_000_000_000_000_000n;
export const TEST_DEPOSIT_VALUE_HEX = "0x11c37937e08000";
export const MIN_WITHDRAWABLE_AMOUNT_WEI = 1n;
export const SANDBOX_MERKLE_TREE_DEPTH = 12;
export const SANDBOX_NOTE_RECORD_VERSION = "sandbox-spend-material-note-v1";
export const SANDBOX_NOTE_RECORD_WARNING = "contains-private-spend-material-no-zk-witness";
export const SANDBOX_NOTE_VAULT_STORAGE_KEY = "shielded-transfers:sandbox-note-vault-v1";
export const SANDBOX_NOTE_VAULT_VERSION = "sandbox-note-vault-v1";
export const SANDBOX_PROOF_GENERATION_STATUS = "not-wired";
export const SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS = "local-untrusted-groth16-generated";
export const SANDBOX_BROWSER_PROOF_GENERATED_STATUS = "browser-groth16-generated";
export const SANDBOX_NATIVE_ETH_ASSET_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const SANDBOX_COMMITMENT_DERIVATION_STATUS = "manual-bn254-field-commitment-not-poseidon-derived";
export const SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS = "poseidon-derived-from-spend-material";
export const SANDBOX_NOTE_STATUS = "deposited-missing-merkle-path-and-proof";
export const SANDBOX_NOTE_WITH_MERKLE_PATH_STATUS = "deposited-with-reconstructed-merkle-path";
export const SANDBOX_NOTE_WITH_PROOF_STATUS = "withdrawal-proof-generated-local-untrusted";
export const SANDBOX_MERKLE_PATH_STATUS = "not-fetched";
export const SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS = "reconstructed-from-root-accepted-logs";
export const BN254_SCALAR_FIELD =
  "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const SANDBOX_DEPLOYMENT_BLOCK_HEX = "0x1136f96";

export const CURRENT_ROOT_SELECTOR = "0xfdab463d";
export const COMMITMENTS_SELECTOR = "0x839df945";
export const DEPOSIT_SELECTOR = "0xb214faa5";
export const WITHDRAW_SELECTOR = "0x9b0c797c";
export const WITHDRAW_BOUNDED_SELECTOR = "0xc7787d0f";
export const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506";
export const NULLARK_V1_1_PUBLIC_INPUTS_LENGTH = 12;
export const NULLIFIERS_SELECTOR = "0x2997e86b";
export const ROOT_ACCEPTED_TOPIC =
  "0x80793a782b868031008b11884d1988be2052119a751633627d7112b0487fd870";

export const CURRENT_ROOT_CALLDATA = CURRENT_ROOT_SELECTOR;

export type SupportedMegaEthChainId = typeof MEGAETH_TESTNET_CHAIN_ID | typeof MEGAETH_MAINNET_CHAIN_ID;
export type SandboxSpendMaterialNoteRecordDeployment = {
  chainId: SupportedMegaEthChainId;
  rpcUrl: string;
  pool: HexString;
};

const SHIELDED_POOL_ENCRYPTED_NOTE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "encryptedNote", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "privateTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "nullifier", type: "bytes32" },
      { name: "newCommitment", type: "bytes32" },
      { name: "encryptedNote", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "nullifier", type: "bytes32" },
      { name: "destination", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "nullifier", type: "bytes32" },
      { name: "destination", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "encryptedChangeNote", type: "bytes" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export function isHexBytes32(value: string): value is HexString {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function isBn254FieldElement(value: string): value is HexString {
  return isHexBytes32(value) && BigInt(value) > 0n && BigInt(value) < BigInt(BN254_SCALAR_FIELD);
}

export function isHexString(value: string): value is HexString {
  return /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

export function isEvmAddress(value: string): value is HexString {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isSupportedMegaEthChainId(value: unknown): value is SupportedMegaEthChainId {
  return value === MEGAETH_TESTNET_CHAIN_ID || value === MEGAETH_MAINNET_CHAIN_ID;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function knownNoteRecordDeploymentForPool(pool: string): SandboxSpendMaterialNoteRecordDeployment | null {
  if (pool.toLowerCase() === SHIELDED_POOL_ADDRESS.toLowerCase()) {
    return {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS
    };
  }

  return null;
}

function isLegacyMainnetShieldedPoolDepth20(pool: string): boolean {
  return pool.toLowerCase() === LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS.toLowerCase();
}

function resolveNoteRecordDeployment(input: {
  chainId?: SupportedMegaEthChainId | undefined;
  rpcUrl?: string | undefined;
  pool: HexString;
}): SandboxSpendMaterialNoteRecordDeployment {
  if (isLegacyMainnetShieldedPoolDepth20(input.pool)) {
    throw new Error("Legacy MegaETH mainnet ShieldedPoolDepth20 address is not a supported NullarkPool binding.");
  }

  const knownDeployment = knownNoteRecordDeploymentForPool(input.pool);
  const chainId = input.chainId ?? knownDeployment?.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const rpcUrl = input.rpcUrl ?? knownDeployment?.rpcUrl ?? MEGAETH_TESTNET_RPC_URL;

  if (!isSupportedMegaEthChainId(chainId)) {
    throw new Error("Expected note record chain ID to be MegaETH mainnet or testnet.");
  }

  if (!isNonEmptyString(rpcUrl)) {
    throw new Error("Expected note record RPC URL.");
  }

  if (knownDeployment) {
    if (chainId !== knownDeployment.chainId) {
      throw new Error("Note record deployment metadata does not match known shielded pool.");
    }
    if (rpcUrl !== knownDeployment.rpcUrl) {
      throw new Error("Note record deployment metadata does not match known shielded pool.");
    }
    return { ...knownDeployment, pool: input.pool };
  }

  return { chainId, rpcUrl, pool: input.pool };
}

export function bytes32ToEvmAddress(value: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error("Expected a 32-byte hex value.");
  }

  return `0x${value.slice(-40).toLowerCase()}`;
}

export function bytes32ToDecimal(value: string): string {
  if (!isHexBytes32(value)) {
    throw new Error("Expected a 32-byte hex value.");
  }

  return BigInt(value).toString();
}

export type SandboxSpendMaterial = {
  assetId: HexString;
  ownerCommitment: HexString;
  noteSecret: HexString;
  blinding: HexString;
  commitment: HexString;
};

export type SandboxSpendMaterialNoteRecord = {
  version: typeof SANDBOX_NOTE_RECORD_VERSION;
  chainId: SupportedMegaEthChainId;
  rpcUrl: string;
  pool: HexString;
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
  blinding: HexString;
  commitment: HexString;
  commitmentDerivationStatus:
    | typeof SANDBOX_COMMITMENT_DERIVATION_STATUS
    | typeof SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS;
  commitmentDerivedFromSpendMaterial: boolean;
  leafIndex: number | null;
  merklePath: {
    root: HexString | null;
    siblings: HexString[];
    pathIndices: number[];
    status: typeof SANDBOX_MERKLE_PATH_STATUS | typeof SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS;
  };
  depositTxHash: HexString;
  currentRootAfter: HexString | null;
  createdAt: string;
  status:
    | typeof SANDBOX_NOTE_STATUS
    | typeof SANDBOX_NOTE_WITH_MERKLE_PATH_STATUS
    | typeof SANDBOX_NOTE_WITH_PROOF_STATUS;
  proofGenerationStatus:
    | typeof SANDBOX_PROOF_GENERATION_STATUS
    | typeof SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    | typeof SANDBOX_BROWSER_PROOF_GENERATED_STATUS;
  warning: typeof SANDBOX_NOTE_RECORD_WARNING;
};

export type SandboxNoteVaultEntry = {
  version: typeof SANDBOX_NOTE_VAULT_VERSION;
  record: SandboxSpendMaterialNoteRecord;
  spent: boolean;
  spentNullifier: HexString | null;
  updatedAt: string;
};

export type SandboxNoteVault = {
  version: typeof SANDBOX_NOTE_VAULT_VERSION;
  entries: SandboxNoteVaultEntry[];
};

export type PrivateReceiveCode = {
  version: "shielded-receive-code-v1";
  chainId: SupportedMegaEthChainId;
  pool: HexString;
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
  commitment: HexString;
  encryptedNote: HexString;
  createdAt: string;
};

export type RootAcceptedLogRecord = {
  root: HexString;
  previousRoot: HexString;
  insertedCommitment: HexString;
};

export type FieldHash = (inputs: readonly bigint[]) => bigint;

export function createSandboxSpendMaterial(getRandomValues: Crypto["getRandomValues"]): SandboxSpendMaterial {
  return {
    assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
    ownerCommitment: createRandomBytes32(getRandomValues),
    noteSecret: createRandomBytes32(getRandomValues),
    blinding: createRandomBytes32(getRandomValues),
    commitment: createRandomBytes32(getRandomValues)
  };
}

export function createSandboxSpendMaterialNoteRecord({
  commitment,
  noteAmountWei,
  ownerCommitment,
  noteSecret,
  blinding,
  depositTxHash,
  currentRootAfter,
  createdAt,
  assetId = SANDBOX_NATIVE_ETH_ASSET_ID,
  leafIndex = null,
  merklePath,
  commitmentDerivationStatus = SANDBOX_COMMITMENT_DERIVATION_STATUS,
  commitmentDerivedFromSpendMaterial = false,
  status = SANDBOX_NOTE_STATUS,
  proofGenerationStatus = SANDBOX_PROOF_GENERATION_STATUS,
  chainId,
  rpcUrl,
  pool = SHIELDED_POOL_ADDRESS
}: {
  commitment: string;
  noteAmountWei: string;
  ownerCommitment: string;
  noteSecret: string;
  blinding: string;
  depositTxHash: string;
  currentRootAfter: string | null;
  createdAt: string;
  assetId?: string;
  leafIndex?: number | null;
  merklePath?: Partial<SandboxSpendMaterialNoteRecord["merklePath"]> | undefined;
  commitmentDerivationStatus?: SandboxSpendMaterialNoteRecord["commitmentDerivationStatus"];
  commitmentDerivedFromSpendMaterial?: boolean;
  status?: SandboxSpendMaterialNoteRecord["status"];
  proofGenerationStatus?: SandboxSpendMaterialNoteRecord["proofGenerationStatus"];
  chainId?: SupportedMegaEthChainId;
  rpcUrl?: string;
  pool?: HexString;
}): SandboxSpendMaterialNoteRecord {
  if (!isEvmAddress(pool)) {
    throw new Error("Expected note record pool to be an EVM address.");
  }
  const deployment = resolveNoteRecordDeployment({ chainId, rpcUrl, pool });

  if (!isHexBytes32(assetId)) {
    throw new Error("Expected note record asset ID to be bytes32 hex.");
  }
  if (assetId.toLowerCase() !== SANDBOX_NATIVE_ETH_ASSET_ID) {
    throw new Error("Expected note record asset ID to match the native ETH sandbox pool.");
  }

  if (!isBn254FieldElement(commitment)) {
    throw new Error("Expected note record commitment to be a nonzero BN254 field element.");
  }

  if (!isBn254FieldElement(ownerCommitment)) {
    throw new Error("Expected note record owner commitment to be a nonzero BN254 field element.");
  }

  if (!isBn254FieldElement(noteSecret)) {
    throw new Error("Expected note record secret to be a nonzero BN254 field element.");
  }

  if (!isBn254FieldElement(blinding)) {
    throw new Error("Expected note record blinding to be a nonzero BN254 field element.");
  }

  if (
    !/^[0-9]+$/.test(noteAmountWei) ||
    BigInt(noteAmountWei) < MIN_WITHDRAWABLE_AMOUNT_WEI ||
    BigInt(noteAmountWei) >= BigInt(BN254_SCALAR_FIELD)
  ) {
    throw new Error("Expected note record amount wei as a positive decimal integer.");
  }

  if (!isHexString(depositTxHash) || depositTxHash.length !== 66) {
    throw new Error("Expected note record deposit tx hash to be 32-byte hex.");
  }

  if (currentRootAfter !== null && !isHexBytes32(currentRootAfter)) {
    throw new Error("Expected note record current root to be bytes32 hex.");
  }

  if (!createdAt) {
    throw new Error("Expected note record creation time.");
  }

  if (leafIndex !== null && (!Number.isSafeInteger(leafIndex) || leafIndex < 0)) {
    throw new Error("Expected note record leaf index to be null or a non-negative safe integer.");
  }

  const normalizedMerklePath = {
    root: merklePath?.root ?? null,
    siblings: merklePath?.siblings ?? [],
    pathIndices: merklePath?.pathIndices ?? [],
    status: merklePath?.status ?? SANDBOX_MERKLE_PATH_STATUS
  };

  if (normalizedMerklePath.root !== null && !isHexBytes32(normalizedMerklePath.root)) {
    throw new Error("Expected note record Merkle path root to be bytes32 hex.");
  }

  if (
    normalizedMerklePath.status !== SANDBOX_MERKLE_PATH_STATUS &&
    normalizedMerklePath.status !== SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
  ) {
    throw new Error("Unsupported note record Merkle path status.");
  }

  for (const sibling of normalizedMerklePath.siblings) {
    if (!isHexBytes32(sibling)) {
      throw new Error("Expected every Merkle path sibling to be bytes32 hex.");
    }
  }

  for (const pathIndex of normalizedMerklePath.pathIndices) {
    if (!Number.isSafeInteger(pathIndex) || (pathIndex !== 0 && pathIndex !== 1)) {
      throw new Error("Expected every Merkle path index to be 0 or 1.");
    }
  }

  if (normalizedMerklePath.siblings.length !== normalizedMerklePath.pathIndices.length) {
    throw new Error("Expected Merkle path siblings and path indices to have the same length.");
  }

  if (
    commitmentDerivationStatus !== SANDBOX_COMMITMENT_DERIVATION_STATUS &&
    commitmentDerivationStatus !== SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS
  ) {
    throw new Error("Unsupported note record commitment derivation status.");
  }

  if (commitmentDerivedFromSpendMaterial !== (commitmentDerivationStatus === SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS)) {
    throw new Error("Note record commitment derivation marker does not match its status.");
  }

  if (
    status !== SANDBOX_NOTE_STATUS &&
    status !== SANDBOX_NOTE_WITH_MERKLE_PATH_STATUS &&
    status !== SANDBOX_NOTE_WITH_PROOF_STATUS
  ) {
    throw new Error("Unsupported note record status.");
  }

  if (
    proofGenerationStatus !== SANDBOX_PROOF_GENERATION_STATUS &&
    proofGenerationStatus !== SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS &&
    proofGenerationStatus !== SANDBOX_BROWSER_PROOF_GENERATED_STATUS
  ) {
    throw new Error("Unsupported note record proof generation status.");
  }

  return {
    version: SANDBOX_NOTE_RECORD_VERSION,
    chainId: deployment.chainId,
    rpcUrl: deployment.rpcUrl,
    pool: deployment.pool,
    assetId,
    noteAmountWei,
    ownerCommitment,
    noteSecret,
    blinding,
    commitment,
    commitmentDerivationStatus,
    commitmentDerivedFromSpendMaterial,
    leafIndex,
    merklePath: normalizedMerklePath,
    depositTxHash,
    currentRootAfter,
    createdAt,
    status,
    proofGenerationStatus,
    warning: SANDBOX_NOTE_RECORD_WARNING
  };
}

export function serializeSandboxSpendMaterialNoteRecord(record: SandboxSpendMaterialNoteRecord): string {
  return JSON.stringify(record, null, 2);
}

export function serializeSandboxDepositNoteRecord(record: SandboxSpendMaterialNoteRecord): string {
  return serializeSandboxSpendMaterialNoteRecord(record);
}

export type SandboxSpendMaterialNoteRecordExpectedDeployment =
  | SandboxSpendMaterialNoteRecordDeployment
  | HexString;

function resolveExpectedNoteRecordDeployment(
  expected: SandboxSpendMaterialNoteRecordExpectedDeployment | undefined,
  recordPool: string
): Partial<SandboxSpendMaterialNoteRecordDeployment> & { pool: HexString } {
  if (expected && typeof expected !== "string") {
    if (!isSupportedMegaEthChainId(expected.chainId)) {
      throw new Error("Expected note record chain ID to be MegaETH mainnet or testnet.");
    }
    if (!isNonEmptyString(expected.rpcUrl)) {
      throw new Error("Expected note record RPC URL.");
    }
    if (!isEvmAddress(expected.pool)) {
      throw new Error("Expected shielded pool to be an EVM address.");
    }
    if (isLegacyMainnetShieldedPoolDepth20(expected.pool)) {
      throw new Error("Legacy MegaETH mainnet ShieldedPoolDepth20 address is not a supported NullarkPool binding.");
    }
    return expected;
  }

  const expectedPool = expected ?? recordPool;
  if (!isEvmAddress(expectedPool)) {
    throw new Error("Expected shielded pool to be an EVM address.");
  }
  if (isLegacyMainnetShieldedPoolDepth20(expectedPool)) {
    throw new Error("Legacy MegaETH mainnet ShieldedPoolDepth20 address is not a supported NullarkPool binding.");
  }

  return knownNoteRecordDeploymentForPool(expectedPool) ?? { pool: expectedPool };
}

export function parseSandboxSpendMaterialNoteRecord(
  value: string,
  expectedDeployment?: SandboxSpendMaterialNoteRecordExpectedDeployment
): SandboxSpendMaterialNoteRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Expected note record JSON.");
  }

  const record = parsed as Partial<SandboxSpendMaterialNoteRecord>;
  if (record.version !== SANDBOX_NOTE_RECORD_VERSION) {
    throw new Error("Unsupported note record version.");
  }

  if (!isSupportedMegaEthChainId(record.chainId)) {
    throw new Error("Unsupported note record chain ID.");
  }

  if (!isNonEmptyString(record.rpcUrl)) {
    throw new Error("Expected note record RPC URL.");
  }

  if (typeof record.pool !== "string") {
    throw new Error("Expected shielded pool to be an EVM address.");
  }
  if (isLegacyMainnetShieldedPoolDepth20(record.pool)) {
    throw new Error("Legacy MegaETH mainnet ShieldedPoolDepth20 address is not a supported NullarkPool binding.");
  }

  const expected = resolveExpectedNoteRecordDeployment(expectedDeployment, record.pool);
  if (expected.chainId !== undefined && record.chainId !== expected.chainId) {
    throw new Error("Note record is not for expected MegaETH chain.");
  }

  if (expected.rpcUrl !== undefined && record.rpcUrl !== expected.rpcUrl) {
    throw new Error("Note record is not for expected MegaETH RPC.");
  }

  if (record.pool.toLowerCase() !== expected.pool.toLowerCase()) {
    throw new Error("Note record is not for this shielded pool.");
  }

  if (
    record.proofGenerationStatus !== SANDBOX_PROOF_GENERATION_STATUS &&
    record.proofGenerationStatus !== SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS &&
    record.proofGenerationStatus !== SANDBOX_BROWSER_PROOF_GENERATED_STATUS
  ) {
    throw new Error("Unsupported note record proof generation status.");
  }

  if (
    record.status !== SANDBOX_NOTE_STATUS &&
    record.status !== SANDBOX_NOTE_WITH_MERKLE_PATH_STATUS &&
    record.status !== SANDBOX_NOTE_WITH_PROOF_STATUS
  ) {
    throw new Error("Unsupported note record status.");
  }

  if (
    record.commitmentDerivationStatus !== SANDBOX_COMMITMENT_DERIVATION_STATUS &&
    record.commitmentDerivationStatus !== SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS
  ) {
    throw new Error("Unsupported note record commitment derivation status.");
  }

  if (typeof record.commitmentDerivedFromSpendMaterial !== "boolean") {
    throw new Error("Note record commitment derivation marker is missing.");
  }

  if (record.warning !== SANDBOX_NOTE_RECORD_WARNING) {
    throw new Error("Note record warning marker is missing.");
  }

  return createSandboxSpendMaterialNoteRecord({
    assetId: record.assetId ?? "",
    commitment: record.commitment ?? "",
    noteAmountWei: record.noteAmountWei ?? "",
    ownerCommitment: record.ownerCommitment ?? "",
    noteSecret: record.noteSecret ?? "",
    blinding: record.blinding ?? "",
    depositTxHash: record.depositTxHash ?? "",
    currentRootAfter: record.currentRootAfter ?? null,
    createdAt: record.createdAt ?? "",
    leafIndex: record.leafIndex ?? null,
    merklePath: record.merklePath,
    commitmentDerivationStatus: record.commitmentDerivationStatus,
    commitmentDerivedFromSpendMaterial: record.commitmentDerivedFromSpendMaterial,
    status: record.status,
    proofGenerationStatus: record.proofGenerationStatus,
    chainId: record.chainId,
    rpcUrl: record.rpcUrl,
    pool: expected.pool
  });
}

export function parseSandboxDepositNoteRecord(value: string): SandboxSpendMaterialNoteRecord {
  return parseSandboxSpendMaterialNoteRecord(value);
}

export function createSandboxNoteVaultEntry({
  record,
  spent = false,
  spentNullifier = null,
  updatedAt
}: {
  record: SandboxSpendMaterialNoteRecord;
  spent?: boolean;
  spentNullifier?: HexString | null;
  updatedAt: string;
}): SandboxNoteVaultEntry {
  if (!updatedAt) {
    throw new Error("Expected note vault update time.");
  }
  if (spentNullifier !== null && !isHexBytes32(spentNullifier)) {
    throw new Error("Expected spent note nullifier to be bytes32 hex.");
  }

  return {
    version: SANDBOX_NOTE_VAULT_VERSION,
    record,
    spent,
    spentNullifier,
    updatedAt
  };
}

export function parseSandboxNoteVault(value: string): SandboxNoteVault {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Expected sandbox note vault JSON.");
  }

  const vault = parsed as Partial<SandboxNoteVault>;
  if (vault.version !== SANDBOX_NOTE_VAULT_VERSION || !Array.isArray(vault.entries)) {
    throw new Error("Unsupported sandbox note vault version.");
  }

  return {
    version: SANDBOX_NOTE_VAULT_VERSION,
    entries: vault.entries.map((entry) => {
      const candidate = entry as Partial<SandboxNoteVaultEntry>;
      if (candidate.version !== SANDBOX_NOTE_VAULT_VERSION) {
        throw new Error("Unsupported sandbox note vault entry version.");
      }
      if (typeof candidate.spent !== "boolean") {
        throw new Error("Expected sandbox note vault spent marker.");
      }

      return createSandboxNoteVaultEntry({
        record: parseSandboxSpendMaterialNoteRecord(JSON.stringify(candidate.record ?? {})),
        spent: candidate.spent,
        spentNullifier: candidate.spentNullifier ?? null,
        updatedAt: candidate.updatedAt ?? ""
      });
    })
  };
}

export function serializeSandboxNoteVault(entries: SandboxNoteVaultEntry[]): string {
  return JSON.stringify({ version: SANDBOX_NOTE_VAULT_VERSION, entries }, null, 2);
}

export function loadSandboxNoteVault(storage: Pick<Storage, "getItem"> | null | undefined): SandboxNoteVaultEntry[] {
  if (!storage) {
    return [];
  }

  const value = storage.getItem(SANDBOX_NOTE_VAULT_STORAGE_KEY);
  if (!value) {
    return [];
  }

  return parseSandboxNoteVault(value).entries;
}

export function saveSandboxNoteVault(
  storage: Pick<Storage, "setItem"> | null | undefined,
  entries: SandboxNoteVaultEntry[]
): void {
  if (!storage) {
    return;
  }

  storage.setItem(SANDBOX_NOTE_VAULT_STORAGE_KEY, serializeSandboxNoteVault(entries));
}

export function upsertSandboxNoteVaultRecord({
  entries,
  record,
  updatedAt
}: {
  entries: SandboxNoteVaultEntry[];
  record: SandboxSpendMaterialNoteRecord;
  updatedAt: string;
}): SandboxNoteVaultEntry[] {
  const normalizedCommitment = record.commitment.toLowerCase();
  const existing = entries.find((entry) => entry.record.commitment.toLowerCase() === normalizedCommitment);
  const nextEntry = createSandboxNoteVaultEntry({
    record,
    spent: existing?.spent ?? false,
    spentNullifier: existing?.spentNullifier ?? null,
    updatedAt
  });
  const withoutExisting = entries.filter((entry) => entry.record.commitment.toLowerCase() !== normalizedCommitment);

  return [nextEntry, ...withoutExisting];
}

export function markSandboxNoteVaultRecordSpent({
  entries,
  commitment,
  spentNullifier,
  updatedAt
}: {
  entries: SandboxNoteVaultEntry[];
  commitment: string;
  spentNullifier: string;
  updatedAt: string;
}): SandboxNoteVaultEntry[] {
  if (!isHexBytes32(spentNullifier)) {
    throw new Error("Expected spent note nullifier to be bytes32 hex.");
  }
  const normalizedCommitment = commitment.toLowerCase();

  return entries.map((entry) =>
    entry.record.commitment.toLowerCase() === normalizedCommitment
      ? createSandboxNoteVaultEntry({
          record: entry.record,
          spent: true,
          spentNullifier,
          updatedAt
        })
      : entry
  );
}

export function selectFirstAvailableSandboxNote(entries: SandboxNoteVaultEntry[]): SandboxSpendMaterialNoteRecord | null {
  return entries.find((entry) => !entry.spent)?.record ?? null;
}

export function selectSandboxNoteForWithdrawal({
  entries,
  grossAmountWei
}: {
  entries: SandboxNoteVaultEntry[];
  grossAmountWei: string;
}): SandboxSpendMaterialNoteRecord | null {
  if (!/^[0-9]+$/.test(grossAmountWei) || BigInt(grossAmountWei) < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected withdrawal amount wei as a positive decimal integer.");
  }
  const requestedWei = BigInt(grossAmountWei);
  const candidates = entries
    .filter((entry) => !entry.spent && BigInt(entry.record.noteAmountWei) >= requestedWei)
    .sort((a, b) => {
      const byAmount = BigInt(a.record.noteAmountWei) - BigInt(b.record.noteAmountWei);
      if (byAmount < 0n) return -1;
      if (byAmount > 0n) return 1;
      return a.updatedAt.localeCompare(b.updatedAt);
    });

  return candidates[0]?.record ?? null;
}

export function selectLargestAvailableSandboxNote(entries: SandboxNoteVaultEntry[]): SandboxSpendMaterialNoteRecord | null {
  const candidates = entries
    .filter((entry) => !entry.spent)
    .sort((a, b) => {
      const byAmount = BigInt(b.record.noteAmountWei) - BigInt(a.record.noteAmountWei);
      if (byAmount < 0n) return -1;
      if (byAmount > 0n) return 1;
      return a.updatedAt.localeCompare(b.updatedAt);
    });

  return candidates[0]?.record ?? null;
}

export function deriveSandboxNoteVaultAvailableBalanceWei(entries: SandboxNoteVaultEntry[]): string {
  const balance = entries.reduce((total, entry) => {
    if (entry.spent) {
      return total;
    }

    return total + BigInt(entry.record.noteAmountWei);
  }, 0n);

  return balance.toString();
}

export function assertWithdrawPublicInputBinding({
  publicInputs,
  nullifier,
  destination,
  grossAmountWei,
  currentRoot,
  changeCommitment,
  expectedPool = SHIELDED_POOL_ADDRESS,
  expectedChainId = MEGAETH_TESTNET_CHAIN_ID
}: {
  publicInputs: string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  currentRoot: string;
  changeCommitment?: string | undefined;
  expectedPool?: HexString;
  expectedChainId?: typeof MEGAETH_TESTNET_CHAIN_ID | 4326;
}): void {
  if (publicInputs.length !== NULLARK_V1_1_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Expected exactly 12 public input bytes32 values.");
  }

  for (const input of publicInputs) {
    if (!isHexBytes32(input)) {
      throw new Error("Expected every public input to be bytes32 hex.");
    }
  }
  const [
    proofRoot,
    proofNullifier,
    proofChangeCommitment,
    proofDestination,
    proofGrossAmount,
    ,
    proofChainId,
    proofPool,
    proofSpentCommitment,
    proofNoteAmount,
    proofContextHash,
    encryptedNoteHash
  ] = publicInputs as [
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString
  ];

  if (!isHexBytes32(currentRoot)) {
    throw new Error("Expected current root to be bytes32 hex.");
  }

  if (proofRoot.toLowerCase() !== currentRoot.toLowerCase()) {
    throw new Error("Withdrawal proof root does not match the current pool root.");
  }

  if (proofNullifier.toLowerCase() !== nullifier.trim().toLowerCase()) {
    throw new Error("Withdrawal nullifier does not match public inputs.");
  }

  if (proofChangeCommitment !== ZERO_BYTES32 && !isBn254FieldElement(proofChangeCommitment)) {
    throw new Error("Withdrawal change commitment is not a nonzero BN254 field element.");
  }

  if (changeCommitment !== undefined && proofChangeCommitment.toLowerCase() !== changeCommitment.trim().toLowerCase()) {
    throw new Error("Withdrawal change commitment does not match public inputs.");
  }

  if (bytes32ToEvmAddress(proofDestination).toLowerCase() !== destination.trim().toLowerCase()) {
    throw new Error("Withdrawal destination does not match public inputs.");
  }

  if (bytes32ToDecimal(proofGrossAmount) !== grossAmountWei.trim()) {
    throw new Error("Withdrawal amount does not match public inputs.");
  }

  if (bytes32ToDecimal(proofChainId) !== expectedChainId.toString()) {
    throw new Error("Withdrawal proof is not bound to the active MegaETH chain.");
  }

  if (bytes32ToEvmAddress(proofPool).toLowerCase() !== expectedPool.toLowerCase()) {
    throw new Error("Withdrawal proof is not bound to this shielded pool.");
  }
  if (!isBn254FieldElement(proofSpentCommitment)) {
    throw new Error("Withdrawal spent commitment is not a nonzero BN254 field element.");
  }
  if (bytes32ToDecimal(proofNoteAmount) === "0") {
    throw new Error("Withdrawal note amount must be positive.");
  }
  if (proofContextHash === ZERO_BYTES32 || encryptedNoteHash === ZERO_BYTES32) {
    throw new Error("Withdrawal proof must bind nonzero proof context and encrypted note hashes.");
  }
}

export function assertPrivateTransferPublicInputBinding({
  publicInputs,
  nullifier,
  newCommitment,
  currentRoot,
  expectedPool = SHIELDED_POOL_ADDRESS,
  expectedChainId = MEGAETH_TESTNET_CHAIN_ID
}: {
  publicInputs: string[];
  nullifier: string;
  newCommitment: string;
  currentRoot: string;
  expectedPool?: HexString;
  expectedChainId?: typeof MEGAETH_TESTNET_CHAIN_ID | 4326;
}): void {
  if (publicInputs.length !== NULLARK_V1_1_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Expected exactly 12 public input bytes32 values.");
  }

  for (const input of publicInputs) {
    if (!isHexBytes32(input)) {
      throw new Error("Expected every public input to be bytes32 hex.");
    }
  }
  const [
    proofRoot,
    proofNullifier,
    proofNewCommitment,
    proofDestination,
    proofGrossAmount,
    proofFee,
    proofChainId,
    proofPool,
    proofSpentCommitment,
    proofNoteAmount,
    proofContextHash,
    encryptedNoteHash
  ] = publicInputs as [
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString,
    HexString
  ];

  if (!isHexBytes32(currentRoot)) {
    throw new Error("Expected current root to be bytes32 hex.");
  }
  if (proofRoot.toLowerCase() !== currentRoot.toLowerCase()) {
    throw new Error("Private transfer proof root does not match the current pool root.");
  }
  if (proofNullifier.toLowerCase() !== nullifier.trim().toLowerCase()) {
    throw new Error("Private transfer nullifier does not match public inputs.");
  }
  if (proofNewCommitment.toLowerCase() !== newCommitment.trim().toLowerCase()) {
    throw new Error("Private transfer commitment does not match public inputs.");
  }
  if (!isBn254FieldElement(proofNewCommitment)) {
    throw new Error("Private transfer commitment is not a nonzero BN254 field element.");
  }
  if (proofDestination !== ZERO_BYTES32 || proofGrossAmount !== ZERO_BYTES32 || proofFee !== ZERO_BYTES32) {
    throw new Error("Private transfer public amount fields must be zero.");
  }
  if (bytes32ToDecimal(proofChainId) !== expectedChainId.toString()) {
    throw new Error("Private transfer proof is not bound to the active MegaETH chain.");
  }
  if (bytes32ToEvmAddress(proofPool).toLowerCase() !== expectedPool.toLowerCase()) {
    throw new Error("Private transfer proof is not bound to this shielded pool.");
  }
  if (!isBn254FieldElement(proofSpentCommitment)) {
    throw new Error("Private transfer spent commitment is not a nonzero BN254 field element.");
  }
  if (bytes32ToDecimal(proofNoteAmount) === "0") {
    throw new Error("Private transfer note amount must be positive.");
  }
  if (proofContextHash === ZERO_BYTES32 || encryptedNoteHash === ZERO_BYTES32) {
    throw new Error("Private transfer proof must bind nonzero proof context and encrypted note hashes.");
  }
}

export function parsePrivateReceiveCode(value: string, expectedPool: HexString = SHIELDED_POOL_ADDRESS): PrivateReceiveCode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Expected private receive code JSON.");
  }
  const code = parsed as Partial<PrivateReceiveCode>;
  if (code.version !== "shielded-receive-code-v1") {
    throw new Error("Unsupported private receive code version.");
  }
  if (code.chainId !== MEGAETH_TESTNET_CHAIN_ID) {
    throw new Error("Private receive code is not for MegaETH testnet.");
  }
  if (!isEvmAddress(expectedPool)) {
    throw new Error("Expected shielded pool to be an EVM address.");
  }
  if (typeof code.pool !== "string" || code.pool.toLowerCase() !== expectedPool.toLowerCase()) {
    throw new Error("Private receive code is not for this shielded pool.");
  }
  if (!isHexBytes32(code.assetId ?? "")) {
    throw new Error("Private receive code asset ID must be bytes32 hex.");
  }
  if (!/^[0-9]+$/.test(code.noteAmountWei ?? "") || BigInt(code.noteAmountWei ?? "0") < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Private receive code amount must be a positive decimal wei string.");
  }
  if (!isBn254FieldElement(code.ownerCommitment ?? "")) {
    throw new Error("Private receive code owner commitment must be a nonzero BN254 field element.");
  }
  if (!isBn254FieldElement(code.noteSecret ?? "")) {
    throw new Error("Private receive code secret must be a nonzero BN254 field element.");
  }
  if (!isBn254FieldElement(code.commitment ?? "")) {
    throw new Error("Private receive code commitment must be a nonzero BN254 field element.");
  }
  if (!isHexString(code.encryptedNote ?? "")) {
    throw new Error("Private receive code encrypted note must be even-length hex.");
  }
  if (!code.createdAt) {
    throw new Error("Private receive code creation time is missing.");
  }

  return code as PrivateReceiveCode;
}

export function encodeBytes32Argument(value: string): string {
  if (!isHexBytes32(value)) {
    throw new Error("Expected a 32-byte hex value.");
  }

  return value.slice(2).toLowerCase();
}

export function encodeCommitmentLookupCalldata(commitment: string): HexString {
  return `${COMMITMENTS_SELECTOR}${encodeBytes32Argument(commitment)}`;
}

export function encodeNullifierLookupCalldata(nullifier: string): HexString {
  return `${NULLIFIERS_SELECTOR}${encodeBytes32Argument(nullifier)}`;
}

export function encodeDepositCalldata(commitment: string): HexString {
  return `${DEPOSIT_SELECTOR}${encodeBytes32Argument(commitment)}`;
}

function normalizeHexBytes(value: string, errorMessage: string): HexString {
  const normalized = value.trim();
  if (!isHexString(normalized)) {
    throw new Error(errorMessage);
  }

  return normalized.toLowerCase() as HexString;
}

function normalizeDecimalUint256(value: string, errorMessage: string): bigint {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(errorMessage);
  }

  return BigInt(normalized);
}

function assertPublicInputs(publicInputs: readonly string[]): asserts publicInputs is readonly HexString[] {
  if (publicInputs.length !== NULLARK_V1_1_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Expected exactly 12 public input bytes32 values.");
  }

  for (const input of publicInputs) {
    if (!isHexBytes32(input)) {
      throw new Error("Expected every public input to be bytes32 hex.");
    }
  }
}

export function encodeDepositWithEncryptedNoteCalldata(commitment: string, encryptedNote: string): HexString {
  if (!isHexBytes32(commitment)) {
    throw new Error("Expected deposit commitment to be bytes32.");
  }

  return encodeFunctionData({
    abi: SHIELDED_POOL_ENCRYPTED_NOTE_ABI,
    functionName: "deposit",
    args: [commitment, normalizeHexBytes(encryptedNote, "Expected encrypted note to be even-length hex bytes.")]
  });
}

export function encodePrivateTransferWithEncryptedNoteCalldata(input: {
  proof: string;
  publicInputs: readonly string[];
  nullifier: string;
  newCommitment: string;
  encryptedNote: string;
}): HexString {
  const proof = normalizeHexBytes(input.proof, "Expected proof and encrypted note to be even-length hex bytes.");
  const encryptedNote = normalizeHexBytes(
    input.encryptedNote,
    "Expected proof and encrypted note to be even-length hex bytes."
  );

  assertPublicInputs(input.publicInputs);

  if (!isHexBytes32(input.nullifier)) {
    throw new Error("Expected a 32-byte nullifier.");
  }

  if (!isHexBytes32(input.newCommitment)) {
    throw new Error("Expected private transfer new commitment to be bytes32.");
  }

  return encodeFunctionData({
    abi: SHIELDED_POOL_ENCRYPTED_NOTE_ABI,
    functionName: "privateTransfer",
    args: [proof, input.publicInputs, input.nullifier, input.newCommitment, encryptedNote]
  });
}

export function encodeStageCWithdrawChangeNoteCalldata(input: {
  proof: string;
  publicInputs: readonly string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  encryptedChangeNote: string;
  minNetAmountWei: string;
  maxFeeWei: string;
}): HexString {
  const proof = normalizeHexBytes(input.proof, "Expected proof and encrypted change note to be even-length hex bytes.");
  const encryptedChangeNote = normalizeHexBytes(
    input.encryptedChangeNote,
    "Expected proof and encrypted change note to be even-length hex bytes."
  );
  const amountError = "Expected gross amount, minimum net amount, and maximum fee as decimal integers.";
  const grossAmount = normalizeDecimalUint256(input.grossAmountWei, amountError);
  const minNetAmount = normalizeDecimalUint256(input.minNetAmountWei, amountError);
  const maxFeeAmount = normalizeDecimalUint256(input.maxFeeWei, amountError);
  const normalizedDestination = input.destination.trim();

  assertPublicInputs(input.publicInputs);

  if (!isHexBytes32(input.nullifier)) {
    throw new Error("Expected a 32-byte nullifier.");
  }

  if (!isEvmAddress(normalizedDestination)) {
    throw new Error("Expected a valid EVM destination address.");
  }

  if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected gross amount wei to be positive.");
  }

  if (minNetAmount > grossAmount) {
    throw new Error("Expected minimum net amount to be less than or equal to gross amount.");
  }

  if (maxFeeAmount > grossAmount) {
    throw new Error("Expected maximum fee to be less than or equal to gross amount.");
  }

  return encodeFunctionData({
    abi: SHIELDED_POOL_ENCRYPTED_NOTE_ABI,
    functionName: "withdraw",
    args: [
      proof,
      input.publicInputs,
      input.nullifier,
      normalizedDestination,
      grossAmount,
      encryptedChangeNote,
      minNetAmount,
      maxFeeAmount
    ]
  });
}

export function encodeWithdrawBoundedCalldata({
  proof,
  publicInputs,
  nullifier,
  destination,
  grossAmountWei,
  minNetAmountWei,
  maxFeeWei
}: {
  proof: string;
  publicInputs: readonly string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  minNetAmountWei: string;
  maxFeeWei: string;
}): HexString {
  const normalizedProof = normalizeHexBytes(proof, "Expected proof to be even-length hex bytes.");
  const normalizedDestination = destination.trim();
  const amountError = "Expected gross amount, minimum net amount, and maximum fee as decimal integers.";
  const grossAmount = normalizeDecimalUint256(grossAmountWei, amountError);
  const minNetAmount = normalizeDecimalUint256(minNetAmountWei, amountError);
  const maxFeeAmount = normalizeDecimalUint256(maxFeeWei, amountError);

  assertPublicInputs(publicInputs);

  if (!isHexBytes32(nullifier)) {
    throw new Error("Expected a 32-byte nullifier.");
  }

  if (!isEvmAddress(normalizedDestination)) {
    throw new Error("Expected a valid EVM destination address.");
  }

  if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected gross amount wei to be positive.");
  }

  if (minNetAmount > grossAmount) {
    throw new Error("Expected minimum net amount to be less than or equal to gross amount.");
  }

  if (maxFeeAmount > grossAmount) {
    throw new Error("Expected maximum fee to be less than or equal to gross amount.");
  }

  return encodeFunctionData({
    abi: SHIELDED_POOL_ENCRYPTED_NOTE_ABI,
    functionName: "withdraw",
    args: [normalizedProof, publicInputs, nullifier, normalizedDestination, grossAmount, "0x", minNetAmount, maxFeeAmount]
  });
}

export function parsePositiveWeiToHex(value: string): HexString {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized) || BigInt(normalized) < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected deposit amount wei to be a positive integer.");
  }

  return `0x${BigInt(normalized).toString(16)}`;
}

export function parseEthDecimalToWei(value: string): string {
  const normalized = value.trim();
  if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(normalized)) {
    throw new Error("Expected ETH amount as a positive decimal value.");
  }

  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > 18) {
    throw new Error("ETH amount cannot have more than 18 decimal places.");
  }

  const wei =
    BigInt(wholePart || "0") * 1_000_000_000_000_000_000n +
    BigInt(fractionPart.padEnd(18, "0") || "0");
  if (wei < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected ETH amount to be greater than zero.");
  }

  return wei.toString();
}

export function fixedDepositDenominationLabels(): string[] {
  return [...MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((denomination) => formatWeiToEthDecimal(denomination.toString()));
}

export function isSupportedFixedDenominationWei(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) {
    return false;
  }
  return isSupportedFixedDenomination(BigInt(value));
}

export function supportedPrivateChangeDenominationLabels(noteAmountWei: string): string[] {
  if (!/^[0-9]+$/.test(noteAmountWei)) {
    throw new Error("Expected note amount wei as a decimal integer.");
  }
  const noteAmount = BigInt(noteAmountWei);
  return [...MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI]
    .filter((denomination) => denomination < noteAmount)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((denomination) => formatWeiToEthDecimal(denomination.toString()));
}

export type SpendablePublicExitChoice = {
  grossAmountWei: string;
  grossAmountEth: string;
  changeAmountWei: string;
  changeAmountEth: string;
  isFullExit: boolean;
};

export function spendablePublicExitChoicesForNote(
  noteAmountWei: string,
  { allowFullExit = true }: { allowFullExit?: boolean } = {}
): SpendablePublicExitChoice[] {
  if (!/^[0-9]+$/.test(noteAmountWei)) {
    throw new Error("Expected note amount wei as a decimal integer.");
  }
  const noteAmount = BigInt(noteAmountWei);
  return spendablePublicExitAmountsForNote(noteAmount, {
    denominationsWei: MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
    allowFullExit
  }).map((grossAmountWei) => {
    const changeAmountWei = noteAmount - grossAmountWei;
    return {
      grossAmountWei: grossAmountWei.toString(),
      grossAmountEth: formatWeiToEthDecimal(grossAmountWei.toString()),
      changeAmountWei: changeAmountWei.toString(),
      changeAmountEth: formatWeiToEthDecimal(changeAmountWei.toString()),
      isFullExit: changeAmountWei === 0n
    };
  });
}

export function parseSingleFixedDepositEthDecimalToWei(value: string): string {
  const amountWei = BigInt(parseEthDecimalToWei(value));
  try {
    const split = splitIntoFixedDenominations(amountWei);
    if (split.noteCount === 1 && isSupportedFixedDenomination(amountWei)) {
      return amountWei.toString();
    }
  } catch {
    // Normalize core policy errors into one user-facing deposit boundary message.
  }

  throw new Error(`Choose one fixed deposit denomination: ${fixedDepositDenominationLabels().join(", ")} ETH.`);
}

export function formatWeiToEthDecimal(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error("Expected wei amount as a decimal integer.");
  }

  const wei = BigInt(normalized);
  const whole = wei / 1_000_000_000_000_000_000n;
  const fraction = wei % 1_000_000_000_000_000_000n;
  const fractionText = fraction.toString().padStart(18, "0").replace(/0+$/, "");

  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error("Expected unsigned integer value.");
  }

  return value.toString(16).padStart(64, "0");
}

function encodeDynamicBytes(value: HexString): string {
  const bytes = value.slice(2).toLowerCase();
  const length = bytes.length / 2;
  const paddedLength = Math.ceil(bytes.length / 64) * 64;

  return `${encodeUint256(BigInt(length))}${bytes.padEnd(paddedLength, "0")}`;
}

function encodeBytes32Array(values: string[]): string {
  return `${encodeUint256(BigInt(values.length))}${values.map(encodeBytes32Argument).join("")}`;
}

export function encodeWithdrawCalldata({
  proof,
  publicInputs,
  nullifier,
  destination,
  grossAmountWei
}: {
  proof: string;
  publicInputs: string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
}): HexString {
  const normalizedProof = proof.trim();
  const normalizedDestination = destination.trim();
  const normalizedGrossAmount = grossAmountWei.trim();

  if (!isHexString(normalizedProof)) {
    throw new Error("Expected proof to be even-length hex bytes.");
  }

  if (publicInputs.length !== NULLARK_V1_1_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Expected exactly 12 public input bytes32 values.");
  }

  if (!isHexBytes32(nullifier)) {
    throw new Error("Expected a 32-byte nullifier.");
  }

  if (!isEvmAddress(normalizedDestination)) {
    throw new Error("Expected a valid EVM destination address.");
  }

  if (!/^[0-9]+$/.test(normalizedGrossAmount)) {
    throw new Error("Expected gross amount wei as a positive decimal integer.");
  }

  const amount = BigInt(normalizedGrossAmount);
  if (amount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected gross amount wei to be positive.");
  }

  const headSizeBytes = 5n * 32n;
  const proofTail = encodeDynamicBytes(normalizedProof);
  const publicInputsTail = encodeBytes32Array(publicInputs);
  const proofOffset = headSizeBytes;
  const publicInputsOffset = headSizeBytes + BigInt(proofTail.length / 2);

  return `${WITHDRAW_SELECTOR}${[
    encodeUint256(proofOffset),
    encodeUint256(publicInputsOffset),
    encodeBytes32Argument(nullifier),
    normalizedDestination.slice(2).toLowerCase().padStart(64, "0"),
    encodeUint256(amount),
    proofTail,
    publicInputsTail
  ].join("")}`;
}

export function boolFromEthCallResult(result: string): boolean {
  if (!/^0x[0-9a-fA-F]+$/.test(result)) {
    throw new Error("Expected hex eth_call result.");
  }

  return BigInt(result) !== 0n;
}

export function reconstructMerklePathFromRootAcceptedLogs({
  logs,
  commitment,
  hash,
  depth = SANDBOX_MERKLE_TREE_DEPTH
}: {
  logs: readonly RootAcceptedLogRecord[];
  commitment: string;
  hash: FieldHash;
  depth?: number;
}): SandboxSpendMaterialNoteRecord["merklePath"] & { leafIndex: number } {
  if (!isHexBytes32(commitment)) {
    throw new Error("Expected commitment to be bytes32 hex.");
  }
  if (!Number.isSafeInteger(depth) || depth <= 0 || depth > 32) {
    throw new Error("Expected Merkle depth to be a positive safe integer.");
  }

  const leaves = logs
    .map((log) => log.insertedCommitment)
    .filter((insertedCommitment) => BigInt(insertedCommitment) !== 0n);
  const leafIndex = leaves.findIndex((leaf) => leaf.toLowerCase() === commitment.toLowerCase());
  if (leafIndex < 0) {
    throw new Error("Imported note commitment was not found in RootAccepted history.");
  }

  if (leaves.length > 2 ** depth) {
    throw new Error("RootAccepted history exceeds the sandbox Merkle tree capacity.");
  }

  const siblings: HexString[] = [];
  const pathIndices: number[] = [];
  const zeroHashes = buildMerkleZeroHashes(depth, hash);
  let layer = new Map<number, bigint>();
  leaves.forEach((leaf, index) => {
    layer.set(index, BigInt(leaf));
  });
  let cursor = leafIndex;
  for (let level = 0; level < depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    const sibling = layer.get(cursor ^ 1) ?? zeroHash;
    siblings.push(bigintToBytes32(sibling));
    pathIndices.push(cursor % 2);
    layer = buildNextSparseMerkleLayer(layer, zeroHash, hash);
    cursor = Math.floor(cursor / 2);
  }

  return {
    leafIndex,
    root: bigintToBytes32(layer.get(0) ?? zeroHashes[depth] ?? 0n),
    siblings,
    pathIndices,
    status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
  };
}

function buildMerkleZeroHashes(depth: number, hash: FieldHash): bigint[] {
  const zeroHashes = [0n];
  for (let level = 0; level < depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    zeroHashes.push(hash([zeroHash, zeroHash]));
  }
  return zeroHashes;
}

function buildNextSparseMerkleLayer(layer: Map<number, bigint>, zeroHash: bigint, hash: FieldHash): Map<number, bigint> {
  const parentIndexes = new Set<number>();
  for (const index of layer.keys()) {
    parentIndexes.add(Math.floor(index / 2));
  }

  const next = new Map<number, bigint>();
  for (const parentIndex of parentIndexes) {
    const left = layer.get(parentIndex * 2) ?? zeroHash;
    const right = layer.get(parentIndex * 2 + 1) ?? zeroHash;
    next.set(parentIndex, hash([left, right]));
  }
  return next;
}

export function bigintToBytes32(value: bigint): HexString {
  if (value < 0n || value >= BigInt(BN254_SCALAR_FIELD)) {
    throw new Error("Expected value to be a BN254 field element.");
  }
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function formatWeiBalance(hexWei: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(hexWei)) {
    throw new Error("Expected hex wei balance.");
  }

  const wei = BigInt(hexWei);
  const whole = wei / 1_000_000_000_000_000_000n;
  const fraction = wei % 1_000_000_000_000_000_000n;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 5).replace(/0+$/, "");

  return fractionText ? `${whole}.${fractionText} ETH` : `${whole} ETH`;
}

export function bytesToHex(bytes: Uint8Array): HexString {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createRandomBytes32(getRandomValues: Crypto["getRandomValues"]): HexString {
  const bytes = new Uint8Array(32);
  getRandomValues.call(globalThis.crypto, bytes);
  bytes[0] = bytes[0]! & 0x1f;
  if (bytes.every((byte) => byte === 0)) {
    bytes[31] = 1;
  }
  return bytesToHex(bytes);
}

export { recoverSpendMaterialFromEvents } from "../recovery/recoveredNotes.js";
export type { EncryptedNoteEventForRecovery, RecoveredSpendMaterial } from "../recovery/recoveredNotes.js";
