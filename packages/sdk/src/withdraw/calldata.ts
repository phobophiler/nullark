import { decodeFunctionData, encodeFunctionData } from "viem";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";
import { MEGAETH_MAINNET_CHAIN_ID, MEGAETH_TESTNET_CHAIN_ID, type SupportedMegaEthChainId } from "../runtime/current.js";

export const MIN_WITHDRAWABLE_AMOUNT_WEI = 1n;
export const WITHDRAW_BOUNDED_SELECTOR = "0xc7787d0f";
export const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506";
export const NULLIFIERS_SELECTOR = "0x2997e86b";
export const NULLARK_V1_1_PUBLIC_INPUTS_LENGTH = 12;
export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const BN254_SCALAR_FIELD =
  "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

const NULLARK_POOL_ABI = [
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

export type WithdrawBoundedCalldataInput = {
  proof: string;
  publicInputs: readonly string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  minNetAmountWei: string;
  maxFeeWei: string;
};

export type StageCWithdrawChangeNoteCalldataInput = WithdrawBoundedCalldataInput & {
  encryptedChangeNote: string;
};

export type WithdrawPublicInputBinding = {
  publicInputs: readonly string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  currentRoot: string;
  changeCommitment?: string | undefined;
  expectedPool: string;
  expectedChainId: SupportedMegaEthChainId;
};

export type WithdrawCalldataBinding = {
  publicInputs: readonly string[];
  nullifier: string;
  destination: string;
  grossAmountWei: string;
  minNetAmountWei: string;
  maxFeeWei: string;
};

export type DecodedStageCWithdrawCalldata = {
  proof: HexString;
  publicInputs: HexString[];
  nullifier: HexString;
  destination: HexString;
  grossAmountWei: string;
  encryptedChangeNote: HexString;
  minNetAmountWei: string;
  maxFeeWei: string;
};

export function encodeWithdrawBoundedCalldata(input: WithdrawBoundedCalldataInput): HexString {
  const normalized = normalizeWithdrawInput(input);

  return encodeFunctionData({
    abi: NULLARK_POOL_ABI,
    functionName: "withdraw",
    args: [
      normalized.proof,
      normalized.publicInputs,
      normalized.nullifier,
      normalized.destination,
      normalized.grossAmount,
      "0x",
      normalized.minNetAmount,
      normalized.maxFeeAmount
    ]
  });
}

export function encodeStageCWithdrawChangeNoteCalldata(input: StageCWithdrawChangeNoteCalldataInput): HexString {
  const normalized = normalizeWithdrawInput(input);
  const encryptedChangeNote = normalizeHexBytes(
    input.encryptedChangeNote,
    "Expected proof and encrypted change note to be even-length hex bytes."
  );

  return encodeFunctionData({
    abi: NULLARK_POOL_ABI,
    functionName: "withdraw",
    args: [
      normalized.proof,
      normalized.publicInputs,
      normalized.nullifier,
      normalized.destination,
      normalized.grossAmount,
      encryptedChangeNote,
      normalized.minNetAmount,
      normalized.maxFeeAmount
    ]
  });
}

export function encodeVerifiedWithdrawBoundedCalldata(
  input: WithdrawBoundedCalldataInput & Omit<WithdrawPublicInputBinding, "publicInputs" | "nullifier" | "destination" | "grossAmountWei">
): HexString {
  assertWithdrawPublicInputBinding(input);
  return encodeWithdrawBoundedCalldata(input);
}

export function encodeVerifiedStageCWithdrawChangeNoteCalldata(
  input: StageCWithdrawChangeNoteCalldataInput &
    Omit<WithdrawPublicInputBinding, "publicInputs" | "nullifier" | "destination" | "grossAmountWei">
): HexString {
  assertWithdrawPublicInputBinding(input);
  return encodeStageCWithdrawChangeNoteCalldata(input);
}

export function assertStageCWithdrawBoundedCalldata(value: string): HexString {
  decodeStageCWithdrawCalldata(value);
  return value as HexString;
}

export function decodeStageCWithdrawCalldata(value: string): DecodedStageCWithdrawCalldata {
  if (!isHexString(value)) {
    throw new Error("Expected withdrawal calldata to be even-length hex bytes.");
  }
  if (!value.toLowerCase().startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)) {
    throw new Error("Expected proof-bound stage-C withdrawal calldata selector.");
  }
  try {
    const decoded = decodeFunctionData({ abi: NULLARK_POOL_ABI, data: value as HexString });
    if (decoded.functionName !== "withdraw" || decoded.args.length !== 8) {
      throw new Error("wrong-shape");
    }
    const [proof, publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, minNetAmount, maxFeeAmount] = decoded.args;
    const normalizedProof = normalizeHexBytes(proof, "Expected proof to be even-length hex bytes.");
    const normalizedPublicInputs = assertPublicInputs(publicInputs);
    const normalizedNullifier = assertBytes32(nullifier, "Expected a 32-byte nullifier.");
    const normalizedDestination = assertAddress(destination);
    const normalizedEncryptedChangeNote = normalizeHexBytes(
      encryptedChangeNote,
      "Expected proof and encrypted change note to be even-length hex bytes."
    );
    if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
      throw new Error("Expected gross amount wei to be positive.");
    }
    if (minNetAmount > grossAmount) {
      throw new Error("Expected minimum net amount to be less than or equal to gross amount.");
    }
    if (maxFeeAmount > grossAmount) {
      throw new Error("Expected maximum fee to be less than or equal to gross amount.");
    }
    return {
      proof: normalizedProof,
      publicInputs: normalizedPublicInputs,
      nullifier: normalizedNullifier,
      destination: normalizedDestination,
      grossAmountWei: grossAmount.toString(),
      encryptedChangeNote: normalizedEncryptedChangeNote,
      minNetAmountWei: minNetAmount.toString(),
      maxFeeWei: maxFeeAmount.toString()
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected")) {
      throw error;
    }
    throw new Error("Expected complete proof-bound stage-C withdrawal calldata.");
  }
}

