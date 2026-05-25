import { describe, expect, it } from "vitest";
import { calculateWithdrawalFee, canSweepFees } from "@nullark/core";

describe("fee accounting cross-check", () => {
  it("keeps accrued fees separate from user principal", () => {
    const withdrawal = calculateWithdrawalFee(1_000_000n);
    const unspentPrivateNotes = 2_000_000n;
    const poolAssets = unspentPrivateNotes + withdrawal.fee;

    expect(poolAssets).toBe(2_003_300n);
    expect(
      canSweepFees({
        accruedProtocolFees: withdrawal.fee,
        feeSweptAccounting: 0n,
        requestedSweep: withdrawal.fee
      })
    ).toBe(true);
  });
});
