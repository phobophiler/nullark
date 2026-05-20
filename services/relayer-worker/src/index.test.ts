import { PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR } from "@nullark/core";
import { encodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import {
  MAINNET_WITHDRAWAL_RELAYER_SELECTORS,
  TESTNET_WITHDRAWAL_RELAYER_SELECTORS,
  WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR,
  type HexString
} from "../../relay/src/broadcaster.js";
import {
  computeStageBContractBoundEncryptedNoteHash,
  computeStageBProofContextHash,
  computeStageBRelayerPolicyHash,
  computeStageCWithdrawChangeNoteHashes,
  type StageBRelayerPolicy
} from "../../relay/src/withdrawalCalldata.js";
import {
  assertWithdrawalNullifierUnspent,
  assertRelayRateLimit,
  assertRelayerSignerBinding,
  buildMainnetRelayPolicy,
  buildRelayRuntime,
  buildTestnetRelayPolicy,
  normalizeRelayRequestForTest,
  relayIdempotencyResponse,
  resolveRelayIdempotencyStore,
  isRelayEndpointPath,
  REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS,
  resolveRelayNonceQueue,
  resolveRelayRateLimitStore
} from "./index.js";

const configuredPool = "0x1111111111111111111111111111111111111111";
const destination = "0x4429b0e7eea175b3b4726feaaaeaf69271fd46ce" as const;
const nullifier = `0x${"01".repeat(32)}` as const;
const spentCommitment = `0x${"02".repeat(32)}` as const;
const root = `0x${"03".repeat(32)}` as const;
const relayer = "0x9999999999999999999999999999999999999999" as const;
const zeroAddress = "0x0000000000000000000000000000000000000000" as const;
const now = Math.floor(Date.now() / 1000);
const grossAmount = 5_000_000_000_000_000n;
const expectedFee = (grossAmount * 33n) / 10_000n;
const expectedNetAmount = grossAmount - expectedFee;
const partialExitNoteAmount = 10_000_000_000_000_000n;
const changeAmount = partialExitNoteAmount - grossAmount;
const changeCommitment = `0x${"04".repeat(32)}` as const;
const encryptedChangeNote = "0xabcd" as const;

const withdrawBoundedParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" }
] as const;

const withdrawStageBRelayerPolicyParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  {
    type: "tuple",
    components: [
      { name: "relayer", type: "address" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" },
      { name: "deadlineOrZero", type: "uint256" }
    ]
  }
] as const;

const stageCWithdrawBoundedParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "uint256" },
  { type: "uint256" }
] as const;

