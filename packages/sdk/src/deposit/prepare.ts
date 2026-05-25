import { encodeAbiParameters, encodeFunctionData, keccak256 } from "viem";
import type { PreparedTransactionRequest } from "../adapters/index.js";
import { deriveNoteCommitment } from "../notes/poseidon.js";
import {
  encryptSpendMaterialEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  makeRecoveryAssociatedData,
  NULLARK_RECOVERY_APP_ID,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import { getNullarkRecoveryEpochId } from "../recovery/recover.js";
import { assertRuntime, type NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";

export const NULLARK_NATIVE_ETH_ASSET_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

export type DepositTransactionRequest = Omit<PreparedTransactionRequest, "value"> & {
  value: bigint;
};

export type DepositProofPacket = {
  proof: HexString;
  publicInputs: readonly HexString[];
};

type DepositProofPublicInputs = readonly [HexString, HexString, HexString, HexString, HexString, HexString];

export type DepositProofBinding = {
  commitment: HexString;
  amountWei: string;
  chainId: number;
  pool: HexString;
  encryptedNote: HexString;
  depositContextHash: HexString;
  encryptedDepositNoteHash: HexString;
  publicInputs: readonly HexString[];
};

export type PreparedDepositNote = {
  commitment: HexString;
  encryptedNote: HexString;
  spendMaterial: SpendMaterialPlaintext;
  transaction: DepositTransactionRequest;
  publicEvidence: {
    kind: "deposit-note-prepared";
    chainId: number;
    pool: HexString;
    commitment: HexString;
    amountWei: string;
    encryptedNotePresent: boolean;
    privateKeysIncluded: false;
    noteSecretsIncluded: false;
  };
};

const DEPOSIT_WITH_PROOF_BOUND_NOTE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "encryptedNote", type: "bytes" }
    ],
    outputs: []
  }
] as const;

const ENCRYPTED_DEPOSIT_NOTE_HASH_PARAMETERS = [
  { name: "domainSeparator", type: "bytes32" },
  { name: "version", type: "uint256" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "commitment", type: "bytes32" },
  { name: "encryptedNote", type: "bytes" }
] as const;
const DEPOSIT_CONTEXT_HASH_PARAMETERS = [
  { name: "domainSeparator", type: "bytes32" },
  { name: "version", type: "uint256" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "commitment", type: "bytes32" },
  { name: "amount", type: "uint256" },
  { name: "encryptedDepositNoteHash", type: "bytes32" }
] as const;

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const DEPOSIT_PROOF_PUBLIC_INPUT_COUNT = 6;
const DEPOSIT_PROOF_CONTEXT_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.v1.2.deposit-context");
const ENCRYPTED_DEPOSIT_NOTE_HASH_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.v1.2.encrypted-deposit-note");
const DEPOSIT_PROOF_CONTEXT_VERSION = 1n;

