import { PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR } from "@nullark/core";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  prepareRelayIdempotency,
  recordRelayPending,
  recordRelaySubmitted,
  type RelayIdempotencyDecision,
  type RelayIdempotencyPrepared,
  type RelayIdempotencyStore
} from "../../relay/src/idempotency.js";
import {
  checkAndRecordRelayRateLimit,
  type RelayRateLimitConfig,
  type RelayRateLimitStore
} from "../../relay/src/rateLimit.js";
import {
  MAINNET_WITHDRAWAL_RELAYER_SELECTORS,
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID,
  TESTNET_WITHDRAWAL_RELAYER_SELECTORS,
  validateRelayBroadcastRequest,
  type RelayBroadcastPolicy,
  type HexString
} from "../../relay/src/broadcaster.js";
import { validateWithdrawalRelayCalldata } from "../../relay/src/withdrawalCalldata.js";
import type { WithdrawalRelayCall } from "../../relay/src/withdrawalCalldata.js";

type Env = {
  WITHDRAWAL_RELAYER_PRIVATE_KEY: HexString;
  WITHDRAWAL_RELAYER_ADDRESS?: HexString;
  RELAYER_ENVIRONMENT?: "megaeth-testnet" | "megaeth-mainnet";
  MEGAETH_TESTNET_RPC_URL?: string;
  MEGAETH_MAINNET_RPC_URL?: string;
  SHIELDED_POOL_ADDRESS?: HexString;
  MAINNET_RELAYER_APPROVED?: string;
  RELAYER_IDEMPOTENCY_KV?: RelayIdempotencyStore;
  RELAYER_RATE_LIMIT_KV?: RelayRateLimitStore;
  RELAYER_NONCE_QUEUE?: RelayDurableObjectNamespace;
};

type RelayDurableObjectNamespace = {
  idFromName(name: string): RelayDurableObjectId;
  get(id: RelayDurableObjectId): RelayDurableObjectStub;
};

type RelayDurableObjectId = unknown;

type RelayDurableObjectStub = {
  fetch(request: Request): Promise<Response>;
};

type RelayRequestBody = {
  chainId?: number;
  to?: string;
  value?: string;
  data?: string;
  deadlineEpochSeconds?: number;
};

type NormalizedRelayRequest = {
  chainId: number;
  to: HexString;
  data: HexString;
  valueWei: bigint;
  deadlineEpochSeconds: number;
  withdrawal: WithdrawalRelayCall;
};

const MEGAETH_TESTNET_RPC_URL = "https://carrot.megaeth.com/rpc";
const MEGAETH_MAINNET_RPC_URL = "https://mainnet.megaeth.com/rpc";
const SHIELDED_POOL_ADDRESS = "0xce4D91A6D10AAfAB3e420e3764C139244057C8E1";
export const REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS = "0x4246e9271D82eFDfEE1566A98dF2858B52f88d77" as const;
const FORBIDDEN_MAINNET_SHIELDED_POOL_ADDRESSES = new Set(["0x54af9d54b4edd062dad5581670e9e5f73048c87b"]);
const MAX_GAS_LIMIT = 20_000_000n;
const NONCE_QUEUE_HEADER = "x-relayer-nonce-queue";
const RELAY_RATE_LIMIT_CONFIG: RelayRateLimitConfig = {
  windowSeconds: 60,
  perIp: 30,
  perDestination: 10,
  perNullifier: 3,
  global: 300
};
const NULLIFIERS_ABI = [
  {
    type: "function",
    name: "nullifiers",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;
const megaEthNativeCurrency = { name: "MegaETH Ether", symbol: "ETH", decimals: 18 } as const;
const megaEthChain = (runtime: RelayRuntime) => ({
  id: runtime.chainId,
  name: runtime.environment === "megaeth-mainnet" ? "MegaETH Mainnet" : "MegaETH Testnet",
  nativeCurrency: megaEthNativeCurrency,
  rpcUrls: { default: { http: [runtime.rpcUrl] } }
}) as const;

type RelayRuntime = {
  environment: "megaeth-testnet" | "megaeth-mainnet";
  chainId: typeof MEGAETH_TESTNET_CHAIN_ID | typeof MEGAETH_MAINNET_CHAIN_ID;
  rpcUrl: string;
  pool: HexString;
  policy: RelayBroadcastPolicy;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const queueResponse = await queueMainnetRelayRequestIfNeeded(request, env);
      if (queueResponse) {
        return queueResponse;
      }
      return handleRelayRequest(request, env);
    } catch (error) {
      return json({ ok: false, error: publicRelayErrorMessage(error) }, 400);
    }
  }
};

