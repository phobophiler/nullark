import {
  ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
  ENCRYPTED_NOTE_V1_VERSION,
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  ZERO_BYTES32,
  createEncryptedNoteV1,
  createProofContextV1,
  hashAbiEncodedToField,
  hashEncryptedNoteV1,
  hashProofContextV1
} from "@nullark/core";
import { encodeAbiParameters, keccak256, stringToBytes } from "viem";

export type HexString = `0x${string}`;
const ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR = keccak256(stringToBytes("nullark.encrypted-output-note.v2"));
const ENCRYPTED_OUTPUT_NOTE_V2_VERSION = 2;

export type EncryptedNoteEventType = "deposit" | "private-transfer" | "withdraw" | "withdraw-change" | "withdraw-output";
export type EncryptedNoteAssetConvention = "native-eth-v1";

export type EncryptedNoteEnvelopeV1 = {
  version: 1;
  chainId: number;
  pool: string;
  action: EncryptedNoteEventType;
  commitment: HexString;
  leafIndex: number;
  amount: bigint;
  assetConvention: EncryptedNoteAssetConvention;
  recipientCiphertext: HexString;
  senderRecoveryCiphertext: HexString;
  nonceOrCounter: HexString | bigint;
  associatedDataHash: HexString;
};

export type EncryptedNoteEventRecord = {
  chainId: number;
  pool: string;
  eventType: EncryptedNoteEventType;
  commitment: HexString;
  nullifier: HexString | null;
  leafIndex: number;
  encryptedNote: HexString;
  encryptionVersion: number;
  blockNumber: bigint;
  transactionHash: HexString;
  logIndex: number;
  observedAtMs: number;
  sourceRpc: string;
};

export type EncryptedNoteCache = {
  records: EncryptedNoteEventRecord[];
};

export type StageBWithdrawPublicExitIndexerBindingInput = {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  proofContextShape?: HexString;
  nullifier: HexString;
  noteAmount: bigint;
  encryptedNoteHash: HexString;
  changeCommitment?: HexString;
  encryptedChangeNote?: HexString;
  proofContextHash?: HexString;
  root?: HexString;
  destination?: HexString;
  grossAmount?: bigint;
  fee?: bigint;
  relayerPolicyHash?: HexString;
  deadlineOrZero?: bigint;
};

export type StageBWithdrawPublicExitIndexerBindingValidation = {
  encryptedNoteHash: HexString;
  proofContextHash?: HexString;
  errors: string[];
  limitations: string[];
};

export type StageCWithdrawChangeNoteIndexerBindingInput = {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  proofContextShape?: HexString;
  nullifier: HexString;
  noteAmount: bigint;
  grossAmount: bigint;
  fee: bigint;
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
  encryptedNoteHash: HexString;
  outputCommitments?: readonly HexString[];
  encryptedChangeNotes?: readonly HexString[];
  changeAmounts?: readonly bigint[];
  proofContextHash?: HexString;
  root?: HexString;
  destination?: HexString;
  relayerPolicyHash?: HexString;
  deadlineOrZero?: bigint;
  eventRecord?: EncryptedNoteEventRecord;
};

export type StageCWithdrawChangeNoteIndexerBindingValidation = {
  encryptedNoteHash: HexString;
  proofContextHash?: HexString;
  errors: string[];
  limitations: string[];
};

export type V12UnlinkableWithdrawOutputNoteIndexerBindingInput = {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  publicInputs: readonly HexString[];
  encryptedOutputNote: HexString;
  relayerPolicyHash?: HexString;
  deadlineOrZero?: bigint;
  eventRecord?: EncryptedNoteEventRecord;
  readinessEvidence?: V12IndexerReadinessEvidence;
};

export type V12UnlinkableWithdrawOutputNoteIndexerBindingValidation = {
  encryptedOutputNoteHash: HexString;
  proofContextHash?: HexString;
  errors: string[];
  limitations: string[];
};