export function assertStageCWithdrawCalldataBinding(value: string, expected: WithdrawCalldataBinding): HexString {
  const decoded = decodeStageCWithdrawCalldata(value);
  const expectedPublicInputs = assertPublicInputs(expected.publicInputs);
  const expectedNullifier = assertBytes32(expected.nullifier, "Expected a 32-byte nullifier.");
  const expectedDestination = assertAddress(expected.destination.trim());
  const expectedGrossAmount = normalizeDecimalUint256(expected.grossAmountWei, "Expected gross amount wei as a decimal integer.");
  const expectedMinNetAmount = normalizeDecimalUint256(expected.minNetAmountWei, "Expected minimum net amount wei as a decimal integer.");
  const expectedMaxFee = normalizeDecimalUint256(expected.maxFeeWei, "Expected maximum fee wei as a decimal integer.");

  if (decoded.publicInputs.some((input, index) => input.toLowerCase() !== expectedPublicInputs[index]?.toLowerCase())) {
    throw new Error("Withdrawal calldata public inputs do not match the proof bundle.");
  }
  if (decoded.nullifier.toLowerCase() !== expectedNullifier.toLowerCase()) {
    throw new Error("Withdrawal calldata nullifier does not match the proof bundle.");
  }
  if (decoded.destination.toLowerCase() !== expectedDestination.toLowerCase()) {
    throw new Error("Withdrawal calldata destination does not match the withdrawal plan.");
  }
  if (BigInt(decoded.grossAmountWei) !== expectedGrossAmount) {
    throw new Error("Withdrawal calldata amount does not match the withdrawal plan.");
  }
  if (BigInt(decoded.minNetAmountWei) !== expectedMinNetAmount || BigInt(decoded.maxFeeWei) !== expectedMaxFee) {
    throw new Error("Withdrawal calldata fee bounds do not match the withdrawal plan.");
  }
  return value as HexString;
}

export function encodeNullifierLookupCalldata(nullifier: string): HexString {
  return `${NULLIFIERS_SELECTOR}${assertBytes32(nullifier, "Expected withdrawal nullifier to be bytes32.").slice(2)}`;
}

