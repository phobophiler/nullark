import {
  ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
  ENCRYPTED_NOTE_V1_VERSION,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  ZERO_BYTES32 as CORE_ZERO_BYTES32,
  createEncryptedNoteV1,
  createProofContextV1,
  createRelayerPolicyV1,
  hashAbiEncodedToField,
  hashEncryptedNoteV1,
  hashProofContextV1,
  hashRelayerPolicyV1
} from "@nullark/core";
import { decodeAbiParameters, encodeAbiParameters, getAddress, isHex, keccak256, stringToBytes } from "viem";
import {
  WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR,
  type HexString
} from "./broadcaster.js";

export type WithdrawalRelayCalldataValidationInput = {
  data: HexString;
  chainId: number;
  pool: HexString;
  relayValidationMode?: WithdrawalRelayCalldataValidationMode;
  deadlineEpochSeconds?: number;
  expectedRelayer?: HexString;
  expectedRelayerPolicyHash?: HexString;
  feePolicy?: WithdrawalRelayFeePolicy;
};

export type WithdrawalRelayCalldataValidationMode = "v1.1" | "v1.2-unlinkable";

export type WithdrawalRelayFeePolicy = {
  activeFeeBps: bigint;
  pendingFeeBps?: bigint;
  pendingFeeActivationEpochSeconds?: bigint;
  nowEpochSeconds?: bigint;
};

export type WithdrawalRelayCalldataValidation = {
  allowed: boolean;
  errors: string[];
  decoded?: WithdrawalRelayCall;
};

export type WithdrawalRelayCall = {
  selector: HexString;
  relayValidationMode?: WithdrawalRelayCalldataValidationMode;
  hasChangeNote: boolean;
  hasOutputNote?: boolean;
  hasUserBounds: boolean;
  publicInputs: readonly HexString[];
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  encryptedChangeNote?: HexString;
  encryptedOutputNote?: HexString;
  minNetAmount?: bigint;
  maxFeeAmount?: bigint;
  relayerPolicy?: StageBRelayerPolicy;
};

export type StageBRelayerPolicy = {
  relayer: HexString;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  deadlineOrZero: bigint;
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
  relayerPolicy: StageBRelayerPolicy;
  encryptedNoteHash: HexString;
  proofContextHash: HexString;
  relayerPolicyHash?: HexString;
  proofContextShape?: HexString | undefined;
  outputCommitments?: readonly HexString[];
  encryptedChangeNotes?: readonly HexString[];
  changeAmounts?: readonly bigint[];
};

export type StageCWithdrawChangeNoteHashes = {
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  proofContextHash: HexString;
};

const WITHDRAWAL_FEE_BPS = 33n;
const MAX_WITHDRAWAL_FEE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;
const MAX_ENCRYPTED_NOTE_BYTES = 2048;
const ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR = keccak256(stringToBytes("nullark.encrypted-output-note.v2"));
const ENCRYPTED_OUTPUT_NOTE_V2_VERSION = 2;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const RELAY_SUPPORTED_FIXED_DENOMINATIONS_WEI = MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI;
const SUPPORTED_FIXED_DENOMINATIONS = new Set<bigint>(RELAY_SUPPORTED_FIXED_DENOMINATIONS_WEI);
const FUNCTION_SELECTOR_LENGTH = 10;
const PUBLIC_INPUT_NEW_COMMITMENT = 2;
const PUBLIC_INPUT_NULLIFIER = 1;
const PUBLIC_INPUT_DESTINATION = 3;
const PUBLIC_INPUT_GROSS_AMOUNT = 4;
const PUBLIC_INPUT_FEE = 5;
const PUBLIC_INPUT_CHAIN_ID = 6;
const PUBLIC_INPUT_VERIFYING_CONTRACT = 7;
const PUBLIC_INPUT_SPENT_COMMITMENT = 8;
const PUBLIC_INPUT_NOTE_AMOUNT = 9;
const PUBLIC_INPUT_PROOF_CONTEXT_HASH = 10;
const PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 11;
const V1_2_PUBLIC_INPUT_PROOF_CONTEXT_HASH = 8;
const V1_2_PUBLIC_INPUT_ENCRYPTED_OUTPUT_NOTE_HASH = 9;
const STAGE_A_PUBLIC_INPUTS_LENGTH = 10;
const STAGE_B_PUBLIC_INPUTS_LENGTH = 12;
const STAGE_C_PUBLIC_INPUTS_LENGTH = 12;
const V1_2_UNLINKABLE_PUBLIC_INPUTS_LENGTH = 10;

const WITHDRAW_PARAMETERS = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" }
] as const;

const WITHDRAW_BOUNDED_PARAMETERS = [
  ...WITHDRAW_PARAMETERS,
  { type: "uint256" },
  { type: "uint256" }
] as const;

const STAGE_C_WITHDRAW_BOUNDED_PARAMETERS = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "uint256" },
  { type: "uint256" }
] as const;