export type V12IndexerReadinessEvidence = {
  runtimeId: string;
  chainId: number;
  pool: HexString;
  status: "ready";
  mainnet4326Blocked: false;
  finalReadiness?: true;
  evidenceSha256: HexString;
};

export const STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION =
  "proof-bound withdrawal proofContextHash requires calldata public inputs; encrypted-note chain logs are not sufficient.";
export const STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION =
  "private-change withdrawal proofContextHash requires calldata public inputs; encrypted-note chain logs alone bind only event metadata and ciphertext.";
export const V12_UNLINKABLE_INDEXER_PROOF_CONTEXT_LIMITATION =
  "v1.2 unlinkable withdrawal proofContextHash requires relayerPolicyHash and deadlineOrZero local hints; 10 public inputs and encrypted output-note bytes do not include them.";
export const V12_UNLINKABLE_INDEXER_READINESS_BLOCKER =
  "v1.2 unlinkable indexer binding remains blocked until matching readiness evidence is present.";

const MAX_ENCRYPTED_NOTE_BYTES = 2048;
const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506" as const;
const V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_COUNT = 10;
const V12_PUBLIC_INPUT_ROOT = 0;
const V12_PUBLIC_INPUT_NULLIFIER = 1;
const V12_PUBLIC_INPUT_OUTPUT_COMMITMENT = 2;
const V12_PUBLIC_INPUT_DESTINATION = 3;
const V12_PUBLIC_INPUT_GROSS_AMOUNT = 4;
const V12_PUBLIC_INPUT_FEE = 5;
const V12_PUBLIC_INPUT_CHAIN_ID = 6;
const V12_PUBLIC_INPUT_POOL = 7;
const V12_PUBLIC_INPUT_PROOF_CONTEXT_HASH = 8;
const V12_PUBLIC_INPUT_ENCRYPTED_OUTPUT_NOTE_HASH = 9;
export const INDEXER_SUPPORTED_FIXED_DENOMINATIONS_WEI = MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI;
const SUPPORTED_FIXED_DENOMINATIONS = new Set<bigint>(INDEXER_SUPPORTED_FIXED_DENOMINATIONS_WEI);

export function createEncryptedNoteCache(): EncryptedNoteCache {
  return { records: [] };
}

export function addEncryptedNoteEvent(cache: EncryptedNoteCache, record: EncryptedNoteEventRecord): void {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(record.encryptedNote)) {
    throw new Error("encrypted note payload must be even-length hex");
  }
  cache.records.push(record);
}

export function listEncryptedNoteEvents(
  cache: EncryptedNoteCache,
  filter: { chainId: number; pool: string; fromBlock: bigint; toBlock: bigint }
): EncryptedNoteEventRecord[] {
  return cache.records.filter(
    (record) =>
      record.chainId === filter.chainId &&
      record.pool.toLowerCase() === filter.pool.toLowerCase() &&
      record.blockNumber >= filter.fromBlock &&
      record.blockNumber <= filter.toBlock
  );
}

