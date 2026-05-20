import { encodeAbiParameters, keccak256 } from "viem";
import { reconstructMerklePathFromRootAcceptedLogs, type RootAcceptedLogRecord } from "../merkle/reconstruct.js";
import { createPoseidonFieldHash, deriveNoteCommitment, deriveNullifier } from "../notes/poseidon.js";
import type { SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";
import { STAGE_C_WITHDRAW_BOUNDED_SELECTOR, ZERO_BYTES32 } from "./calldata.js";
import type { WithdrawProofIntent } from "../proving/withdrawProof.js";

export type WithdrawWitness = Record<string, string | string[]>;

export type RecoveryMerklePathPayload = {
  commitment: HexString;
  leafIndex: number;
  root: HexString;
  pathElements: readonly HexString[];
  pathIndices: readonly number[];
  chainId: 6343 | 4326;
  pool: HexString;
  latestCheckedBlock: string;
};

export type WithdrawalWitnessBundle = {
  witness: WithdrawWitness;
  intent: WithdrawProofIntent;
  nullifier: HexString;
  changeNote: SpendMaterialPlaintext | null;
  encryptedChangeNote: HexString;
  netAmountWei: string;
};

export type BuildWithdrawalWitnessInput = {
  note: SpendMaterialPlaintext;
  merklePath: RecoveryMerklePathPayload;
  destination: HexString;
  grossAmountWei?: string;
  chainId: 6343 | 4326;
  pool: HexString;
  merkleTreeDepth: number;
  randomBytes?: (length: number) => Uint8Array;
  encryptChangeNote?: (changeNote: SpendMaterialPlaintext) => Promise<HexString>;
  now?: () => Date;
};

export type BuildWithdrawalWitnessFromRootHistoryInput = Omit<BuildWithdrawalWitnessInput, "merklePath"> & {
  rootAcceptedLogs: readonly RootAcceptedLogRecord[];
  latestCheckedBlock?: string | undefined;
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
};

export type StageCWithdrawChangeNotePreflightInput = StageBWithdrawPublicExitPreflightInput & {
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
};

export type WithdrawContextHashes = {
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  proofContextHash: HexString;
};

const NATIVE_ETH_ASSET_ID = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const ZERO_HEX_BYTES = "0x" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const UINT128_MAX = (1n << 128n) - 1n;
const WITHDRAWAL_FEE_BPS = 33n;
const BPS_DENOMINATOR = 10_000n;
const PROOF_CONTEXT_V1_VERSION = 1n;
const PROOF_CONTEXT_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.proof-context.v1");
const PROOF_CONTEXT_V1_SHAPE_WITHDRAW = hashDomainSeparator("withdraw_context_v1_1");
const ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.encrypted-note.v1");
const RELAYER_POLICY_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.relayer-policy.v1");

const PROOF_CONTEXT_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "uint256", name: "chainId" },
  { type: "address", name: "pool" },
  { type: "bytes32", name: "shape" },
  { type: "bytes4", name: "selector" },
  { type: "bytes32", name: "root" },
  { type: "bytes32", name: "nullifier" },
  { type: "address", name: "destination" },
  { type: "uint256", name: "grossAmount" },
  { type: "uint256", name: "fee" },
  { type: "bytes32", name: "encryptedNoteHash" },
  { type: "bytes32", name: "relayerPolicyHash" },
  { type: "uint256", name: "deadlineOrZero" }
] as const;

const ENCRYPTED_NOTE_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "uint256", name: "chainId" },
  { type: "address", name: "pool" },
  { type: "bytes32", name: "shape" },
  { type: "bytes4", name: "selector" },
  { type: "bytes32", name: "nullifier" },
  { type: "bytes32", name: "commitment" },
  { type: "uint256", name: "noteAmount" },
  { type: "bytes", name: "encryptedNote" }
] as const;

const RELAYER_POLICY_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "address", name: "relayer" },
  { type: "uint256", name: "minNetAmount" },
  { type: "uint256", name: "maxFeeAmount" },
  { type: "uint256", name: "deadlineOrZero" }
] as const;