const STAGE_B_RELAYER_POLICY_PARAMETERS = [
  ...WITHDRAW_PARAMETERS,
  {
    type: "tuple",
    components: [
      { name: "relayer", type: "address" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" },
      { name: "deadlineOrZero", type: "uint256" }
    ]
  }
] as const;

export function validateWithdrawalRelayCalldata(
  input: WithdrawalRelayCalldataValidationInput
): WithdrawalRelayCalldataValidation {
  const errors: string[] = [];
  const decoded = decodeWithdrawalRelayCall(input.data, errors);

  if (!decoded) {
    return { allowed: false, errors };
  }

  const relayValidationMode = input.relayValidationMode ?? "v1.1";
  decoded.relayValidationMode = relayValidationMode;
  if (relayValidationMode === "v1.2-unlinkable") {
    return validateV12UnlinkableWithdrawalRelayCall({ input, decoded, errors });
  }

  const expectedPool = addressToBytes32(input.pool);
  const expectedDestination = addressToBytes32(decoded.destination);
  const expectedFee = calculateWithdrawalFee(decoded.grossAmount, input.feePolicy?.activeFeeBps);
  const publicFee = bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_FEE] ?? ZERO_BYTES32);
  const noteAmount = bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_NOTE_AMOUNT] ?? ZERO_BYTES32);
  const isStageC = decoded.hasChangeNote;
  const isStageB = decoded.relayerPolicy !== undefined && !isStageC;
  const isBoundedFullExit = decoded.selector === WITHDRAW_BOUNDED_SELECTOR && !isStageC;
  const isProofBound = isStageB || isStageC;
  const proofContextShape = selectWithdrawalProofContextShape(input.feePolicy);

  const expectedPublicInputsLength = isStageC
    ? STAGE_C_PUBLIC_INPUTS_LENGTH
    : isStageB
      ? STAGE_B_PUBLIC_INPUTS_LENGTH
      : isBoundedFullExit
        ? STAGE_B_PUBLIC_INPUTS_LENGTH
        : STAGE_A_PUBLIC_INPUTS_LENGTH;
  if (decoded.publicInputs.length !== expectedPublicInputsLength) {
    errors.push(
      isProofBound || isBoundedFullExit
        ? isStageC
          ? "Private-change withdrawal calldata must include exactly 12 public inputs"
          : "Proof-bound withdrawal calldata must include exactly 12 public inputs"
        : "withdrawal calldata must include exactly 10 public inputs"
    );
  }

  for (const publicInput of decoded.publicInputs) {
    if (!isBytes32(publicInput)) {
      errors.push("withdrawal public inputs must be bytes32 values");
      break;
    }
  }

  if (decoded.nullifier.toLowerCase() !== (decoded.publicInputs[PUBLIC_INPUT_NULLIFIER] ?? "").toLowerCase()) {
    errors.push("withdrawal nullifier does not match public inputs");
  }

  if (decoded.nullifier.toLowerCase() === ZERO_BYTES32) {
    errors.push("withdrawal nullifier must be nonzero");
  }

  if ((decoded.publicInputs[PUBLIC_INPUT_DESTINATION] ?? "").toLowerCase() !== expectedDestination.toLowerCase()) {
    errors.push("withdrawal destination does not match public inputs");
  }

  if (bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] ?? ZERO_BYTES32) !== decoded.grossAmount) {
    errors.push("withdrawal gross amount does not match public inputs");
  }

  if (publicFee !== expectedFee) {
    errors.push(input.feePolicy ? "withdrawal fee does not match active fee policy" : "withdrawal fee does not match relayer fee policy");
  }

  if (input.feePolicy) {
    const feePolicyInput: Parameters<typeof validateWithdrawalFeePolicy>[0] = {
      policy: input.feePolicy,
      grossAmount: decoded.grossAmount,
      publicFee
    };
    if (input.deadlineEpochSeconds !== undefined) {
      feePolicyInput.deadlineEpochSeconds = input.deadlineEpochSeconds;
    }
    errors.push(...validateWithdrawalFeePolicy(feePolicyInput));
  }

  if (bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_CHAIN_ID] ?? ZERO_BYTES32) !== BigInt(input.chainId)) {
    errors.push("withdrawal proof chain ID does not match relayer chain");
  }

  if ((decoded.publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] ?? "").toLowerCase() !== expectedPool.toLowerCase()) {
    errors.push("withdrawal proof pool does not match relayer pool");
  }

  if ((decoded.publicInputs[PUBLIC_INPUT_SPENT_COMMITMENT] ?? ZERO_BYTES32).toLowerCase() === ZERO_BYTES32) {
    errors.push("withdrawal spent commitment must be nonzero");
  }

  if (decoded.destination.toLowerCase() === ZERO_ADDRESS) {
    errors.push("withdrawal destination must be nonzero");
  }

  if (decoded.grossAmount <= 0n) {
    errors.push("withdrawal gross amount must be positive");
  }

  if (noteAmount <= 0n) {
    errors.push("withdrawal note amount must be positive");
  }

  if (!SUPPORTED_FIXED_DENOMINATIONS.has(noteAmount)) {
    errors.push("withdrawal note amount must be a supported fixed denomination");
  }

  if (!SUPPORTED_FIXED_DENOMINATIONS.has(decoded.grossAmount)) {
    errors.push("withdrawal gross amount must be a supported fixed denomination");
  }

  if (decoded.grossAmount > noteAmount) {
    errors.push("withdrawal gross amount cannot exceed note amount");
  }

  if (!isStageC && decoded.grossAmount !== noteAmount) {
    errors.push("Public exits without private change must withdraw the full fixed-denomination note");
  }

  if (!isStageC && (decoded.publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] ?? ZERO_BYTES32).toLowerCase() !== ZERO_BYTES32) {
    errors.push("Public exits without private change must not create new commitments");
  }

  if (!isStageC && decoded.encryptedChangeNote !== undefined) {
    errors.push("Public exits without private change must not include encrypted change notes");
  }

  if (!decoded.hasUserBounds) {
    errors.push("Public exit relayer requests require user minNetAmount and maxFeeAmount bounds");
  }

  if (decoded.hasUserBounds) {
    const minNetAmount = decoded.minNetAmount ?? 0n;
    const maxFeeAmount = decoded.maxFeeAmount ?? 0n;
    const netAmount = decoded.grossAmount - expectedFee;

    if (expectedFee > maxFeeAmount) {
      errors.push("withdrawal fee exceeds user max fee bound");
    }

    if (netAmount < minNetAmount) {
      errors.push("withdrawal net amount is below user minimum bound");
    }

    if (maxFeeAmount > decoded.grossAmount) {
      errors.push("withdrawal user max fee bound cannot exceed gross amount");
    }
  }

  if (decoded.encryptedChangeNote && hexByteLength(decoded.encryptedChangeNote) > MAX_ENCRYPTED_NOTE_BYTES) {
    errors.push("withdrawal encrypted change note exceeds relayer policy maximum");
  }

  if (isStageB) {
    const stageBInput: Parameters<typeof validateStageBWithdrawalPreflight>[0] = {
      decoded,
      chainId: input.chainId,
      pool: input.pool,
      expectedFee,
      noteAmount,
      proofContextShape
    };
    if (input.deadlineEpochSeconds !== undefined) {
      stageBInput.deadlineEpochSeconds = input.deadlineEpochSeconds;
    }
    if (input.expectedRelayer !== undefined) {
      stageBInput.expectedRelayer = input.expectedRelayer;
    }
    if (input.expectedRelayerPolicyHash !== undefined) {
      stageBInput.expectedRelayerPolicyHash = input.expectedRelayerPolicyHash;
    }
    errors.push(
      ...validateStageBWithdrawalPreflight(stageBInput)
    );
  }

  if (isBoundedFullExit) {
    errors.push(
      ...validateBoundedFullExitPreflight({
        decoded,
        chainId: input.chainId,
        pool: input.pool,
        expectedFee,
        noteAmount,
        proofContextShape
      })
    );
  }

  if (isStageC) {
    const stageCRelayerPolicy = createStageCRelayerPolicy({ decoded });
    const changeCommitment = decoded.publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] ?? ZERO_BYTES32;
    const changeAmount = noteAmount - decoded.grossAmount;
    const isUnifiedFullExit =
      changeAmount === 0n &&
      changeCommitment.toLowerCase() === ZERO_BYTES32 &&
      (decoded.encryptedChangeNote ?? "0x").toLowerCase() === "0x";
    if (!isUnifiedFullExit && !SUPPORTED_FIXED_DENOMINATIONS.has(changeAmount)) {
      errors.push("Private change amount must be a supported fixed denomination");
    }
    const stageCInput: StageCWithdrawChangeNotePreflightInput = {
      chainId: input.chainId,
      pool: input.pool,
      selector: decoded.selector,
      root: decoded.publicInputs[0] ?? ZERO_BYTES32,
      nullifier: decoded.nullifier,
      destination: decoded.destination,
      grossAmount: decoded.grossAmount,
      fee: expectedFee,
      noteAmount,
      changeCommitment,
      changeAmount,
      encryptedChangeNote: decoded.encryptedChangeNote ?? "0x",
      relayerPolicy: stageCRelayerPolicy,
      encryptedNoteHash: decoded.publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] ?? ZERO_BYTES32,
      proofContextHash: decoded.publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] ?? ZERO_BYTES32,
      proofContextShape
    };
    if (input.expectedRelayerPolicyHash !== undefined) {
      stageCInput.relayerPolicyHash = input.expectedRelayerPolicyHash;
    }
    errors.push(
      ...(isUnifiedFullExit
        ? validateStageCFullExitPreflight(stageCInput)
        : validateStageCWithdrawChangeNotePreflight(stageCInput))
    );
  }

  return { allowed: errors.length === 0, errors, decoded };
}

