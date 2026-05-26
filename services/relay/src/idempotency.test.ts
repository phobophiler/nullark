import { describe, expect, it } from "vitest";
import {
  prepareRelayIdempotency,
  recordRelayPending,
  recordRelaySubmitted,
  type RelayIdempotencyStore
} from "./idempotency.js";
import type { HexString } from "./broadcaster.js";

const pool = "0xce4D91A6D10AAfAB3e420e3764C139244057C8E1" as const;
const nullifier = `0x${"01".repeat(32)}` as const;
const calldata = `0x${"12".repeat(64)}` as const;
const differentCalldata = `0x${"34".repeat(64)}` as const;
const txHash = `0x${"ab".repeat(32)}` as const;

describe("relay idempotency", () => {
  it("records pending requests by calldata and nullifier", async () => {
    const store = memoryStore();
    const decision = await prepareRelayIdempotency(baseInput(store));
    expect(decision.kind).toBe("ready");
    if (decision.kind !== "ready") {
      throw new Error("expected ready decision");
    }

    await recordRelayPending(store, decision.prepared);

    await expect(prepareRelayIdempotency(baseInput(store))).resolves.toMatchObject({ kind: "pending" });
  });

  it("returns submitted transaction hashes for duplicate calldata", async () => {
    const store = memoryStore();
    const decision = await prepareRelayIdempotency(baseInput(store));
    if (decision.kind !== "ready") {
      throw new Error("expected ready decision");
    }

    await recordRelaySubmitted(store, decision.prepared, txHash);

    await expect(prepareRelayIdempotency(baseInput(store))).resolves.toMatchObject({
      kind: "submitted",
      record: { txHash }
    });
  });

  it("rejects a different calldata payload for an already recorded nullifier", async () => {
    const store = memoryStore();
    const decision = await prepareRelayIdempotency(baseInput(store));
    if (decision.kind !== "ready") {
      throw new Error("expected ready decision");
    }
    await recordRelayPending(store, decision.prepared);

    await expect(prepareRelayIdempotency(baseInput(store, { calldata: differentCalldata }))).resolves.toMatchObject({
      kind: "conflict",
      reason: "withdrawal nullifier already has a different relay request recorded"
    });
  });
});

function baseInput(store: RelayIdempotencyStore, overrides: Partial<{ calldata: HexString }> = {}) {
  return {
    store,
    chainId: 4326,
    pool,
    nullifier,
    calldata: overrides.calldata ?? calldata,
    nowEpochSeconds: 1_800_000_000
  };
}

function memoryStore(): RelayIdempotencyStore {
  const values = new Map<string, string>();
  return {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    }
  };
}