export async function buildWithdrawalWitness(input: BuildWithdrawalWitnessInput): Promise<WithdrawalWitnessBundle> {
  assertNoteForPool(input.note, input.chainId, input.pool);
  assertMerklePath(input.merklePath, input.chainId, input.pool, input.note.commitment, input.merkleTreeDepth);
  if (!isEvmAddress(input.destination) || input.destination === ZERO_ADDRESS) {
    throw new Error("Withdrawal destination must be a nonzero EVM address.");
  }

  const noteAmount = parsePositiveDecimalField(input.note.noteAmountWei, "noteAmountWei");
  const grossAmount =
    input.grossAmountWei === undefined
      ? noteAmount
      : parsePositiveDecimalField(input.grossAmountWei, "grossAmountWei");
  if (grossAmount > noteAmount) {
    throw new Error("Withdrawal amount cannot exceed the recovered note amount.");
  }
  const fee = (grossAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
  const changeAmount = noteAmount - grossAmount;
  const changeNote = changeAmount === 0n ? null : await createChangeNote(input, changeAmount);
  const changeCommitment = changeNote?.commitment ?? ZERO_BYTES32;
  const encryptedChangeNote = changeNote ? await encryptRequiredChangeNote(input, changeNote) : ZERO_HEX_BYTES;

  const expectedCommitment = await deriveNoteCommitment({
    assetId: input.note.assetId,
    noteAmountWei: input.note.noteAmountWei,
    ownerCommitment: input.note.ownerCommitment,
    noteSecret: input.note.noteSecret
  });
  if (expectedCommitment.toLowerCase() !== input.note.commitment.toLowerCase()) {
    throw new Error("Recovered note commitment does not match its spend material.");
  }

  const nullifier = await deriveNullifier({
    noteSecret: input.note.noteSecret,
    leafIndex: input.merklePath.leafIndex,
    chainId: input.chainId,
    verifyingContract: input.pool
  });
  const relayerPolicy = {
    relayer: ZERO_ADDRESS,
    minNetAmount: grossAmount - fee,
    maxFeeAmount: fee,
    deadlineOrZero: 0n
  };
  const hashes =
    changeCommitment === ZERO_BYTES32
      ? computeStageBWithdrawPublicExitHashes({
          chainId: input.chainId,
          pool: input.pool,
          selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
          root: input.merklePath.root,
          nullifier,
          destination: input.destination,
          grossAmount,
          fee,
          noteAmount,
          relayerPolicy
        })
      : computeStageCWithdrawChangeNoteHashes({
          chainId: input.chainId,
          pool: input.pool,
          selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
          root: input.merklePath.root,
          nullifier,
          destination: input.destination,
          grossAmount,
          fee,
          noteAmount,
          changeCommitment,
          changeAmount,
          encryptedChangeNote,
          relayerPolicy
        });

  const destinationDecimal = BigInt(input.destination).toString();
  const poolDecimal = BigInt(input.pool).toString();
  const witness: WithdrawWitness = {
    root: BigInt(input.merklePath.root).toString(),
    nullifier: BigInt(nullifier).toString(),
    newCommitment: BigInt(changeCommitment).toString(),
    destination: destinationDecimal,
    grossAmount: grossAmount.toString(),
    fee: fee.toString(),
    chainId: input.chainId.toString(),
    verifyingContract: poolDecimal,
    spentCommitment: BigInt(input.note.commitment).toString(),
    proofContextHash: BigInt(hashes.proofContextHash).toString(),
    encryptedNoteHash: BigInt(hashes.encryptedNoteHash).toString(),
    pathElements: input.merklePath.pathElements.map((pathElement) => BigInt(pathElement).toString()),
    assetId: BigInt(input.note.assetId).toString(),
    noteAmount: noteAmount.toString(),
    ownerCommitment: BigInt(input.note.ownerCommitment).toString(),
    noteSecret: BigInt(input.note.noteSecret).toString(),
    leafIndex: input.merklePath.leafIndex.toString(),
    withdrawalDestination: destinationDecimal,
    changeAmount: changeAmount.toString(),
    changeOwnerCommitment: changeNote ? BigInt(changeNote.ownerCommitment).toString() : "0",
    changeNoteSecret: changeNote ? BigInt(changeNote.noteSecret).toString() : "0",
    expectedProofContextHash: BigInt(hashes.proofContextHash).toString(),
    expectedEncryptedNoteHash: BigInt(hashes.encryptedNoteHash).toString()
  };

  return {
    witness,
    intent: {
      root: input.merklePath.root,
      nullifier,
      changeCommitment,
      destination: input.destination,
      grossAmountWei: grossAmount.toString(),
      feeWei: fee.toString(),
      chainId: input.chainId,
      pool: input.pool,
      spentCommitment: input.note.commitment,
      noteAmountWei: noteAmount.toString(),
      proofContextHash: hashes.proofContextHash,
      encryptedNoteHash: hashes.encryptedNoteHash
    },
    nullifier,
    changeNote,
    encryptedChangeNote,
    netAmountWei: (grossAmount - fee).toString()
  };
}

export async function buildWithdrawalWitnessFromRootAcceptedLogs(
  input: BuildWithdrawalWitnessFromRootHistoryInput
): Promise<WithdrawalWitnessBundle> {
  const hash = await createPoseidonFieldHash();
  const reconstructed = reconstructMerklePathFromRootAcceptedLogs({
    logs: input.rootAcceptedLogs,
    commitment: input.note.commitment,
    hash,
    depth: input.merkleTreeDepth
  });
  return buildWithdrawalWitness({
    ...input,
    merklePath: {
      commitment: reconstructed.commitment,
      leafIndex: reconstructed.leafIndex,
      root: reconstructed.root,
      pathElements: reconstructed.pathElements,
      pathIndices: reconstructed.pathIndices,
      chainId: input.chainId,
      pool: input.pool,
      latestCheckedBlock: input.latestCheckedBlock ?? "latest"
    }
  });
}

export function computeStageBWithdrawPublicExitHashes(input: StageBWithdrawPublicExitPreflightInput): WithdrawContextHashes {
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;
  const encryptedNoteHash = hashEncryptedNoteV1({
    chainId: input.chainId,
    pool: input.pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
    selector,
    nullifier: input.nullifier,
    commitment: ZERO_BYTES32,
    noteAmount: input.noteAmount,
    encryptedNote: ZERO_HEX_BYTES
  });
  const relayerPolicyHash = hashRelayerPolicyV1(input.relayerPolicy);
  const proofContextHash = hashProofContextV1({
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
  });

  return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
}

export function computeStageCWithdrawChangeNoteHashes(input: StageCWithdrawChangeNotePreflightInput): WithdrawContextHashes {
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;
  const encryptedNoteHash = hashEncryptedNoteV1({
    chainId: input.chainId,
    pool: input.pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
    selector,
    nullifier: input.nullifier,
    commitment: input.changeCommitment,
    noteAmount: input.changeAmount,
    encryptedNote: input.encryptedChangeNote
  });
  const relayerPolicyHash = hashRelayerPolicyV1(input.relayerPolicy);
  const proofContextHash = hashProofContextV1({
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
  });

  return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
}

async function encryptRequiredChangeNote(
  input: BuildWithdrawalWitnessInput,
  changeNote: SpendMaterialPlaintext
): Promise<HexString> {
  if (!input.encryptChangeNote) {
    throw new Error("Encrypted change note bytes are required before generating a split withdrawal proof.");
  }
  const encryptedChangeNote = await input.encryptChangeNote(changeNote);
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(encryptedChangeNote)) {
    throw new Error("Encrypted change note must be nonempty even-length hex bytes.");
  }
  return encryptedChangeNote;
}

