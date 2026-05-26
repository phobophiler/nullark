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

export type RecoveryHintedRootAcceptedLogs = {
  source: "hint" | "fallback";
  logs: RawRootAcceptedRpcLog[];
  toBlock: HexString;
  hintRejectedReason?: string | undefined;
};

export async function fetchRootAcceptedLogs(input: {
  runtime: NullarkCurrentRuntime;
  fromBlock?: HexString;
  toBlock?: HexString;
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
  if (input.toBlock !== undefined && !isBlockQuantity(input.toBlock)) {
    throw new Error("Expected RootAccepted toBlock to be a hex block quantity.");
  }

  const latestBlockHex = input.toBlock ?? (await rpcRequest<HexString>(fetchImpl, input.runtime.rpcUrl, "eth_blockNumber", []));
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

export async function fetchRecoveryHintedRootAcceptedLogs(input: {
  runtime: NullarkCurrentRuntime;
  commitment: HexString;
  txHashHint?: HexString | null | undefined;
  blockNumberHint?: HexString | null | undefined;
  leafIndexHint?: number | null | undefined;
  toBlock?: HexString | undefined;
  minConfirmations?: bigint | number | undefined;
  logChunkSize?: bigint | number;
  fetchImpl?: typeof fetch;
}): Promise<RecoveryHintedRootAcceptedLogs> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const commitment = assertBytes32(input.commitment);
  let hintedToBlock: HexString | null = null;
  let hintRejectedReason: string | undefined;

  if (input.txHashHint !== undefined && input.txHashHint !== null) {
    if (!isHexBytes32(input.txHashHint)) {
      hintRejectedReason = "transaction hash hint was not bytes32";
    } else {
      try {
        const receipt = await rpcRequest<RawTransactionReceipt | null>(
          fetchImpl,
          input.runtime.rpcUrl,
          "eth_getTransactionReceipt",
          [input.txHashHint]
        );
        const receiptBlockNumber = receipt?.blockNumber;
        if (
          receipt &&
          receiptBlockNumber &&
          isBlockQuantity(receiptBlockNumber) &&
          receiptContainsCommitment(receipt, input.runtime.pool, commitment)
        ) {
          hintedToBlock = receiptBlockNumber;
        } else {
          hintRejectedReason = "transaction receipt hint did not contain the commitment for this pool";
        }
      } catch (error) {
        hintRejectedReason = error instanceof Error ? error.message : "transaction receipt hint lookup failed";
      }
    }
  }

  if (!hintedToBlock && input.blockNumberHint !== undefined && input.blockNumberHint !== null) {
    if (!isBlockQuantity(input.blockNumberHint)) {
      hintRejectedReason = appendHintRejectedReason(hintRejectedReason, "block number hint was not a hex block quantity");
    } else {
      hintedToBlock = input.blockNumberHint;
    }
  }

  const finalizedToBlock = await resolveRecoveryToBlock({
    runtime: input.runtime,
    fetchImpl,
    toBlock: input.toBlock,
    minConfirmations: input.minConfirmations,
    requireFinalityPolicy: input.runtime.environment === "megaeth-mainnet"
  });

  if (hintedToBlock) {
    if (finalizedToBlock && BigInt(hintedToBlock) > BigInt(finalizedToBlock)) {
      throw new Error("RootAccepted hint block is newer than the configured recovery finality boundary.");
    }
    try {
      const hintedLogs = await fetchRootAcceptedLogs({
        runtime: input.runtime,
        fromBlock: input.runtime.poolDeploymentBlock,
        toBlock: hintedToBlock,
        ...(input.logChunkSize === undefined ? {} : { logChunkSize: input.logChunkSize }),
        fetchImpl
      });
      const decoded = decodeRootAcceptedLogs(hintedLogs);
      if (decodedLogsConfirmHint(decoded, commitment, input.leafIndexHint)) {
        return { source: "hint", logs: hintedLogs, toBlock: hintedToBlock };
      }
      hintRejectedReason = "RootAccepted logs did not confirm the hinted commitment and leaf index";
    } catch (error) {
      hintRejectedReason = error instanceof Error ? error.message : "hinted RootAccepted lookup failed";
    }
  }

  const latestBlockHex =
    finalizedToBlock ?? (await rpcRequest<HexString>(fetchImpl, input.runtime.rpcUrl, "eth_blockNumber", []));
  const fallbackLogs = await fetchRootAcceptedLogs({
    runtime: input.runtime,
    fromBlock: input.runtime.poolDeploymentBlock,
    toBlock: latestBlockHex,
    ...(input.logChunkSize === undefined ? {} : { logChunkSize: input.logChunkSize }),
    fetchImpl
  });
  return { source: "fallback", logs: fallbackLogs, toBlock: latestBlockHex, hintRejectedReason };
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
  return normalizeRootAcceptedLogs(logs).flatMap((log) => {
    const decoded = decodeRootAcceptedLog(log);
    return decoded ? [decoded] : [];
  });
}

export function normalizeRootAcceptedLogs(logs: readonly RawRootAcceptedRpcLog[]): RawRootAcceptedRpcLog[] {
  const byTransactionLogIndex = new Map<string, RawRootAcceptedRpcLog>();
  const byBlockLogIndex = new Map<string, RawRootAcceptedRpcLog>();
  const normalized: RawRootAcceptedRpcLog[] = [];

  for (const log of logs) {
    if (!isBlockQuantity(log.blockNumber ?? "") || !isBlockQuantity(log.logIndex ?? "")) {
      throw new Error("RootAccepted logs require blockNumber and logIndex before reconstruction.");
    }
    const blockNumber = log.blockNumber as HexString;
    const logIndex = log.logIndex as HexString;
    const transactionKey = log.transactionHash && isHexBytes32(log.transactionHash) ? `${log.transactionHash.toLowerCase()}:${logIndex.toLowerCase()}` : null;
    if (transactionKey) {
      const previous = byTransactionLogIndex.get(transactionKey);
      if (previous) {
        if (!sameRootAcceptedLog(previous, log)) {
          throw new Error("ambiguous RootAccepted logs share transactionHash and logIndex.");
        }
        continue;
      }
      byTransactionLogIndex.set(transactionKey, log);
    }

    const blockKey = `${blockNumber.toLowerCase()}:${logIndex.toLowerCase()}`;
    const previousAtPosition = byBlockLogIndex.get(blockKey);
    if (previousAtPosition && !sameRootAcceptedLog(previousAtPosition, log)) {
      throw new Error("ambiguous RootAccepted logs share blockNumber and logIndex.");
    }
    byBlockLogIndex.set(blockKey, log);
    normalized.push(log);
  }

  return normalized.sort((left, right) => {
    const blockDelta = BigInt(left.blockNumber ?? "0x0") - BigInt(right.blockNumber ?? "0x0");
    if (blockDelta !== 0n) {
      return blockDelta < 0n ? -1 : 1;
    }
    const logDelta = BigInt(left.logIndex ?? "0x0") - BigInt(right.logIndex ?? "0x0");
    if (logDelta !== 0n) {
      return logDelta < 0n ? -1 : 1;
    }
    return 0;
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

type RawTransactionReceipt = {
  blockNumber?: HexString | undefined;
  logs?: Array<{
    address?: string | undefined;
    topics?: string[] | undefined;
  }> | undefined;
};

function receiptContainsCommitment(
  receipt: RawTransactionReceipt,
  pool: HexString,
  commitment: HexString
): boolean {
  const normalizedPool = pool.toLowerCase();
  const normalizedCommitment = commitment.toLowerCase();
  return (
    receipt.logs?.some(
      (log) =>
        log.address?.toLowerCase() === normalizedPool &&
        log.topics?.some((topic) => topic.toLowerCase() === normalizedCommitment)
    ) ?? false
  );
}

function decodedLogsConfirmHint(
  logs: readonly RootAcceptedLogRecord[],
  commitment: HexString,
  leafIndexHint: number | null | undefined
): boolean {
  const leaves = logs
    .map((log) => log.insertedCommitment)
    .filter((insertedCommitment) => BigInt(insertedCommitment) !== 0n);
  const leafIndex = leaves.findIndex((leaf) => leaf.toLowerCase() === commitment.toLowerCase());
  if (leafIndex < 0) {
    return false;
  }
  if (leafIndexHint !== null && leafIndexHint !== undefined && leafIndex !== leafIndexHint) {
    return false;
  }
  return true;
}

function appendHintRejectedReason(previous: string | undefined, next: string): string {
  return previous ? `${previous}; ${next}` : next;
}

async function resolveRecoveryToBlock(input: {
  runtime: NullarkCurrentRuntime;
  fetchImpl: typeof fetch;
  toBlock: HexString | undefined;
  minConfirmations: bigint | number | undefined;
  requireFinalityPolicy: boolean;
}): Promise<HexString | null> {
  if (input.toBlock !== undefined && !isBlockQuantity(input.toBlock)) {
    throw new Error("Expected RootAccepted recovery toBlock to be a hex block quantity.");
  }
  if (input.minConfirmations !== undefined) {
    const confirmations = BigInt(input.minConfirmations);
    if (confirmations <= 0n) {
      throw new Error("RootAccepted recovery minConfirmations must be positive.");
    }
    if (input.toBlock !== undefined) {
      throw new Error("RootAccepted recovery finality policy must use either toBlock or minConfirmations, not both.");
    }
    const latestBlockHex = await rpcRequest<HexString>(input.fetchImpl, input.runtime.rpcUrl, "eth_blockNumber", []);
    const latestBlock = BigInt(latestBlockHex);
    if (latestBlock < confirmations) {
      throw new Error("RootAccepted recovery minConfirmations exceeds the latest block.");
    }
    return toBlockQuantity(latestBlock - confirmations);
  }
  if (input.toBlock !== undefined) {
    return input.toBlock;
  }
  if (input.requireFinalityPolicy) {
    throw new Error("RootAccepted recovery on mainnet requires an explicit finality policy.");
  }
  return null;
}

function sameRootAcceptedLog(left: RawRootAcceptedRpcLog, right: RawRootAcceptedRpcLog): boolean {
  return JSON.stringify(canonicalLog(left)) === JSON.stringify(canonicalLog(right));
}

function canonicalLog(log: RawRootAcceptedRpcLog): RawRootAcceptedRpcLog {
  return {
    address: log.address.toLowerCase(),
    topics: log.topics.map((topic) => topic.toLowerCase() as HexString),
    data: log.data.toLowerCase() as HexString,
    blockNumber: log.blockNumber?.toLowerCase() as HexString | undefined,
    transactionHash: log.transactionHash?.toLowerCase() as HexString | undefined,
    logIndex: log.logIndex?.toLowerCase() as HexString | undefined
  };
}

function toBlockQuantity(value: bigint): HexString {
  return `0x${value.toString(16)}`;
}

function isBlockQuantity(value: string): value is HexString {
  return /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}
