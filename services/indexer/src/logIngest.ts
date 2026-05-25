import { decodeEventLog } from "viem";
import { addEncryptedNoteEvent, createEncryptedNoteCache, type EncryptedNoteCache } from "./encryptedNotes.js";
import { createRangeTracker, markCheckedRange, type BlockRange, type RangeTracker } from "./ranges.js";

export type EventTopics = [signature: `0x${string}`, ...`0x${string}`[]];

export const POOL_EVENT_ABI = [
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
  },
  {
    type: "event",
    name: "RootAccepted",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "previousRoot", type: "bytes32", indexed: true },
      { name: "insertedCommitment", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "NullifierSpent",
    inputs: [{ name: "nullifier", type: "bytes32", indexed: true }]
  }
] as const;

export type RawPoolLog = {
  address: `0x${string}`;
  topics: EventTopics;
  data: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
};

export type RootRecord = {
  root: `0x${string}`;
  previousRoot: `0x${string}`;
  insertedCommitment: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
};

export type NullifierRecord = {
  nullifier: `0x${string}`;
  spent: true;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
};

export type IndexerState = {
  encryptedNotes: EncryptedNoteCache;
  roots: Map<string, RootRecord>;
  nullifiers: Map<string, NullifierRecord>;
  ranges: RangeTracker;
};

export function createIndexerState(): IndexerState {
  return {
    encryptedNotes: createEncryptedNoteCache(),
    roots: new Map(),
    nullifiers: new Map(),
    ranges: createRangeTracker()
  };
}

export function ingestPoolLogs(
  state: IndexerState,
  input: {
    chainId: number;
    pool: `0x${string}`;
    sourceRpc: string;
    observedAtMs: number;
    logs: RawPoolLog[];
    checkedRange: BlockRange;
  }
): void {
  for (const log of input.logs) {
    if (log.address.toLowerCase() !== input.pool.toLowerCase()) {
      continue;
    }

    const decoded = decodeEventLog({ abi: POOL_EVENT_ABI, data: log.data, topics: log.topics });
    if (decoded.eventName === "DepositNoteCreated") {
      addEncryptedNoteEvent(state.encryptedNotes, {
        chainId: input.chainId,
        pool: input.pool,
        eventType: "deposit",
        commitment: decoded.args.commitment,
        nullifier: null,
        leafIndex: Number(decoded.args.leafIndex),
        encryptedNote: decoded.args.encryptedNote,
        encryptionVersion: decoded.args.encryptionVersion,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        observedAtMs: input.observedAtMs,
        sourceRpc: input.sourceRpc
      });
    } else if (
      decoded.eventName === "PrivateTransferNoteCreated" ||
      decoded.eventName === "WithdrawalChangeNoteCreated" ||
      decoded.eventName === "WithdrawalOutputNoteCreated"
    ) {
      addEncryptedNoteEvent(state.encryptedNotes, {
        chainId: input.chainId,
        pool: input.pool,
        eventType:
          decoded.eventName === "PrivateTransferNoteCreated"
            ? "private-transfer"
            : decoded.eventName === "WithdrawalOutputNoteCreated"
              ? "withdraw-output"
              : "withdraw-change",
        commitment: decoded.args.commitment,
        nullifier: decoded.args.nullifier,
        leafIndex: Number(decoded.args.leafIndex),
        encryptedNote: decoded.args.encryptedNote,
        encryptionVersion: decoded.args.encryptionVersion,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        observedAtMs: input.observedAtMs,
        sourceRpc: input.sourceRpc
      });
    } else if (decoded.eventName === "RootAccepted") {
      state.roots.set(decoded.args.root.toLowerCase(), {
        root: decoded.args.root,
        previousRoot: decoded.args.previousRoot,
        insertedCommitment: decoded.args.insertedCommitment,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex
      });
    } else if (decoded.eventName === "NullifierSpent") {
      state.nullifiers.set(decoded.args.nullifier.toLowerCase(), {
        nullifier: decoded.args.nullifier,
        spent: true,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex
      });
    }
  }
  markCheckedRange(state.ranges, input.checkedRange);
}
