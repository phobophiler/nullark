import {
  BPS_DENOMINATOR,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
  WITHDRAWAL_FEE_BPS
} from "@nullark/core";
import { encodeAbiParameters, keccak256 } from "viem";
import type { EncryptedOutputNoteV2Ciphertext, SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import {
  computeStageBWithdrawPublicExitHashes,
  computeStageCWithdrawChangeNoteHashes,
  createEncryptedOutputNoteV2Envelope,
  serializeEncryptedOutputNoteV2EnvelopeToHex
} from "../recovery/encryptedNoteEnvelope.js";
import {
  createBrowserPoseidonFieldHash,
  deriveBrowserNoteCommitment,
  deriveBrowserNullifier
} from "../recovery/browserPoseidon.js";
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
import type { V12UnlinkableWithdrawProofIntent, WithdrawProofPublicInputSchema } from "./browserWithdrawProver.js";

export type WithdrawWitness = Record<string, string | string[]>;

const DEFAULT_WITHDRAW_TREE_DEPTH = SANDBOX_MERKLE_TREE_DEPTH;
const UINT128_MAX = (1n << 128n) - 1n;
const MAX_WITHDRAWAL_FEE_BPS = 100;
export const V12_DUMMY_ENCRYPTED_OUTPUT_NOTE = "0x00" as const;

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

type BrowserWithdrawWitnessBundleBase = {
  witness: WithdrawWitness;
  intent: WithdrawProofIntent | V12UnlinkableWithdrawProofIntent;
  publicInputSchema: WithdrawProofPublicInputSchema;
  publicInputs?: readonly HexString[];
  nullifier: HexString;
  netAmountWei: string;
};

type BrowserV11WithdrawWitnessBundle = BrowserWithdrawWitnessBundleBase & {
  publicInputSchema: "v1.1";
  changeNote: SpendMaterialPlaintext | null;
  encryptedChangeNote: HexString;
  outputNote?: undefined;
  encryptedOutputNote?: undefined;
};

type BrowserV12UnlinkableWithdrawWitnessBundle = BrowserWithdrawWitnessBundleBase & {
  publicInputSchema: "v1.2-unlinkable";
  publicInputs: readonly HexString[];
  outputNote: SpendMaterialPlaintext | null;
  encryptedOutputNote: HexString;
  changeNote?: undefined;
  encryptedChangeNote?: undefined;
};

export type BrowserWithdrawWitnessBundle = BrowserV11WithdrawWitnessBundle | BrowserV12UnlinkableWithdrawWitnessBundle;

export type BuildBrowserWithdrawWitnessInput = {
  note: SpendMaterialPlaintext;
  merklePath: RecoveryMerklePathPayload;
  destination: HexString;
  grossAmountWei?: string;
  chainId: 6343 | 4326;
  pool: HexString;
  merkleTreeDepth?: number;
  withdrawalFeeBps?: number;
  proofContextShape?: "v1.1" | "v1.2-fee-governance";
  publicInputSchema?: WithdrawProofPublicInputSchema;
  pendingWithdrawalFeeBps?: number | null | undefined;
  encryptChangeNote?: (changeNote: SpendMaterialPlaintext) => Promise<HexString>;
  encryptOutputNote?: (outputNote: SpendMaterialPlaintext) => Promise<HexString | EncryptedOutputNoteV2Ciphertext>;
};

export async function buildBrowserWithdrawWitness(input: BuildBrowserWithdrawWitnessInput): Promise<BrowserWithdrawWitnessBundle> {
  const publicInputSchema = input.publicInputSchema ?? "v1.1";
  if (publicInputSchema === "v1.2-unlinkable") {
    return buildBrowserV12UnlinkableWithdrawWitness(input);
  }
  if (publicInputSchema !== "v1.1") {
    throw new Error("Withdrawal proof public input schema must be v1.1 or v1.2-unlinkable.");
  }
  if (input.proofContextShape === "v1.2-fee-governance") {
    throw new Error("v1.2 fee-governed withdrawals must use publicInputSchema v1.2-unlinkable.");
  }
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

  const withdrawalFeeBps = normalizeFeeBps(input.withdrawalFeeBps ?? Number(WITHDRAWAL_FEE_BPS));
  normalizeOptionalFeeBps(input.pendingWithdrawalFeeBps);
  const proofContextShape = resolveWithdrawContextShape(input.proofContextShape, input.pendingWithdrawalFeeBps);
  const fee = (grossAmount * BigInt(withdrawalFeeBps)) / BPS_DENOMINATOR;
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
          proofContextShape,
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
          proofContextShape,
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
    publicInputSchema,
    nullifier,
    changeNote,
    encryptedChangeNote,
    netAmountWei: (grossAmount - fee).toString()
  };
}

