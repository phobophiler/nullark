import { describe, expect, it } from "vitest";
import {
  V12_SPEND_PUBLIC_INPUT_COUNT,
  V12_SPEND_PUBLIC_INPUT_ORDER,
  assertV12SpendPublicInputOrder
} from "@nullark/core";
import {
  V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
  assertV12UnlinkableWithdrawPublicInputs,
  generateWithdrawalGroth16Proof
} from "./withdrawProof.js";

const LEGACY_LINKABLE_WITHDRAW_ORDER = [
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
] as const;

const LEGACY_LINKABLE_PUBLIC_SIGNALS = Array.from(
  { length: LEGACY_LINKABLE_WITHDRAW_ORDER.length },
  (_item, index) => `0x${BigInt(index + 1).toString(16).padStart(64, "0")}`
);

const V12_UNLINKABLE_PUBLIC_SIGNALS = Array.from(
  { length: V12_SPEND_PUBLIC_INPUT_COUNT },
  (_item, index) => `0x${BigInt(index + 1).toString(16).padStart(64, "0")}` as `0x${string}`
);

describe("Nullark v1.2 unlinkable withdrawal public inputs", () => {
  it("rejects the old 12-input order with spentCommitment and noteAmount at the core schema boundary", () => {
    expect(() => assertV12SpendPublicInputOrder(LEGACY_LINKABLE_WITHDRAW_ORDER)).toThrow(
      "v1.2 spend public inputs include forbidden public fields"
    );
  });

  it("freezes the v1.2 target order at 10 inputs with encryptedOutputNoteHash", () => {
    expect(V12_SPEND_PUBLIC_INPUT_COUNT).toBe(10);
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).toHaveLength(10);
    expect([...V12_SPEND_PUBLIC_INPUT_ORDER]).toEqual([
      "root",
      "nullifier",
      "outputCommitment",
      "destination",
      "grossAmount",
      "fee",
      "chainId",
      "verifyingContract",
      "proofContextHash",
      "encryptedOutputNoteHash"
    ]);
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).toContain("encryptedOutputNoteHash");
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).not.toContain("encryptedNoteHash");
    expect([...V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER]).toEqual([...V12_SPEND_PUBLIC_INPUT_ORDER]);
  });

  it("keeps legacy 12-input prover output accepted by default for v1.1 compatibility", async () => {
    const result = await generateWithdrawalGroth16Proof({
      witness: {},
      artifacts: {
        withdrawWasm: "/tmp/withdraw.wasm",
        withdrawFinalZkey: "/tmp/withdraw_final.zkey"
      },
      artifactBinding: { trusted: true },
      proverRunner: {
        async fullProve() {
          return {
            proof: proofFixture(),
            publicSignals: LEGACY_LINKABLE_PUBLIC_SIGNALS
          };
        }
      }
    });

    expect(result.publicInputs).toHaveLength(12);
  });

  it("rejects legacy 12-input prover output in explicit v1.2 unlinkable mode", async () => {
    await expect(
      generateWithdrawalGroth16Proof({
        witness: {},
        artifacts: {
          withdrawWasm: "/tmp/withdraw.wasm",
          withdrawFinalZkey: "/tmp/withdraw_final.zkey"
        },
        artifactBinding: { trusted: true },
        proverRunner: {
          async fullProve() {
            return {
              proof: proofFixture(),
              publicSignals: LEGACY_LINKABLE_PUBLIC_SIGNALS
            };
          }
        },
        publicInputSchema: "v1.2-unlinkable"
      })
    ).rejects.toThrow(/v1\.2|10|forbidden|spentCommitment|noteAmount|encryptedOutputNoteHash/);
  });

  it("accepts exactly 10 bytes32 public signals in explicit v1.2 unlinkable mode", async () => {
    expect(assertV12UnlinkableWithdrawPublicInputs(V12_UNLINKABLE_PUBLIC_SIGNALS)).toEqual(
      V12_UNLINKABLE_PUBLIC_SIGNALS
    );

    const result = await generateWithdrawalGroth16Proof({
      witness: {},
      artifacts: {
        withdrawWasm: "/tmp/withdraw.wasm",
        withdrawFinalZkey: "/tmp/withdraw_final.zkey"
      },
      artifactBinding: { trusted: true },
      proverRunner: {
        async fullProve() {
          return {
            proof: proofFixture(),
            publicSignals: V12_UNLINKABLE_PUBLIC_SIGNALS
          };
        }
      },
      publicInputSchema: "v1.2-unlinkable"
    });

    expect(result.publicInputs).toEqual(V12_UNLINKABLE_PUBLIC_SIGNALS);
  });
});

function proofFixture() {
  return {
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["3", "4"],
      ["5", "6"],
      ["1", "0"]
    ],
    pi_c: ["7", "8", "1"]
  };
}