export function validateEncryptedNoteEnvelopeForRecord(
  record: EncryptedNoteEventRecord,
  envelope: EncryptedNoteEnvelopeV1
): string[] {
  const errors: string[] = [];

  if (envelope.version !== 1 || record.encryptionVersion !== envelope.version) {
    errors.push("encrypted note envelope version does not match indexed event");
  }
  if (envelope.chainId !== record.chainId) {
    errors.push("encrypted note envelope chain does not match indexed event");
  }
  if (envelope.pool.toLowerCase() !== record.pool.toLowerCase()) {
    errors.push("encrypted note envelope pool does not match indexed event");
  }
  const actionMatches =
    envelope.action === record.eventType ||
    (record.eventType === "withdraw-change" && envelope.action === "withdraw") ||
    (record.eventType === "withdraw-output" &&
      (envelope.action === "withdraw" || envelope.action === "withdraw-change"));
  if (!actionMatches) {
    errors.push("encrypted note envelope action does not match indexed event");
  }
  if (envelope.commitment.toLowerCase() !== record.commitment.toLowerCase()) {
    errors.push("encrypted note envelope commitment does not match indexed event");
  }
  if (envelope.leafIndex !== record.leafIndex) {
    errors.push("encrypted note envelope leaf index does not match indexed event");
  }
  if (!isSupportedFixedDenomination(envelope.amount)) {
    errors.push("encrypted note envelope amount is not a supported fixed denomination");
  }
  if (envelope.assetConvention !== "native-eth-v1") {
    errors.push("encrypted note envelope asset convention must be native ETH v1");
  }
  if (!isEvenHex(envelope.recipientCiphertext) || hexByteLength(envelope.recipientCiphertext) === 0) {
    errors.push("encrypted note envelope recipient ciphertext must be nonempty even-length hex");
  }
  if (!isEvenHex(envelope.senderRecoveryCiphertext) || hexByteLength(envelope.senderRecoveryCiphertext) === 0) {
    errors.push("encrypted note envelope sender recovery ciphertext must be nonempty even-length hex");
  }
  if (
    hexByteLength(envelope.recipientCiphertext) + hexByteLength(envelope.senderRecoveryCiphertext) >
    MAX_ENCRYPTED_NOTE_BYTES
  ) {
    errors.push("encrypted note envelope ciphertexts exceed maximum payload size");
  }
  if (!isBytes32(envelope.associatedDataHash)) {
    errors.push("encrypted note envelope associated data hash must be bytes32");
  }
  if (typeof envelope.nonceOrCounter !== "bigint" && !isBytes32(envelope.nonceOrCounter)) {
    errors.push("encrypted note envelope nonce or counter must be uint256-like bigint or bytes32");
  }

  return errors;
}

export function assertEncryptedNoteEnvelopeMatchesRecord(
  record: EncryptedNoteEventRecord,
  envelope: EncryptedNoteEnvelopeV1
): void {
  const errors = validateEncryptedNoteEnvelopeForRecord(record, envelope);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

export function computeStageBWithdrawPublicExitEncryptedNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  proofContextShape?: HexString;
  nullifier: HexString;
  noteAmount: bigint;
}): HexString {
  const shape = input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW;
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape,
      selector: input.selector ?? PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: input.nullifier,
      commitment: ZERO_BYTES32,
      noteAmount: input.noteAmount,
      encryptedNote: "0x"
    })
  ) as HexString;
}

export function validateStageBWithdrawPublicExitIndexerBinding(
  input: StageBWithdrawPublicExitIndexerBindingInput
): StageBWithdrawPublicExitIndexerBindingValidation {
  const errors: string[] = [];
  const limitations: string[] = [];
  const selector = input.selector ?? PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR;
  const shape = input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW;

  if (selector !== PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR) {
    errors.push("proof-bound public exit selector must be the withdraw relayer-policy selector");
  }
  if (input.changeCommitment !== undefined && input.changeCommitment.toLowerCase() !== ZERO_BYTES32) {
    errors.push("proof-bound public exit does not support change-note commitments");
  }
  if (input.encryptedChangeNote !== undefined && input.encryptedChangeNote !== "0x") {
    errors.push("proof-bound public exit does not support encrypted change notes");
  }

  const encryptedNoteHash = computeStageBWithdrawPublicExitEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    proofContextShape: shape,
    nullifier: input.nullifier,
    noteAmount: input.noteAmount
  });
  if (encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("proof-bound public exit encryptedNoteHash does not match chain-bound fields");
  }

  const proofContextFields = [
    input.root,
    input.destination,
    input.grossAmount,
    input.fee,
    input.relayerPolicyHash,
    input.deadlineOrZero,
    input.proofContextHash
  ];
  const hasAnyProofContextField = proofContextFields.some((value) => value !== undefined);
  const hasAllProofContextFields = proofContextFields.every((value) => value !== undefined);
  let proofContextHash: HexString | undefined;

  if (hasAllProofContextFields) {
    proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape,
        selector,
        root: input.root as HexString,
        nullifier: input.nullifier,
        destination: input.destination as HexString,
        grossAmount: input.grossAmount as bigint,
        fee: input.fee as bigint,
        encryptedNoteHash,
        relayerPolicyHash: input.relayerPolicyHash as HexString,
        deadlineOrZero: input.deadlineOrZero as bigint
      })
    ) as HexString;
    if (proofContextHash.toLowerCase() !== (input.proofContextHash as HexString).toLowerCase()) {
      errors.push("proof-bound public exit proofContextHash does not match calldata-bound fields");
    }
  } else if (hasAnyProofContextField) {
    limitations.push(
      "proof-bound withdrawal proofContextHash cannot be validated without root, destination, grossAmount, fee, relayerPolicyHash, deadlineOrZero, and proofContextHash."
    );
  } else {
    limitations.push(STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION);
  }

  const result: StageBWithdrawPublicExitIndexerBindingValidation = {
    encryptedNoteHash,
    errors,
    limitations
  };
  if (proofContextHash !== undefined) {
    result.proofContextHash = proofContextHash;
  }
  return result;
}