export function assertWithdrawPublicInputBinding({
  publicInputs,
  nullifier,
  destination,
  grossAmountWei,
  currentRoot,
  changeCommitment,
  expectedPool,
  expectedChainId
}: WithdrawPublicInputBinding): void {
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
  ] = assertPublicInputs(publicInputs) as [
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

  const expectedRoot = assertBytes32(currentRoot, "Expected current root to be bytes32 hex.");
  const expectedNullifier = assertBytes32(nullifier, "Expected a 32-byte nullifier.");
  const expectedDestination = assertAddress(destination.trim());
  const expectedGrossAmount = normalizeDecimalUint256(grossAmountWei, "Expected gross amount wei as a decimal integer.");
  const pool = assertAddress(expectedPool);

  if (expectedChainId !== MEGAETH_MAINNET_CHAIN_ID && expectedChainId !== MEGAETH_TESTNET_CHAIN_ID) {
    throw new Error("Expected withdrawal proof chain ID to be MegaETH mainnet or testnet.");
  }
  if (proofRoot.toLowerCase() !== expectedRoot.toLowerCase()) {
    throw new Error("Withdrawal proof root does not match the current pool root.");
  }
  if (proofNullifier.toLowerCase() !== expectedNullifier.toLowerCase()) {
    throw new Error("Withdrawal nullifier does not match public inputs.");
  }
  if (proofChangeCommitment !== ZERO_BYTES32 && !isBn254FieldElement(proofChangeCommitment)) {
    throw new Error("Withdrawal change commitment is not a nonzero BN254 field element.");
  }
  if (changeCommitment !== undefined && proofChangeCommitment.toLowerCase() !== changeCommitment.trim().toLowerCase()) {
    throw new Error("Withdrawal change commitment does not match public inputs.");
  }
  if (bytes32ToEvmAddress(proofDestination).toLowerCase() !== expectedDestination.toLowerCase()) {
    throw new Error("Withdrawal destination does not match public inputs.");
  }
  if (BigInt(proofGrossAmount) !== expectedGrossAmount) {
    throw new Error("Withdrawal amount does not match public inputs.");
  }
  if (BigInt(proofChainId) !== BigInt(expectedChainId)) {
    throw new Error("Withdrawal proof is not bound to the active MegaETH chain.");
  }
  if (bytes32ToEvmAddress(proofPool).toLowerCase() !== pool.toLowerCase()) {
    throw new Error("Withdrawal proof is not bound to this shielded pool.");
  }
  if (!isBn254FieldElement(proofSpentCommitment)) {
    throw new Error("Withdrawal spent commitment is not a nonzero BN254 field element.");
  }
  if (BigInt(proofNoteAmount) === 0n) {
    throw new Error("Withdrawal note amount must be positive.");
  }
  if (proofContextHash === ZERO_BYTES32 || encryptedNoteHash === ZERO_BYTES32) {
    throw new Error("Withdrawal proof must bind nonzero proof context and encrypted note hashes.");
  }
}

function normalizeWithdrawInput(input: WithdrawBoundedCalldataInput): {
  proof: HexString;
  publicInputs: HexString[];
  nullifier: HexString;
  destination: HexString;
  grossAmount: bigint;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
} {
  const proof = normalizeHexBytes(input.proof, "Expected proof to be even-length hex bytes.");
  const publicInputs = assertPublicInputs(input.publicInputs);
  const nullifier = assertBytes32(input.nullifier, "Expected a 32-byte nullifier.");
  const destination = assertAddress(input.destination.trim());
  const amountError = "Expected gross amount, minimum net amount, and maximum fee as decimal integers.";
  const grossAmount = normalizeDecimalUint256(input.grossAmountWei, amountError);
  const minNetAmount = normalizeDecimalUint256(input.minNetAmountWei, amountError);
  const maxFeeAmount = normalizeDecimalUint256(input.maxFeeWei, amountError);

  if (grossAmount < MIN_WITHDRAWABLE_AMOUNT_WEI) {
    throw new Error("Expected gross amount wei to be positive.");
  }
  if (minNetAmount > grossAmount) {
    throw new Error("Expected minimum net amount to be less than or equal to gross amount.");
  }
  if (maxFeeAmount > grossAmount) {
    throw new Error("Expected maximum fee to be less than or equal to gross amount.");
  }

  return { proof, publicInputs, nullifier, destination, grossAmount, minNetAmount, maxFeeAmount };
}

function assertPublicInputs(values: readonly string[]): HexString[] {
  if (values.length !== NULLARK_V1_1_PUBLIC_INPUTS_LENGTH) {
    throw new Error("Expected exactly 12 public input bytes32 values.");
  }
  return values.map((value) => assertBytes32(value, "Expected every public input to be bytes32."));
}

function normalizeHexBytes(value: string, message: string): HexString {
  const normalized = value.trim();
  if (!isHexString(normalized)) {
    throw new Error(message);
  }
  return normalized as HexString;
}

function assertBytes32(value: string, message: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error(message);
  }
  return value as HexString;
}

function isBn254FieldElement(value: string): value is HexString {
  return isHexBytes32(value) && BigInt(value) > 0n && BigInt(value) < BigInt(BN254_SCALAR_FIELD);
}

function bytes32ToEvmAddress(value: string): HexString {
  return `0x${value.slice(-40).toLowerCase()}`;
}

function assertAddress(value: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error("Expected a valid EVM destination address.");
  }
  return value as HexString;
}

function normalizeDecimalUint256(value: string, message: string): bigint {
  const normalized = value.trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(message);
  }
  return BigInt(normalized);
}
