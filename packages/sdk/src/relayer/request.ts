import type { PreparedTransactionRequest, RelayerTransactionRequest } from "../adapters/index.js";
import {
  NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2,
  type NullarkCurrentRuntime
} from "../runtime/current.js";
import { isEvmAddress, type HexString } from "../types.js";
import {
  assertStageCWithdrawBoundedCalldata,
  decodeV12UnlinkableWithdrawOutputNoteCalldata
} from "../withdraw/calldata.js";

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
    data: assertRuntimeWithdrawalCalldata(input.runtime, input.calldata),
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
    data: assertRuntimeWithdrawalCalldata(input.runtime, input.calldata)
  };
}

function assertPool(value: string): HexString {
  if (!isEvmAddress(value)) {
    throw new Error("Runtime pool must be an EVM address.");
  }
  return value as HexString;
}

function assertRuntimeWithdrawalCalldata(runtime: NullarkCurrentRuntime, calldata: string): HexString {
  if (usesV12UnlinkableWithdrawals(runtime)) {
    try {
      decodeV12UnlinkableWithdrawOutputNoteCalldata(calldata);
      return calldata as HexString;
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(`Expected v1.2 unlinkable withdrawal calldata with 10 public inputs and an encrypted output note.${detail}`);
    }
  }

  return assertStageCWithdrawBoundedCalldata(calldata);
}

function usesV12UnlinkableWithdrawals(runtime: NullarkCurrentRuntime): boolean {
  return (
    runtime.groth16PublicInputOrder.length === NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2.length &&
    runtime.groth16PublicInputOrder.every((name, index) => name === NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2[index])
  );
}
