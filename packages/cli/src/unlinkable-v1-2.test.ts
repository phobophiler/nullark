import { describe, expect, it, vi } from "vitest";
import {
  V12_SPEND_PUBLIC_INPUT_COUNT,
  V12_SPEND_PUBLIC_INPUT_ORDER,
  assertV12SpendPublicInputOrder
} from "@nullark/core";
import {
  encodeV12UnlinkableWithdrawOutputNoteCalldata,
  encodeStageCWithdrawChangeNoteCalldata,
  getRuntimeForNetwork,
  V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
  assertV12UnlinkableWithdrawPublicInputs,
  type HexString,
  type RecoveredWalletNote
} from "@nullark/sdk";
import {
  createNullarkCliSession,
  parseV12UnlinkableWithdrawJson,
  runNullarkCli,
  type CliIo,
  type CliProofBundlePrivate,
  type CliWithdrawalPlan
} from "./index.js";

const bytes32 = (byte: string): HexString => `0x${byte.repeat(32)}`;
const uint256Bytes32 = (value: string | number | bigint): HexString => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressBytes32 = (address: string): HexString => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
const TEST_DESTINATION_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TEST_RUNTIME = getRuntimeForNetwork("megaeth-testnet");

const LEGACY_V12_WITHDRAW_FIXTURE = {
  schema: "nullark-v1.2-withdraw-proof-json",
  publicInputOrder: [
    "root",
    "nullifier",
    "newCommitment",
    "destination",
    "grossAmount",
    "fee",
    "chainId",
    "verifyingContract",
    "spentCommitment",
    "noteAmount",
    "proofContextHash",
    "encryptedNoteHash"
  ],
  publicInputs: Array.from(
    { length: 12 },
    (_item, index) => `0x${BigInt(index + 1).toString(16).padStart(64, "0")}` as `0x${string}`
  )
} as const;

const V12_UNLINKABLE_WITHDRAW_FIXTURE = {
  schema: "nullark-v1.2-withdraw-proof-json",
  publicInputOrder: V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
  publicInputs: Array.from(
    { length: V12_SPEND_PUBLIC_INPUT_COUNT },
    (_item, index) => `0x${BigInt(index + 1).toString(16).padStart(64, "0")}` as `0x${string}`
  )
} as const;

describe("Nullark CLI v1.2 unlinkable withdraw JSON guard", () => {
  it("documents parseV12UnlinkableWithdrawJson rejecting legacy 12-input fixtures before SDK/prover use", () => {
    const sdkOrProverUse = vi.fn();

    expect(() => {
      assertFutureCliV12UnlinkableWithdrawJsonBeforeSdkUse(LEGACY_V12_WITHDRAW_FIXTURE);
      sdkOrProverUse();
    }).toThrow("v1.2 spend public inputs include forbidden public fields");
    expect(sdkOrProverUse).not.toHaveBeenCalled();
  });

  it("documents that the v1.2 CLI target order is 10 inputs and uses encryptedOutputNoteHash", () => {
    expect(V12_SPEND_PUBLIC_INPUT_COUNT).toBe(10);
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).toContain("encryptedOutputNoteHash");
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).not.toContain("encryptedNoteHash");
    expect([...V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER]).toEqual([...V12_SPEND_PUBLIC_INPUT_ORDER]);
  });

  it("uses the CLI v1.2 unlinkable JSON guard before SDK/prover use", () => {
    const sdkOrProverUse = vi.fn();

    expect(() => {
      parseV12UnlinkableWithdrawJson(V12_UNLINKABLE_WITHDRAW_FIXTURE);
      sdkOrProverUse();
    }).not.toThrow();
    expect(sdkOrProverUse).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy v1.2 12-input withdraw proof JSON before SDK/prover use", () => {
    const sdkOrProverUse = vi.fn();

    expect(() => {
      parseV12UnlinkableWithdrawJson(LEGACY_V12_WITHDRAW_FIXTURE);
      sdkOrProverUse();
    }).toThrow("v1.2 spend public inputs include forbidden public fields");
    expect(sdkOrProverUse).not.toHaveBeenCalled();
  });

  it("rejects 10-input v1.2 withdraw proof JSON unless the order is explicit unlinkable v1.2", () => {
    const swappedOrder = [...V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER];
    [swappedOrder[2], swappedOrder[3]] = [swappedOrder[3]!, swappedOrder[2]!];

    expect(() => {
      parseV12UnlinkableWithdrawJson({
        ...V12_UNLINKABLE_WITHDRAW_FIXTURE,
        publicInputOrder: swappedOrder
      });
    }).toThrow("v1.2 unlinkable withdraw public input at index 2 must be outputCommitment");
  });

  it("blocks staged v1.2 proof plans before a prover adapter can use them", async () => {
    const { result, stderr } = await runV12ProofBundle({
      publicInputs: v12PublicInputs({ outputCommitment: bytes32("00") }),
      encryptedOutputNote: "0xabcd"
    });

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("v1.2 unlinkable withdrawal output commitment must be nonzero");
  });

  it("blocks staged v1.2 calldata paths before v1.2 encrypted output material is accepted", async () => {
    const { result, stderr } = await runV12ProofBundle({
      publicInputs: v12PublicInputs(),
      encryptedOutputNote: "0x00"
    });

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("v1.2 unlinkable withdrawal calldata must include a real encrypted output note");
  });

  it("blocks staged v1.2 plans before trusted prover bundle schema selection", async () => {
    const { result, stderr } = await runV12ProofBundle({
      publicInputs: legacyPublicInputs(),
      encryptedOutputNote: "0xabcd",
      publicInputSchema: "v1.1"
    });

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("Trusted prover adapter returned a proof with the wrong public input schema");
  });
});

