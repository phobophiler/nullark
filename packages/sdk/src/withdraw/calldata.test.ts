import { describe, expect, it } from "vitest";
import {
  NULLARK_V1_1_PUBLIC_INPUTS_LENGTH,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  ZERO_BYTES32,
  assertStageCWithdrawCalldataBinding,
  assertStageCWithdrawBoundedCalldata,
  assertWithdrawPublicInputBinding,
  encodeStageCWithdrawChangeNoteCalldata,
  encodeVerifiedWithdrawBoundedCalldata,
  encodeWithdrawBoundedCalldata
} from "./calldata.js";

const bytes32 = (byte: string) => `0x${byte.repeat(32)}`;
const uint256 = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;
const addressToBytes32 = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
const publicInputs = Array.from({ length: NULLARK_V1_1_PUBLIC_INPUTS_LENGTH }, (_, index) =>
  bytes32((index + 1).toString(16).padStart(2, "0"))
);
const TEST_DESTINATION_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TEST_POOL_ADDRESS = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";

function boundPublicInputs(overrides: Partial<Record<"destination" | "grossAmount" | "chainId" | "pool", string>> = {}) {
  return [
    bytes32("01"),
    bytes32("aa"),
    ZERO_BYTES32,
    overrides.destination ?? addressToBytes32(TEST_DESTINATION_ADDRESS),
    overrides.grossAmount ?? uint256(10001n),
    uint256(101n),
    overrides.chainId ?? uint256(4326n),
    overrides.pool ?? addressToBytes32(TEST_POOL_ADDRESS),
    bytes32("02"),
    uint256(10001n),
    bytes32("03"),
    bytes32("04")
  ];
}

describe("withdraw calldata", () => {
  it("encodes full-note public exit through the stage-C bounded selector", () => {
    const calldata = encodeWithdrawBoundedCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: bytes32("aa"),
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "10001",
      minNetAmountWei: "9900",
      maxFeeWei: "101"
    });

    expect(calldata.startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)).toBe(true);
    expect(assertStageCWithdrawBoundedCalldata(calldata)).toBe(calldata);
  });

  it("encodes split withdrawal with encrypted change note through the same stage-C selector", () => {
    const calldata = encodeStageCWithdrawChangeNoteCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: bytes32("aa"),
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "10001",
      encryptedChangeNote: "0xabcd",
      minNetAmountWei: "9900",
      maxFeeWei: "101"
    });

    expect(calldata.startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)).toBe(true);
  });

  it("rejects wrong public input length and unbounded selector data", () => {
    expect(() =>
      encodeWithdrawBoundedCalldata({
        proof: "0x1234",
        publicInputs: publicInputs.slice(0, 2),
        nullifier: bytes32("aa"),
        destination: TEST_DESTINATION_ADDRESS,
        grossAmountWei: "10001",
        minNetAmountWei: "9900",
        maxFeeWei: "101"
      })
    ).toThrow("12 public input");

    expect(() => assertStageCWithdrawBoundedCalldata(`0xc7787d0f${"00".repeat(32)}`)).toThrow(
      "stage-C withdrawal calldata selector"
    );
    expect(() => assertStageCWithdrawBoundedCalldata("0x678d850600")).toThrow(
      "complete proof-bound stage-C withdrawal calldata"
    );
  });

  it("validates withdrawal public inputs against destination amount chain and pool", () => {
    const input = {
      proof: "0x1234",
      publicInputs: boundPublicInputs(),
      nullifier: bytes32("aa"),
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "10001",
      minNetAmountWei: "9900",
      maxFeeWei: "101",
      currentRoot: bytes32("01"),
      expectedPool: TEST_POOL_ADDRESS,
      expectedChainId: 4326 as const
    };

    expect(() => assertWithdrawPublicInputBinding(input)).not.toThrow();
    expect(encodeVerifiedWithdrawBoundedCalldata(input).startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)).toBe(true);
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...input,
        publicInputs: boundPublicInputs({ destination: addressToBytes32("0x000000000000000000000000000000000000bEEF") })
      })
    ).toThrow("destination does not match");
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...input,
        publicInputs: boundPublicInputs({ grossAmount: uint256(10002n) })
      })
    ).toThrow("amount does not match");
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...input,
        publicInputs: boundPublicInputs({ chainId: uint256(6343n) })
      })
    ).toThrow("active MegaETH chain");
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...input,
        publicInputs: boundPublicInputs({ pool: addressToBytes32("0x000000000000000000000000000000000000bEEF") })
      })
    ).toThrow("shielded pool");
  });

  it("validates stage-C calldata against the selected withdrawal plan", () => {
    const input = {
      proof: "0x1234",
      publicInputs: boundPublicInputs(),
      nullifier: bytes32("aa"),
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "10001",
      minNetAmountWei: "9900",
      maxFeeWei: "101"
    };
    const calldata = encodeWithdrawBoundedCalldata(input);

    expect(assertStageCWithdrawCalldataBinding(calldata, input)).toBe(calldata);
    expect(() =>
      assertStageCWithdrawCalldataBinding(calldata, {
        ...input,
        destination: "0x000000000000000000000000000000000000bEEF"
      })
    ).toThrow("destination does not match");
    expect(() =>
      assertStageCWithdrawCalldataBinding(calldata, {
        ...input,
        minNetAmountWei: "9899"
      })
    ).toThrow("fee bounds do not match");
  });
});
