import { describe, expect, it } from "vitest";
import {
  getCurrentRuntime,
  NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1,
  NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2,
  type NullarkCurrentRuntime
} from "../runtime/current.js";
import { encodeV12UnlinkableWithdrawOutputNoteCalldata, encodeWithdrawBoundedCalldata } from "../withdraw/calldata.js";
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

function v12Runtime(): NullarkCurrentRuntime {
  return {
    ...getCurrentRuntime(),
    schema: "nullark-sdk-runtime-v1-2-candidate-v1",
    productVersion: "nullark-v1.2-fee-governance",
    pool: "0x1234567890abcdef1234567890abcdef12345678",
    groth16PublicInputOrder: NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2
  };
}

function legacyRuntime(): NullarkCurrentRuntime {
  return {
    ...getCurrentRuntime(),
    schema: "nullark-sdk-runtime-current-v1",
    productVersion: "nullark-v1.1-mainnet",
    groth16PublicInputOrder: NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1
  };
}

function v12Calldata(): string {
  return encodeV12UnlinkableWithdrawOutputNoteCalldata({
    proof: "0x1234",
    publicInputs: Array.from({ length: 10 }, (_, index) => bytes32((index + 1).toString(16).padStart(2, "0"))),
    nullifier: bytes32("aa"),
    destination: TEST_DESTINATION_ADDRESS,
    grossAmountWei: "10001",
    encryptedOutputNote: "0xabcd",
    minNetAmountWei: "9900",
    maxFeeWei: "101"
  });
}

describe("relayer requests", () => {
  it("builds the deployed relayer request shape used by the app and worker", () => {
    const runtime = getCurrentRuntime();

    expect(
      buildWithdrawalRelayerRequest({
        runtime,
        calldata: v12Calldata(),
        nowEpochSeconds: 1_780_000_000
      })
    ).toEqual({
      chainId: 4326,
      to: runtime.pool,
      value: "0x0",
      data: expect.stringMatching(/^0x678d8506/),
      deadlineEpochSeconds: 1_780_000_120
    });
  });

  it("builds a direct wallet transaction request without submitting it", () => {
    const runtime = getCurrentRuntime();

    expect(buildDirectWalletWithdrawalTransaction({ runtime, calldata: v12Calldata() })).toEqual({
      chainId: 4326,
      to: runtime.pool,
      value: 0n,
      data: expect.stringMatching(/^0x678d8506/)
    });
  });

  it("keeps relayer deadlines inside the worker policy window", () => {
    expect(() =>
      buildWithdrawalRelayerRequest({
        runtime: legacyRuntime(),
        calldata: calldata(),
        deadlineSeconds: 121
      })
    ).toThrow("between 1 and 120 seconds");
  });

  it("rejects legacy 12-input withdrawal calldata when building v1.2 relayer requests", () => {
    expect(() =>
      buildWithdrawalRelayerRequest({
        runtime: v12Runtime(),
        calldata: calldata(),
        nowEpochSeconds: 1_780_000_000
      })
    ).toThrow("v1.2 unlinkable withdrawal calldata");
  });

  it("rejects legacy 12-input withdrawal calldata when building v1.2 direct wallet transactions", () => {
    expect(() =>
      buildDirectWalletWithdrawalTransaction({
        runtime: v12Runtime(),
        calldata: calldata()
      })
    ).toThrow("v1.2 unlinkable withdrawal calldata");
  });

  it("accepts 10-input encrypted-output withdrawal calldata for v1.2 relayer requests", () => {
    expect(
      buildWithdrawalRelayerRequest({
        runtime: v12Runtime(),
        calldata: v12Calldata(),
        nowEpochSeconds: 1_780_000_000
      })
    ).toMatchObject({
      chainId: 4326,
      to: "0x1234567890abcdef1234567890abcdef12345678",
      value: "0x0",
      data: expect.stringMatching(/^0x678d8506/)
    });
  });
});
