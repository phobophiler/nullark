import { describe, expect, it } from "vitest";
import {
  canUseHostedIdentityService,
  checkAndRecordRelayRateLimit,
  getHostedServiceLimit,
  type RelayRateLimitStore
} from "./rateLimit.js";

describe("hosted identity-adjacent service rate limits", () => {
  it("allows local identity creation without server approval", () => {
    expect(canUseHostedIdentityService({ service: "local-identity-create", requestsInWindow: 1 })).toBe(true);
    expect(getHostedServiceLimit("local-identity-create")).toMatchObject({ category: "identity", localOnly: true });
  });

  it("rate limits identity handle publication separately from directory lookup", () => {
    expect(canUseHostedIdentityService({ service: "handle-publication", requestsInWindow: 21 })).toBe(false);
    expect(canUseHostedIdentityService({ service: "directory-lookup", requestsInWindow: 21 })).toBe(true);
    expect(getHostedServiceLimit("directory-lookup").category).toBe("directory");
  });

  it("uses separate sync backup and relay limits", () => {
    expect(canUseHostedIdentityService({ service: "sync", requestsInWindow: 61 })).toBe(false);
    expect(canUseHostedIdentityService({ service: "backup-storage", requestsInWindow: 11 })).toBe(false);
    expect(canUseHostedIdentityService({ service: "relay", requestsInWindow: 31 })).toBe(false);

    expect(canUseHostedIdentityService({ service: "sync", requestsInWindow: 60 })).toBe(true);
    expect(canUseHostedIdentityService({ service: "backup-storage", requestsInWindow: 10 })).toBe(true);
    expect(canUseHostedIdentityService({ service: "relay", requestsInWindow: 30 })).toBe(true);
  });
});

describe("relay request rate limits", () => {
  it("enforces per-IP destination nullifier and global buckets", async () => {
    const store = memoryStore();
    const base = baseInput(store);

    await expect(checkAndRecordRelayRateLimit(base)).resolves.toEqual({ allowed: true, exceeded: [] });
    await expect(checkAndRecordRelayRateLimit(base)).resolves.toEqual({ allowed: true, exceeded: [] });
    await expect(checkAndRecordRelayRateLimit(base)).resolves.toEqual({
      allowed: false,
      exceeded: ["perIp", "perDestination", "perNullifier"]
    });
  });

  it("separates rate-limit windows", async () => {
    const store = memoryStore();
    await expect(checkAndRecordRelayRateLimit(baseInput(store, { nowEpochSeconds: 120 }))).resolves.toMatchObject({
      allowed: true
    });
    await expect(checkAndRecordRelayRateLimit(baseInput(store, { nowEpochSeconds: 180 }))).resolves.toMatchObject({
      allowed: true
    });
  });

  it("rejects invalid rate-limit config", async () => {
    await expect(
      checkAndRecordRelayRateLimit(baseInput(memoryStore(), { config: { ...defaultConfig, perIp: 0 } }))
    ).rejects.toThrow("relay rate limit perIp must be positive");
  });
});

const defaultConfig = {
  windowSeconds: 60,
  perIp: 2,
  perDestination: 2,
  perNullifier: 2,
  global: 10
};

function baseInput(
  store: RelayRateLimitStore,
  overrides: Partial<Parameters<typeof checkAndRecordRelayRateLimit>[0]> = {}
): Parameters<typeof checkAndRecordRelayRateLimit>[0] {
  return {
    store,
    chainId: 4326,
    pool: "0xce4D91A6D10AAfAB3e420e3764C139244057C8E1",
    ip: "203.0.113.8",
    destination: "0x4429b0e7eea175b3b4726feaaaeaf69271fd46ce",
    nullifier: `0x${"01".repeat(32)}`,
    nowEpochSeconds: 1_800_000_000,
    config: defaultConfig,
    ...overrides
  };
}

function memoryStore(): RelayRateLimitStore {
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