export class RelayerNonceQueue {
  private readonly env: Env;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(_state: unknown, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const run = this.tail.then(() => handleRelayRequest(request, this.env));
    this.tail = run.catch(() => undefined);
    return run;
  }
}

async function handleRelayRequest(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "not found" }, 404);
    }

    try {
      const runtime = buildRelayRuntime(env);
      if (!isRelayEndpointPath(new URL(request.url).pathname, runtime)) {
        return json({ ok: false, error: "not found" }, 404);
      }
      const body = (await request.json()) as RelayRequestBody;
      const account = privateKeyToAccount(env.WITHDRAWAL_RELAYER_PRIVATE_KEY);
      assertRelayerSignerBinding(runtime, env, account.address as HexString);
      const normalized = normalizeRelayRequest(body, runtime, account.address as HexString);
      const rateLimitStore = resolveRelayRateLimitStore(env, runtime);
      if (rateLimitStore) {
        await assertRelayRateLimit({
          store: rateLimitStore,
          request,
          runtime,
          normalized
        });
      }
      const idempotencyStore = resolveRelayIdempotencyStore(env, runtime);
      const idempotency = idempotencyStore
        ? await prepareRelayIdempotency({
            store: idempotencyStore,
            chainId: normalized.chainId,
            pool: runtime.pool,
            nullifier: normalized.withdrawal.nullifier,
            calldata: normalized.data,
            nowEpochSeconds: Math.floor(Date.now() / 1000)
          })
        : undefined;
      const idempotencyResponse = relayIdempotencyResponse(idempotency, account.address as HexString);
      if (idempotencyResponse) {
        return idempotencyResponse;
      }
      const chain = megaEthChain(runtime);
      const publicClient = createPublicClient({ chain, transport: http(runtime.rpcUrl) });
      const chainId = await publicClient.getChainId();
      if (chainId !== runtime.chainId) {
        throw new Error(`Relayer expected ${runtime.environment} chain ${runtime.chainId}; got ${chainId}.`);
      }
      await assertWithdrawalNullifierUnspent({
        publicClient,
        pool: runtime.pool,
        nullifier: normalized.withdrawal.nullifier
      });

      const estimatedGas = await publicClient.estimateGas({
        account: account.address,
        to: normalized.to,
        value: 0n,
        data: normalized.data
      });
      const gas = estimatedGas + estimatedGas / 5n + 100_000n;
      validatePolicy({ ...normalized, gasLimit: gas }, runtime.policy);
      if (idempotencyStore && idempotency?.kind === "ready") {
        await recordRelayPending(idempotencyStore, idempotency.prepared);
      }

      const walletClient = createWalletClient({ account, chain, transport: http(runtime.rpcUrl) });
      const txHash = await walletClient.sendTransaction({
        to: normalized.to,
        value: 0n,
        data: normalized.data,
        gas
      });
      if (idempotencyStore && idempotency?.kind === "ready") {
        await recordRelaySubmitted(idempotencyStore, idempotency.prepared, txHash);
      }

      return json({
        ok: true,
        scope: "deployed-withdrawal-relayer",
        txHash,
        relayer: account.address
      });
    } catch (error) {
      return json({ ok: false, error: publicRelayErrorMessage(error) }, 400);
    }
}

function publicRelayErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "relay failed";
  }
  return error.message.replace(/0x[0-9a-fA-F]{64,}/g, "0x[redacted]");
}

