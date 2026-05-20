import {
  EXPECTED_WITHDRAW_VERIFIER_ADDRESS,
  EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH,
  MEGAETH_TESTNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID_HEX,
  MEGAETH_TESTNET_RPC_URL,
  MAINNET_SHIELDED_POOL_ADDRESS,
  SANDBOX_DEPLOYMENT_BLOCK_HEX,
  SANDBOX_MERKLE_TREE_DEPTH,
  SHIELDED_POOL_ADDRESS,
  type HexString
} from "./shieldedTransfersHelpers.js";

export const NULLARK_TESTNET_POOL_ADDRESS = "0xfd41bc6473c969d5284B4C01284bD4A50c176f4d" as const;
export const NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK_HEX = "0x12930a0" as const;
export const NULLARK_TESTNET_MERKLE_TREE_DEPTH = 20;
export const NULLARK_TESTNET_WITHDRAW_VERIFIER_ADDRESS = "0x1E2dE0CE5861E55F1159184F102Ad2a99C5bA46b" as const;
export const NULLARK_TESTNET_RELAYER_ENDPOINT =
  "https://shielded-withdrawal-relayer-testnet.drz-danii.workers.dev/transaction" as const;
export const NULLARK_MAINNET_RELAYER_ENDPOINT =
  "https://relayer.nullark.com/transaction" as const;

export type ProductRuntimeConfig = {
  chainId: 4326 | typeof MEGAETH_TESTNET_CHAIN_ID;
  chainIdHex: HexString;
  rpcUrl: string;
  networkName: string;
  networkBadge: string;
  walletChainName: string;
  poolAddress: HexString;
  poolDeploymentBlockHex: HexString;
  merkleTreeDepth: number;
  proverManifestUrl?: string;
  relayerEndpoint?: string;
  withdrawVerifierAddress: HexString;
  withdrawVerifierBytecodeHash: HexString;
  allowUntrustedLocalDevProver: boolean;
  allowLocalDevProofServiceFallback: boolean;
  mainnetValueMovingApproved: boolean;
  guardedUsersApproved: boolean;
  productionPrivacyClaimsApproved: boolean;
};

type ProductRuntimeConfigGlobal = typeof globalThis & {
  __shieldedTransfersRuntimeConfig?: ProductRuntimeConfig;
};

const MAINNET_CHAIN_ID = 4326;
const MAINNET_CHAIN_ID_HEX = "0x10e6" as const;
const MAINNET_RPC_URL = "https://mainnet.megaeth.com/rpc";
const MAINNET_SHIELDED_POOL_DEPLOYMENT_BLOCK_HEX = "0xf98a11" as const;
const MAINNET_MERKLE_TREE_DEPTH = 20;
const MAINNET_WITHDRAW_VERIFIER_ADDRESS = "0x9023FAfB13320D4A34AAD6C25E0411862b0E3397" as const;
const MAINNET_WITHDRAW_VERIFIER_BYTECODE_HASH =
  "0x9a20d11112ee8b3c57677de4ba84eccf3928cb8aec734a21a1df5770086ad4f6" as const;
const MAINNET_PROVER_MANIFEST_URL = "/proving/withdraw-artifacts.manifest.json";
const MAINNET_VALUE_MOVING_APPROVED_ENV = "VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVED";
const MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH_ENV =
  "VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH";
const MAINNET_GUARDED_USERS_APPROVED_ENV = "VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED";
const MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH_ENV =
  "VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH";
const PRODUCTION_PRIVACY_CLAIMS_APPROVED_ENV = "VITE_NULLARK_PRODUCTION_PRIVACY_CLAIMS_APPROVED";
const PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASH_ENV =
  "VITE_NULLARK_PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASH";
const MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH_ENV =
  "VITE_NULLARK_MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH";
const MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_ARTIFACT =
  "public-artifacts/current.json";
const MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH =
  "0x753591df4299a40ccb5be1eef6987db9d7299747272a8948f5530661b7e44436" as const;
const MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASHES: readonly HexString[] = [
  "0x29cc2aa2ae50a74a5b60a897849a947a5060fef378b2474eb0b063d99eb8ef6e"
];
const MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASHES: readonly HexString[] = [];
const PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASHES: readonly HexString[] = [];
const LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS = "0x54af9d54b4edD062daD5581670E9E5f73048c87b" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const MAINNET_VALUE_MOVING_BLOCKED_MESSAGE =
  "MegaETH mainnet value-moving actions are blocked until mainnet value-moving approval is explicitly enabled.";
export const PRODUCTION_PRIVACY_CLAIMS_BLOCKED_MESSAGE =
  "Production privacy claims are blocked until a public privacy-claims artifact is explicitly enabled.";
const MAINNET_RUNTIME_EXPLICIT_BINDING_REQUIRED_MESSAGE =
  "MegaETH mainnet runtime config requires explicit VITE_SHIELDED_TRANSFERS_ENVIRONMENT=megaeth-mainnet and a fresh NullarkPool binding.";

export function getProductRuntimeConfig(): ProductRuntimeConfig {
  const override = (globalThis as ProductRuntimeConfigGlobal).__shieldedTransfersRuntimeConfig;
  if (override) {
    return override;
  }

  const locationConfig = getProductRuntimeConfigFromLocation();
  if (locationConfig) {
    return locationConfig;
  }

  const envConfig = getProductRuntimeConfigFromEnv();
  if (envConfig) {
    return envConfig;
  }

  return createMainnetProductRuntimeConfig();
}

function getProductRuntimeConfigFromLocation(): ProductRuntimeConfig | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const pool = params.get("pool")?.toLowerCase();
  const network = params.get("network")?.toLowerCase();
  if (pool === "nullark" || network === "megaeth-testnet-nullark") {
    return createNullarkTestnetProductRuntimeConfig({ relayerEndpoint: NULLARK_TESTNET_RELAYER_ENDPOINT });
  }
  if (network === "megaeth-mainnet" && isLocalRuntimeOverrideHost(window.location.hostname)) {
    return createFinalMainnetProductRuntimeConfig();
  }
  if (!isLocalRuntimeOverrideHost(window.location.hostname)) {
    return null;
  }
  if (pool === "depth12" || network === "megaeth-testnet") {
    return createTestnetProductRuntimeConfig();
  }
  return null;
}

function isLocalRuntimeOverrideHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
}

