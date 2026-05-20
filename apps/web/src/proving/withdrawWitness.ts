import { BPS_DENOMINATOR, WITHDRAWAL_FEE_BPS } from "@nullark/core";
import type { SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import {
  computeStageBWithdrawPublicExitHashes,
  computeStageCWithdrawChangeNoteHashes
} from "../recovery/encryptedNoteEnvelope.js";
import { deriveBrowserNoteCommitment, deriveBrowserNullifier } from "../recovery/browserPoseidon.js";
import {
  BN254_SCALAR_FIELD,
  MEGAETH_TESTNET_CHAIN_ID,
  MIN_WITHDRAWABLE_AMOUNT_WEI,
  SANDBOX_MERKLE_TREE_DEPTH,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_BOUNDED_SELECTOR,
  ZERO_BYTES32,
  createRandomBytes32,
  isBn254FieldElement,
  isEvmAddress,
  isHexBytes32,
  type HexString
} from "../product/shieldedTransfersHelpers.js";
import type { WithdrawProofIntent } from "./browserWithdrawProver.js";

export type WithdrawWitness = Record<string, string | string[]>;

const DEFAULT_WITHDRAW_TREE_DEPTH = SANDBOX_MERKLE_TREE_DEPTH;
const UINT128_MAX = (1n << 128n) - 1n;

export type RecoveryMerklePathPayload = {
  commitment: HexString;
  leafIndex: number;
  root: HexString;
  pathElements: HexString[];
  pathIndices: number[];
  chainId: 6343 | 4326;
  pool: HexString;
  latestCheckedBlock: string;
};

export type BrowserWithdrawWitnessBundle = {
  witness: WithdrawWitness;
  intent: WithdrawProofIntent;
  nullifier: HexString;
  changeNote: SpendMaterialPlaintext | null;
  encryptedChangeNote: HexString;
  netAmountWei: string;
};

export type BuildBrowserWithdrawWitnessInput = {
  note: SpendMaterialPlaintext;
  merklePath: RecoveryMerklePathPayload;
  destination: HexString;
  grossAmountWei?: string;
  chainId: 6343 | 4326;
  pool: HexString;
  merkleTreeDepth?: number;
  encryptChangeNote?: (changeNote: SpendMaterialPlaintext) => Promise<HexString>;
};

export async function buildBrowserWithdrawWitness(input: BuildBrowserWithdrawWitnessInput): Promise<BrowserWithdrawWitnessBundle> {
  assertNoteForPool(input.note, input.chainId, input.pool);
  assertMerklePath(input.merklePath, input.chainId, input.pool, input.note.commitment, input.merkleTreeDepth ?? DEFAULT_WITHDRAW_TREE_DEPTH);

  if (!isEvmAddress(input.destination) || input.destination === "0x0000000000000000000000000000000000000000") {
    throw new Error("Withdrawal destination must be a nonzero EVM address.");
  }

  const noteAmount = parsePositiveDecimalField(input.note.noteAmountWei, "noteAmountWei");
  const grossAmount = input.grossAmountWei
    ? parsePositiveDecimalField(input.grossAmountWei, "grossAmountWei")
    : noteAmount;
  if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Withdrawal amount must be positive.");
  }
  if (grossAmount > noteAmount) {
    throw new Error("Withdrawal amount cannot exceed the recovered note amount.");
  }

  const fee = (grossAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
  const changeAmount = noteAmount - grossAmount;
  const changeNote = changeAmount === 0n ? null : await createChangeNote(input.note, changeAmount);
  const changeCommitment = changeNote?.commitment ?? ZERO_BYTES32;
  const encryptedChangeNote = changeNote ? await encryptRequiredChangeNote(input, changeNote) : ZERO_HEX_BYTES;

  const expectedCommitment = await deriveBrowserNoteCommitment({
    assetId: input.note.assetId,
    noteAmountWei: input.note.noteAmountWei,
    ownerCommitment: input.note.ownerCommitment,
    noteSecret: input.note.noteSecret
  });
  if (expectedCommitment.toLowerCase() !== input.note.commitment.toLowerCase()) {
    throw new Error("Recovered note commitment does not match its spend material.");
  }

  const nullifier = await deriveBrowserNullifier({
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

const ZERO_HEX_BYTES = "0x" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

async function encryptRequiredChangeNote(
  input: BuildBrowserWithdrawWitnessInput,
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

async function createChangeNote(note: SpendMaterialPlaintext, changeAmount: bigint): Promise<SpendMaterialPlaintext> {
  const ownerCommitment = createRandomBytes32(crypto.getRandomValues.bind(crypto));
  const noteSecret = createRandomBytes32(crypto.getRandomValues.bind(crypto));
  const commitment = await deriveBrowserNoteCommitment({
    assetId: note.assetId,
    noteAmountWei: changeAmount.toString(),
    ownerCommitment,
    noteSecret
  });

  return {
    version: "spend-material-v1",
    chainId: note.chainId,
    pool: note.pool,
    assetId: note.assetId,
    noteAmountWei: changeAmount.toString(),
    ownerCommitment,
    noteSecret,
    blinding: createRandomBytes32(crypto.getRandomValues.bind(crypto)),
    commitment,
    createdAt: new Date().toISOString()
  };
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
  if (note.assetId.toLowerCase() !== SANDBOX_NATIVE_ETH_ASSET_ID.toLowerCase()) {
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
  assertZeroAllowedField(path.root, "Merkle path root");
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

function assertZeroAllowedField(value: HexString, fieldName: string): void {
  if (!isHexBytes32(value) || BigInt(value) >= BigInt(BN254_SCALAR_FIELD)) {
    throw new Error(`${fieldName} must be a BN254 field element.`);
  }
}

function parsePositiveDecimalField(value: string, fieldName: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${fieldName} must be a decimal integer.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed >= BigInt(BN254_SCALAR_FIELD)) {
    throw new Error(`${fieldName} must be a positive BN254 field element.`);
  }
  if (parsed > UINT128_MAX) {
    throw new Error(`${fieldName} must fit the withdrawal circuit 128-bit amount bound.`);
  }
  return parsed;
}
