import {
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  ZERO_BYTES32,
  createEncryptedNoteV1,
  createProofContextV1,
  hashEncryptedNoteV1,
  hashProofContextV1
} from "@nullark/core";

export type HexString = `0x${string}`;

export type EncryptedNoteEventType = "deposit" | "private-transfer" | "withdraw" | "withdraw-change";
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

export const STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION =
  "proof-bound withdrawal proofContextHash requires calldata public inputs; encrypted-note chain logs are not sufficient.";
export const STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION =
  "private-change withdrawal proofContextHash requires calldata public inputs; encrypted-note chain logs alone bind only event metadata and ciphertext.";

const MAX_ENCRYPTED_NOTE_BYTES = 2048;
const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506" as const;
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
    (record.eventType === "withdraw-change" && envelope.action === "withdraw");
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
  nullifier: HexString;
  noteAmount: bigint;
}): HexString {
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
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
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
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
  nullifier: HexString;
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
}): HexString {
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: input.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
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
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
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

function isEvenHex(value: unknown): value is HexString {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
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