function getProductRuntimeConfigFromEnv(): ProductRuntimeConfig | null {
  const env = getRuntimeEnv();
  const environment = String(env.VITE_SHIELDED_TRANSFERS_ENVIRONMENT ?? "").toLowerCase();
  if (!env || environment.length === 0) {
    return null;
  }

  if (environment === "megaeth-testnet-nullark") {
    const isLocalHost =
      typeof window !== "undefined" && isLocalRuntimeOverrideHost(window.location.hostname);
    if (isLocalHost) {
      return createNullarkTestnetProductRuntimeConfig();
    }
    return createNullarkTestnetProductRuntimeConfig({
      poolAddress: requireEnvAddress(env, "VITE_SHIELDED_POOL_ADDRESS", NULLARK_TESTNET_POOL_ADDRESS),
      poolDeploymentBlockHex: requireEnvBlockQuantity(
        env,
        "VITE_SHIELDED_POOL_DEPLOYMENT_BLOCK",
        NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK_HEX
      ),
      merkleTreeDepth: requireEnvInteger(env, "VITE_MERKLE_TREE_DEPTH", NULLARK_TESTNET_MERKLE_TREE_DEPTH),
      withdrawVerifierAddress: requireEnvAddress(
        env,
        "VITE_WITHDRAW_VERIFIER_ADDRESS",
        NULLARK_TESTNET_WITHDRAW_VERIFIER_ADDRESS
      ),
      relayerEndpoint: requireRelayerEndpoint(env, "VITE_RELAYER_ENDPOINT")
    });
  }

  if (environment !== "megaeth-mainnet") {
    return null;
  }

  const chainId = Number(env.VITE_MEGAETH_CHAIN_ID ?? MAINNET_CHAIN_ID);
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error("MegaETH mainnet runtime config requires VITE_MEGAETH_CHAIN_ID=4326.");
  }

  const rpcUrl = requireEnvString(env, "VITE_MEGAETH_RPC_URL", MAINNET_RPC_URL);
  if (rpcUrl !== MAINNET_RPC_URL) {
    throw new Error("MegaETH mainnet runtime config requires the approved mainnet RPC URL.");
  }

  const mainnetValueMovingApproved = resolveMainnetValueMovingApproved(env);
  const guardedUsersApproved = resolveMainnetGuardedUsersApproved(env);
  const productionPrivacyClaimsApproved = resolveProductionPrivacyClaimsApproved(env);
  const relayerEndpoint = mainnetValueMovingApproved
    ? getOptionalMainnetRelayerEndpoint(env, "VITE_RELAYER_ENDPOINT") ?? NULLARK_MAINNET_RELAYER_ENDPOINT
    : undefined;

  return {
    chainId: MAINNET_CHAIN_ID,
    chainIdHex: MAINNET_CHAIN_ID_HEX,
    rpcUrl,
    networkName: "MegaETH mainnet",
    networkBadge: "MAINNET",
    walletChainName: "MegaETH Mainnet",
    poolAddress: requireFinalMainnetPoolAddress(env, "VITE_SHIELDED_POOL_ADDRESS"),
    poolDeploymentBlockHex: requireFinalMainnetBlockQuantity(
      env,
      "VITE_SHIELDED_POOL_DEPLOYMENT_BLOCK",
      MAINNET_SHIELDED_POOL_DEPLOYMENT_BLOCK_HEX
    ),
    merkleTreeDepth: requireEnvInteger(env, "VITE_MERKLE_TREE_DEPTH", MAINNET_MERKLE_TREE_DEPTH),
    proverManifestUrl: requireEnvString(env, "VITE_PROVER_MANIFEST_URL", MAINNET_PROVER_MANIFEST_URL),
    ...(relayerEndpoint ? { relayerEndpoint } : {}),
    withdrawVerifierAddress: requireFinalMainnetAddress(
      env,
      "VITE_WITHDRAW_VERIFIER_ADDRESS",
      MAINNET_WITHDRAW_VERIFIER_ADDRESS
    ),
    withdrawVerifierBytecodeHash: requireFinalMainnetBytes32(
      env,
      "VITE_WITHDRAW_VERIFIER_BYTECODE_HASH",
      MAINNET_WITHDRAW_VERIFIER_BYTECODE_HASH
    ),
    allowUntrustedLocalDevProver: false,
    allowLocalDevProofServiceFallback: false,
    mainnetValueMovingApproved,
    guardedUsersApproved,
    productionPrivacyClaimsApproved
  };
}

function getRuntimeEnv(): Record<string, string | boolean | undefined> {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env ?? {};
  const nodeEnv =
    typeof process !== "undefined" && typeof process.env === "object"
      ? (process.env as Record<string, string | undefined>)
      : {};
  return { ...nodeEnv, ...viteEnv };
}

export function createMainnetProductRuntimeConfig(): ProductRuntimeConfig {
  throw new Error(MAINNET_RUNTIME_EXPLICIT_BINDING_REQUIRED_MESSAGE);
}