export async function prepareDepositNote(input: {
  runtime: NullarkCurrentRuntime;
  walletSignature: HexString;
  amountWei: string;
  now?: string;
  randomBytes?: (length: number) => Uint8Array;
  depositProof?:
    | DepositProofPacket
    | ((binding: DepositProofBinding) => DepositProofPacket | Promise<DepositProofPacket>);
}): Promise<PreparedDepositNote> {
  const runtime = assertRuntime(input.runtime);
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.walletSignature)) {
    throw new Error("Expected wallet recovery signature bytes.");
  }
  if (!/^[0-9]+$/.test(input.amountWei) || BigInt(input.amountWei) <= 0n) {
    throw new Error("Expected deposit amount as positive decimal wei.");
  }
  const now = input.now ?? new Date().toISOString();
  if (!now || Number.isNaN(Date.parse(now))) {
    throw new Error("Expected deposit creation time.");
  }
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;
  const ownerCommitment = randomField(randomBytes);
  const noteSecret = randomField(randomBytes);
  const blinding = randomField(randomBytes);
  const commitment = await deriveNoteCommitment({
    assetId: NULLARK_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret
  });
  const spendMaterial: SpendMaterialPlaintext = {
    version: "spend-material-v1",
    chainId: runtime.chainId,
    pool: runtime.pool,
    assetId: NULLARK_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret,
    blinding,
    commitment,
    createdAt: now
  };
  const recoveryKey = await deriveWalletRecoveryKey({
    walletSignature: input.walletSignature,
    chainId: runtime.chainId,
    pool: runtime.pool,
    appId: NULLARK_RECOVERY_APP_ID,
    recoveryVersion: 1
  });
  const noteKey = await deriveNoteKey(recoveryKey, {
    commitment,
    epochId: getNullarkRecoveryEpochId(runtime.chainId)
  });
  const encryptedEnvelope = await encryptSpendMaterialEnvelope({
    noteKey,
    plaintext: spendMaterial,
    aad: makeRecoveryAssociatedData({
      chainId: runtime.chainId,
      pool: runtime.pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    })
  });
  const encryptedNote = serializeEncryptedNoteEnvelopeToHex(encryptedEnvelope);
  const depositProofBinding = createDepositProofBinding({
    runtime,
    commitment,
    amountWei: input.amountWei,
    encryptedNote
  });
  const depositProof = await resolveDepositProof(input.depositProof, depositProofBinding);
  const transaction: DepositTransactionRequest = {
    chainId: runtime.chainId,
    to: runtime.pool,
    value: BigInt(input.amountWei),
    data: encodeFunctionData({
      abi: DEPOSIT_WITH_PROOF_BOUND_NOTE_ABI,
      functionName: "deposit",
      args: [depositProof.proof, depositProof.publicInputs, encryptedNote]
    })
  };

  return {
    commitment,
    encryptedNote,
    spendMaterial,
    transaction,
    publicEvidence: {
      kind: "deposit-note-prepared",
      chainId: runtime.chainId,
      pool: runtime.pool,
      commitment,
      amountWei: input.amountWei,
      encryptedNotePresent: encryptedNote !== "0x",
      privateKeysIncluded: false,
      noteSecretsIncluded: false
    }
  };
}

function createDepositProofBinding(input: {
  runtime: NullarkCurrentRuntime;
  commitment: HexString;
  amountWei: string;
  encryptedNote: HexString;
}): DepositProofBinding {
  const amount = BigInt(input.amountWei);
  const encryptedDepositNoteHash = hashEncryptedDepositNote({
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    commitment: input.commitment,
    encryptedNote: input.encryptedNote
  });
  const depositContextHash = hashDepositContext({
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    commitment: input.commitment,
    amount,
    encryptedDepositNoteHash
  });
  const publicInputs = [
    input.commitment,
    encodeUint256(amount),
    encodeUint256(BigInt(input.runtime.chainId)),
    encodeAddressAsBytes32(input.runtime.pool),
    depositContextHash,
    encryptedDepositNoteHash
  ] as const satisfies readonly HexString[];

  return {
    commitment: input.commitment,
    amountWei: input.amountWei,
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    encryptedNote: input.encryptedNote,
    depositContextHash,
    encryptedDepositNoteHash,
    publicInputs
  };
}

async function resolveDepositProof(
  depositProof: DepositProofPacket | ((binding: DepositProofBinding) => DepositProofPacket | Promise<DepositProofPacket>) | undefined,
  binding: DepositProofBinding
): Promise<DepositProofPacket> {
  const packet =
    typeof depositProof === "function" ? await depositProof(binding) : depositProof ?? { proof: "0x", publicInputs: binding.publicInputs };

  const proof = normalizeHexBytes(packet.proof, "Expected deposit proof bytes as even-length hex.");
  const publicInputs = assertDepositProofPublicInputs(packet.publicInputs);
  assertDepositProofBinding(publicInputs, binding);
  return { proof, publicInputs };
}

function assertDepositProofPublicInputs(publicInputs: readonly string[]): DepositProofPublicInputs {
  if (publicInputs.length !== DEPOSIT_PROOF_PUBLIC_INPUT_COUNT) {
    throw new Error("Expected deposit proof publicInputs to contain exactly 6 bytes32 values.");
  }
  return publicInputs.map((publicInput) =>
    assertBytes32(publicInput, "Expected every deposit proof public input to be bytes32.")
  ) as unknown as DepositProofPublicInputs;
}

