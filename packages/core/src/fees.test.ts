import { describe, expect, it } from "vitest";
import { calculateWithdrawalFee, canSweepFees, resolveWithdrawalFeeState } from "./fees.js";

describe("withdrawal fee math", () => {
  it("charges 33 bps using floor rounding", () => {
    expect(calculateWithdrawalFee(1_000_000n)).toEqual({
      gross: 1_000_000n,
      fee: 3_300n,
      net: 996_700n
    });
  });

  it("allows tiny withdrawals when the 33 bps fee rounds to zero", () => {
    expect(calculateWithdrawalFee(303n)).toEqual({
      gross: 303n,
      fee: 0n,
      net: 303n
    });
    expect(() => calculateWithdrawalFee(0n)).toThrow("withdrawal below minimum");
  });

  it("prevents fee sweeps above accrued protocol fees", () => {
    expect(canSweepFees({ accruedProtocolFees: 100n, feeSweptAccounting: 40n, requestedSweep: 60n })).toBe(true);
    expect(canSweepFees({ accruedProtocolFees: 100n, feeSweptAccounting: 40n, requestedSweep: 61n })).toBe(false);
  });

  it("uses only active fee bps and exposes pending fee as non-applied state", () => {
    const state = resolveWithdrawalFeeState({
      activeFeeBps: 33,
      maxFeeBps: 100,
      pendingFeeBps: 75,
      pendingFeeActivationTime: "2026-05-24T00:00:00.000Z",
      source: "on-chain-feeBps"
    });

    expect(state).toEqual({
      activeFeeBps: 33,
      maxFeeBps: 100,
      pendingFeeBps: 75,
      pendingFeeActivationTime: "2026-05-24T00:00:00.000Z",
      pendingFeeActive: false,
      source: "on-chain-feeBps"
    });
    expect(calculateWithdrawalFee(1_000_000n, state.activeFeeBps)).toEqual({
      gross: 1_000_000n,
      fee: 3_300n,
      net: 996_700n
    });
  });

  it("rejects unsafe fee state and stale user withdrawal bounds", () => {
    expect(() => resolveWithdrawalFeeState({ activeFeeBps: 101, maxFeeBps: 100, source: "on-chain-feeBps" })).toThrow(
      "active withdrawal fee bps cannot exceed max fee bps"
    );
    expect(() => calculateWithdrawalFee(1_000_000n, 101, { maxFeeBps: 100 })).toThrow(
      "withdrawal fee bps cannot exceed max fee bps"
    );
    expect(() => calculateWithdrawalFee(1_000_000n, 50, { maxFeeWei: 3_300n })).toThrow(
      "withdrawal fee exceeds user maximum"
    );
    expect(() => calculateWithdrawalFee(1_000_000n, 50, { minNetAmountWei: 996_700n })).toThrow(
      "withdrawal net amount is below user minimum"
    );
  });
});