describe("relayer worker policy", () => {
  it("allowlists the configured pool instead of the baked-in testnet default", () => {
    const policy = buildTestnetRelayPolicy(configuredPool);

    expect(policy.allowedContracts).toEqual([configuredPool]);
    expect(policy.allowedFunctionSelectors).toEqual([
      ...TESTNET_WITHDRAWAL_RELAYER_SELECTORS,
      PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR
    ]);
  });

  it("keeps mainnet policy on the current private-change withdraw selector only", () => {
    const policy = buildMainnetRelayPolicy(configuredPool);

    expect(policy.allowedChainIds).toEqual([4326]);
    expect(policy.allowMegaEthMainnet).toBe(true);
    expect(policy.allowedContracts).toEqual([configuredPool]);
    expect(policy.allowedFunctionSelectors).toEqual([...MAINNET_WITHDRAWAL_RELAYER_SELECTORS]);
    expect(policy.allowedFunctionSelectors).not.toContain(WITHDRAW_SELECTOR);
    expect(policy.allowedFunctionSelectors).not.toContain(WITHDRAW_BOUNDED_SELECTOR);
    expect(policy.allowedFunctionSelectors).not.toContain(STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR);
    expect(policy.allowedFunctionSelectors).not.toContain(PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR);
    expect(policy.allowedFunctionSelectors).toContain(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
  });

  it("accepts Stage C unified withdraw partial-exit calldata in testnet mode", () => {
    const runtime = buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-testnet", SHIELDED_POOL_ADDRESS: configuredPool });
    const deadline = now + 30;

    expect(runtime.policy.allowedFunctionSelectors).toContain(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 6343,
        to: configuredPool,
        value: "0",
        data: encodeStageCWithdrawCalldata({
          pool: configuredPool,
          chainId: 6343,
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );

    expect(normalized.withdrawal.selector).toBe(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
    expect(normalized.withdrawal.hasChangeNote).toBe(true);
    expect(normalized.withdrawal.encryptedChangeNote).toBe(encryptedChangeNote);
  });

  it("allows Stage C unified withdraw signing in mainnet mode only after explicit runtime approval", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;

    expect(runtime.policy.allowedFunctionSelectors).toContain(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 4326,
        to: configuredPool,
        value: "0",
        data: encodeStageCWithdrawCalldata({
          pool: configuredPool,
          chainId: 4326,
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );

    expect(normalized.withdrawal.selector).toBe(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
  });

  it("accepts Stage C unified full-exit calldata in mainnet mode", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;

    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 4326,
        to: configuredPool,
        value: "0",
        data: encodeStageCFullExitWithdrawCalldata({
          pool: configuredPool,
          chainId: 4326,
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );

    expect(normalized.withdrawal.selector).toBe(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
    expect(normalized.withdrawal.encryptedChangeNote).toBe("0x");
  });

  it("requires explicit approval and pool configuration before mainnet runtime can be built", () => {
    expect(() => buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-mainnet" })).toThrow(
      "mainnet relayer requires MAINNET_RELAYER_APPROVED=true"
    );
    expect(() => buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-mainnet", MAINNET_RELAYER_APPROVED: "true" })).toThrow(
      "mainnet relayer requires explicit SHIELDED_POOL_ADDRESS"
    );

    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });

    expect(runtime).toMatchObject({
      environment: "megaeth-mainnet",
      chainId: 4326,
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      pool: configuredPool
    });
    expect(runtime.policy.allowedFunctionSelectors).toEqual([
      ...MAINNET_WITHDRAWAL_RELAYER_SELECTORS
    ]);
  });

  it("refuses to build mainnet runtime for the legacy ShieldedPoolDepth20 address", () => {
    expect(() =>
      buildRelayRuntime({
        RELAYER_ENVIRONMENT: "megaeth-mainnet",
        MAINNET_RELAYER_APPROVED: "true",
        SHIELDED_POOL_ADDRESS: "0x54af9d54b4edD062daD5581670E9E5f73048c87b"
      })
    ).toThrow("mainnet relayer refuses legacy ShieldedPoolDepth20 pool address");
  });

  it("rejects stale Stage B withdrawal calldata in mainnet mode even if runtime approval is enabled", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;

    expect(() =>
      normalizeRelayRequestForTest(
        {
          chainId: 4326,
          to: configuredPool,
          value: "0",
          data: encodeStageBWithdrawCalldata({ pool: configuredPool, chainId: 4326, deadlineOrZero: BigInt(deadline) }),
          deadlineEpochSeconds: deadline
        },
        runtime,
        relayer
      )
    ).toThrow("function selector is not allowlisted");
  });

  it("rejects withdrawal calldata that is not bound to the configured relayer pool", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;

    expect(() =>
      normalizeRelayRequestForTest(
        {
          chainId: 4326,
          to: configuredPool,
          value: "0",
          data: encodeStageCWithdrawCalldata({
            pool: "0x2222222222222222222222222222222222222222",
            chainId: 4326,
            relayerPolicy: stageCContractBoundedRelayerPolicy()
          }),
          deadlineEpochSeconds: deadline
        },
        runtime
      )
    ).toThrow("withdrawal proof pool does not match relayer pool");
  });

  it("surfaces the withdrawal nullifier for on-chain replay prechecks", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;

    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 4326,
        to: configuredPool,
        value: "0",
        data: encodeStageCWithdrawCalldata({
          pool: configuredPool,
          chainId: 4326,
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );

    expect(normalized.withdrawal.nullifier).toBe(nullifier);
  });

  it("normalizes Stage B relayer-policy calldata only for the signing relayer", () => {
    const runtime = buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-testnet", SHIELDED_POOL_ADDRESS: configuredPool });
    const deadline = now + 30;
    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 6343,
        to: configuredPool,
        value: "0",
        data: encodeStageBWithdrawCalldata({ pool: configuredPool, chainId: 6343, deadlineOrZero: BigInt(deadline) }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );

    expect(normalized.withdrawal.selector).toBe(PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR);
    expect(normalized.withdrawal.relayerPolicy?.relayer).toBe(relayer);

    expect(() =>
      normalizeRelayRequestForTest(
        {
          chainId: 6343,
          to: configuredPool,
          value: "0",
          data: encodeStageBWithdrawCalldata({ pool: configuredPool, chainId: 6343, deadlineOrZero: BigInt(deadline) }),
          deadlineEpochSeconds: deadline
        },
        runtime,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toThrow("Proof-bound withdrawal relayer policy does not match signing relayer");
  });

  it("rejects already-spent nullifiers before gas estimation and signing", async () => {
    await expect(
      assertWithdrawalNullifierUnspent({
        publicClient: {
          async readContract() {
            return true;
          }
        },
        pool: configuredPool,
        nullifier
      })
    ).rejects.toThrow("withdrawal nullifier already spent on-chain");

    await expect(
      assertWithdrawalNullifierUnspent({
        publicClient: {
          async readContract() {
            return false;
          }
        },
        pool: configuredPool,
        nullifier
      })
    ).resolves.toBeUndefined();
  });

  it("requires a durable idempotency binding for mainnet mode", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });

    expect(() => resolveRelayIdempotencyStore({}, runtime)).toThrow(
      "mainnet relayer requires RELAYER_IDEMPOTENCY_KV binding"
    );

    const store = {
      async get() {
        return null;
      },
      async put() {
        return undefined;
      }
    };
    expect(resolveRelayIdempotencyStore({ RELAYER_IDEMPOTENCY_KV: store }, runtime)).toBe(store);
  });

  it("requires a durable rate-limit binding for mainnet mode", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const store = memoryStore();

    expect(() => resolveRelayRateLimitStore({}, runtime)).toThrow("mainnet relayer requires RELAYER_RATE_LIMIT_KV binding");
    expect(resolveRelayRateLimitStore({ RELAYER_RATE_LIMIT_KV: store }, runtime)).toBe(store);
  });

  it("requires a Durable Object nonce queue binding for mainnet mode", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const namespace = {
      idFromName(name: string) {
        return name;
      },
      get(id: unknown) {
        return {
          async fetch() {
            return new Response(String(id));
          }
        };
      }
    };

    expect(() => resolveRelayNonceQueue({}, runtime)).toThrow(
      "mainnet relayer requires RELAYER_NONCE_QUEUE Durable Object binding"
    );
    expect(resolveRelayNonceQueue({ RELAYER_NONCE_QUEUE: namespace }, runtime)).toBe(namespace);
  });

  it("does not require durable relay bindings in testnet mode", () => {
    const runtime = buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-testnet" });

    expect(resolveRelayIdempotencyStore({}, runtime)).toBeUndefined();
    expect(resolveRelayRateLimitStore({}, runtime)).toBeUndefined();
    expect(resolveRelayNonceQueue({}, runtime)).toBeUndefined();
  });

  it("requires the configured mainnet relayer address to match the signing key address", () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });

    expect(() => assertRelayerSignerBinding(runtime, {}, relayer)).toThrow(
      "mainnet relayer requires WITHDRAWAL_RELAYER_ADDRESS"
    );
    expect(() => assertRelayerSignerBinding(runtime, { WITHDRAWAL_RELAYER_ADDRESS: relayer }, relayer)).toThrow(
      "mainnet relayer address must match approved withdrawal relayer"
    );
    expect(() =>
      assertRelayerSignerBinding(
        runtime,
        { WITHDRAWAL_RELAYER_ADDRESS: REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS.toUpperCase() as HexString },
        relayer
      )
    ).toThrow("mainnet relayer signer does not match WITHDRAWAL_RELAYER_ADDRESS");
    expect(() =>
      assertRelayerSignerBinding(
        runtime,
        { WITHDRAWAL_RELAYER_ADDRESS: REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS },
        REQUIRED_MAINNET_WITHDRAWAL_RELAYER_ADDRESS
      )
    ).not.toThrow();
  });

  it("does not require a configured relayer address in testnet mode", () => {
    const runtime = buildRelayRuntime({ RELAYER_ENVIRONMENT: "megaeth-testnet" });

    expect(() => assertRelayerSignerBinding(runtime, {}, relayer)).not.toThrow();
  });

  it("rejects the legacy relay route on mainnet while keeping it for non-mainnet mode", () => {
    expect(isRelayEndpointPath("/transaction", { environment: "megaeth-mainnet" })).toBe(true);
    expect(isRelayEndpointPath("/relay-transaction", { environment: "megaeth-mainnet" })).toBe(false);
    expect(isRelayEndpointPath("/relay-transaction", { environment: "megaeth-testnet" })).toBe(true);
    expect(isRelayEndpointPath("/")).toBe(false);
  });

  it("includes the signing relayer on idempotent replay responses", async () => {
    const txHash = `0x${"06".repeat(32)}` as const;
    const response = relayIdempotencyResponse(
      {
        kind: "submitted",
        record: {
          status: "submitted",
          chainId: 4326,
          pool: configuredPool,
          nullifier,
          calldataHash: `0x${"05".repeat(32)}`,
          txHash,
          updatedAtEpochSeconds: now
        }
      },
      relayer
    );

    expect(response).toBeDefined();
    await expect(response?.json()).resolves.toMatchObject({
      ok: true,
      scope: "deployed-withdrawal-relayer",
      txHash,
      relayer,
      idempotentReplay: true
    });
  });

  it("applies relay rate limits from request IP destination and nullifier", async () => {
    const runtime = buildRelayRuntime({
      RELAYER_ENVIRONMENT: "megaeth-mainnet",
      MAINNET_RELAYER_APPROVED: "true",
      SHIELDED_POOL_ADDRESS: configuredPool
    });
    const deadline = now + 30;
    const normalized = normalizeRelayRequestForTest(
      {
        chainId: 4326,
        to: configuredPool,
        value: "0",
        data: encodeStageCWithdrawCalldata({
          pool: configuredPool,
          chainId: 4326,
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        }),
        deadlineEpochSeconds: deadline
      },
      runtime,
      relayer
    );
    const request = new Request("https://relayer.example/relay-transaction", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.9" }
    });
    const store = memoryStore();

    await expect(assertRelayRateLimit({ store, request, runtime, normalized })).resolves.toBeUndefined();
  });
});