async function buildBrowserV12UnlinkableWithdrawWitness(
  input: BuildBrowserWithdrawWitnessInput
): Promise<BrowserWithdrawWitnessBundle> {
  if (input.proofContextShape !== "v1.2-fee-governance") {
    throw new Error("v1.2 unlinkable withdrawals must use proofContextShape v1.2-fee-governance.");
  }
  assertNoteForPool(input.note, input.chainId, input.pool);
  assertMerklePath(input.merklePath, input.chainId, input.pool, input.note.commitment, input.merkleTreeDepth ?? DEFAULT_WITHDRAW_TREE_DEPTH);

  if (!isEvmAddress(input.destination) || input.destination === ZERO_ADDRESS) {
    throw new Error("Withdrawal destination must be a nonzero EVM address.");
  }

  const oldAmount = parsePositiveDecimalField(input.note.noteAmountWei, "oldAmountWei");
  const grossAmount = input.grossAmountWei
    ? parsePositiveDecimalField(input.grossAmountWei, "grossAmountWei")
    : oldAmount;
  if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Withdrawal amount must be positive.");
  }
  if (grossAmount > oldAmount) {
    throw new Error("Withdrawal amount cannot exceed the recovered note amount.");
  }

  const withdrawalFeeBps = normalizeFeeBps(input.withdrawalFeeBps ?? Number(WITHDRAWAL_FEE_BPS));
  normalizeOptionalFeeBps(input.pendingWithdrawalFeeBps);
  const fee = (grossAmount * BigInt(withdrawalFeeBps)) / BPS_DENOMINATOR;
  const outputAmount = oldAmount - grossAmount;
  const outputMaterial = await createOutputNote(input.note, outputAmount);
  const outputNote = outputAmount === 0n ? null : outputMaterial;
  const outputCommitment = outputMaterial.commitment;
  const outputCiphertext = outputNote
    ? await encryptRequiredOutputNote(input, outputNote)
    : { ciphertext: V12_DUMMY_ENCRYPTED_OUTPUT_NOTE };
  const encryptedOutputNote = serializeEncryptedOutputNoteV2EnvelopeToHex(
    createEncryptedOutputNoteV2Envelope({
      chainId: input.chainId,
      verifyingContract: input.pool,
      outputCommitment,
      ciphertext: outputCiphertext.ciphertext,
      ...(outputCiphertext.nonce === undefined ? {} : { nonce: outputCiphertext.nonce }),
      ...(outputCiphertext.ephemeralPublicKey === undefined ? {} : { ephemeralPublicKey: outputCiphertext.ephemeralPublicKey })
    })
  );

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
  const hashes = computeV12UnlinkableWithdrawHashes({
    chainId: input.chainId,
    pool: input.pool,
    proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE as HexString,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root: input.merklePath.root,
    nullifier,
    destination: input.destination,
    grossAmount,
    fee,
    outputCommitment,
    encryptedOutputNote,
    relayerPolicy
  });

  const destinationDecimal = BigInt(input.destination).toString();
  const poolDecimal = BigInt(input.pool).toString();
  const witness: WithdrawWitness = {
    root: BigInt(input.merklePath.root).toString(),
    nullifier: BigInt(nullifier).toString(),
    outputCommitment: BigInt(outputCommitment).toString(),
    destination: destinationDecimal,
    grossAmount: grossAmount.toString(),
    fee: fee.toString(),
    chainId: input.chainId.toString(),
    verifyingContract: poolDecimal,
    proofContextHash: BigInt(hashes.proofContextHash).toString(),
    encryptedOutputNoteHash: BigInt(hashes.encryptedOutputNoteHash).toString(),
    pathElements: input.merklePath.pathElements.map((pathElement) => BigInt(pathElement).toString()),
    assetId: BigInt(input.note.assetId).toString(),
    oldAmount: oldAmount.toString(),
    ownerCommitment: BigInt(input.note.ownerCommitment).toString(),
    noteSecret: BigInt(input.note.noteSecret).toString(),
    leafIndex: input.merklePath.leafIndex.toString(),
    withdrawalDestination: destinationDecimal,
    outputAmount: outputAmount.toString(),
    outputOwnerCommitment: BigInt(outputMaterial.ownerCommitment).toString(),
    outputNoteSecret: BigInt(outputMaterial.noteSecret).toString(),
    expectedProofContextHash: BigInt(hashes.proofContextHash).toString(),
    expectedEncryptedOutputNoteHash: BigInt(hashes.encryptedOutputNoteHash).toString()
  };
  const publicInputs = [
    input.merklePath.root,
    nullifier,
    outputCommitment,
    addressToBytes32(input.destination),
    toBytes32(grossAmount),
    toBytes32(fee),
    toBytes32(BigInt(input.chainId)),
    addressToBytes32(input.pool),
    hashes.proofContextHash,
    hashes.encryptedOutputNoteHash
  ] as const;

  return {
    witness,
    intent: {
      root: input.merklePath.root,
      nullifier,
      outputCommitment,
      destination: input.destination,
      grossAmountWei: grossAmount.toString(),
      feeWei: fee.toString(),
      chainId: input.chainId,
      verifyingContract: input.pool,
      proofContextHash: hashes.proofContextHash,
      encryptedOutputNoteHash: hashes.encryptedOutputNoteHash
    },
    publicInputSchema: "v1.2-unlinkable",
    publicInputs,
    nullifier,
    outputNote,
    encryptedOutputNote,
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

async function encryptRequiredOutputNote(
  input: BuildBrowserWithdrawWitnessInput,
  outputNote: SpendMaterialPlaintext
): Promise<EncryptedOutputNoteV2Ciphertext> {
  const encryptOutputNote = input.encryptOutputNote ?? input.encryptChangeNote;
  if (!encryptOutputNote) {
    throw new Error("Encrypted output note bytes are required before generating a split v1.2 withdrawal proof.");
  }
  const encryptedOutputNote = await encryptOutputNote(outputNote);
  const payload =
    typeof encryptedOutputNote === "string" ? { ciphertext: encryptedOutputNote } : encryptedOutputNote;
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(payload.ciphertext)) {
    throw new Error("Encrypted output note must be nonempty even-length hex bytes.");
  }
  if (payload.nonce !== undefined && !/^0x[0-9a-fA-F]{48}$/.test(payload.nonce)) {
    throw new Error("Encrypted output note nonce must be bytes24 hex.");
  }
  if (payload.ephemeralPublicKey !== undefined && !isHexBytes32(payload.ephemeralPublicKey)) {
    throw new Error("Encrypted output note ephemeral public key must be bytes32 hex.");
  }
  return payload;
}