function validateV12UnlinkableWithdrawalRelayCall(input: {
  input: WithdrawalRelayCalldataValidationInput;
  decoded: WithdrawalRelayCall;
  errors: string[];
}): WithdrawalRelayCalldataValidation {
  const { decoded, errors } = input;
  const request = input.input;
  const expectedPool = addressToBytes32(request.pool);
  const expectedDestination = addressToBytes32(decoded.destination);
  const expectedFee = calculateWithdrawalFee(decoded.grossAmount, request.feePolicy?.activeFeeBps);
  const publicFee = bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_FEE] ?? ZERO_BYTES32);
  const outputCommitment = decoded.publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] ?? ZERO_BYTES32;
  const proofContextHash = decoded.publicInputs[V1_2_PUBLIC_INPUT_PROOF_CONTEXT_HASH] ?? ZERO_BYTES32;
  const encryptedOutputNoteHash = decoded.publicInputs[V1_2_PUBLIC_INPUT_ENCRYPTED_OUTPUT_NOTE_HASH] ?? ZERO_BYTES32;
  const encryptedOutputNote = decoded.encryptedChangeNote ?? "0x";
  const hasEncryptedWithdrawalNote = decoded.hasChangeNote;

  decoded.hasChangeNote = false;
  decoded.hasOutputNote = true;
  decoded.encryptedOutputNote = encryptedOutputNote;
  delete decoded.encryptedChangeNote;

  if (decoded.publicInputs.length !== V1_2_UNLINKABLE_PUBLIC_INPUTS_LENGTH) {
    errors.push("v1.2 unlinkable withdrawal calldata must include exactly 10 public inputs");
    if (decoded.publicInputs.length >= STAGE_B_PUBLIC_INPUTS_LENGTH) {
      errors.push("v1.2 unlinkable withdrawal calldata must not expose spentCommitment or noteAmount public inputs");
    }
  }

  for (const publicInput of decoded.publicInputs) {
    if (!isBytes32(publicInput)) {
      errors.push("v1.2 unlinkable withdrawal public inputs must be bytes32 values");
      break;
    }
  }

  if (decoded.nullifier.toLowerCase() !== (decoded.publicInputs[PUBLIC_INPUT_NULLIFIER] ?? "").toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal nullifier does not match public inputs");
  }

  if (decoded.nullifier.toLowerCase() === ZERO_BYTES32) {
    errors.push("v1.2 unlinkable withdrawal nullifier must be nonzero");
  }

  if ((decoded.publicInputs[PUBLIC_INPUT_DESTINATION] ?? "").toLowerCase() !== expectedDestination.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal destination does not match public inputs");
  }

  if (bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] ?? ZERO_BYTES32) !== decoded.grossAmount) {
    errors.push("v1.2 unlinkable withdrawal gross amount does not match public inputs");
  }

  if (publicFee !== expectedFee) {
    errors.push(request.feePolicy ? "v1.2 unlinkable withdrawal fee does not match active fee policy" : "v1.2 unlinkable withdrawal fee does not match relayer fee policy");
  }

  if (request.feePolicy) {
    const feePolicyInput: Parameters<typeof validateWithdrawalFeePolicy>[0] = {
      policy: request.feePolicy,
      grossAmount: decoded.grossAmount,
      publicFee
    };
    if (request.deadlineEpochSeconds !== undefined) {
      feePolicyInput.deadlineEpochSeconds = request.deadlineEpochSeconds;
    }
    errors.push(...validateWithdrawalFeePolicy(feePolicyInput));
  }

  if (bytes32ToBigInt(decoded.publicInputs[PUBLIC_INPUT_CHAIN_ID] ?? ZERO_BYTES32) !== BigInt(request.chainId)) {
    errors.push("v1.2 unlinkable withdrawal proof chain ID does not match relayer chain");
  }

  if ((decoded.publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] ?? "").toLowerCase() !== expectedPool.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal proof pool does not match relayer pool");
  }

  if (decoded.destination.toLowerCase() === ZERO_ADDRESS) {
    errors.push("v1.2 unlinkable withdrawal destination must be nonzero");
  }

  if (decoded.grossAmount <= 0n) {
    errors.push("v1.2 unlinkable withdrawal gross amount must be positive");
  }

  if (!SUPPORTED_FIXED_DENOMINATIONS.has(decoded.grossAmount)) {
    errors.push("v1.2 unlinkable withdrawal gross amount must be a supported fixed denomination");
  }

  if (!decoded.hasUserBounds) {
    errors.push("v1.2 unlinkable relay requests require user minNetAmount and maxFeeAmount bounds");
  }

  if (decoded.hasUserBounds) {
    const minNetAmount = decoded.minNetAmount ?? 0n;
    const maxFeeAmount = decoded.maxFeeAmount ?? 0n;
    const netAmount = decoded.grossAmount - expectedFee;

    if (expectedFee > maxFeeAmount) {
      errors.push("v1.2 unlinkable withdrawal fee exceeds user max fee bound");
    }

    if (netAmount < minNetAmount) {
      errors.push("v1.2 unlinkable withdrawal net amount is below user minimum bound");
    }

    if (maxFeeAmount > decoded.grossAmount) {
      errors.push("v1.2 unlinkable withdrawal user max fee bound cannot exceed gross amount");
    }
  }

  if (!isBytes32(outputCommitment)) {
    errors.push("v1.2 unlinkable output commitment must be a bytes32 value");
  } else if (outputCommitment.toLowerCase() === ZERO_BYTES32) {
    errors.push("v1.2 unlinkable output commitment must be nonzero");
  }
  if (!hasEncryptedWithdrawalNote || !isEvenHex(encryptedOutputNote) || encryptedOutputNote === "0x") {
    errors.push("v1.2 unlinkable withdrawal requires always-present encrypted output note bytes");
  }

  if (isEvenHex(encryptedOutputNote) && hexByteLength(encryptedOutputNote) > MAX_ENCRYPTED_NOTE_BYTES) {
    errors.push("v1.2 unlinkable encrypted output note exceeds relayer policy maximum");
  }
  if (isEvenHex(encryptedOutputNote) && encryptedOutputNote !== "0x") {
    errors.push(...validateEncryptedOutputNoteV2EnvelopeForBinding(encryptedOutputNote, {
      chainId: request.chainId,
      pool: request.pool,
      outputCommitment
    }));
  }

  const relayerPolicy = decoded.relayerPolicy ?? createStageCRelayerPolicy({ decoded });
  const expectedEncryptedOutputNoteHash = computeV12ContractBoundEncryptedOutputNoteHash({
    chainId: request.chainId,
    pool: request.pool,
    selector: decoded.selector,
    nullifier: decoded.nullifier,
    outputCommitment,
    encryptedOutputNote
  });
  if (encryptedOutputNoteHash.toLowerCase() !== expectedEncryptedOutputNoteHash.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal encryptedOutputNoteHash does not match public inputs");
  }

  const expectedProofContextHash = computeStageBProofContextHash({
    chainId: request.chainId,
    pool: request.pool,
    selector: decoded.selector,
    root: decoded.publicInputs[0] ?? ZERO_BYTES32,
    nullifier: decoded.nullifier,
    destination: decoded.destination,
    grossAmount: decoded.grossAmount,
    fee: expectedFee,
    encryptedNoteHash: expectedEncryptedOutputNoteHash,
    relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
    deadlineOrZero: relayerPolicy.deadlineOrZero,
    proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
  });
  if (proofContextHash.toLowerCase() !== expectedProofContextHash.toLowerCase()) {
    errors.push("v1.2 unlinkable withdrawal proofContextHash does not match public inputs");
  }

  return { allowed: errors.length === 0, errors, decoded };
}

