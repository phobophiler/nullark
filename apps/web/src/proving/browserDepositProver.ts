import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { proofObjectToCandidateBytes } from "./browserWithdrawProver.js";
import type { HexString } from "../product/shieldedTransfersHelpers.js";

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ENCRYPTED_NOTE_HASH_DOMAIN = keccak256(toBytes("nullark.encrypted-note.v1"));
const DEPOSIT_CONTEXT_DOMAIN = keccak256(toBytes("nullark.deposit-context.v1"));
const DEPOSIT_CONTEXT_SHAPE = keccak256(toBytes("deposit_context_v1_2"));
const DEPOSIT_SELECTOR = keccak256(toBytes("deposit(bytes,bytes32[],bytes)")).slice(0, 10) as HexString;

export type BrowserDepositProofInput = {
  commitment: HexString;
  amountWei: string;
  chainId: 6343 | 4326;
  pool: HexString;
  assetId: HexString;
  ownerCommitment: HexString;
  noteSecret: HexString;
  encryptedNote: HexString;
  wasmUrl?: string;
  zkeyUrl?: string;
};

export type BrowserDepositProofResult = {
  proof: HexString;
  proofCandidates: HexString[];
  publicInputs: HexString[];
  depositContextHash: HexString;
  encryptedDepositNoteHash: HexString;
};

export async function generateBrowserDepositProof(input: BrowserDepositProofInput): Promise<BrowserDepositProofResult> {
  const encryptedDepositNoteHash = hashEncryptedDepositNote(input);
  const depositContextHash = hashDepositContext({ ...input, encryptedDepositNoteHash });
  const witness = {
    commitment: toCircuitScalar(input.commitment),
    amount: input.amountWei,
    chainId: input.chainId.toString(),
    verifyingContract: BigInt(input.pool).toString(),
    depositContextHash: toCircuitScalar(depositContextHash),
    encryptedDepositNoteHash: toCircuitScalar(encryptedDepositNoteHash),
    assetId: toCircuitScalar(input.assetId),
    ownerCommitment: toCircuitScalar(input.ownerCommitment),
    noteSecret: toCircuitScalar(input.noteSecret),
    expectedChainId: input.chainId.toString(),
    expectedVerifyingContract: BigInt(input.pool).toString(),
    expectedDepositContextHash: toCircuitScalar(depositContextHash),
    expectedEncryptedDepositNoteHash: toCircuitScalar(encryptedDepositNoteHash)
  };
  const { groth16 } = await import("snarkjs");
  const generated = await groth16.fullProve(
    witness,
    input.wasmUrl ?? "/proving/deposit.wasm",
    input.zkeyUrl ?? "/proving/deposit_final.zkey"
  );
  const proofCandidates = proofObjectToCandidateBytes(generated.proof);
  const publicInputs = generated.publicSignals.map(toBytes32);
  assertDepositPublicInputs(publicInputs, {
    commitment: input.commitment,
    amountWei: input.amountWei,
    chainId: input.chainId,
    pool: input.pool,
    depositContextHash,
    encryptedDepositNoteHash
  });
  return {
    proof: proofCandidates[0] ?? "0x",
    proofCandidates,
    publicInputs,
    depositContextHash,
    encryptedDepositNoteHash
  };
}

function hashEncryptedDepositNote(input: Pick<BrowserDepositProofInput, "chainId" | "pool" | "commitment" | "encryptedNote">): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(
      [
        { type: "bytes32", name: "domain" },
        { type: "uint256", name: "version" },
        { type: "uint256", name: "chainId" },
        { type: "address", name: "pool" },
        { type: "bytes32", name: "shape" },
        { type: "bytes4", name: "selector" },
        { type: "bytes32", name: "nullifier" },
        { type: "bytes32", name: "commitment" },
        { type: "bytes", name: "encryptedNote" }
      ],
      [
        ENCRYPTED_NOTE_HASH_DOMAIN,
        1n,
        BigInt(input.chainId),
        input.pool,
        DEPOSIT_CONTEXT_SHAPE,
        DEPOSIT_SELECTOR,
        `0x${"0".repeat(64)}`,
        input.commitment,
        input.encryptedNote
      ]
    ) as HexString
  );
}

function hashDepositContext(
  input: Pick<BrowserDepositProofInput, "chainId" | "pool" | "commitment" | "amountWei"> & {
    encryptedDepositNoteHash: HexString;
  }
): HexString {
  return hashAbiEncodedToField(
    encodeAbiParameters(
      [
        { type: "bytes32", name: "domain" },
        { type: "uint256", name: "version" },
        { type: "uint256", name: "chainId" },
        { type: "address", name: "pool" },
        { type: "bytes32", name: "shape" },
        { type: "bytes4", name: "selector" },
        { type: "bytes32", name: "commitment" },
        { type: "uint256", name: "amount" },
        { type: "bytes32", name: "encryptedNoteHash" }
      ],
      [
        DEPOSIT_CONTEXT_DOMAIN,
        1n,
        BigInt(input.chainId),
        input.pool,
        DEPOSIT_CONTEXT_SHAPE,
        DEPOSIT_SELECTOR,
        input.commitment,
        BigInt(input.amountWei),
        input.encryptedDepositNoteHash
      ]
    ) as HexString
  );
}

function hashAbiEncodedToField(encoded: HexString): HexString {
  return toBytes32(BigInt(keccak256(encoded)) % BN254_SCALAR_FIELD);
}

function toCircuitScalar(value: HexString): string {
  return BigInt(value).toString();
}

function toBytes32(value: unknown): HexString {
  const normalized = typeof value === "bigint" ? value : BigInt(String(value));
  return `0x${normalized.toString(16).padStart(64, "0")}`;
}

function assertDepositPublicInputs(
  publicInputs: HexString[],
  expected: {
    commitment: HexString;
    amountWei: string;
    chainId: 6343 | 4326;
    pool: HexString;
    depositContextHash: HexString;
    encryptedDepositNoteHash: HexString;
  }
): void {
  const expectedPublicInputs = [
    expected.commitment,
    toBytes32(BigInt(expected.amountWei)),
    toBytes32(BigInt(expected.chainId)),
    `0x${expected.pool.slice(2).toLowerCase().padStart(64, "0")}`,
    expected.depositContextHash,
    expected.encryptedDepositNoteHash
  ].map((value) => value.toLowerCase());
  if (publicInputs.length !== expectedPublicInputs.length) {
    throw new Error("v1.2 deposit proof must contain exactly 6 public inputs.");
  }
  publicInputs.forEach((value, index) => {
    if (value.toLowerCase() !== expectedPublicInputs[index]) {
      throw new Error("v1.2 deposit proof public inputs do not match the prepared deposit.");
    }
  });
}