function memoryStore() {
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

function encodeBoundedWithdrawCalldata(input: { pool: HexString }): HexString {
  return `${WITHDRAW_BOUNDED_SELECTOR}${encodeAbiParameters(withdrawBoundedParameters, [
    "0x1234",
    [
      root,
      nullifier,
      `0x${"00".repeat(32)}`,
      addressToBytes32(destination),
      toBytes32(grossAmount),
      toBytes32(expectedFee),
      toBytes32(4326n),
      addressToBytes32(input.pool),
      spentCommitment,
      toBytes32(grossAmount)
    ],
    nullifier,
    destination,
    grossAmount,
    expectedNetAmount,
    expectedFee
  ]).slice(2)}` as HexString;
}

function encodeStageBWithdrawCalldata(input: {
  pool: HexString;
  chainId: number;
  deadlineOrZero: bigint;
}): HexString {
  const policy = stageBRelayerPolicy({ deadlineOrZero: input.deadlineOrZero });
  return `${PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR}${encodeAbiParameters(withdrawStageBRelayerPolicyParameters, [
    "0x1234",
    stageBPublicInputs({ pool: input.pool, chainId: input.chainId, relayerPolicy: policy }),
    nullifier,
    destination,
    grossAmount,
    policy
  ]).slice(2)}` as HexString;
}

function encodeStageCWithdrawCalldata(input: {
  pool: HexString;
  chainId: number;
  relayerPolicy: StageBRelayerPolicy;
}): HexString {
  return `${STAGE_C_WITHDRAW_BOUNDED_SELECTOR}${encodeAbiParameters(stageCWithdrawBoundedParameters, [
    "0x1234",
    stageCPublicInputs(input),
    nullifier,
    destination,
    grossAmount,
    encryptedChangeNote,
    expectedNetAmount,
    expectedFee
  ]).slice(2)}` as HexString;
}

function encodeStageCFullExitWithdrawCalldata(input: {
  pool: HexString;
  chainId: number;
  relayerPolicy: StageBRelayerPolicy;
}): HexString {
  return `${STAGE_C_WITHDRAW_BOUNDED_SELECTOR}${encodeAbiParameters(stageCWithdrawBoundedParameters, [
    "0x1234",
    stageCFullExitPublicInputs(input),
    nullifier,
    destination,
    grossAmount,
    "0x",
    expectedNetAmount,
    expectedFee
  ]).slice(2)}` as HexString;
}

function stageBPublicInputs(input: {
  pool: HexString;
  chainId: number;
  relayerPolicy: StageBRelayerPolicy;
}): HexString[] {
  const relayerPolicyHash = computeStageBRelayerPolicyHash(input.relayerPolicy);
  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
    nullifier,
    noteAmount: grossAmount
  });
  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
    root,
    nullifier,
    destination,
    grossAmount,
    fee: expectedFee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: input.relayerPolicy.deadlineOrZero
  });

  return [
    root,
    nullifier,
    `0x${"00".repeat(32)}`,
    addressToBytes32(destination),
    toBytes32(grossAmount),
    toBytes32(expectedFee),
    toBytes32(BigInt(input.chainId)),
    addressToBytes32(input.pool),
    spentCommitment,
    toBytes32(grossAmount),
    proofContextHash,
    encryptedNoteHash
  ] as HexString[];
}