async function createChangeNote(
  input: BuildWithdrawalWitnessInput,
  changeAmount: bigint
): Promise<SpendMaterialPlaintext> {
  const randomBytes = input.randomBytes ?? getCryptoRandomBytes;
  const ownerCommitment = createRandomBytes32(randomBytes);
  const noteSecret = createRandomBytes32(randomBytes);
  const commitment = await deriveNoteCommitment({
    assetId: input.note.assetId,
    noteAmountWei: changeAmount.toString(),
    ownerCommitment,
    noteSecret
  });

  return {
    version: "spend-material-v1",
    chainId: input.note.chainId,
    pool: input.note.pool,
    assetId: input.note.assetId,
    noteAmountWei: changeAmount.toString(),
    ownerCommitment,
    noteSecret,
    blinding: createRandomBytes32(randomBytes),
    commitment,
    createdAt: (input.now ?? (() => new Date()))().toISOString()
  };
}

function getCryptoRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hashProofContextV1(input: {
  chainId: number;
  pool: HexString;
  shape: HexString;
  selector: HexString;
  root: HexString;
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  fee: bigint;
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  deadlineOrZero: bigint;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(PROOF_CONTEXT_V1_ABI_PARAMETERS, [
      PROOF_CONTEXT_V1_DOMAIN_SEPARATOR,
      PROOF_CONTEXT_V1_VERSION,
      BigInt(assertSupportedChainId(input.chainId)),
      assertAddress(input.pool, "pool"),
      assertBytes32(input.shape, "shape"),
      assertBytes4(input.selector, "selector"),
      assertNonZeroBytes32(input.root, "root"),
      assertNonZeroBytes32(input.nullifier, "nullifier"),
      assertAddress(input.destination, "destination"),
      assertPositiveUint256(input.grossAmount, "grossAmount"),
      assertUint256(input.fee, "fee"),
      assertBytes32(input.encryptedNoteHash, "encryptedNoteHash"),
      assertBytes32(input.relayerPolicyHash, "relayerPolicyHash"),
      assertUint256(input.deadlineOrZero, "deadlineOrZero")
    ])
  );
}

