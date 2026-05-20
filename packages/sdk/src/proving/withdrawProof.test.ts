import { describe, expect, it } from "vitest";
import {
  assertWithdrawWitnessFee,
  generateWithdrawalGroth16Proof,
  proofObjectToBytes,
  validateWithdrawProofIntent,
  type WithdrawProofIntent
} from "./withdrawProof.js";

const ZERO = `0x${"0".repeat(64)}` as const;
const ROOT = `0x${"1".repeat(64)}` as const;
const NULLIFIER = `0x${"2".repeat(64)}` as const;
const CHANGE = `0x${"3".repeat(64)}` as const;
const DESTINATION = "0x000000000000000000000000000000000000dEaD" as const;
const POOL = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15" as const;
const SPENT = `0x${"4".repeat(64)}` as const;
const CONTEXT = `0x${"5".repeat(64)}` as const;
const ENCRYPTED = `0x${"6".repeat(64)}` as const;

const intent: WithdrawProofIntent = {
  root: ROOT,
  nullifier: NULLIFIER,
  changeCommitment: CHANGE,
  destination: DESTINATION,
  grossAmountWei: "10000",
  feeWei: "33",
  chainId: 4326,
  pool: POOL,
  spentCommitment: SPENT,
  noteAmountWei: "20000",
  proofContextHash: CONTEXT,
  encryptedNoteHash: ENCRYPTED
};

describe("withdraw proof generation", () => {
  it("runs Groth16 through an adapter and validates generated public inputs against the withdrawal intent", async () => {
    const calls: unknown[] = [];
    const result = await generateWithdrawalGroth16Proof({
      witness: { grossAmount: "10000", fee: "33" },
      artifacts: {
        withdrawWasm: "/tmp/withdraw.wasm",
        withdrawFinalZkey: "/tmp/withdraw_final.zkey"
      },
      artifactBinding: { trusted: true },
      intent,
      proverRunner: {
        async fullProve(witness, wasmPath, zkeyPath) {
          calls.push({ witness, wasmPath, zkeyPath });
          return {
            proof: {
              pi_a: ["1", "2", "1"],
              pi_b: [
                ["3", "4"],
                ["5", "6"],
                ["1", "0"]
              ],
              pi_c: ["7", "8", "1"]
            },
            publicSignals: [
              ROOT,
              NULLIFIER,
              CHANGE,
              addressToBytes32(DESTINATION),
              toBytes32("10000"),
              toBytes32("33"),
              toBytes32("4326"),
              addressToBytes32(POOL),
              SPENT,
              toBytes32("20000"),
              CONTEXT,
              ENCRYPTED
            ]
          };
        }
      }
    });

    expect(calls).toEqual([
      {
        witness: { grossAmount: "10000", fee: "33" },
        wasmPath: "/tmp/withdraw.wasm",
        zkeyPath: "/tmp/withdraw_final.zkey"
      }
    ]);
    expect(result.proof).toBe(proofObjectToBytes({ pi_a: ["1", "2", "1"], pi_b: [["3", "4"], ["5", "6"], ["1", "0"]], pi_c: ["7", "8", "1"] }));
    expect(result.publicInputs).toHaveLength(12);
    expect(result.proofGenerationStatus).toBe("groth16-generated");
  });

  it("rejects witness fee drift before proving", () => {
    expect(() => assertWithdrawWitnessFee({ grossAmount: "10000", fee: "34" })).toThrow(
      "Withdrawal witness fee must equal floor(grossAmount * 33 / 10000)."
    );
  });

  it("fails closed when artifact trust has not been established", async () => {
    await expect(
      generateWithdrawalGroth16Proof({
        witness: { grossAmount: "10000", fee: "33" },
        artifacts: {
          withdrawWasm: "/tmp/withdraw.wasm",
          withdrawFinalZkey: "/tmp/withdraw_final.zkey"
        },
        artifactBinding: { trusted: false, reason: "missing-public-trust-metadata" },
        proverRunner: {
          async fullProve() {
            throw new Error("should not prove");
          }
        }
      })
    ).rejects.toThrow("Trusted prover gate blocked withdrawal proof generation: missing-public-trust-metadata.");
  });

  it("uses chain-neutral proof binding errors for mainnet and testnet", () => {
    expect(() =>
      validateWithdrawProofIntent(
        [ROOT, NULLIFIER, CHANGE, addressToBytes32(DESTINATION), toBytes32("10000"), toBytes32("33"), toBytes32("6343"), addressToBytes32(POOL), SPENT, toBytes32("20000"), CONTEXT, ENCRYPTED],
        intent
      )
    ).toThrow("Withdrawal proof is not bound to the active MegaETH chain.");
  });

  it("rejects Groth16 scalars that are negative or do not fit uint256 chunks", () => {
    expect(() =>
      proofObjectToBytes({
        pi_a: [-1, "2", "1"],
        pi_b: [
          ["3", "4"],
          ["5", "6"],
          ["1", "0"]
        ],
        pi_c: ["7", "8", "1"]
      })
    ).toThrow("Malformed Groth16 scalar.");

    expect(() =>
      proofObjectToBytes({
        pi_a: ["1", "2", "1"],
        pi_b: [
          ["3", "4"],
          ["5", `0x1${"0".repeat(64)}`],
          ["1", "0"]
        ],
        pi_c: ["7", "8", "1"]
      })
    ).toThrow("Malformed Groth16 scalar.");
  });
});

function toBytes32(value: string): `0x${string}` {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}