export function createFinalMainnetProductRuntimeConfig(): ProductRuntimeConfig {
  return {
    chainId: MAINNET_CHAIN_ID,
    chainIdHex: MAINNET_CHAIN_ID_HEX,
    rpcUrl: MAINNET_RPC_URL,
    networkName: "MegaETH mainnet",
    networkBadge: "MAINNET",
    walletChainName: "MegaETH Mainnet",
    poolAddress: MAINNET_SHIELDED_POOL_ADDRESS,
    poolDeploymentBlockHex: MAINNET_SHIELDED_POOL_DEPLOYMENT_BLOCK_HEX,
    merkleTreeDepth: MAINNET_MERKLE_TREE_DEPTH,
    proverManifestUrl: MAINNET_PROVER_MANIFEST_URL,
    withdrawVerifierAddress: MAINNET_WITHDRAW_VERIFIER_ADDRESS,
    withdrawVerifierBytecodeHash: MAINNET_WITHDRAW_VERIFIER_BYTECODE_HASH,
    allowUntrustedLocalDevProver: false,
    allowLocalDevProofServiceFallback: false,
    mainnetValueMovingApproved: false,
    guardedUsersApproved: false,
    productionPrivacyClaimsApproved: false
  };
}

export function createTestnetProductRuntimeConfig(): ProductRuntimeConfig {
  return {
    chainId: MEGAETH_TESTNET_CHAIN_ID,
    chainIdHex: MEGAETH_TESTNET_CHAIN_ID_HEX,
    rpcUrl: MEGAETH_TESTNET_RPC_URL,
    networkName: "MegaETH dev network",
    networkBadge: "TESTNET",
    walletChainName: "MegaETH Testnet",
    poolAddress: SHIELDED_POOL_ADDRESS,
    poolDeploymentBlockHex: SANDBOX_DEPLOYMENT_BLOCK_HEX,
    merkleTreeDepth: SANDBOX_MERKLE_TREE_DEPTH,
    withdrawVerifierAddress: EXPECTED_WITHDRAW_VERIFIER_ADDRESS,
    withdrawVerifierBytecodeHash: EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH,
    allowUntrustedLocalDevProver: true,
    allowLocalDevProofServiceFallback: true,
    mainnetValueMovingApproved: false,
    guardedUsersApproved: false,
    productionPrivacyClaimsApproved: false
  };
}

export function createNullarkTestnetProductRuntimeConfig(
  options: {
    poolAddress?: HexString;
    poolDeploymentBlockHex?: HexString;
    merkleTreeDepth?: number;
    withdrawVerifierAddress?: HexString;
    relayerEndpoint?: string;
  } = {}
): ProductRuntimeConfig {
  const config: ProductRuntimeConfig = {
    ...createTestnetProductRuntimeConfig(),
    poolAddress: options.poolAddress ?? NULLARK_TESTNET_POOL_ADDRESS,
    poolDeploymentBlockHex: options.poolDeploymentBlockHex ?? NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK_HEX,
    merkleTreeDepth: options.merkleTreeDepth ?? NULLARK_TESTNET_MERKLE_TREE_DEPTH,
    withdrawVerifierAddress: options.withdrawVerifierAddress ?? NULLARK_TESTNET_WITHDRAW_VERIFIER_ADDRESS,
    allowLocalDevProofServiceFallback: false
  };
  if (options.relayerEndpoint) {
    config.relayerEndpoint = options.relayerEndpoint;
  }
  return config;
}

function requireEnvString(env: Record<string, string | boolean | undefined>, key: string, fallback?: string): string {
  const value = env[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`MegaETH mainnet runtime config requires ${key}.`);
}

function requireRelayerEndpoint(env: Record<string, string | boolean | undefined>, key: string): string {
  const value = requireEnvString(env, key);
  return assertRelayerEndpoint(value, key);
}

function assertRelayerEndpoint(value: string, key: string): string {
  if (!/^https:\/\/[^ ]+$/i.test(value)) {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to be HTTPS.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to be a valid HTTPS URL.`);
  }
  if (
    parsed.hostname === "example.com" ||
    parsed.hostname.endsWith(".example.com") ||
    parsed.hostname === "nullark-relayer.example.com"
  ) {
    throw new Error(`MegaETH mainnet runtime config rejects placeholder relayer endpoint ${key}.`);
  }
  if (parsed.pathname !== "/transaction") {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to target /transaction.`);
  }
  return value;
}