function validateBoundedFullExitPreflight(input: {
  decoded: WithdrawalRelayCall;
  chainId: number;
  pool: HexString;
  expectedFee: bigint;
  noteAmount: bigint;
  proofContextShape: HexString;
}): string[] {
  const errors: string[] = [];
  const root = input.decoded.publicInputs[0] ?? ZERO_BYTES32;
  const relayerPolicy: StageBRelayerPolicy = {
    relayer: ZERO_ADDRESS,
    minNetAmount: input.decoded.minNetAmount ?? 0n,
    maxFeeAmount: input.decoded.maxFeeAmount ?? 0n,
    deadlineOrZero: 0n
  };
  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: input.decoded.selector,
    nullifier: input.decoded.nullifier,
    noteAmount: input.noteAmount,
    proofContextShape: input.proofContextShape
  });
  if ((input.decoded.publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] ?? "").toLowerCase() !== encryptedNoteHash.toLowerCase()) {
    errors.push("Proof-bound withdrawal encrypted-note hash does not match public inputs");
  }

  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: input.decoded.selector,
    root,
    nullifier: input.decoded.nullifier,
    destination: input.decoded.destination,
    grossAmount: input.decoded.grossAmount,
    fee: input.expectedFee,
    encryptedNoteHash,
    relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
    deadlineOrZero: 0n,
    proofContextShape: input.proofContextShape
  });
  if ((input.decoded.publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] ?? "").toLowerCase() !== proofContextHash.toLowerCase()) {
    errors.push("Proof-bound withdrawal proofContextHash does not match public inputs");
  }

  return errors;
}

export function computeStageBContractBoundEncryptedNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector: HexString;
  nullifier: HexString;
  noteAmount: bigint;
  proofContextShape?: HexString | undefined;
}): HexString {
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: getAddress(input.pool) as HexString,
      shape: input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector: input.selector,
      nullifier: input.nullifier,
      commitment: CORE_ZERO_BYTES32,
      noteAmount: input.noteAmount,
      encryptedNote: "0x"
    })
  ) as HexString;
}

export function computeV12ContractBoundEncryptedOutputNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector: HexString;
  nullifier: HexString;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
}): HexString {
  return hashAbiEncodedToField(encodeAbiParameters([
    { type: "bytes32" },
    { type: "uint16" },
    { type: "uint256" },
    { type: "address" },
    { type: "bytes32" },
    { type: "bytes4" },
    { type: "bytes32" },
    { type: "bytes32" },
    { type: "bytes32" }
  ], [
    ENCRYPTED_OUTPUT_NOTE_V2_DOMAIN_SEPARATOR,
    ENCRYPTED_OUTPUT_NOTE_V2_VERSION,
    BigInt(input.chainId),
    getAddress(input.pool),
    PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
    input.selector,
    input.nullifier,
    input.outputCommitment,
    keccak256(input.encryptedOutputNote)
  ])) as HexString;
}

export function computeStageBRelayerPolicyHash(input: {
  relayer: HexString;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  deadlineOrZero: bigint;
}): HexString {
  return hashRelayerPolicyV1(createRelayerPolicyV1(input)) as HexString;
}

export function computeStageBProofContextHash(input: {
  chainId: number;
  pool: HexString;
  selector: HexString;
  root: HexString;
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  fee: bigint;
  encryptedNoteHash: HexString;
  relayerPolicyHash: HexString;
  deadlineOrZero: bigint;
  proofContextShape?: HexString | undefined;
}): HexString {
  return hashProofContextV1(
    createProofContextV1({
      chainId: input.chainId,
      pool: getAddress(input.pool) as HexString,
      shape: input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector: input.selector,
      root: input.root,
      nullifier: input.nullifier,
      destination: getAddress(input.destination) as HexString,
      grossAmount: input.grossAmount,
      fee: input.fee,
      encryptedNoteHash: input.encryptedNoteHash,
      relayerPolicyHash: input.relayerPolicyHash,
      deadlineOrZero: input.deadlineOrZero
    })
  ) as HexString;
}

export function computeStageCContractBoundEncryptedChangeNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector?: HexString;
  nullifier: HexString;
  changeCommitment: HexString;
  changeAmount: bigint;
  encryptedChangeNote: HexString;
  proofContextShape?: HexString | undefined;
}): HexString {
  return hashEncryptedNoteV1(
    createEncryptedNoteV1({
      chainId: input.chainId,
      pool: getAddress(input.pool) as HexString,
      shape: input.proofContextShape ?? PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
      selector: input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      nullifier: input.nullifier,
      commitment: input.changeCommitment,
      noteAmount: input.changeAmount,
      encryptedNote: input.encryptedChangeNote
    })
  ) as HexString;
}