function stageCFullExitPublicInputs(input: {
  pool: HexString;
  chainId: number;
  relayerPolicy: StageBRelayerPolicy;
}): HexString[] {
  const relayerPolicyHash = computeStageBRelayerPolicyHash(input.relayerPolicy);
  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    nullifier,
    noteAmount: grossAmount
  });
  const proofContextHash = computeStageBProofContextHash({
    chainId: input.chainId,
    pool: input.pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root,
    nullifier,
    destination,
    grossAmount,
    fee: expectedFee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: input.relayerPolicy.deadlineOrZero
  });

  return [
    root,
    nullifier,
    `0x${"00".repeat(32)}`,
    addressToBytes32(destination),
    toBytes32(grossAmount),
    toBytes32(expectedFee),
    toBytes32(BigInt(input.chainId)),
    addressToBytes32(input.pool),
    spentCommitment,
    toBytes32(grossAmount),
    proofContextHash,
    encryptedNoteHash
  ] as HexString[];
}

function stageCPublicInputs(input: {
  pool: HexString;
  chainId: number;
  relayerPolicy: StageBRelayerPolicy;
}): HexString[] {
  const hashes = computeStageCWithdrawChangeNoteHashes({
    chainId: input.chainId,
    pool: input.pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root,
    nullifier,
    destination,
    grossAmount,
    fee: expectedFee,
    noteAmount: partialExitNoteAmount,
    changeCommitment,
    changeAmount,
    encryptedChangeNote,
    relayerPolicy: input.relayerPolicy
  });

  return [
    root,
    nullifier,
    changeCommitment,
    addressToBytes32(destination),
    toBytes32(grossAmount),
    toBytes32(expectedFee),
    toBytes32(BigInt(input.chainId)),
    addressToBytes32(input.pool),
    spentCommitment,
    toBytes32(partialExitNoteAmount),
    hashes.proofContextHash,
    hashes.encryptedNoteHash
  ] as HexString[];
}

function stageBRelayerPolicy(overrides: Partial<StageBRelayerPolicy> = {}): StageBRelayerPolicy {
  return {
    relayer: overrides.relayer ?? relayer,
    minNetAmount: overrides.minNetAmount ?? expectedNetAmount,
    maxFeeAmount: overrides.maxFeeAmount ?? expectedFee,
    deadlineOrZero: overrides.deadlineOrZero ?? BigInt(now + 30)
  };
}

function stageCContractBoundedRelayerPolicy(overrides: Partial<StageBRelayerPolicy> = {}): StageBRelayerPolicy {
  return {
    relayer: overrides.relayer ?? zeroAddress,
    minNetAmount: overrides.minNetAmount ?? expectedNetAmount,
    maxFeeAmount: overrides.maxFeeAmount ?? expectedFee,
    deadlineOrZero: overrides.deadlineOrZero ?? 0n
  };
}

function addressToBytes32(address: HexString): HexString {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as HexString;
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}` as HexString;
}