function getOptionalRelayerEndpoint(env: Record<string, string | boolean | undefined>, key: string): string | null {
  const value = env[key];
  if (value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to be HTTPS.`);
  }
  return assertRelayerEndpoint(value, key);
}

function getOptionalMainnetRelayerEndpoint(
  env: Record<string, string | boolean | undefined>,
  key: string
): string | null {
  const value = getOptionalRelayerEndpoint(env, key);
  if (value === null) {
    return null;
  }
  if (value !== NULLARK_MAINNET_RELAYER_ENDPOINT) {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to match the canonical Nullark mainnet relayer endpoint.`);
  }
  return value;
}

function requireEnvInteger(env: Record<string, string | boolean | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  const value = typeof raw === "string" && raw.trim().length > 0 ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`MegaETH mainnet runtime config requires positive integer ${key}.`);
  }
  return value;
}

function requireEnvAddress(
  env: Record<string, string | boolean | undefined>,
  key: string,
  fallback?: HexString
): HexString {
  const value = requireEnvString(env, key, fallback);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`MegaETH mainnet runtime config requires nonzero EVM address ${key}.`);
  }
  return value as HexString;
}

function requireFinalMainnetPoolAddress(env: Record<string, string | boolean | undefined>, key: string): HexString {
  const value = requireEnvAddress(env, key);
  if (value.toLowerCase() === LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS.toLowerCase()) {
    throw new Error("MegaETH mainnet runtime config cannot bind legacy ShieldedPoolDepth20 as NullarkPool.");
  }
  if (value.toLowerCase() !== MAINNET_SHIELDED_POOL_ADDRESS.toLowerCase()) {
    throw new Error("MegaETH mainnet runtime config must bind the final NullarkPool address.");
  }
  return value;
}

function requireFinalMainnetAddress(
  env: Record<string, string | boolean | undefined>,
  key: string,
  expected: HexString
): HexString {
  const value = requireEnvAddress(env, key);
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to match the final deployment binding.`);
  }
  return value;
}

function requireEnvBlockQuantity(env: Record<string, string | boolean | undefined>, key: string, fallback: HexString): HexString {
  const value = requireEnvString(env, key, fallback);
  if (!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error(`MegaETH mainnet runtime config requires hex block quantity ${key}.`);
  }
  return value as HexString;
}

function requireFinalMainnetBlockQuantity(
  env: Record<string, string | boolean | undefined>,
  key: string,
  expected: HexString
): HexString {
  const value = requireEnvBlockQuantity(env, key, expected);
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to match the final pool deployment block.`);
  }
  return value;
}

function requireEnvBytes32(env: Record<string, string | boolean | undefined>, key: string): HexString {
  const value = requireEnvString(env, key);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || value.toLowerCase() === ZERO_BYTES32) {
    throw new Error(`MegaETH mainnet runtime config requires nonzero bytes32 ${key}.`);
  }
  return value as HexString;
}

function requireFinalMainnetBytes32(
  env: Record<string, string | boolean | undefined>,
  key: string,
  expected: HexString
): HexString {
  const value = requireEnvBytes32(env, key);
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`MegaETH mainnet runtime config requires ${key} to match the final deployment binding.`);
  }
  return value;
}

function getOptionalEnvBytes32(env: Record<string, string | boolean | undefined>, key: string): HexString | null {
  const value = env[key];
  if (value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value) || value.toLowerCase() === ZERO_BYTES32) {
    throw new Error(`MegaETH mainnet runtime config requires nonzero bytes32 ${key}.`);
  }
  return value as HexString;
}