export function computeStageCWithdrawChangeNoteEncryptedNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  proofContextShape?: HexString;
  nullifier: HexString;
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
}): HexString {
  const shape = input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW;
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape,
      selector: input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      nullifier: input.nullifier,
      commitment: input.changeCommitment,
      noteAmount: input.changeAmount,
      encryptedNote: input.encryptedChangeNote
    })
  ) as HexString;
}

export function validateStageCWithdrawChangeNoteIndexerBinding(
  input: StageCWithdrawChangeNoteIndexerBindingInput
): StageCWithdrawChangeNoteIndexerBindingValidation {
  const errors: string[] = [];
  const limitations: string[] = [];
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;
  const shape = input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW;

  if (selector !== STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    errors.push("private-change withdrawal selector must be the bounded change-note selector");
  }
  if (!isBytes32(input.changeCommitment) || input.changeCommitment.toLowerCase() === ZERO_BYTES32) {
    errors.push("private-change withdrawal change commitment must be a nonzero bytes32 value");
  }
  if (!isEvenHex(input.encryptedChangeNote) || hexByteLength(input.encryptedChangeNote) === 0) {
    errors.push("private-change withdrawal encrypted change note must be nonempty even-length hex");
  }
  if (isEvenHex(input.encryptedChangeNote) && hexByteLength(input.encryptedChangeNote) > MAX_ENCRYPTED_NOTE_BYTES) {
    errors.push("private-change withdrawal encrypted change note exceeds maximum payload size");
  }
  if (input.changeAmount <= 0n) {
    errors.push("private-change withdrawal change amount must be positive");
  }
  if (!isSupportedFixedDenomination(input.noteAmount)) {
    errors.push("private-change withdrawal note amount must be a supported fixed denomination");
  }
  if (!isSupportedFixedDenomination(input.grossAmount)) {
    errors.push("private-change withdrawal gross amount must be a supported fixed denomination");
  }
  if (!isSupportedFixedDenomination(input.changeAmount)) {
    errors.push("private-change withdrawal change amount must be a supported fixed denomination");
  }
  if (input.fee > input.grossAmount) {
    errors.push("private-change withdrawal fee cannot exceed public gross amount");
  }
  if (input.noteAmount !== input.grossAmount + input.changeAmount) {
    errors.push("private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount");
  }

  const outputCommitments = input.outputCommitments ?? [input.changeCommitment];
  const encryptedChangeNotes = input.encryptedChangeNotes ?? [input.encryptedChangeNote];
  const changeAmounts = input.changeAmounts ?? [input.changeAmount];
  if (outputCommitments.length !== 1 || encryptedChangeNotes.length !== 1 || changeAmounts.length !== 1) {
    errors.push("private-change withdrawal fixed arity supports exactly one private change output");
  } else {
    if (outputCommitments[0]?.toLowerCase() !== input.changeCommitment.toLowerCase()) {
      errors.push("private-change withdrawal output commitment order does not match change commitment");
    }
    if (encryptedChangeNotes[0]?.toLowerCase() !== input.encryptedChangeNote.toLowerCase()) {
      errors.push("private-change withdrawal ciphertext order does not match change output");
    }
    if (changeAmounts[0] !== input.changeAmount) {
      errors.push("private-change withdrawal change amount order does not match change output");
    }
  }

  if (input.eventRecord !== undefined) {
    if (input.eventRecord.chainId !== input.chainId) {
      errors.push("private-change withdrawal event chain does not match change binding");
    }
    if (input.eventRecord.pool.toLowerCase() !== input.pool.toLowerCase()) {
      errors.push("private-change withdrawal event pool does not match change binding");
    }
    if (input.eventRecord.eventType !== "withdraw-change") {
      errors.push("private-change withdrawal event type must be withdraw-change");
    }
    if (input.eventRecord.commitment.toLowerCase() !== input.changeCommitment.toLowerCase()) {
      errors.push("private-change withdrawal event commitment does not match change binding");
    }
    if (input.eventRecord.encryptedNote.toLowerCase() !== input.encryptedChangeNote.toLowerCase()) {
      errors.push("private-change withdrawal event ciphertext does not match change binding");
    }
    if (input.eventRecord.nullifier !== null && input.eventRecord.nullifier.toLowerCase() !== input.nullifier.toLowerCase()) {
      errors.push("private-change withdrawal event nullifier does not match change binding");
    }
  }

  const encryptedNoteHash = computeStageCWithdrawChangeNoteEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    proofContextShape: shape,
    nullifier: input.nullifier,
    changeCommitment: input.changeCommitment,
    changeAmount: input.changeAmount,
    encryptedChangeNote: input.encryptedChangeNote
  });
  if (encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("private-change withdrawal encryptedNoteHash does not match chain-bound change fields");
  }

  const proofContextFields = [
    input.root,
    input.destination,
    input.relayerPolicyHash,
    input.deadlineOrZero,
    input.proofContextHash
  ];
  const hasAnyProofContextField = proofContextFields.some((value) => value !== undefined);
  const hasAllProofContextFields = proofContextFields.every((value) => value !== undefined);
  let proofContextHash: HexString | undefined;

  if (hasAllProofContextFields) {
    proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape,
        selector,
        root: input.root as HexString,
        nullifier: input.nullifier,
        destination: input.destination as HexString,
        grossAmount: input.grossAmount,
        fee: input.fee,
        encryptedNoteHash,
        relayerPolicyHash: input.relayerPolicyHash as HexString,
        deadlineOrZero: input.deadlineOrZero as bigint
      })
    ) as HexString;
    if (proofContextHash.toLowerCase() !== (input.proofContextHash as HexString).toLowerCase()) {
      errors.push("private-change withdrawal proofContextHash does not match calldata-bound change fields");
    }
  } else if (hasAnyProofContextField) {
    limitations.push(
      "private-change withdrawal proofContextHash cannot be validated without root, destination, relayerPolicyHash, deadlineOrZero, and proofContextHash."
    );
  } else {
    limitations.push(STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION);
  }

  const result: StageCWithdrawChangeNoteIndexerBindingValidation = {
    encryptedNoteHash,
    errors,
    limitations
  };
  if (proofContextHash !== undefined) {
    result.proofContextHash = proofContextHash;
  }
  return result;
}