async function queueMainnetRelayRequestIfNeeded(request: Request, env: Env): Promise<Response | undefined> {
  if (request.method === "OPTIONS" || request.headers.get(NONCE_QUEUE_HEADER) === "1") {
    return undefined;
  }
  if (request.method !== "POST") {
    return undefined;
  }

  const runtime = buildRelayRuntime(env);
  if (!isRelayEndpointPath(new URL(request.url).pathname, runtime)) {
    return undefined;
  }
  const account = privateKeyToAccount(env.WITHDRAWAL_RELAYER_PRIVATE_KEY);
  assertRelayerSignerBinding(runtime, env, account.address as HexString);
  const nonceQueue = resolveRelayNonceQueue(env, runtime);
  if (!nonceQueue) {
    return undefined;
  }

  const id = nonceQueue.idFromName(`relayer:${runtime.chainId}:${runtime.pool.toLowerCase()}`);
  const headers = new Headers(request.headers);
  headers.set(NONCE_QUEUE_HEADER, "1");
  return nonceQueue.get(id).fetch(new Request(request, { headers }));
}

export function isRelayEndpointPath(
  pathname: string,
  runtime?: Pick<RelayRuntime, "environment">
): boolean {
  if (pathname === "/transaction") {
    return true;
  }
  if (pathname !== "/relay-transaction") {
    return false;
  }
  return runtime?.environment !== "megaeth-mainnet";
}

export function normalizeRelayRequestForTest(body: RelayRequestBody, runtime: RelayRuntime, relayerAddress?: HexString) {
  return normalizeRelayRequest(body, runtime, relayerAddress);
}

function normalizeRelayRequest(
  body: RelayRequestBody,
  runtime: RelayRuntime,
  relayerAddress?: HexString
): NormalizedRelayRequest {
  const to = parseAddress(body.to, "to");
  const data = parseHex(body.data, "data");
  const valueWei = body.value === undefined ? 0n : BigInt(body.value);
  const deadlineEpochSeconds = body.deadlineEpochSeconds;
  if (!Number.isSafeInteger(deadlineEpochSeconds)) {
    throw new Error("relay request deadline must be a safe integer");
  }
  const deadline = deadlineEpochSeconds as number;
  const chainId = body.chainId;
  if (chainId !== runtime.chainId) {
    throw new Error(`relayer only supports ${runtime.environment}`);
  }

  const pool = runtime.pool;
  if (to.toLowerCase() !== pool.toLowerCase()) {
    throw new Error("relayer only submits transactions to the configured shielded pool");
  }
  if (valueWei !== 0n) {
    throw new Error("relayer refuses value-bearing transactions");
  }

  validatePolicy({ chainId, to, data, valueWei, gasLimit: 1n, deadlineEpochSeconds: deadline }, runtime.policy);
  const withdrawalInput: Parameters<typeof validateWithdrawalCall>[0] = {
    chainId,
    pool,
    data,
    deadlineEpochSeconds: deadline
  };
  if (relayerAddress !== undefined) {
    withdrawalInput.expectedRelayer = relayerAddress;
  }
  const withdrawal = validateWithdrawalCall(withdrawalInput);
  return { chainId, to, data, valueWei, deadlineEpochSeconds: deadline, withdrawal };
}

export function buildRelayRuntime(env: Pick<Env, "RELAYER_ENVIRONMENT" | "MEGAETH_TESTNET_RPC_URL" | "MEGAETH_MAINNET_RPC_URL" | "SHIELDED_POOL_ADDRESS" | "MAINNET_RELAYER_APPROVED">): RelayRuntime {
  const environment = env.RELAYER_ENVIRONMENT ?? "megaeth-testnet";
  const pool = getAddress(env.SHIELDED_POOL_ADDRESS ?? SHIELDED_POOL_ADDRESS) as HexString;
  if (environment === "megaeth-mainnet") {
    if (env.MAINNET_RELAYER_APPROVED !== "true") {
      throw new Error("mainnet relayer requires MAINNET_RELAYER_APPROVED=true");
    }
    if (!env.SHIELDED_POOL_ADDRESS) {
      throw new Error("mainnet relayer requires explicit SHIELDED_POOL_ADDRESS");
    }
    if (FORBIDDEN_MAINNET_SHIELDED_POOL_ADDRESSES.has(pool.toLowerCase())) {
      throw new Error("mainnet relayer refuses legacy ShieldedPoolDepth20 pool address");
    }
    return {
      environment,
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      rpcUrl: env.MEGAETH_MAINNET_RPC_URL ?? MEGAETH_MAINNET_RPC_URL,
      pool,
      policy: buildMainnetRelayPolicy(pool)
    };
  }

  return {
    environment: "megaeth-testnet",
    chainId: MEGAETH_TESTNET_CHAIN_ID,
    rpcUrl: env.MEGAETH_TESTNET_RPC_URL ?? MEGAETH_TESTNET_RPC_URL,
    pool,
    policy: buildTestnetRelayPolicy(pool)
  };
}