function assertDepositProofBinding(publicInputs: DepositProofPublicInputs, binding: DepositProofBinding): void {
  const [commitment, amount, chainId, pool, depositContextHash, encryptedDepositNoteHash] = publicInputs;

  if (commitment.toLowerCase() !== binding.commitment.toLowerCase()) {
    throw new Error("Deposit proof commitment does not match the prepared note.");
  }
  if (BigInt(amount) !== BigInt(binding.amountWei)) {
    throw new Error("Deposit proof amount does not match the prepared note.");
  }
  if (BigInt(chainId) !== BigInt(binding.chainId)) {
    throw new Error("Deposit proof is not bound to the active MegaETH chain.");
  }
  if (bytes32ToEvmAddress(pool).toLowerCase() !== binding.pool.toLowerCase()) {
    throw new Error("Deposit proof is not bound to this shielded pool.");
  }
  if (depositContextHash.toLowerCase() !== binding.depositContextHash.toLowerCase()) {
    throw new Error("Deposit proof context hash does not match the prepared note.");
  }
  if (encryptedDepositNoteHash.toLowerCase() !== binding.encryptedDepositNoteHash.toLowerCase()) {
    throw new Error("Deposit proof encrypted note hash does not match the prepared note.");
  }
}

function hashEncryptedDepositNote(input: {
  chainId: number;
  pool: HexString;
  commitment: HexString;
  encryptedNote: HexString;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(ENCRYPTED_DEPOSIT_NOTE_HASH_PARAMETERS, [
      ENCRYPTED_DEPOSIT_NOTE_HASH_DOMAIN_SEPARATOR,
      DEPOSIT_PROOF_CONTEXT_VERSION,
      BigInt(input.chainId),
      input.pool,
      input.commitment,
      input.encryptedNote
    ]) as HexString
  );
}

function hashDepositContext(input: {
  chainId: number;
  pool: HexString;
  commitment: HexString;
  amount: bigint;
  encryptedDepositNoteHash: HexString;
}): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(DEPOSIT_CONTEXT_HASH_PARAMETERS, [
      DEPOSIT_PROOF_CONTEXT_DOMAIN_SEPARATOR,
      DEPOSIT_PROOF_CONTEXT_VERSION,
      BigInt(input.chainId),
      input.pool,
      input.commitment,
      input.amount,
      input.encryptedDepositNoteHash
    ]) as HexString
  );
}

function hashAbiEncodedToField(encoded: HexString): HexString {
  return encodeUint256(BigInt(keccak256(encoded)) % BN254_SCALAR_FIELD);
}

function hashDomainSeparator(value: string): HexString {
  return keccak256(new TextEncoder().encode(value));
}

function normalizeHexBytes(value: string, message: string): HexString {
  if (!isHexString(value)) {
    throw new Error(message);
  }
  return value as HexString;
}

function assertBytes32(value: string, message: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error(message);
  }
  return value as HexString;
}

function encodeUint256(value: bigint): HexString {
  if (value < 0n || value >= 2n ** 256n) {
    throw new Error("Expected uint256 value.");
  }
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function encodeAddressAsBytes32(value: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error("Expected deposit proof verifying contract address.");
  }
  return `0x${value.slice(2).toLowerCase().padStart(64, "0")}`;
}

function bytes32ToEvmAddress(value: string): HexString {
  return `0x${value.slice(-40).toLowerCase()}`;
}

function randomField(randomBytes: (length: number) => Uint8Array): HexString {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const bytes = randomBytes(32);
    if (bytes.length !== 32) {
      throw new Error("Expected randomBytes(32) to return 32 bytes.");
    }
    const hex = bytesToHex(bytes);
    const value = BigInt(hex);
    if (value > 0n && value < BN254_SCALAR_FIELD) {
      return hex;
    }
  }
  throw new Error("Unable to sample a BN254 field element.");
}

function cryptoRandomBytes(length: number): Uint8Array {
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error("Crypto randomness is unavailable.");
  }
  return cryptoProvider.getRandomValues(new Uint8Array(length));
}

function bytesToHex(bytes: Uint8Array): HexString {
  const value = `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  if (!isHexString(value)) {
    throw new Error("Expected generated bytes to be hex.");
  }
  return value;
}