export function computeStageCWithdrawChangeNoteHashes(
  input: Omit<
    StageCWithdrawChangeNotePreflightInput,
    "encryptedNoteHash" | "proofContextHash" | "relayerPolicyHash" | "outputCommitments" | "encryptedChangeNotes" | "changeAmounts"
  >
): StageCWithdrawChangeNoteHashes {
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;
  const encryptedNoteHash = computeStageCContractBoundEncryptedChangeNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    nullifier: input.nullifier,
    changeCommitment: input.changeCommitment,
    changeAmount: input.changeAmount,
    encryptedChangeNote: input.encryptedChangeNote,
    proofContextShape: input.proofContextShape
  });
  const relayerPolicyHash = computeStageBRelayerPolicyHash(input.relayerPolicy);
  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    root: input.root,
    nullifier: input.nullifier,
    destination: input.destination,
    grossAmount: input.grossAmount,
    fee: input.fee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: input.relayerPolicy.deadlineOrZero,
    proofContextShape: input.proofContextShape
  });

  return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
}

export function validateStageCWithdrawChangeNotePreflight(
  input: StageCWithdrawChangeNotePreflightInput
): string[] {
  const errors: string[] = [];
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;

  if (selector !== STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    errors.push("Private-change withdrawal selector must be the bounded private-change selector");
  }
  if (!isBytes32(input.changeCommitment) || input.changeCommitment.toLowerCase() === ZERO_BYTES32) {
    errors.push("Private change commitment must be a nonzero bytes32 value");
  }
  if (!isEvenHex(input.encryptedChangeNote) || input.encryptedChangeNote === "0x") {
    errors.push("Encrypted private change note must be nonempty even-length hex");
  }
  if (isEvenHex(input.encryptedChangeNote) && hexByteLength(input.encryptedChangeNote) > MAX_ENCRYPTED_NOTE_BYTES) {
    errors.push("Encrypted private change note exceeds relayer policy maximum");
  }
  if (input.changeAmount <= 0n) {
    errors.push("Private change amount must be positive");
  }
  if (input.fee > input.grossAmount) {
    errors.push("Private-change withdrawal fee cannot exceed public gross amount");
  }
  if (input.noteAmount !== input.grossAmount + input.changeAmount) {
    errors.push("Private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount");
  }

  const outputCommitments = input.outputCommitments ?? [input.changeCommitment];
  const encryptedChangeNotes = input.encryptedChangeNotes ?? [input.encryptedChangeNote];
  const changeAmounts = input.changeAmounts ?? [input.changeAmount];
  if (outputCommitments.length !== 1 || encryptedChangeNotes.length !== 1 || changeAmounts.length !== 1) {
    errors.push("Private-change withdrawal supports exactly one private change output");
  } else {
    if (outputCommitments[0]?.toLowerCase() !== input.changeCommitment.toLowerCase()) {
      errors.push("Private change output commitment order does not match the change commitment");
    }
    if (encryptedChangeNotes[0]?.toLowerCase() !== input.encryptedChangeNote.toLowerCase()) {
      errors.push("Private change ciphertext order does not match the change output");
    }
    if (changeAmounts[0] !== input.changeAmount) {
      errors.push("Private change amount order does not match the change output");
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  const hashes = computeStageCWithdrawChangeNoteHashes({ ...input, selector });
  if (hashes.encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("Private change note hash does not match preflight context");
  }
  if (input.relayerPolicyHash !== undefined && hashes.relayerPolicyHash.toLowerCase() !== input.relayerPolicyHash.toLowerCase()) {
    errors.push("Private-change withdrawal relayerPolicyHash does not match relayer policy");
  }
  if (hashes.proofContextHash.toLowerCase() !== input.proofContextHash.toLowerCase()) {
    errors.push("Private-change withdrawal proofContextHash does not match preflight context");
  }

  return errors;
}

function validateStageCFullExitPreflight(input: StageCWithdrawChangeNotePreflightInput): string[] {
  const errors: string[] = [];
  const selector = input.selector ?? STAGE_C_WITHDRAW_BOUNDED_SELECTOR;

  if (selector !== STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    errors.push("Stage C full-exit withdrawal selector must be the bounded unified selector");
  }
  if (input.changeCommitment.toLowerCase() !== ZERO_BYTES32) {
    errors.push("Stage C full exits must not create a private change commitment");
  }
  if ((input.encryptedChangeNote ?? "0x").toLowerCase() !== "0x") {
    errors.push("Stage C full exits must not include encrypted private change note bytes");
  }
  if (input.changeAmount !== 0n) {
    errors.push("Stage C full exits must have zero private change amount");
  }
  if (input.fee > input.grossAmount) {
    errors.push("Stage C full-exit withdrawal fee cannot exceed public gross amount");
  }
  if (input.noteAmount !== input.grossAmount) {
    errors.push("Stage C full-exit value conservation must satisfy noteAmount = grossAmount");
  }

  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    nullifier: input.nullifier,
    noteAmount: input.noteAmount,
    proofContextShape: input.proofContextShape
  });
  if (encryptedNoteHash.toLowerCase() !== input.encryptedNoteHash.toLowerCase()) {
    errors.push("Stage C full-exit encrypted-note hash does not match public inputs");
  }
  const relayerPolicyHash = computeStageBRelayerPolicyHash(input.relayerPolicy);
  if (input.relayerPolicyHash !== undefined && relayerPolicyHash.toLowerCase() !== input.relayerPolicyHash.toLowerCase()) {
    errors.push("Stage C full-exit relayerPolicyHash does not match relayer policy");
  }
  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector,
    root: input.root,
    nullifier: input.nullifier,
    destination: input.destination,
    grossAmount: input.grossAmount,
    fee: input.fee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: input.relayerPolicy.deadlineOrZero,
    proofContextShape: input.proofContextShape
  });
  if (proofContextHash.toLowerCase() !== input.proofContextHash.toLowerCase()) {
    errors.push("Stage C full-exit proofContextHash does not match public inputs");
  }

  return errors;
}