export function computeV12UnlinkableWithdrawEncryptedOutputNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  nullifier: HexString;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint16" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes4" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" }
      ],
      [
        ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR,
        ENCRYPTED_OUTPUT_NOTE_V2_VERSION,
        BigInt(input.chainId),
        input.pool,
        PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
        input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
        input.nullifier,
        input.outputCommitment,
        keccak256(input.encryptedOutputNote)
      ]
    )
  ) as HexString;
}

export function validateV12UnlinkableWithdrawOutputNoteIndexerBinding(
  input: V12UnlinkableWithdrawOutputNoteIndexerBindingInput
): V12UnlinkableWithdrawOutputNoteIndexerBindingValidation {
  const errors: string[] = [];
  const limitations: string[] = [];
  const rawInput = input as unknown as Record<string, unknown>;
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;

  if (selector !== STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    errors.push("v1.2 unlinkable output-note withdrawal selector must be the bounded output-note selector");
  }
  if (!hasMatchingV12IndexerReadinessEvidence(input.readinessEvidence, input.chainId, input.pool)) {
    errors.push(V12_UNLINKABLE_INDEXER_READINESS_BLOCKER);
  }
  if (input.publicInputs.length !== V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_COUNT) {
    errors.push("v1.2 unlinkable withdrawal public inputs must include exactly 10 fields");
    if (input.publicInputs.length >= 12) {
      errors.push("v1.2 unlinkable withdrawal public inputs must not expose spentCommitment or noteAmount");
    }
  }
  if (rawInput.spentCommitment !== undefined || rawInput.noteAmount !== undefined) {
    errors.push("v1.2 unlinkable output-note validation does not accept spentCommitment or noteAmount");
  }
  if (rawInput.encryptedNoteHash !== undefined) {
    errors.push("v1.2 unlinkable output-note validation does not accept encryptedNoteHash");
  }
  if (rawInput.changeCommitment !== undefined || rawInput.changeAmount !== undefined) {
    errors.push("v1.2 unlinkable output-note validation does not accept changeCommitment or changeAmount");
  }
  if (rawInput.encryptedChangeNote !== undefined || rawInput.encryptedChangeNotes !== undefined) {
    errors.push("v1.2 unlinkable output-note validation does not accept encryptedChangeNote or encryptedChangeNotes");
  }
  if (rawInput.outputCommitments !== undefined || rawInput.changeAmounts !== undefined) {
    errors.push("v1.2 unlinkable output-note validation does not accept outputCommitments or changeAmounts");
  }

  for (const publicInput of input.publicInputs) {
    if (!isBytes32(publicInput)) {
      errors.push("v1.2 unlinkable withdrawal public inputs must be bytes32 values");
      break;
    }
  }

  const root = input.publicInputs[V12_PUBLIC_INPUT_ROOT] ?? ZERO_BYTES32;
  const nullifier = input.publicInputs[V12_PUBLIC_INPUT_NULLIFIER] ?? ZERO_BYTES32;
  const outputCommitment = input.publicInputs[V12_PUBLIC_INPUT_OUTPUT_COMMITMENT] ?? ZERO_BYTES32;
  const destination = input.publicInputs[V12_PUBLIC_INPUT_DESTINATION] ?? ZERO_BYTES32;
  const grossAmount = input.publicInputs[V12_PUBLIC_INPUT_GROSS_AMOUNT] ?? ZERO_BYTES32;
  const fee = input.publicInputs[V12_PUBLIC_INPUT_FEE] ?? ZERO_BYTES32;
  const chainId = input.publicInputs[V12_PUBLIC_INPUT_CHAIN_ID] ?? ZERO_BYTES32;
  const pool = input.publicInputs[V12_PUBLIC_INPUT_POOL] ?? ZERO_BYTES32;
  const expectedProofContextHashInput = input.publicInputs[V12_PUBLIC_INPUT_PROOF_CONTEXT_HASH] ?? ZERO_BYTES32;
  const expectedEncryptedOutputNoteHashInput =
    input.publicInputs[V12_PUBLIC_INPUT_ENCRYPTED_OUTPUT_NOTE_HASH] ?? ZERO_BYTES32;

  if (BigInt(chainId) !== BigInt(input.chainId)) {
    errors.push("v1.2 unlinkable withdrawal chain ID does not match public inputs");
  }
  if (bytes32ToEvmAddress(pool).toLowerCase() !== input.pool.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal pool does not match public inputs");
  }
  if (!isBytes32(nullifier) || nullifier.toLowerCase() === ZERO_BYTES32) {
    errors.push("v1.2 unlinkable withdrawal nullifier must be nonzero bytes32");
  }
  if (!isBytes32(outputCommitment)) {
    errors.push("v1.2 unlinkable output commitment must be bytes32");
  } else if (outputCommitment.toLowerCase() === ZERO_BYTES32) {
    errors.push("v1.2 unlinkable output commitment must be nonzero bytes32");
  }
  if (!isEvenHex(input.encryptedOutputNote) || hexByteLength(input.encryptedOutputNote) === 0) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note must be always-present nonempty even-length hex");
  }
  if (isEvenHex(input.encryptedOutputNote) && hexByteLength(input.encryptedOutputNote) > MAX_ENCRYPTED_NOTE_BYTES) {
    errors.push("v1.2 unlinkable encrypted output note exceeds maximum payload size");
  }
  if (isEvenHex(input.encryptedOutputNote) && hexByteLength(input.encryptedOutputNote) > 0) {
    const envelopeErrors = validateEncryptedOutputNoteV2EnvelopeForBinding(input.encryptedOutputNote, {
      chainId: input.chainId,
      pool: input.pool,
      outputCommitment
    });
    errors.push(...envelopeErrors);
  }

  if (input.eventRecord === undefined) {
    errors.push("v1.2 unlinkable output-note event evidence is required");
  } else {
    if (input.eventRecord.chainId !== input.chainId) {
      errors.push("v1.2 unlinkable output-note event chain does not match binding");
    }
    if (input.eventRecord.pool.toLowerCase() !== input.pool.toLowerCase()) {
      errors.push("v1.2 unlinkable output-note event pool does not match binding");
    }
    if (input.eventRecord.eventType !== "withdraw-output") {
      errors.push("v1.2 unlinkable output-note event type must be withdraw-output");
    }
    if (input.eventRecord.commitment.toLowerCase() !== outputCommitment.toLowerCase()) {
      errors.push("v1.2 unlinkable output-note event commitment does not match output commitment");
    }
    if (input.eventRecord.encryptedNote.toLowerCase() !== input.encryptedOutputNote.toLowerCase()) {
      errors.push("v1.2 unlinkable output-note event ciphertext does not match encrypted output note");
    }
    if (input.eventRecord.nullifier !== null && input.eventRecord.nullifier.toLowerCase() !== nullifier.toLowerCase()) {
      errors.push("v1.2 unlinkable output-note event nullifier does not match public inputs");
    }
  }

  const encryptedOutputNoteHash = computeV12UnlinkableWithdrawEncryptedOutputNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    nullifier,
    outputCommitment,
    encryptedOutputNote: input.encryptedOutputNote
  });
  if (encryptedOutputNoteHash.toLowerCase() !== expectedEncryptedOutputNoteHashInput.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal encryptedOutputNoteHash does not match output-note fields");
  }

  let proofContextHash: HexString | undefined;
  if (input.relayerPolicyHash !== undefined && input.deadlineOrZero !== undefined) {
    proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
        selector,
        root,
        nullifier,
        destination: bytes32ToEvmAddress(destination),
        grossAmount: BigInt(grossAmount),
        fee: BigInt(fee),
        encryptedNoteHash: encryptedOutputNoteHash,
        relayerPolicyHash: input.relayerPolicyHash,
        deadlineOrZero: input.deadlineOrZero
      })
    ) as HexString;
    if (proofContextHash.toLowerCase() !== expectedProofContextHashInput.toLowerCase()) {
      errors.push("v1.2 unlinkable withdrawal proofContextHash does not match output-note fields");
    }
  } else {
    limitations.push(V12_UNLINKABLE_INDEXER_PROOF_CONTEXT_LIMITATION);
  }

  const result: V12UnlinkableWithdrawOutputNoteIndexerBindingValidation = {
    encryptedOutputNoteHash,
    errors: dedupe(errors),
    limitations
  };
  if (proofContextHash !== undefined) {
    result.proofContextHash = proofContextHash;
  }
  return result;
}

