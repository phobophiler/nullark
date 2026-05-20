import { BPS_DENOMINATOR, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_FEE_BPS } from "./config.js";

export type WithdrawalFeeResult = {
  gross: bigint;
  fee: bigint;
  net: bigint;
};

export type SweepCheck = {
  accruedProtocolFees: bigint;
  feeSweptAccounting: bigint;
  requestedSweep: bigint;
};

export function calculateWithdrawalFee(grossWithdrawalAmount: bigint): WithdrawalFeeResult {
  if (grossWithdrawalAmount < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error("withdrawal below minimum");
  }

  const fee = (grossWithdrawalAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;

  return {
    gross: grossWithdrawalAmount,
    fee,
    net: grossWithdrawalAmount - fee
  };
}

export function canSweepFees(check: SweepCheck): boolean {
  if (check.accruedProtocolFees < 0n || check.feeSweptAccounting < 0n || check.requestedSweep < 0n) {
    return false;
  }

  if (check.feeSweptAccounting > check.accruedProtocolFees) {
    return false;
  }

  return check.requestedSweep <= check.accruedProtocolFees - check.feeSweptAccounting;
}