function validateStageBWithdrawalPreflight(input: {
  decoded: WithdrawalRelayCall;
  chainId: number;
  pool: HexString;
  deadlineEpochSeconds?: number;
  expectedRelayer?: HexString;
  expectedRelayerPolicyHash?: HexString;
  expectedFee: bigint;
  noteAmount: bigint;
  proofContextShape: HexString;
}): string[] {
  const errors: string[] = [];
  const root = input.decoded.publicInputs[0] ?? ZERO_BYTES32;
  const relayerPolicy = input.decoded.relayerPolicy;

  if (!relayerPolicy) {
    return ["Proof-bound withdrawal calldata must include relayer policy"];
  }

  if (input.decoded.selector !== PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR) {
    errors.push("Proof-bound withdrawal selector does not match relayer-policy withdraw selector");
  }

  const deadlineEpochSeconds = input.deadlineEpochSeconds;
  if (
    typeof deadlineEpochSeconds !== "number" ||
    !Number.isSafeInteger(deadlineEpochSeconds) ||
    BigInt(deadlineEpochSeconds) !== relayerPolicy.deadlineOrZero
  ) {
    errors.push("Proof-bound withdrawal deadline does not match relayer request");
  }

  if (input.expectedRelayer && relayerPolicy.relayer.toLowerCase() !== getAddress(input.expectedRelayer).toLowerCase()) {
    errors.push("Proof-bound withdrawal relayer policy does not match signing relayer");
  }

  const netAmount = input.decoded.grossAmount - input.expectedFee;
  if (input.expectedFee > relayerPolicy.maxFeeAmount) {
    errors.push("Proof-bound withdrawal fee exceeds relayer policy max fee");
  }
  if (netAmount < relayerPolicy.minNetAmount) {
    errors.push("Proof-bound withdrawal net amount is below relayer policy minimum");
  }

  const relayerPolicyHash = computeStageBRelayerPolicyHash(relayerPolicy);
  if (
    input.expectedRelayerPolicyHash &&
    relayerPolicyHash.toLowerCase() !== input.expectedRelayerPolicyHash.toLowerCase()
  ) {
    errors.push("Proof-bound withdrawal relayerPolicyHash does not match relayer policy");
  }

  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: input.decoded.selector,
    nullifier: input.decoded.nullifier,
    noteAmount: input.noteAmount,
    proofContextShape: input.proofContextShape
  });
  if ((input.decoded.publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] ?? "").toLowerCase() !== encryptedNoteHash.toLowerCase()) {
    errors.push("Proof-bound withdrawal encrypted-note hash does not match public inputs");
  }

  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: input.decoded.selector,
    root,
    nullifier: input.decoded.nullifier,
    destination: input.decoded.destination,
    grossAmount: input.decoded.grossAmount,
    fee: input.expectedFee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: relayerPolicy.deadlineOrZero,
    proofContextShape: input.proofContextShape
  });
  if ((input.decoded.publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] ?? "").toLowerCase() !== proofContextHash.toLowerCase()) {
    errors.push("Proof-bound withdrawal proofContextHash does not match public inputs");
  }

  return errors;
}

function decodeWithdrawalRelayCall(data: HexString, errors: string[]): WithdrawalRelayCall | undefined {
  if (!isHex(data) || data.length < FUNCTION_SELECTOR_LENGTH) {
    errors.push("withdrawal calldata must be hex with a function selector");
    return undefined;
  }

  const selector = data.slice(0, FUNCTION_SELECTOR_LENGTH).toLowerCase() as HexString;
  const encodedParameters = `0x${data.slice(FUNCTION_SELECTOR_LENGTH)}` as HexString;

  try {
    if (selector === WITHDRAW_SELECTOR) {
      errors.push("Relayer requires user-bounded withdrawal calldata");
      return undefined;
    }

    if (selector === WITHDRAW_BOUNDED_SELECTOR) {
      const [proof, publicInputs, nullifier, destination, grossAmount, minNetAmount, maxFeeAmount] =
        decodeAbiParameters(WITHDRAW_BOUNDED_PARAMETERS, encodedParameters);
      return normalizeDecodedWithdrawalCall({
        selector,
        proof,
        publicInputs,
        nullifier,
        destination,
        grossAmount,
        minNetAmount,
        maxFeeAmount,
        hasChangeNote: false,
        hasUserBounds: true
      });
    }

    if (selector === PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR) {
      const [proof, publicInputs, nullifier, destination, grossAmount, relayerPolicy] =
        decodeAbiParameters(STAGE_B_RELAYER_POLICY_PARAMETERS, encodedParameters);
      return normalizeDecodedWithdrawalCall({
        selector,
        proof,
        publicInputs,
        nullifier,
        destination,
        grossAmount,
        relayerPolicy,
        hasChangeNote: false,
        hasUserBounds: true
      });
    }

    if (selector === STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR) {
      errors.push("Unbounded private-change withdrawal calls are not accepted by the relayer");
      return undefined;
    }

    if (selector === STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
      const [proof, publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, minNetAmount, maxFeeAmount] =
        decodeAbiParameters(STAGE_C_WITHDRAW_BOUNDED_PARAMETERS, encodedParameters);
      return normalizeDecodedWithdrawalCall({
        selector,
        proof,
        publicInputs,
        nullifier,
        destination,
        grossAmount,
        encryptedChangeNote,
        minNetAmount,
        maxFeeAmount,
        hasChangeNote: true,
        hasUserBounds: true
      });
    }

    errors.push("withdrawal function selector is unsupported");
    return undefined;
  } catch {
    errors.push("withdrawal calldata could not be decoded");
    return undefined;
  }
}

