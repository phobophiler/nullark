import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import { encodeWithdrawBoundedCalldata } from "../withdraw/calldata.js";
import { buildDirectWalletWithdrawalTransaction, buildWithdrawalRelayerRequest } from "./request.js";

const bytes32 = (byte: string) => `0x${byte.repeat(32)}`;
const publicInputs = Array.from({ length: 12 }, (_, index) => bytes32((index + 1).toString(16).padStart(2, "0")));
const TEST_DESTINATION_ADDRESS = "0x000000000000000000000000000000000000dEaD";

function calldata(): string {
  return encodeWithdrawBoundedCalldata({
    proof: "0x1234",
    publicInputs,
    nullifier: bytes32("aa"),
    destination: TEST_DESTINATION_ADDRESS,
    grossAmountWei: "10001",
    minNetAmountWei: "9900",
    maxFeeWei: "101"
  });
}

describe("relayer requests", () => {
  it("builds the deployed relayer request shape used by the app and worker", () => {
    expect(
      buildWithdrawalRelayerRequest({
        runtime: getCurrentRuntime(),
        calldata: calldata(),
        nowEpochSeconds: 1_780_000_000
      })
    ).toEqual({
      chainId: 4326,
      to: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      value: "0x0",
      data: expect.stringMatching(/^0x678d8506/),
      deadlineEpochSeconds: 1_780_000_120
    });
  });

  it("builds a direct wallet transaction request without submitting it", () => {
    expect(buildDirectWalletWithdrawalTransaction({ runtime: getCurrentRuntime(), calldata: calldata() })).toEqual({
      chainId: 4326,
      to: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      value: 0n,
      data: expect.stringMatching(/^0x678d8506/)
    });
  });

  it("keeps relayer deadlines inside the worker policy window", () => {
    expect(() =>
      buildWithdrawalRelayerRequest({
        runtime: getCurrentRuntime(),
        calldata: calldata(),
        deadlineSeconds: 121
      })
    ).toThrow("between 1 and 120 seconds");
  });
});