function requireEnvBoolean(
  env: Record<string, string | boolean | undefined>,
  key: string,
  fallback: boolean
): boolean {
  const value = env[key];
  if (value === undefined || value === "") {
    return fallback;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  throw new Error(`MegaETH mainnet runtime config requires ${key} to be true or false.`);
}

function resolveMainnetValueMovingApproved(env: Record<string, string | boolean | undefined>): boolean {
  const requested = requireEnvBoolean(env, MAINNET_VALUE_MOVING_APPROVED_ENV, false);
  if (!requested) {
    return false;
  }

  const approvalArtifactHash = getOptionalEnvBytes32(env, MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH_ENV);
  if (!approvalArtifactHash) {
    throw new Error(
      `MegaETH mainnet value-moving approval requires ${MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH_ENV}.`
    );
  }
  if (
    !MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASHES.some(
      (expectedHash) => expectedHash.toLowerCase() === approvalArtifactHash.toLowerCase()
    )
  ) {
    throw new Error("MegaETH mainnet value-moving approval artifact hash does not match the pinned approved artifact.");
  }
  return true;
}

function resolveMainnetGuardedUsersApproved(env: Record<string, string | boolean | undefined>): boolean {
  const requested = requireEnvBoolean(env, MAINNET_GUARDED_USERS_APPROVED_ENV, false);
  if (!requested) {
    return false;
  }

  const blockedStateHash = getOptionalEnvBytes32(env, MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH_ENV);
  if (blockedStateHash) {
    if (blockedStateHash.toLowerCase() !== MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH) {
      throw new Error(
        `MegaETH mainnet guarded-user release-candidate blocked-state hash must match ${MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_ARTIFACT}.`
      );
    }
    return false;
  }

  const approvalArtifactHash = getOptionalEnvBytes32(env, MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH_ENV);
  if (!approvalArtifactHash) {
    throw new Error(
      `MegaETH mainnet guarded-user approval requires ${MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH_ENV} or ${MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH_ENV}.`
    );
  }
  if (MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASHES.length === 0) {
    throw new Error("MegaETH mainnet guarded-user approval has no pinned approved artifact hash.");
  }
  if (
    !MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASHES.some(
      (expectedHash) => expectedHash.toLowerCase() === approvalArtifactHash.toLowerCase()
    )
  ) {
    throw new Error("MegaETH mainnet guarded-user approval artifact hash does not match the pinned approved artifact.");
  }
  return true;
}

function resolveProductionPrivacyClaimsApproved(env: Record<string, string | boolean | undefined>): boolean {
  const requested = requireEnvBoolean(env, PRODUCTION_PRIVACY_CLAIMS_APPROVED_ENV, false);
  if (!requested) {
    return false;
  }

  const approvalArtifactHash = getOptionalEnvBytes32(env, PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASH_ENV);
  if (!approvalArtifactHash) {
    throw new Error(
      `Production privacy claims approval requires ${PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASH_ENV}.`
    );
  }
  if (PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASHES.length === 0) {
    throw new Error("Production privacy claims approval has no pinned approved artifact hash.");
  }
  if (
    !PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASHES.some(
      (expectedHash) => expectedHash.toLowerCase() === approvalArtifactHash.toLowerCase()
    )
  ) {
    throw new Error("Production privacy claims approval artifact hash does not match the pinned approved artifact.");
  }
  return true;
}

export function isMainnetValueMovingBlocked(config: ProductRuntimeConfig): boolean {
  return config.chainId === MAINNET_CHAIN_ID && !config.mainnetValueMovingApproved;
}

export function assertMainnetValueMovingAllowed(config: ProductRuntimeConfig): void {
  if (isMainnetValueMovingBlocked(config)) {
    throw new Error(MAINNET_VALUE_MOVING_BLOCKED_MESSAGE);
  }
}

export function assertProductionPrivacyClaimsAllowed(config: ProductRuntimeConfig): void {
  if (!config.productionPrivacyClaimsApproved) {
    throw new Error(PRODUCTION_PRIVACY_CLAIMS_BLOCKED_MESSAGE);
  }
}

export function setProductRuntimeConfigForTests(config: ProductRuntimeConfig | null): void {
  const runtimeGlobal = globalThis as ProductRuntimeConfigGlobal;
  if (config) {
    runtimeGlobal.__shieldedTransfersRuntimeConfig = config;
    return;
  }

  delete runtimeGlobal.__shieldedTransfersRuntimeConfig;
}
