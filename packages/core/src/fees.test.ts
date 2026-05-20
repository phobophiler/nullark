import { describe, expect, it } from "vitest";
import { calculateWithdrawalFee, canSweepFees } from "./fees.js";

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
});