function isEvenHex(value: unknown): value is HexString {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

function hasMatchingV12IndexerReadinessEvidence(
  evidence: V12IndexerReadinessEvidence | undefined,
  chainId: number,
  pool: HexString
): boolean {
  return (
    evidence !== undefined &&
    evidence.runtimeId === "nullark-v1.2-mainnet-unlinkable" &&
    evidence.status === "ready" &&
    evidence.mainnet4326Blocked === false &&
    evidence.finalReadiness === true &&
    evidence.chainId === chainId &&
    evidence.pool.toLowerCase() === pool.toLowerCase() &&
    isBytes32(evidence.evidenceSha256)
  );
}

function validateEncryptedOutputNoteV2EnvelopeForBinding(
  encryptedOutputNote: HexString,
  checks: { chainId: number; pool: HexString; outputCommitment: HexString }
): string[] {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(hexToUtf8(encryptedOutputNote));
  } catch {
    return ["v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope"];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return ["v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope"];
  }

  const envelope = parsed as Record<string, unknown>;
  const expectedFields = new Set([
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
  ]);
  for (const key of Object.keys(envelope)) {
    if (!expectedFields.has(key)) {
      errors.push("v1.2 unlinkable withdrawal encrypted output note must be a fixed-shape EncryptedOutputNoteV2 envelope");
      break;
    }
  }
  if (envelope.version !== 2 || envelope.domain !== "nullark.encrypted-output-note.v2") {
    errors.push("v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope");
  }
  if (envelope.action !== "withdraw-output") {
    errors.push("v1.2 unlinkable withdrawal encrypted output note action must be withdraw-output");
  }
  if (envelope.chainId !== checks.chainId) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note chain does not match binding");
  }
  if (typeof envelope.verifyingContract !== "string" || envelope.verifyingContract.toLowerCase() !== checks.pool.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note pool does not match binding");
  }
  if (typeof envelope.outputCommitment !== "string" || envelope.outputCommitment.toLowerCase() !== checks.outputCommitment.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note commitment does not match binding");
  }
  if (!isBytes32(envelope.proofContextHash) || !isBytes32(envelope.ephemeralPublicKey)) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note V2 fixed fields must include bytes32 proofContextHash and ephemeralPublicKey");
  }
  if (typeof envelope.nonce !== "string" || !/^0x[0-9a-fA-F]{48}$/.test(envelope.nonce)) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note nonce must be bytes24");
  }
  if (!isEvenHex(envelope.ciphertext) || hexByteLength(envelope.ciphertext) === 0) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note ciphertext must be nonempty even-length hex");
  }
  if (!isEvenHex(envelope.paddingBytes)) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note padding must be even-length hex");
  }
  const ciphertextByteLength = typeof envelope.ciphertext === "string" && isEvenHex(envelope.ciphertext)
    ? hexByteLength(envelope.ciphertext)
    : -1;
  const paddingByteLength = typeof envelope.paddingBytes === "string" && isEvenHex(envelope.paddingBytes)
    ? hexByteLength(envelope.paddingBytes)
    : -1;
  if (
    envelope.ciphertextByteLength !== ciphertextByteLength ||
    envelope.paddingByteLength !== paddingByteLength ||
    envelope.paddedCiphertextByteLength !== 256 ||
    ciphertextByteLength + paddingByteLength !== envelope.paddedCiphertextByteLength
  ) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note must be fixed-shape padded to 256 bytes");
  }
  if (typeof envelope.paddingBytes !== "string" || !/^0x(?:00)*$/.test(envelope.paddingBytes)) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note padding must be zero bytes");
  }

  return dedupe(errors);
}

function hexToUtf8(value: HexString): string {
  const hex = value.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function isBytes32(value: unknown): value is HexString {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isSupportedFixedDenomination(value: bigint): boolean {
  return SUPPORTED_FIXED_DENOMINATIONS.has(value);
}

function hexByteLength(value: HexString): number {
  return (value.length - 2) / 2;
}

function bytes32ToEvmAddress(value: HexString): HexString {
  return `0x${value.slice(-40).toLowerCase()}`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
