import { BPS_DENOMINATOR, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_FEE_BPS } from "./config.js";

export type WithdrawalFeeResult = {
  gross: bigint;
  fee: bigint;
  net: bigint;
};

export type WithdrawalFeeSource = "runtime-static-v1.1" | "on-chain-feeBps";

export type WithdrawalFeeStateInput = {
  activeFeeBps: number;
  maxFeeBps: number;
  pendingFeeBps?: number | null | undefined;
  pendingFeeActivationTime?: string | null | undefined;
  source: WithdrawalFeeSource;
};

export type WithdrawalFeeState = {
  activeFeeBps: number;
  maxFeeBps: number;
  pendingFeeBps?: number | undefined;
  pendingFeeActivationTime?: string | undefined;
  pendingFeeActive: false;
  source: WithdrawalFeeSource;
};

export type WithdrawalFeeBounds = {
  maxFeeBps?: number | undefined;
  maxFeeWei?: bigint | undefined;
  minNetAmountWei?: bigint | undefined;
};

export type SweepCheck = {
  accruedProtocolFees: bigint;
  feeSweptAccounting: bigint;
  requestedSweep: bigint;
};

export function calculateWithdrawalFee(
  grossWithdrawalAmount: bigint,
  feeBps: number | bigint = WITHDRAWAL_FEE_BPS,
  bounds: WithdrawalFeeBounds = {}
): WithdrawalFeeResult {
  if (grossWithdrawalAmount < MIN_WITHDRAWAL_AMOUNT) {
    throw new Error("withdrawal below minimum");
  }

  const normalizedFeeBps = normalizeFeeBps(feeBps, "withdrawal fee bps");
  const maxFeeBps = bounds.maxFeeBps === undefined ? undefined : normalizeFeeBps(bounds.maxFeeBps, "max fee bps");
  if (maxFeeBps !== undefined && normalizedFeeBps > maxFeeBps) {
    throw new Error("withdrawal fee bps cannot exceed max fee bps");
  }

  const fee = (grossWithdrawalAmount * BigInt(normalizedFeeBps)) / BPS_DENOMINATOR;
  const net = grossWithdrawalAmount - fee;
  if (bounds.maxFeeWei !== undefined && fee > bounds.maxFeeWei) {
    throw new Error("withdrawal fee exceeds user maximum");
  }
  if (bounds.minNetAmountWei !== undefined && net < bounds.minNetAmountWei) {
    throw new Error("withdrawal net amount is below user minimum");
  }

  return {
    gross: grossWithdrawalAmount,
    fee,
    net
  };
}

export function resolveWithdrawalFeeState(input: WithdrawalFeeStateInput): WithdrawalFeeState {
  const activeFeeBps = normalizeFeeBps(input.activeFeeBps, "active withdrawal fee bps");
  const maxFeeBps = normalizeFeeBps(input.maxFeeBps, "max withdrawal fee bps");
  if (activeFeeBps > maxFeeBps) {
    throw new Error("active withdrawal fee bps cannot exceed max fee bps");
  }
  const pendingFeeBps =
    input.pendingFeeBps === undefined || input.pendingFeeBps === null
      ? undefined
      : normalizeFeeBps(input.pendingFeeBps, "pending withdrawal fee bps");
  if (pendingFeeBps !== undefined && pendingFeeBps > maxFeeBps) {
    throw new Error("pending withdrawal fee bps cannot exceed max fee bps");
  }
  const pendingFeeActivationTime =
    input.pendingFeeActivationTime === undefined || input.pendingFeeActivationTime === null
      ? undefined
      : input.pendingFeeActivationTime;
  if (pendingFeeActivationTime !== undefined && Number.isNaN(Date.parse(pendingFeeActivationTime))) {
    throw new Error("pending withdrawal fee activation time must be an ISO timestamp");
  }
  return {
    activeFeeBps,
    maxFeeBps,
    ...(pendingFeeBps === undefined ? {} : { pendingFeeBps }),
    ...(pendingFeeActivationTime === undefined ? {} : { pendingFeeActivationTime }),
    pendingFeeActive: false,
    source: input.source
  };
}

function normalizeFeeBps(value: number | bigint, label: string): number {
  const parsed = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return parsed;
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
