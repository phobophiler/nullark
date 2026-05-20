import { keccak256 } from "viem";
import type { HexString } from "./broadcaster.js";

export type RelayIdempotencyStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type RelayIdempotencyRecord = {
  status: "pending" | "submitted";
  chainId: number;
  pool: HexString;
  nullifier: HexString;
  calldataHash: HexString;
  updatedAtEpochSeconds: number;
  txHash?: HexString;
};

export type RelayIdempotencyInput = {
  store: RelayIdempotencyStore;
  chainId: number;
  pool: HexString;
  nullifier: HexString;
  calldata: HexString;
  nowEpochSeconds: number;
};

export type RelayIdempotencyPrepared = {
  chainId: number;
  pool: HexString;
  nullifier: HexString;
  calldataHash: HexString;
  nullifierKey: string;
  calldataKey: string;
  nowEpochSeconds: number;
};

export type RelayIdempotencyDecision =
  | {
      kind: "ready";
      prepared: RelayIdempotencyPrepared;
    }
  | {
      kind: "pending";
      record: RelayIdempotencyRecord;
    }
  | {
      kind: "submitted";
      record: RelayIdempotencyRecord & { txHash: HexString };
    }
  | {
      kind: "conflict";
      reason: string;
    };

export const RELAY_IDEMPOTENCY_TTL_SECONDS = 60 * 60;

export async function prepareRelayIdempotency(input: RelayIdempotencyInput): Promise<RelayIdempotencyDecision> {
  const calldataHash = keccak256(input.calldata);
  const prepared = buildRelayIdempotencyPrepared({ ...input, calldataHash });
  const [nullifierRecord, calldataRecord] = await Promise.all([
    readRelayIdempotencyRecord(input.store, prepared.nullifierKey),
    readRelayIdempotencyRecord(input.store, prepared.calldataKey)
  ]);

  const submittedCalldataRecord = asSubmitted(calldataRecord);
  if (submittedCalldataRecord) {
    return { kind: "submitted", record: submittedCalldataRecord };
  }

  if (calldataRecord?.status === "pending") {
    return { kind: "pending", record: calldataRecord };
  }

  if (nullifierRecord) {
    if (nullifierRecord.calldataHash.toLowerCase() !== calldataHash.toLowerCase()) {
      return {
        kind: "conflict",
        reason: "withdrawal nullifier already has a different relay request recorded"
      };
    }

    const submittedNullifierRecord = asSubmitted(nullifierRecord);
    if (submittedNullifierRecord) {
      return { kind: "submitted", record: submittedNullifierRecord };
    }

    return { kind: "pending", record: nullifierRecord };
  }

  return { kind: "ready", prepared };
}

export async function recordRelayPending(
  store: RelayIdempotencyStore,
  prepared: RelayIdempotencyPrepared
): Promise<RelayIdempotencyRecord> {
  const record: RelayIdempotencyRecord = {
    status: "pending",
    chainId: prepared.chainId,
    pool: prepared.pool,
    nullifier: prepared.nullifier,
    calldataHash: prepared.calldataHash,
    updatedAtEpochSeconds: prepared.nowEpochSeconds
  };
  await writeRelayIdempotencyRecord(store, prepared, record);
  return record;
}

export async function recordRelaySubmitted(
  store: RelayIdempotencyStore,
  prepared: RelayIdempotencyPrepared,
  txHash: HexString
): Promise<RelayIdempotencyRecord> {
  const record: RelayIdempotencyRecord = {
    status: "submitted",
    chainId: prepared.chainId,
    pool: prepared.pool,
    nullifier: prepared.nullifier,
    calldataHash: prepared.calldataHash,
    txHash,
    updatedAtEpochSeconds: Math.floor(Date.now() / 1000)
  };
  await writeRelayIdempotencyRecord(store, prepared, record);
  return record;
}

function buildRelayIdempotencyPrepared(input: RelayIdempotencyInput & { calldataHash: HexString }): RelayIdempotencyPrepared {
  const pool = input.pool.toLowerCase() as HexString;
  const nullifier = input.nullifier.toLowerCase() as HexString;
  const calldataHash = input.calldataHash.toLowerCase() as HexString;
  const prefix = `relay:${input.chainId}:${pool}`;
  return {
    chainId: input.chainId,
    pool,
    nullifier,
    calldataHash,
    nullifierKey: `${prefix}:nullifier:${nullifier}`,
    calldataKey: `${prefix}:calldata:${calldataHash}`,
    nowEpochSeconds: input.nowEpochSeconds
  };
}

async function readRelayIdempotencyRecord(
  store: RelayIdempotencyStore,
  key: string
): Promise<RelayIdempotencyRecord | null> {
  const raw = await store.get(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RelayIdempotencyRecord;
    if (!isRelayIdempotencyRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeRelayIdempotencyRecord(
  store: RelayIdempotencyStore,
  prepared: RelayIdempotencyPrepared,
  record: RelayIdempotencyRecord
): Promise<void> {
  const serialized = JSON.stringify(record);
  await Promise.all([
    store.put(prepared.nullifierKey, serialized, { expirationTtl: RELAY_IDEMPOTENCY_TTL_SECONDS }),
    store.put(prepared.calldataKey, serialized, { expirationTtl: RELAY_IDEMPOTENCY_TTL_SECONDS })
  ]);
}

function asSubmitted(record: RelayIdempotencyRecord | null): (RelayIdempotencyRecord & { txHash: HexString }) | null {
  if (record?.status === "submitted" && isHex(record.txHash)) {
    return record as RelayIdempotencyRecord & { txHash: HexString };
  }
  return null;
}

function isRelayIdempotencyRecord(value: RelayIdempotencyRecord): value is RelayIdempotencyRecord {
  return (
    (value.status === "pending" || value.status === "submitted") &&
    Number.isSafeInteger(value.chainId) &&
    isHex(value.pool) &&
    isHex(value.nullifier) &&
    isHex(value.calldataHash) &&
    Number.isSafeInteger(value.updatedAtEpochSeconds) &&
    (value.txHash === undefined || isHex(value.txHash))
  );
}

function isHex(value: unknown): value is HexString {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}