async function createChangeNote(note: SpendMaterialPlaintext, changeAmount: bigint): Promise<SpendMaterialPlaintext> {
  return createOutputNote(note, changeAmount);
}

async function createOutputNote(note: SpendMaterialPlaintext, outputAmount: bigint): Promise<SpendMaterialPlaintext> {
  const ownerCommitment = createRandomBytes32(crypto.getRandomValues.bind(crypto));
  const noteSecret = createRandomBytes32(crypto.getRandomValues.bind(crypto));
  const commitment = await deriveBrowserOutputNoteCommitment({
    assetId: note.assetId,
    noteAmountWei: outputAmount.toString(),
    ownerCommitment,
    noteSecret
  });

  return {
    version: "spend-material-v1",
    chainId: note.chainId,
    pool: note.pool,
    assetId: note.assetId,
    noteAmountWei: outputAmount.toString(),
    ownerCommitment,
    noteSecret,
    blinding: createRandomBytes32(crypto.getRandomValues.bind(crypto)),
    commitment,
    createdAt: new Date().toISOString()
  };
}

async function deriveBrowserOutputNoteCommitment(input: {
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
}): Promise<HexString> {
  const hash = await createBrowserPoseidonFieldHash();
  const amount = parseZeroAllowedDecimalField(input.noteAmountWei, "outputAmountWei");
  const commitment = hash([
    10_001n,
    BigInt(assertBytes32(input.assetId, "assetId")),
    amount,
    BigInt(assertBytes32(input.ownerCommitment, "ownerCommitment")),
    BigInt(assertBytes32(input.noteSecret, "noteSecret"))
  ]);

  return toBytes32(commitment);
}

type V12UnlinkableWithdrawContextHashes = {
  encryptedOutputNoteHash: HexString;
  relayerPolicyHash: HexString;
  proofContextHash: HexString;
};

function computeV12UnlinkableWithdrawHashes(input: {
  chainId: number;
  pool: HexString;
  proofContextShape: HexString;
  selector: HexString;
  root: HexString;
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  fee: bigint;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
  relayerPolicy: {
    relayer: HexString;
    minNetAmount: bigint;
    maxFeeAmount: bigint;
    deadlineOrZero: bigint;
  };
}): V12UnlinkableWithdrawContextHashes {
  const encryptedOutputNoteHash = hashEncryptedOutputNoteV2({
    chainId: input.chainId,
    pool: input.pool,
    shape: input.proofContextShape,
    selector: input.selector,
    nullifier: input.nullifier,
    outputCommitment: input.outputCommitment,
    encryptedOutputNote: input.encryptedOutputNote
  });
  const relayerPolicyHash = hashRelayerPolicyV1(input.relayerPolicy);
  const proofContextHash = hashProofContextV1({
    chainId: input.chainId,
    pool: input.pool,
    shape: input.proofContextShape,
    selector: input.selector,
    root: input.root,
    nullifier: input.nullifier,
    destination: input.destination,
    grossAmount: input.grossAmount,
    fee: input.fee,
    encryptedNoteHash: encryptedOutputNoteHash,
    relayerPolicyHash,
    deadlineOrZero: input.relayerPolicy.deadlineOrZero
  });

  return { encryptedOutputNoteHash, relayerPolicyHash, proofContextHash };
}

