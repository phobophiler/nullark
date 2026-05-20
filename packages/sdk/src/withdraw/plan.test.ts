import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import { ZERO_BYTES32 } from "./calldata.js";
import { createWithdrawalPlan } from "./plan.js";

const bytes32 = (byte: string) => `0x${byte.repeat(32)}` as const;
const uint256 = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}` as const;
const addressToBytes32 = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as const;
const TEST_DESTINATION_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

function publicInputs(runtime = getCurrentRuntime()) {
  return [
    bytes32("01"),
    bytes32("aa"),
    ZERO_BYTES32,
    addressToBytes32(TEST_DESTINATION_ADDRESS),
    uint256(10001n),
    uint256(101n),
    uint256(BigInt(runtime.chainId)),
    addressToBytes32(runtime.pool),
    bytes32("02"),
    uint256(10001n),
    bytes32("03"),
    bytes32("04")
  ] as const;
}

describe("withdrawal plan", () => {
  it("verifies proof binding, encodes calldata, and prepares both submission requests", () => {
    const runtime = getCurrentRuntime();
    const plan = createWithdrawalPlan({
      runtime,
      proof: "0x1234",
      publicInputs: publicInputs(runtime),
      nullifier: bytes32("aa"),
      currentRoot: bytes32("01"),
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "10001",
      minNetAmountWei: "9900",
      maxFeeWei: "101",
      nowEpochSeconds: 1_780_000_000
    });

    expect(plan.calldata.startsWith("0x678d8506")).toBe(true);
    expect(plan.relayerRequest).toMatchObject({
      chainId: 4326,
      to: runtime.pool,
      value: "0x0",
      deadlineEpochSeconds: 1_780_000_120
    });
    expect(plan.directWalletTransaction).toMatchObject({
      chainId: 4326,
      to: runtime.pool,
      value: 0n
    });
  });

  it("fails closed when a proof bundle is bound to the wrong destination", () => {
    expect(() =>
      createWithdrawalPlan({
        runtime: getCurrentRuntime(),
        proof: "0x1234",
        publicInputs: publicInputs(),
        nullifier: bytes32("aa"),
        currentRoot: bytes32("01"),
        destination: "0x000000000000000000000000000000000000bEEF",
        grossAmountWei: "10001",
        minNetAmountWei: "9900",
        maxFeeWei: "101"
      })
    ).toThrow("destination does not match");
  });
});
