import { decodeEventLog, toEventHash } from "viem";
import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";
import type { RootAcceptedLogRecord } from "./reconstruct.js";

const ROOT_ACCEPTED_ABI = [
  {
    type: "event",
    name: "RootAccepted",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "previousRoot", type: "bytes32", indexed: true },
      { name: "insertedCommitment", type: "bytes32", indexed: true }
    ]
  }
] as const;

export const ROOT_ACCEPTED_TOPIC = toEventHash("RootAccepted(bytes32,bytes32,bytes32)");

export type RawRootAcceptedRpcLog = {
  address: string;
  topics: HexString[];
  data: HexString;
  blockNumber?: HexString | undefined;
  transactionHash?: HexString | undefined;
  logIndex?: HexString | undefined;
};

export async function fetchRootAcceptedLogs(input: {
  runtime: NullarkCurrentRuntime;
  fromBlock?: HexString;
  logChunkSize?: bigint | number;
  fetchImpl?: typeof fetch;
}): Promise<RawRootAcceptedRpcLog[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const chunkSize = input.logChunkSize === undefined ? 50_000n : BigInt(input.logChunkSize);
  if (chunkSize <= 0n) {
    throw new Error("Expected RootAccepted log chunk size to be positive.");
  }
  const fromBlock = input.fromBlock ?? input.runtime.poolDeploymentBlock;
  if (!isBlockQuantity(fromBlock)) {
    throw new Error("Expected RootAccepted fromBlock to be a hex block quantity.");
  }

  const latestBlockHex = await rpcRequest<HexString>(fetchImpl, input.runtime.rpcUrl, "eth_blockNumber", []);
  const latestBlock = BigInt(latestBlockHex);
  let cursor = BigInt(fromBlock);
  const logs: RawRootAcceptedRpcLog[] = [];

  while (cursor <= latestBlock) {
    const chunkEnd = cursor + chunkSize > latestBlock ? latestBlock : cursor + chunkSize;
    const result = await rpcRequest<RawRootAcceptedRpcLog[]>(fetchImpl, input.runtime.rpcUrl, "eth_getLogs", [
      {
        address: input.runtime.pool,
        fromBlock: toBlockQuantity(cursor),
        toBlock: toBlockQuantity(chunkEnd),
        topics: [ROOT_ACCEPTED_TOPIC]
      }
    ]);
    logs.push(...result);
    cursor = chunkEnd + 1n;
  }

  return logs;
}

export function decodeRootAcceptedLog(log: RawRootAcceptedRpcLog): RootAcceptedLogRecord | null {
  if (!isEvmAddress(log.address) || !isHexString(log.data)) {
    throw new Error("Invalid RootAccepted log shape.");
  }
  if (!Array.isArray(log.topics) || log.topics.some((topic) => !isHexString(topic))) {
    throw new Error("Invalid RootAccepted log topics.");
  }
  const decoded = decodeEventLog({
    abi: ROOT_ACCEPTED_ABI,
    topics: log.topics as [HexString, ...HexString[]],
    data: log.data
  });
  if (decoded.eventName !== "RootAccepted") {
    return null;
  }
  return {
    root: assertBytes32(decoded.args.root),
    previousRoot: assertBytes32(decoded.args.previousRoot),
    insertedCommitment: assertBytes32(decoded.args.insertedCommitment)
  };
}

export function decodeRootAcceptedLogs(logs: readonly RawRootAcceptedRpcLog[]): RootAcceptedLogRecord[] {
  return logs.flatMap((log) => {
    const decoded = decodeRootAcceptedLog(log);
    return decoded ? [decoded] : [];
  });
}

async function rpcRequest<T>(fetchImpl: typeof fetch, rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) {
    throw new Error(`MegaETH RPC ${method} returned HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `MegaETH RPC ${method} failed.`);
  }
  return body.result as T;
}

function assertBytes32(value: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error("Expected RootAccepted bytes32 value.");
  }
  return value;
}

function toBlockQuantity(value: bigint): HexString {
  return `0x${value.toString(16)}`;
}

function isBlockQuantity(value: string): value is HexString {
  return /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}