function normalizeDecodedWithdrawalCall(input: {
  selector: HexString;
  proof: HexString;
  publicInputs: readonly HexString[];
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  encryptedChangeNote?: HexString;
  minNetAmount?: bigint;
  maxFeeAmount?: bigint;
  relayerPolicy?: {
    relayer: HexString;
    minNetAmount: bigint;
    maxFeeAmount: bigint;
    deadlineOrZero: bigint;
  };
  hasChangeNote: boolean;
  hasUserBounds: boolean;
}): WithdrawalRelayCall {
  const call: WithdrawalRelayCall = {
    selector: input.selector,
    hasChangeNote: input.hasChangeNote,
    hasUserBounds: input.hasUserBounds,
    publicInputs: input.publicInputs.map((value) => value.toLowerCase() as HexString),
    nullifier: input.nullifier.toLowerCase() as HexString,
    destination: getAddress(input.destination) as HexString,
    grossAmount: input.grossAmount
  };

  if (input.encryptedChangeNote !== undefined) {
    call.encryptedChangeNote = input.encryptedChangeNote;
  }
  if (input.minNetAmount !== undefined) {
    call.minNetAmount = input.minNetAmount;
  }
  if (input.maxFeeAmount !== undefined) {
    call.maxFeeAmount = input.maxFeeAmount;
  }
  if (input.relayerPolicy !== undefined) {
    call.relayerPolicy = {
      relayer: getAddress(input.relayerPolicy.relayer) as HexString,
      minNetAmount: input.relayerPolicy.minNetAmount,
      maxFeeAmount: input.relayerPolicy.maxFeeAmount,
      deadlineOrZero: input.relayerPolicy.deadlineOrZero
    };
    call.minNetAmount = input.relayerPolicy.minNetAmount;
    call.maxFeeAmount = input.relayerPolicy.maxFeeAmount;
  }

  return call;
}

function calculateWithdrawalFee(grossAmount: bigint, feeBps = WITHDRAWAL_FEE_BPS): bigint {
  return (grossAmount * feeBps) / BPS_DENOMINATOR;
}

function selectWithdrawalProofContextShape(feePolicy?: WithdrawalRelayFeePolicy): HexString {
  return feePolicy ? PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE : PROOF_CONTEXT_V1_SHAPE_WITHDRAW;
}

function validateWithdrawalFeePolicy(input: {
  policy: WithdrawalRelayFeePolicy;
  grossAmount: bigint;
  publicFee: bigint;
  deadlineEpochSeconds?: number;
}): string[] {
  const errors: string[] = [];
  if (input.policy.activeFeeBps < 0n || input.policy.activeFeeBps > MAX_WITHDRAWAL_FEE_BPS) {
    errors.push("active fee bps is outside relayer policy bounds");
  }
  if (input.policy.pendingFeeBps !== undefined && (input.policy.pendingFeeBps < 0n || input.policy.pendingFeeBps > MAX_WITHDRAWAL_FEE_BPS)) {
    errors.push("pending fee bps is outside relayer policy bounds");
  }
  if (
    input.policy.pendingFeeBps !== undefined &&
    input.policy.pendingFeeActivationEpochSeconds !== undefined &&
    input.deadlineEpochSeconds !== undefined &&
    input.policy.pendingFeeActivationEpochSeconds <= BigInt(input.deadlineEpochSeconds)
  ) {
    errors.push("pending fee activates before relay deadline");
  }
  if (
    input.policy.pendingFeeBps !== undefined &&
    input.policy.pendingFeeActivationEpochSeconds !== undefined &&
    input.policy.nowEpochSeconds !== undefined &&
    input.policy.nowEpochSeconds < input.policy.pendingFeeActivationEpochSeconds &&
    input.publicFee === calculateWithdrawalFee(input.grossAmount, input.policy.pendingFeeBps)
  ) {
    errors.push("withdrawal fee matches pending fee before activation");
  }
  return errors;
}

function createStageCRelayerPolicy(input: {
  decoded: WithdrawalRelayCall;
}): StageBRelayerPolicy {
  // The bounded private-change overload on NullarkPool constructs this exact
  // zero-relayer proof context internally. The Worker request deadline remains
  // an outer relay policy and must not be mixed into the contract proof hash.
  return {
    relayer: ZERO_ADDRESS,
    minNetAmount: input.decoded.minNetAmount ?? 0n,
    maxFeeAmount: input.decoded.maxFeeAmount ?? 0n,
    deadlineOrZero: 0n
  };
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
  if (envelope.version !== ENCRYPTED_OUTPUT_NOTE_V2_VERSION || envelope.domain !== "nullark.encrypted-output-note.v2") {
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
  if (isBytes32(envelope.proofContextHash) && envelope.proofContextHash.toLowerCase() !== ZERO_BYTES32) {
    errors.push("v1.2 unlinkable withdrawal encrypted output note proofContextHash must be zero until envelope binding v3");
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

  return [...new Set(errors)];
}

function hexToUtf8(value: HexString): string {
  const hex = value.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function addressToBytes32(address: HexString): HexString {
  return `0x${"0".repeat(24)}${getAddress(address).slice(2).toLowerCase()}` as HexString;
}

function bytes32ToBigInt(value: HexString): bigint {
  return BigInt(value);
}

function isBytes32(value: unknown): value is HexString {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isEvenHex(value: unknown): value is HexString {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

function hexByteLength(value: HexString): number {
  return (value.length - 2) / 2;
}
