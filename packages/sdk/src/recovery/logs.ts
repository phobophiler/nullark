import { decodeEventLog, toEventHash } from "viem";
import type { NullarkCurrentRuntime } from "../runtime/current.js";
import { isEvmAddress, isHexBytes32, isHexString, type HexString } from "../types.js";

const NOTE_EVENTS_ABI = [
  {
    type: "event",
    name: "DepositNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "PrivateTransferNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "WithdrawalChangeNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "WithdrawalOutputNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  }
] as const;

export const NOTE_EVENT_TOPICS = [
  toEventHash("DepositNoteCreated(bytes32,uint256,bytes,uint16)"),
  toEventHash("PrivateTransferNoteCreated(bytes32,bytes32,uint256,bytes,uint16)"),
  toEventHash("WithdrawalChangeNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)"),
  toEventHash("WithdrawalOutputNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)")
] as const;

export type RawNoteRpcLog = {
  address: string;
  topics: HexString[];
  data: HexString;
  transactionHash: HexString;
};

export type DecodedNoteEventLog = {
  action: "deposit" | "private-transfer" | "withdraw-change" | "withdraw-output";
  commitment: HexString;
  leafIndex: number;
  encryptedNote: HexString;
  encryptionVersion: 1 | 2;
  nullifier: HexString | null;
  transactionHash: HexString;
};

export async function fetchNoteEventLogs(input: {
  runtime: NullarkCurrentRuntime;
  fromBlock?: HexString;
  logChunkSize?: bigint | number;
  fetchImpl?: typeof fetch;
}): Promise<RawNoteRpcLog[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const chunkSize = input.logChunkSize === undefined ? 50_000n : BigInt(input.logChunkSize);
  if (chunkSize <= 0n) {
    throw new Error("Expected note recovery log chunk size to be positive.");
  }
  const fromBlock = input.fromBlock ?? input.runtime.poolDeploymentBlock;
  if (!isBlockQuantity(fromBlock)) {
    throw new Error("Expected note recovery fromBlock to be a hex block quantity.");
  }
  const latestBlockHex = await rpcRequest<HexString>(fetchImpl, input.runtime.rpcUrl, "eth_blockNumber", []);
  if (!isBlockQuantity(latestBlockHex)) {
    throw new Error("Expected MegaETH RPC eth_blockNumber to return a hex block quantity.");
  }
  const latestBlock = BigInt(latestBlockHex);
  let cursor = BigInt(fromBlock);
  const logs: RawNoteRpcLog[] = [];

  while (cursor <= latestBlock) {
    const chunkEnd = cursor + chunkSize > latestBlock ? latestBlock : cursor + chunkSize;
    const result = await rpcRequest<RawNoteRpcLog[]>(fetchImpl, input.runtime.rpcUrl, "eth_getLogs", [
      {
        address: input.runtime.pool,
        fromBlock: toBlockQuantity(cursor),
        toBlock: toBlockQuantity(chunkEnd),
        topics: [NOTE_EVENT_TOPICS]
      }
    ]);
    logs.push(...result);
    cursor = chunkEnd + 1n;
  }

  return logs;
}

export function decodeNoteEventLog(log: RawNoteRpcLog): DecodedNoteEventLog | null {
  if (!isEvmAddress(log.address) || !isHexString(log.data) || !isHexString(log.transactionHash)) {
    throw new Error("Invalid note event log shape.");
  }
  if (!Array.isArray(log.topics) || log.topics.some((topic) => !isHexString(topic))) {
    throw new Error("Invalid note event topics.");
  }
  const decoded = decodeEventLog({
    abi: NOTE_EVENTS_ABI,
    topics: log.topics as [HexString, ...HexString[]],
    data: log.data
  });

  if (decoded.eventName === "DepositNoteCreated") {
    return {
      action: "deposit",
      commitment: assertBytes32(decoded.args.commitment),
      leafIndex: safeLeafIndex(decoded.args.leafIndex),
      encryptedNote: assertHexBytes(decoded.args.encryptedNote),
      encryptionVersion: assertEncryptionVersion(decoded.args.encryptionVersion),
      nullifier: null,
      transactionHash: log.transactionHash
    };
  }
  if (decoded.eventName === "PrivateTransferNoteCreated") {
    return {
      action: "private-transfer",
      commitment: assertBytes32(decoded.args.commitment),
      leafIndex: safeLeafIndex(decoded.args.leafIndex),
      encryptedNote: assertHexBytes(decoded.args.encryptedNote),
      encryptionVersion: assertEncryptionVersion(decoded.args.encryptionVersion),
      nullifier: assertBytes32(decoded.args.nullifier),
      transactionHash: log.transactionHash
    };
  }
  if (decoded.eventName === "WithdrawalChangeNoteCreated" || decoded.eventName === "WithdrawalOutputNoteCreated") {
    return {
      action: decoded.eventName === "WithdrawalOutputNoteCreated" ? "withdraw-output" : "withdraw-change",
      commitment: assertBytes32(decoded.args.commitment),
      leafIndex: safeLeafIndex(decoded.args.leafIndex),
      encryptedNote: assertHexBytes(decoded.args.encryptedNote),
      encryptionVersion: assertEncryptionVersion(decoded.args.encryptionVersion),
      nullifier: assertBytes32(decoded.args.nullifier),
      transactionHash: log.transactionHash
    };
  }

  return null;
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

function safeLeafIndex(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Note event leaf index exceeds safe integer range.");
  }
  return Number(value);
}

function assertEncryptionVersion(value: number): 1 | 2 {
  if (value !== 1 && value !== 2) {
    throw new Error("Unsupported note encryption version.");
  }
  return value;
}

function assertBytes32(value: string): HexString {
  if (!isHexBytes32(value)) {
    throw new Error("Expected note event bytes32 value.");
  }
  return value;
}

function assertHexBytes(value: string): HexString {
  if (!isHexString(value)) {
    throw new Error("Expected note event encrypted note bytes.");
  }
  return value;
}

function toBlockQuantity(value: bigint): HexString {
  return `0x${value.toString(16)}`;
}

function isBlockQuantity(value: string): value is HexString {
  return /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}