function hashEncryptedNoteV1(input: {
  chainId: number;
  pool: HexString;
  shape: HexString;
  selector: HexString;
  nullifier: HexString;
  commitment: HexString;
  noteAmount: bigint;
  encryptedNote: HexString;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(ENCRYPTED_NOTE_V1_ABI_PARAMETERS, [
      ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
      PROOF_CONTEXT_V1_VERSION,
      BigInt(assertSupportedChainId(input.chainId)),
      assertAddress(input.pool, "pool"),
      assertBytes32(input.shape, "shape"),
      assertBytes4(input.selector, "selector"),
      assertNonZeroBytes32(input.nullifier, "nullifier"),
      assertBytes32(input.commitment, "commitment"),
      assertPositiveUint256(input.noteAmount, "noteAmount"),
      assertHexBytes(input.encryptedNote, "encryptedNote")
    ])
  );
}

function hashRelayerPolicyV1(input: StageBRelayerPolicyInput): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(RELAYER_POLICY_V1_ABI_PARAMETERS, [
      RELAYER_POLICY_V1_DOMAIN_SEPARATOR,
      PROOF_CONTEXT_V1_VERSION,
      assertAddress(input.relayer, "relayer"),
      assertUint256(input.minNetAmount, "minNetAmount"),
      assertUint256(input.maxFeeAmount, "maxFeeAmount"),
      assertUint256(input.deadlineOrZero, "deadlineOrZero")
    ])
  );
}

function hashDomainSeparator(value: string): HexString {
  return keccak256(new TextEncoder().encode(value));
}

function hashAbiEncodedToField(encoded: HexString): HexString {
  return toBytes32(BigInt(keccak256(assertHexBytes(encoded, "encoded"))) % BN254_SCALAR_FIELD);
}

function assertNoteForPool(note: SpendMaterialPlaintext, chainId: 6343 | 4326, pool: HexString): void {
  if (note.version !== "spend-material-v1") {
    throw new Error("Recovered note has an unsupported version.");
  }
  if (note.chainId !== chainId) {
    throw new Error("Recovered note is not for the configured MegaETH network.");
  }
  if (note.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("Recovered note is not for this shielded pool.");
  }
  if (note.assetId.toLowerCase() !== NATIVE_ETH_ASSET_ID) {
    throw new Error("Recovered note asset is not the native ETH pool asset.");
  }
  for (const [fieldName, value] of [
    ["commitment", note.commitment],
    ["ownerCommitment", note.ownerCommitment],
    ["noteSecret", note.noteSecret]
  ] as const) {
    if (!isBn254FieldElement(value)) {
      throw new Error(`Recovered note ${fieldName} must be a nonzero BN254 field element.`);
    }
  }
}

