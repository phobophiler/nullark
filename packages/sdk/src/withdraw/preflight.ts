import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isHexBytes32, isHexString, type HexString } from "../types.js";
import { assertStageCWithdrawBoundedCalldata, encodeNullifierLookupCalldata } from "./calldata.js";

export type WithdrawalPreflightResult = {
  ok: true;
  chainId: number;
  nullifierSpent: false;
  estimatedGas: HexString;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

export async function preflightWithdrawal(input: {
  runtime: NullarkCurrentRuntime;
  calldata: string;
  nullifier: string;
  fetchImpl?: typeof fetch;
}): Promise<WithdrawalPreflightResult> {
  const calldata = assertStageCWithdrawBoundedCalldata(input.calldata);
  const nullifier = assertNullifier(input.nullifier);
  const rpc = makeRpcClient(input.runtime.rpcUrl, input.fetchImpl ?? fetch);
  const chainIdHex = await rpc<string>("eth_chainId", []);
  const chainId = BigInt(assertHexRpcResult(chainIdHex, "RPC chain ID"));
  if (chainId !== BigInt(input.runtime.chainId)) {
    throw new Error("Withdrawal preflight RPC is not connected to MegaETH mainnet 4326.");
  }

  const nullifierResult = await rpc<string>("eth_call", [
    {
      to: input.runtime.pool,
      data: encodeNullifierLookupCalldata(nullifier)
    },
    "latest"
  ]);
  if (boolFromEthCallResult(nullifierResult)) {
    throw new Error("Withdrawal nullifier is already spent.");
  }

  const tx = {
    to: input.runtime.pool,
    data: calldata,
    value: "0x0"
  };
  await rpc<string>("eth_call", [tx, "latest"]);
  const estimatedGas = assertHexRpcResult(await rpc<string>("eth_estimateGas", [tx]), "estimated gas");

  return {
    ok: true,
    chainId: input.runtime.chainId,
    nullifierSpent: false,
    estimatedGas
  };
}

function makeRpcClient(rpcUrl: string, fetchImpl: typeof fetch): <T>(method: string, params: unknown[]) => Promise<T> {
  let id = 0;
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    id += 1;
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    if (!response.ok) {
      throw new Error(`Withdrawal preflight RPC returned HTTP ${response.status}.`);
    }
    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new Error(body.error.message ?? "Withdrawal preflight RPC error.");
    }
    if (body.result === undefined) {
      throw new Error("Withdrawal preflight RPC returned no result.");
    }
    return body.result;
  };
}

function assertNullifier(value: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error("Expected withdrawal nullifier to be bytes32.");
  }
  return value as HexString;
}

function assertHexRpcResult(value: string, label: string): HexString {
  if (!isHexString(value)) {
    throw new Error(`Expected ${label} hex result.`);
  }
  return value as HexString;
}

function boolFromEthCallResult(result: string): boolean {
  const normalized = assertHexRpcResult(result, "eth_call");
  return BigInt(normalized) !== 0n;
}
