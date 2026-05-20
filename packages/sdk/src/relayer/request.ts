import type { PreparedTransactionRequest, RelayerTransactionRequest } from "../adapters/index.js";
import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, type HexString } from "../types.js";
import { assertStageCWithdrawBoundedCalldata } from "../withdraw/calldata.js";

export type BuildRelayerRequestInput = {
  runtime: NullarkCurrentRuntime;
  calldata: string;
  nowEpochSeconds?: number;
  deadlineSeconds?: number;
};

export function buildWithdrawalRelayerRequest(input: BuildRelayerRequestInput): RelayerTransactionRequest {
  const deadlineSeconds = input.deadlineSeconds ?? 120;
  if (!Number.isSafeInteger(deadlineSeconds) || deadlineSeconds <= 0 || deadlineSeconds > 120) {
    throw new Error("Relayer deadline must be between 1 and 120 seconds.");
  }
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error("Current epoch seconds must be a positive safe integer.");
  }

  return {
    chainId: input.runtime.chainId,
    to: assertPool(input.runtime.pool),
    value: "0x0",
    data: assertStageCWithdrawBoundedCalldata(input.calldata),
    deadlineEpochSeconds: now + deadlineSeconds
  };
}

export function buildDirectWalletWithdrawalTransaction(input: {
  runtime: NullarkCurrentRuntime;
  calldata: string;
}): PreparedTransactionRequest {
  return {
    chainId: input.runtime.chainId,
    to: assertPool(input.runtime.pool),
    value: 0n,
    data: assertStageCWithdrawBoundedCalldata(input.calldata)
  };
}

function assertPool(value: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error("Runtime pool must be an EVM address.");
  }
  return value as HexString;
}