export function assertRelayerSignerBinding(
  runtime: Pick<RelayRuntime, "environment">,
  env: Pick<Env, "WITHDRAWAL_RELAYER_ADDRESS">,
  signerAddress: HexString
): void {
  if (runtime.environment !== "megaeth-mainnet") {
    return;
  }
  if (!env.WITHDRAWAL_RELAYER_ADDRESS) {
    throw new Error("mainnet relayer requires WITHDRAWAL_RELAYER_ADDRESS");
  }
  const expectedAddress = normalizeAddressForBinding(env.WITHDRAWAL_RELAYER_ADDRESS, "WITHDRAWAL_RELAYER_ADDRESS");
  const requiredAddress = normalizeAddressForBinding(
    REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS,
    "required mainnet withdrawal relayer address"
  );
  if (expectedAddress !== requiredAddress) {
    throw new Error("mainnet relayer address must match approved withdrawal relayer");
  }
  const actualAddress = normalizeAddressForBinding(signerAddress, "signing relayer address");
  if (actualAddress !== expectedAddress) {
    throw new Error("mainnet relayer signer does not match WITHDRAWAL_RELAYER_ADDRESS");
  }
}

export function resolveRelayIdempotencyStore(
  env: Pick<Env, "RELAYER_IDEMPOTENCY_KV">,
  runtime: Pick<RelayRuntime, "environment">
): RelayIdempotencyStore | undefined {
  if (env.RELAYER_IDEMPOTENCY_KV) {
    return env.RELAYER_IDEMPOTENCY_KV;
  }
  if (runtime.environment === "megaeth-mainnet") {
    throw new Error("mainnet relayer requires RELAYER_IDEMPOTENCY_KV binding");
  }
  return undefined;
}

export function resolveRelayRateLimitStore(
  env: Pick<Env, "RELAYER_RATE_LIMIT_KV">,
  runtime: Pick<RelayRuntime, "environment">
): RelayRateLimitStore | undefined {
  if (env.RELAYER_RATE_LIMIT_KV) {
    return env.RELAYER_RATE_LIMIT_KV;
  }
  if (runtime.environment === "megaeth-mainnet") {
    throw new Error("mainnet relayer requires RELAYER_RATE_LIMIT_KV binding");
  }
  return undefined;
}

export function resolveRelayNonceQueue(
  env: Pick<Env, "RELAYER_NONCE_QUEUE">,
  runtime: Pick<RelayRuntime, "environment">
): RelayDurableObjectNamespace | undefined {
  if (env.RELAYER_NONCE_QUEUE) {
    return env.RELAYER_NONCE_QUEUE;
  }
  if (runtime.environment === "megaeth-mainnet") {
    throw new Error("mainnet relayer requires RELAYER_NONCE_QUEUE Durable Object binding");
  }
  return undefined;
}

export function buildTestnetRelayPolicy(allowedPool: HexString): RelayBroadcastPolicy {
  return {
    allowedChainIds: [MEGAETH_TESTNET_CHAIN_ID],
    allowedContracts: [getAddress(allowedPool) as HexString],
    allowedFunctionSelectors: [...TESTNET_WITHDRAWAL_RELAYER_SELECTORS, PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR],
    maxValueWei: 0n,
    maxGasLimit: MAX_GAS_LIMIT,
    maxDeadlineSecondsFromNow: 120
  };
}

