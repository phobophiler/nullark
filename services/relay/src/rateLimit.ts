export type HostedService =
  | "local-identity-create"
  | "handle-publication"
  | "directory-lookup"
  | "sync"
  | "backup-storage"
  | "relay";

export type HostedServiceRequest = {
  service: HostedService;
  requestsInWindow: number;
};

export type HostedServiceLimit = {
  category: "identity" | "directory" | "sync" | "backup" | "relay";
  maxRequestsPerWindow: number;
  localOnly?: boolean;
};

export type RelayRateLimitStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type RelayRateLimitConfig = {
  windowSeconds: number;
  perIp: number;
  perDestination: number;
  perNullifier: number;
  global: number;
};

export type RelayRateLimitInput = {
  store: RelayRateLimitStore;
  chainId: number;
  pool: `0x${string}`;
  ip: string;
  destination: `0x${string}`;
  nullifier: `0x${string}`;
  nowEpochSeconds: number;
  config: RelayRateLimitConfig;
};

export type RelayRateLimitDecision = {
  allowed: boolean;
  exceeded: string[];
};

export const HOSTED_SERVICE_LIMITS: Record<HostedService, HostedServiceLimit> = {
  "local-identity-create": {
    category: "identity",
    maxRequestsPerWindow: 0,
    localOnly: true
  },
  "handle-publication": {
    category: "identity",
    maxRequestsPerWindow: 20
  },
  "directory-lookup": {
    category: "directory",
    maxRequestsPerWindow: 120
  },
  sync: {
    category: "sync",
    maxRequestsPerWindow: 60
  },
  "backup-storage": {
    category: "backup",
    maxRequestsPerWindow: 10
  },
  relay: {
    category: "relay",
    maxRequestsPerWindow: 30
  }
};

export function canUseHostedIdentityService(request: HostedServiceRequest): boolean {
  const limit = HOSTED_SERVICE_LIMITS[request.service];
  if (limit.localOnly) {
    return true;
  }

  return request.requestsInWindow <= limit.maxRequestsPerWindow;
}

export function getHostedServiceLimit(service: HostedService): HostedServiceLimit {
  return HOSTED_SERVICE_LIMITS[service];
}

export async function checkAndRecordRelayRateLimit(input: RelayRateLimitInput): Promise<RelayRateLimitDecision> {
  validateRelayRateLimitConfig(input.config);
  const bucket = Math.floor(input.nowEpochSeconds / input.config.windowSeconds);
  const prefix = `relay-rate:${input.chainId}:${input.pool.toLowerCase()}:${bucket}`;
  const checks = [
    { label: "perIp", key: `${prefix}:ip:${normalizeKeyPart(input.ip)}`, limit: input.config.perIp },
    {
      label: "perDestination",
      key: `${prefix}:destination:${input.destination.toLowerCase()}`,
      limit: input.config.perDestination
    },
    {
      label: "perNullifier",
      key: `${prefix}:nullifier:${input.nullifier.toLowerCase()}`,
      limit: input.config.perNullifier
    },
    { label: "global", key: `${prefix}:global`, limit: input.config.global }
  ];

  const currentCounts = await Promise.all(checks.map((check) => readCount(input.store, check.key)));
  const exceeded = checks
    .filter((check, index) => (currentCounts[index] ?? 0) + 1 > check.limit)
    .map((check) => check.label);

  if (exceeded.length !== 0) {
    return { allowed: false, exceeded };
  }

  await Promise.all(
    checks.map((check, index) =>
      input.store.put(check.key, String((currentCounts[index] ?? 0) + 1), {
        expirationTtl: input.config.windowSeconds * 2
      })
    )
  );

  return { allowed: true, exceeded: [] };
}

export function validateRelayRateLimitConfig(config: RelayRateLimitConfig): void {
  for (const key of ["windowSeconds", "perIp", "perDestination", "perNullifier", "global"] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) {
      throw new Error(`relay rate limit ${key} must be positive`);
    }
  }
}

async function readCount(store: RelayRateLimitStore, key: string): Promise<number> {
  const raw = await store.get(key);
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:._-]/g, "_").slice(0, 128) || "unknown";
}