function assertMerklePath(
  path: RecoveryMerklePathPayload,
  chainId: 6343 | 4326,
  pool: HexString,
  commitment: HexString,
  treeDepth: number
): void {
  if (path.chainId !== chainId) {
    throw new Error("Merkle path is not for the configured MegaETH network.");
  }
  if (path.pool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("Merkle path is not for this shielded pool.");
  }
  if (path.commitment.toLowerCase() !== commitment.toLowerCase()) {
    throw new Error("Merkle path commitment does not match the recovered note.");
  }
  assertNonZeroField(path.root, "Merkle path root");
  if (!Number.isSafeInteger(treeDepth) || treeDepth <= 0 || treeDepth > 32) {
    throw new Error("Withdrawal circuit depth must be between 1 and 32.");
  }
  if (!Number.isSafeInteger(path.leafIndex) || path.leafIndex < 0 || path.leafIndex >= 2 ** treeDepth) {
    throw new Error("Merkle path leaf index must fit the withdrawal circuit depth.");
  }
  if (path.pathElements.length !== treeDepth || path.pathIndices.length !== treeDepth) {
    throw new Error("Merkle path must match the withdrawal circuit depth.");
  }
  for (const element of path.pathElements) {
    assertZeroAllowedField(element, "Merkle path element");
  }
  for (const [level, pathIndex] of path.pathIndices.entries()) {
    if (pathIndex !== 0 && pathIndex !== 1) {
      throw new Error("Merkle path indices must be bits.");
    }
    if (Math.floor(path.leafIndex / 2 ** level) % 2 !== pathIndex) {
      throw new Error("Merkle path indices do not match the leaf index.");
    }
  }
}

function createRandomBytes32(randomBytes: (length: number) => Uint8Array): HexString {
  const bytes = randomBytes(32);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new Error("Random byte provider must return exactly 32 bytes.");
  }
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parsePositiveDecimalField(value: string, fieldName: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${fieldName} must be a decimal integer.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed >= BN254_SCALAR_FIELD) {
    throw new Error(`${fieldName} must be a positive BN254 field element.`);
  }
  if (parsed > UINT128_MAX) {
    throw new Error(`${fieldName} must fit the withdrawal circuit 128-bit amount bound.`);
  }
  return parsed;
}

function isBn254FieldElement(value: string): boolean {
  return isHexBytes32(value) && BigInt(value) > 0n && BigInt(value) < BN254_SCALAR_FIELD;
}

function assertZeroAllowedField(value: HexString, fieldName: string): void {
  if (!isHexBytes32(value) || BigInt(value) >= BN254_SCALAR_FIELD) {
    throw new Error(`${fieldName} must be a BN254 field element.`);
  }
}

function assertNonZeroField(value: HexString, fieldName: string): void {
  assertZeroAllowedField(value, fieldName);
  if (BigInt(value) === 0n) {
    throw new Error(`${fieldName} must be a nonzero BN254 field element.`);
  }
}

function assertSupportedChainId(value: number): 4326 | 6343 {
  if (value !== 4326 && value !== 6343) {
    throw new Error("Expected MegaETH mainnet or testnet chain ID.");
  }
  return value;
}

function assertAddress(value: string, label: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error(`${label} must be an EVM address.`);
  }
  return value as HexString;
}

function assertBytes32(value: string, label: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error(`${label} must be bytes32.`);
  }
  return value as HexString;
}

function assertNonZeroBytes32(value: string, label: string): HexString {
  const bytes32 = assertBytes32(value, label);
  if (bytes32 === ZERO_BYTES32) {
    throw new Error(`${label} must be nonzero bytes32.`);
  }
  return bytes32;
}

function assertBytes4(value: string, label: string): HexString {
  if (!/^0x[0-9a-fA-F]{8}$/.test(value)) {
    throw new Error(`${label} must be bytes4.`);
  }
  return value as HexString;
}

function assertHexBytes(value: string, label: string): HexString {
  if (!isHexString(value)) {
    throw new Error(`${label} must be hex bytes.`);
  }
  return value as HexString;
}

function assertUint256(value: bigint, label: string): bigint {
  if (value < 0n || value >= 1n << 256n) {
    throw new Error(`${label} must be uint256.`);
  }
  return value;
}

function assertPositiveUint256(value: bigint, label: string): bigint {
  if (value <= 0n) {
    throw new Error(`${label} must be positive.`);
  }
  return assertUint256(value, label);
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