const PROOF_CONTEXT_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.proof-context.v1");
const PROOF_CONTEXT_V1_VERSION = 1n;
const ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.encrypted-output-note.v2");
const RELAYER_POLICY_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.relayer-policy.v1");
const ENCRYPTED_OUTPUT_NOTE_V2_VERSION = 2n;
const UINT256_MAX_EXCLUSIVE = 1n << 256n;

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

const ENCRYPTED_OUTPUT_NOTE_V2_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint16", name: "version" },
  { type: "uint256", name: "chainId" },
  { type: "address", name: "pool" },
  { type: "bytes32", name: "shape" },
  { type: "bytes4", name: "selector" },
  { type: "bytes32", name: "nullifier" },
  { type: "bytes32", name: "outputCommitment" },
  { type: "bytes32", name: "encryptedOutputNoteDigest" }
] as const;

const RELAYER_POLICY_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "address", name: "relayer" },
  { type: "uint256", name: "minNetAmount" },
  { type: "uint256", name: "maxFeeAmount" },
  { type: "uint256", name: "deadlineOrZero" }
] as const;

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

function hashEncryptedOutputNoteV2(input: {
  chainId: number;
  pool: HexString;
  shape: HexString;
  selector: HexString;
  nullifier: HexString;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(ENCRYPTED_OUTPUT_NOTE_V2_ABI_PARAMETERS, [
      ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR,
      Number(ENCRYPTED_OUTPUT_NOTE_V2_VERSION),
      BigInt(assertSupportedChainId(input.chainId)),
      assertAddress(input.pool, "pool"),
      assertBytes32(input.shape, "shape"),
      assertBytes4(input.selector, "selector"),
      assertNonZeroBytes32(input.nullifier, "nullifier"),
      assertNonZeroBytes32(input.outputCommitment, "outputCommitment"),
      keccak256(assertHexBytes(input.encryptedOutputNote, "encryptedOutputNote"))
    ])
  );
}

function hashRelayerPolicyV1(input: {
  relayer: HexString;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  deadlineOrZero: bigint;
}): HexString {
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
  return toBytes32(BigInt(keccak256(assertHexBytes(encoded, "encoded"))) % BigInt(BN254_SCALAR_FIELD));
}

function assertSupportedChainId(value: number): 6343 | 4326 {
  if (value !== 6343 && value !== 4326) {
    throw new Error("Withdrawal proof intent must target MegaETH mainnet or testnet.");
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
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${label} must be hex bytes.`);
  }
  return value as HexString;
}

function assertUint256(value: bigint, label: string): bigint {
  if (value < 0n || value >= UINT256_MAX_EXCLUSIVE) {
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

function addressToBytes32(address: HexString): HexString {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
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

function parseZeroAllowedDecimalField(value: string, fieldName: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${fieldName} must be a decimal integer.`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BigInt(BN254_SCALAR_FIELD)) {
    throw new Error(`${fieldName} must be a BN254 field element.`);
  }
  if (parsed > UINT128_MAX) {
    throw new Error(`${fieldName} must fit the withdrawal circuit 128-bit amount bound.`);
  }
  return parsed;
}

function normalizeFeeBps(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WITHDRAWAL_FEE_BPS) {
    throw new Error("withdrawalFeeBps must be a nonnegative safe integer at or below 100 bps.");
  }
  return value;
}

function normalizeOptionalFeeBps(value: number | null | undefined): void {
  if (value !== undefined && value !== null) {
    normalizeFeeBps(value);
  }
}

function resolveWithdrawContextShape(
  requested: BuildBrowserWithdrawWitnessInput["proofContextShape"],
  pendingWithdrawalFeeBps: number | null | undefined
): HexString {
  if (requested === "v1.1" || requested === undefined) {
    if (pendingWithdrawalFeeBps !== undefined && pendingWithdrawalFeeBps !== null) {
      throw new Error("v1.2 fee-governed withdrawals must use proofContextShape v1.2-fee-governance.");
    }
    return PROOF_CONTEXT_V1_SHAPE_WITHDRAW as HexString;
  }
  if (requested === "v1.2-fee-governance") {
    return PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE as HexString;
  }
  throw new Error("Unsupported withdrawal proofContextShape.");
}