export function buildMainnetRelayPolicy(allowedPool: HexString): RelayBroadcastPolicy {
  return {
    allowedChainIds: [MEGAETH_MAINNET_CHAIN_ID],
    allowMegaEthMainnet: true,
    allowedContracts: [getAddress(allowedPool) as HexString],
    allowedFunctionSelectors: [...MAINNET_WITHDRAWAL_RELAYER_SELECTORS],
    maxValueWei: 0n,
    maxGasLimit: MAX_GAS_LIMIT,
    maxDeadlineSecondsFromNow: 120
  };
}

function validatePolicy(request: {
  chainId: number;
  to: HexString;
  data: HexString;
  valueWei: bigint;
  gasLimit: bigint;
  deadlineEpochSeconds: number;
}, policy: RelayBroadcastPolicy) {
  const decision = validateRelayBroadcastRequest(
    request,
    policy,
    Math.floor(Date.now() / 1000)
  );
  if (!decision.allowed) {
    throw new Error(decision.errors.join("; "));
  }
}

function validateWithdrawalCall(request: {
  chainId: number;
  pool: HexString;
  data: HexString;
  deadlineEpochSeconds?: number;
  expectedRelayer?: HexString;
  expectedRelayerPolicyHash?: HexString;
}): WithdrawalRelayCall {
  const decision = validateWithdrawalRelayCalldata(request);
  if (!decision.allowed || !decision.decoded) {
    throw new Error(decision.errors.join("; "));
  }
  return decision.decoded;
}

export async function assertWithdrawalNullifierUnspent(input: {
  publicClient: {
    readContract(args: {
      address: HexString;
      abi: typeof NULLIFIERS_ABI;
      functionName: "nullifiers";
      args: readonly [HexString];
    }): Promise<boolean>;
  };
  pool: HexString;
  nullifier: HexString;
}): Promise<void> {
  const alreadySpent = await input.publicClient.readContract({
    address: input.pool,
    abi: NULLIFIERS_ABI,
    functionName: "nullifiers",
    args: [input.nullifier]
  });
  if (alreadySpent) {
    throw new Error("withdrawal nullifier already spent on-chain");
  }
}

export async function assertRelayRateLimit(input: {
  store: RelayRateLimitStore;
  request: Request;
  runtime: Pick<RelayRuntime, "chainId" | "pool">;
  normalized: NormalizedRelayRequest;
}): Promise<void> {
  const decision = await checkAndRecordRelayRateLimit({
    store: input.store,
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    ip: getClientIp(input.request),
    destination: input.normalized.withdrawal.destination,
    nullifier: input.normalized.withdrawal.nullifier,
    nowEpochSeconds: Math.floor(Date.now() / 1000),
    config: RELAY_RATE_LIMIT_CONFIG
  });
  if (!decision.allowed) {
    throw new Error(`relay rate limit exceeded: ${decision.exceeded.join(", ")}`);
  }
}

export function relayIdempotencyResponse(
  decision: RelayIdempotencyDecision | undefined,
  relayerAddress: HexString
): Response | undefined {
  if (!decision) {
    return undefined;
  }
  if (decision.kind === "submitted") {
    return json({
      ok: true,
      scope: "deployed-withdrawal-relayer",
      txHash: decision.record.txHash,
      relayer: relayerAddress,
      idempotentReplay: true
    });
  }
  if (decision.kind === "pending") {
    return json({ ok: false, error: "relay request already pending for this nullifier" }, 409);
  }
  if (decision.kind === "conflict") {
    return json({ ok: false, error: decision.reason }, 409);
  }
  return undefined;
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

function parseAddress(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be an EVM address`);
  }
  return getAddress(value) as HexString;
}

function normalizeAddressForBinding(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/i.test(value)) {
    throw new Error(`${fieldName} must be an EVM address`);
  }
  return `0x${value.slice(2).toLowerCase()}` as HexString;
}

function parseHex(value: unknown, fieldName: string): HexString {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${fieldName} must be hex calldata`);
  }
  return value as HexString;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json"
    }
  });
}