function assertFutureCliV12UnlinkableWithdrawJsonBeforeSdkUse(fixture: {
  readonly publicInputOrder: readonly string[];
  readonly publicInputs: readonly `0x${string}`[];
}): void {
  assertV12SpendPublicInputOrder(fixture.publicInputOrder);
  assertV12UnlinkableWithdrawPublicInputs(fixture.publicInputs);
}

function v12PublicInputs(overrides: { outputCommitment?: HexString } = {}): HexString[] {
  return [
    bytes32("01"),
    bytes32("aa"),
    overrides.outputCommitment ?? bytes32("02"),
    addressBytes32(TEST_DESTINATION_ADDRESS),
    uint256Bytes32("1000"),
    uint256Bytes32("5"),
    uint256Bytes32(TEST_RUNTIME.chainId),
    addressBytes32(TEST_RUNTIME.pool),
    bytes32("08"),
    bytes32("09")
  ];
}

function legacyPublicInputs(): HexString[] {
  return [
    bytes32("01"),
    bytes32("aa"),
    bytes32("00"),
    addressBytes32(TEST_DESTINATION_ADDRESS),
    uint256Bytes32("1000"),
    uint256Bytes32("5"),
    uint256Bytes32(TEST_RUNTIME.chainId),
    addressBytes32(TEST_RUNTIME.pool),
    bytes32("cc"),
    uint256Bytes32("1000"),
    bytes32("08"),
    bytes32("09")
  ];
}

async function runV12ProofBundle(input: {
  publicInputs: HexString[];
  encryptedOutputNote: HexString;
  publicInputSchema?: CliProofBundlePrivate["publicInputSchema"];
}): Promise<{ result: { exitCode: number }; stderr: string[] }> {
  const session = createNullarkCliSession();
  const note = recoveredNote();
  const plan = withdrawalPlan(note);
  session.recoveredNotes.push(note);
  session.withdrawalPlans.push(plan);
  const proofBundle: CliProofBundlePrivate = {
    id: "proof_1",
    planId: plan.id,
    proof: "0x1234",
    publicInputs: input.publicInputs,
    nullifier: bytes32("aa"),
    calldata:
      input.publicInputSchema === "v1.1"
        ? encodeStageCWithdrawChangeNoteCalldata({
            proof: "0x1234",
            publicInputs: input.publicInputs,
            nullifier: bytes32("aa"),
            destination: TEST_DESTINATION_ADDRESS,
            grossAmountWei: plan.grossAmountWei,
            encryptedChangeNote: input.encryptedOutputNote,
            minNetAmountWei: plan.netAmountWei,
            maxFeeWei: plan.feeWei
          })
        : encodeV12UnlinkableWithdrawOutputNoteCalldata({
            proof: "0x1234",
            publicInputs: input.publicInputs,
            nullifier: bytes32("aa"),
            destination: TEST_DESTINATION_ADDRESS,
            grossAmountWei: plan.grossAmountWei,
            encryptedOutputNote: input.encryptedOutputNote,
            minNetAmountWei: plan.netAmountWei,
            maxFeeWei: plan.feeWei
          }),
    currentRoot: bytes32("01"),
    publicInputSchema: input.publicInputSchema ?? "v1.2-unlinkable",
    submitVia: "relayer"
  };
  const { io, stderr } = captureIo();
  const result = await runNullarkCli(["withdraw", "prove", "--network", "megaeth-testnet", "--plan", plan.id], io, {
    session,
    proveWithdrawalPlan: async () => proofBundle
  });

  return { result, stderr };
}

function withdrawalPlan(note: RecoveredWalletNote): CliWithdrawalPlan {
  return {
    id: "plan_1",
    noteId: note.summary.id,
    destination: TEST_DESTINATION_ADDRESS,
    grossAmountWei: "1000",
    feeWei: "5",
    netAmountWei: "995",
    chainId: TEST_RUNTIME.chainId,
    pool: TEST_RUNTIME.pool,
    publicInputSchema: "v1.2-unlinkable",
    submitVia: "relayer",
    directSenderImplication: "No direct wallet sender is selected for this plan.",
    relayerTrustBoundary:
      "The relayer submits prepared calldata only; it does not recover notes, generate witnesses, choose destinations, or custody funds."
  };
}

function recoveredNote(): RecoveredWalletNote {
  return {
    summary: {
      id: "note_v12_binding_guard_0",
      commitment: bytes32("cc"),
      amountWei: "1000",
      spent: false,
      leafIndex: 0,
      transactionHash: bytes32("dd")
    },
    spendMaterial: {
      version: "spend-material-v1",
      chainId: TEST_RUNTIME.chainId,
      pool: TEST_RUNTIME.pool,
      assetId: uint256Bytes32(1),
      noteAmountWei: "1000",
      ownerCommitment: bytes32("11"),
      noteSecret: bytes32("12"),
      blinding: bytes32("13"),
      commitment: bytes32("cc"),
      createdAt: "2026-05-24T00:00:00.000Z"
    },
    nullifier: bytes32("aa")
  };
}

function captureIo(): { io: CliIo; stderr: string[] } {
  const stderr: string[] = [];
  return {
    stderr,
    io: {
      stdout: () => undefined,
      stderr: (line) => stderr.push(line)
    }
  };
}
