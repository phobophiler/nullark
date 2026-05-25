import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAINNET_VALUE_MOVING_BLOCKED_MESSAGE,
  PRODUCTION_PRIVACY_CLAIMS_BLOCKED_MESSAGE,
  V12_PUBLIC_RUNTIME_BLOCKED_LABEL,
  assertMainnetValueMovingAllowed,
  assertProductionPrivacyClaimsAllowed,
  getProductPublicRuntimeStatus,
  getProductRuntimeConfig,
  isProductPublicRuntimeBlocked,
  isMainnetValueMovingBlocked,
  setProductRuntimeConfigForTests
} from "./productRuntimeConfig.js";

const LEGACY_MAINNET_DEPTH20_POOL = "0x54af9d54b4edD062daD5581670E9E5f73048c87b";
const MAINNET_NULLARK_POOL = "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8";
const MAINNET_POOL_DEPLOYMENT_BLOCK = "0x10152dd";
const MAINNET_VERIFIER = "0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92";
const MAINNET_VERIFIER_HASH = "0x613190065f23e69c6dcd8d75796b8aa20c060a5f51b312cf82c11424443bfdca";
const STALE_MAINNET_POOL = "0xE02D37aCcb2444C8677BbB821F4171465b8cD0fB";
const STALE_MAINNET_POOL_DEPLOYMENT_BLOCK = "0xf87493";
const STALE_MAINNET_VERIFIER = "0x66E84786b323F431a6571578dCd88e33328AdFFa";
const STALE_MAINNET_VERIFIER_HASH = "0xc04104683424f81f2625045c77a73acf355084c1ddaf9ff6b2547c469488dae4";
const MAINNET_RELAYER = "https://relayer.nullark.com/transaction";
const NULLARK_TESTNET_RELAYER = "https://testnet-relayer.nullark.com/transaction";
const PLACEHOLDER_RELAYER = "https://nullark-relayer.example.com/transaction";
const MAINNET_RC_BLOCKED_STATE_HASH = "0x753591df4299a40ccb5be1eef6987db9d7299747272a8948f5530661b7e44436";
const MAINNET_VALUE_MOVING_APPROVAL_HASH =
  "0x29cc2aa2ae50a74a5b60a897849a947a5060fef378b2474eb0b063d99eb8ef6e";
const MAINNET_GUARDED_USERS_APPROVAL_HASH =
  "0xe9a7f78a293cc7c48888356f4e05edea756408adfcaed626d77faa98dfc7ff58";
const NULLARK_TESTNET_POOL = "0xEc61D863700DeF260E7BABA634FAa24AEC81f29e";
const NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK = "0x1305540";
const NULLARK_TESTNET_WITHDRAW_VERIFIER = "0x9710F0853688c0ef58e826Cd1Bb0024b3D29bC72";
const NULLARK_TESTNET_WITHDRAW_VERIFIER_HASH =
  "0x4927cf479baf49196aa232f61fd697e41ef4a379064f298c3805964a61cf59fb";

describe("product runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setProductRuntimeConfigForTests(null);
  });

  it("uses the promoted v1.2 mainnet pool config by default", () => {
    setLocation("http://localhost:5173/");

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      poolAddress: MAINNET_NULLARK_POOL,
      poolDeploymentBlockHex: MAINNET_POOL_DEPLOYMENT_BLOCK,
      withdrawVerifierAddress: MAINNET_VERIFIER,
      withdrawVerifierBytecodeHash: MAINNET_VERIFIER_HASH,
      allowLocalDevProofServiceFallback: false
    });
  });

  it("keeps explicit testnet query override available on localhost", () => {
    setLocation("http://localhost:5173/?network=megaeth-testnet");

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 6343,
      chainIdHex: "0x18c7",
      networkBadge: "TESTNET",
      walletChainName: "MegaETH Testnet",
      poolDeploymentBlockHex: "0x1136f96",
      merkleTreeDepth: 12,
      allowUntrustedLocalDevProver: true,
      allowLocalDevProofServiceFallback: true,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(isMainnetValueMovingBlocked(getProductRuntimeConfig())).toBe(false);
    expect(() => assertMainnetValueMovingAllowed(getProductRuntimeConfig())).not.toThrow();
  });

  it("uses replacement v1.1 RC Nullark testnet evidence on localhost", () => {
    setLocation("http://localhost:5173/?network=megaeth-testnet-nullark");

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 6343,
      chainIdHex: "0x18c7",
      rpcUrl: "https://carrot.megaeth.com/rpc",
      networkBadge: "TESTNET",
      walletChainName: "MegaETH Testnet",
      poolAddress: NULLARK_TESTNET_POOL,
      poolDeploymentBlockHex: NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      proverManifestUrl: "/proving/v1-2-testnet/withdraw-artifacts.manifest.json",
      withdrawVerifierAddress: NULLARK_TESTNET_WITHDRAW_VERIFIER,
      withdrawVerifierBytecodeHash: NULLARK_TESTNET_WITHDRAW_VERIFIER_HASH,
      allowUntrustedLocalDevProver: true,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(getProductRuntimeConfig().withdrawalFeeState).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 100,
      source: "on-chain-feeBps"
    });
    expect(isMainnetValueMovingBlocked(getProductRuntimeConfig())).toBe(false);
    expect(() => assertMainnetValueMovingAllowed(getProductRuntimeConfig())).not.toThrow();
  });

  it("uses explicit Nullark testnet VITE config for Cloudflare preview builds", () => {
    setLocation("https://nullark-testnet.shielded-private-transfer.pages.dev/");
    vi.stubEnv("VITE_SHIELDED_TRANSFERS_ENVIRONMENT", "megaeth-testnet-nullark");
    vi.stubEnv("VITE_SHIELDED_POOL_ADDRESS", NULLARK_TESTNET_POOL);
    vi.stubEnv("VITE_SHIELDED_POOL_DEPLOYMENT_BLOCK", NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK);
    vi.stubEnv("VITE_MERKLE_TREE_DEPTH", "20");
    vi.stubEnv("VITE_WITHDRAW_VERIFIER_ADDRESS", NULLARK_TESTNET_WITHDRAW_VERIFIER);
    vi.stubEnv("VITE_RELAYER_ENDPOINT", NULLARK_TESTNET_RELAYER);

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 6343,
      chainIdHex: "0x18c7",
      rpcUrl: "https://carrot.megaeth.com/rpc",
      networkBadge: "TESTNET",
      walletChainName: "MegaETH Testnet",
      poolAddress: NULLARK_TESTNET_POOL,
      poolDeploymentBlockHex: NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      proverManifestUrl: "/proving/v1-2-testnet/withdraw-artifacts.manifest.json",
      withdrawVerifierAddress: NULLARK_TESTNET_WITHDRAW_VERIFIER,
      withdrawVerifierBytecodeHash: NULLARK_TESTNET_WITHDRAW_VERIFIER_HASH,
      relayerEndpoint: NULLARK_TESTNET_RELAYER,
      allowUntrustedLocalDevProver: true,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(isMainnetValueMovingBlocked(getProductRuntimeConfig())).toBe(false);
    expect(() => assertMainnetValueMovingAllowed(getProductRuntimeConfig())).not.toThrow();
  });

  it("requires explicit Nullark testnet relayer endpoint in nonlocal VITE config", () => {
    setLocation("https://nullark-testnet.shielded-private-transfer.pages.dev/");
    vi.stubEnv("VITE_SHIELDED_TRANSFERS_ENVIRONMENT", "megaeth-testnet-nullark");

    expect(() => getProductRuntimeConfig()).toThrow("VITE_RELAYER_ENDPOINT");
  });

  it("rejects placeholder Nullark testnet relayer endpoints in nonlocal VITE config", () => {
    setLocation("https://nullark-testnet.shielded-private-transfer.pages.dev/");
    vi.stubEnv("VITE_SHIELDED_TRANSFERS_ENVIRONMENT", "megaeth-testnet-nullark");
    vi.stubEnv("VITE_RELAYER_ENDPOINT", PLACEHOLDER_RELAYER);

    expect(() => getProductRuntimeConfig()).toThrow("placeholder");
  });

  it("ignores testnet query overrides on the production Pages host", () => {
    setLocation("https://shielded-private-transfer.pages.dev/?network=megaeth-testnet-nullark");
    stubMainnetEnv();

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      chainIdHex: "0x10e6",
      networkBadge: "MAINNET",
      poolAddress: MAINNET_NULLARK_POOL,
      poolDeploymentBlockHex: MAINNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      proverManifestUrl: "/proving/withdraw-artifacts.manifest.json",
      withdrawVerifierAddress: MAINNET_VERIFIER,
      withdrawVerifierBytecodeHash: MAINNET_VERIFIER_HASH,
      allowUntrustedLocalDevProver: false,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
  });

  it("allows the production Pages host to switch back to mainnet by query", () => {
    setLocation("https://shielded-private-transfer.pages.dev/?network=megaeth-mainnet");
    stubMainnetEnv();

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      chainIdHex: "0x10e6",
      networkBadge: "MAINNET",
      poolAddress: MAINNET_NULLARK_POOL,
      poolDeploymentBlockHex: MAINNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      withdrawVerifierAddress: MAINNET_VERIFIER,
      withdrawVerifierBytecodeHash: MAINNET_VERIFIER_HASH,
      allowUntrustedLocalDevProver: false,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
  });

  it("uses explicit mainnet VITE config without requiring a relayer endpoint while value-moving is blocked", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      chainIdHex: "0x10e6",
      rpcUrl: "https://mainnet.megaeth.com/rpc",
      networkBadge: "MAINNET",
      poolAddress: MAINNET_NULLARK_POOL,
      poolDeploymentBlockHex: MAINNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      proverManifestUrl: "/proving/withdraw-artifacts.manifest.json",
      withdrawVerifierAddress: MAINNET_VERIFIER,
      withdrawVerifierBytecodeHash: MAINNET_VERIFIER_HASH,
      allowUntrustedLocalDevProver: false,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(getProductRuntimeConfig().withdrawalFeeState).toMatchObject({
      activeFeeBps: 33,
      maxFeeBps: 100,
      source: "on-chain-feeBps"
    });
    expect(getProductRuntimeConfig().relayerEndpoint).toBeUndefined();
    expect(getProductPublicRuntimeStatus(getProductRuntimeConfig())).toMatchObject({
      currentRuntime: "v1.2",
      candidateRuntime: "v1.2",
      candidateStatus: "current",
      label: "",
      detail: ""
    });
  });

  it("does not mark Nullark testnet v1.2 runtime as a blocked mainnet draft", () => {
    setLocation("http://localhost:5173/?network=megaeth-testnet-nullark");

    expect(isProductPublicRuntimeBlocked(getProductRuntimeConfig())).toBe(false);
    expect(getProductPublicRuntimeStatus(getProductRuntimeConfig())).toMatchObject({
      currentRuntime: "v1.2",
      candidateRuntime: "v1.2",
      candidateStatus: "current",
      label: "",
      detail: ""
    });
  });

  it("labels non-final v1.2-style on-chain fee runtimes as blocked draft instead of current", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    const config = {
      ...getProductRuntimeConfig(),
      poolAddress: STALE_MAINNET_POOL as `0x${string}`,
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false as const,
        source: "on-chain-feeBps" as const
      }
    };

    expect(getProductPublicRuntimeStatus(config)).toMatchObject({
      currentRuntime: "v1.1",
      candidateRuntime: "v1.2",
      candidateStatus: "blocked-draft",
      label: V12_PUBLIC_RUNTIME_BLOCKED_LABEL
    });
    expect(getProductPublicRuntimeStatus(config).detail).toContain("not bound to the final v1.2 public runtime");
  });

  it("keeps injected v1.2-style runtimes fail-closed even when value-moving approval is present", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: MAINNET_RELAYER,
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });
    const config = {
      ...getProductRuntimeConfig(),
      poolAddress: STALE_MAINNET_POOL as `0x${string}`,
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false as const,
        source: "on-chain-feeBps" as const
      }
    };

    expect(isProductPublicRuntimeBlocked(config)).toBe(true);
    expect(isMainnetValueMovingBlocked(config)).toBe(false);
    expect(() => assertMainnetValueMovingAllowed(config)).toThrow("v1.2 public artifact promotion is blocked");
  });

  it("keeps injected v1.2-style runtimes fail-closed when final deployment metadata drifts", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: MAINNET_RELAYER,
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });

    const baseConfig = getProductRuntimeConfig();
    const staleBlockConfig = {
      ...baseConfig,
      poolDeploymentBlockHex: STALE_MAINNET_POOL_DEPLOYMENT_BLOCK as `0x${string}`
    };
    const staleDepthConfig = {
      ...baseConfig,
      merkleTreeDepth: 12
    };
    const staleManifestConfig = {
      ...baseConfig,
      proverManifestUrl: "/proving/stale-withdraw-artifacts.manifest.json"
    };

    expect(isProductPublicRuntimeBlocked(staleBlockConfig)).toBe(true);
    expect(isProductPublicRuntimeBlocked(staleDepthConfig)).toBe(true);
    expect(isProductPublicRuntimeBlocked(staleManifestConfig)).toBe(true);
    expect(() => assertMainnetValueMovingAllowed(staleBlockConfig)).toThrow("v1.2 public artifact promotion is blocked");
  });

  it("ignores an explicit HTTPS mainnet relayer endpoint while value-moving is blocked", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({ relayerEndpoint: MAINNET_RELAYER });

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      networkBadge: "MAINNET",
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(getProductRuntimeConfig().relayerEndpoint).toBeUndefined();
  });

  it("enables mainnet value-moving only with a pinned approval artifact hash", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: MAINNET_RELAYER,
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });

    const config = getProductRuntimeConfig();

    expect(config).toMatchObject({
      chainId: 4326,
      networkBadge: "MAINNET",
      relayerEndpoint: MAINNET_RELAYER,
      mainnetValueMovingApproved: true,
      guardedUsersApproved: false,
      productionPrivacyClaimsApproved: false
    });
    expect(isMainnetValueMovingBlocked(config)).toBe(false);
    expect(() => assertMainnetValueMovingAllowed(config)).not.toThrow();
    expect(() => assertProductionPrivacyClaimsAllowed(config)).toThrow(PRODUCTION_PRIVACY_CLAIMS_BLOCKED_MESSAGE);
  });

  it("rejects the legacy Depth20 pool for explicit mainnet runtime config", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_SHIELDED_POOL_ADDRESS", LEGACY_MAINNET_DEPTH20_POOL);

    expect(() => getProductRuntimeConfig()).toThrow("cannot bind legacy ShieldedPoolDepth20 as NullarkPool");
  });

  it("rejects stale mainnet final-pool runtime bindings", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_SHIELDED_POOL_ADDRESS", STALE_MAINNET_POOL);

    expect(() => getProductRuntimeConfig()).toThrow("final NullarkPool address");

    stubMainnetEnv();
    vi.stubEnv("VITE_SHIELDED_POOL_DEPLOYMENT_BLOCK", STALE_MAINNET_POOL_DEPLOYMENT_BLOCK);

    expect(() => getProductRuntimeConfig()).toThrow("final pool deployment block");

    stubMainnetEnv();
    vi.stubEnv("VITE_WITHDRAW_VERIFIER_ADDRESS", STALE_MAINNET_VERIFIER);

    expect(() => getProductRuntimeConfig()).toThrow("final deployment binding");

    stubMainnetEnv();
    vi.stubEnv("VITE_WITHDRAW_VERIFIER_BYTECODE_HASH", STALE_MAINNET_VERIFIER_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("final deployment binding");
  });

  it("rejects boolean-only mainnet value-moving approval", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVED", "true");

    expect(() => getProductRuntimeConfig()).toThrow("VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH");
  });

  it("keeps guarded users blocked with explicit release-candidate blocked-state validation", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_RELEASE_CANDIDATE_BLOCKED_STATE_HASH", MAINNET_RC_BLOCKED_STATE_HASH);

    const config = getProductRuntimeConfig();

    expect(config).toMatchObject({
      chainId: 4326,
      networkBadge: "MAINNET",
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
    });
    expect(isMainnetValueMovingBlocked(config)).toBe(true);
    expect(() => assertMainnetValueMovingAllowed(config)).toThrow(MAINNET_VALUE_MOVING_BLOCKED_MESSAGE);
  });

  it("enables guarded-user approval only with the pinned trusted setup record hash", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 4326,
      networkBadge: "MAINNET",
      mainnetValueMovingApproved: false,
      guardedUsersApproved: true
    });
  });

  it("rejects legacy relayer endpoints after guarded-user approval is hash-gated", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: "https://relayer.nullark.com/relay-transaction",
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("to target /transaction");
  });

  it("rejects placeholder relayer endpoints after guarded-user approval is hash-gated", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: PLACEHOLDER_RELAYER,
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("placeholder");
  });

  it("rejects noncanonical relayer hosts after guarded-user approval is hash-gated", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({
      relayerEndpoint: "https://attacker.example/transaction",
      mainnetValueMovingApproved: true,
      mainnetValueMovingApprovalHash: MAINNET_VALUE_MOVING_APPROVAL_HASH
    });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("canonical Nullark mainnet relayer endpoint");
  });

  it("rejects guarded-user approval artifact hashes that are not pinned", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv(
      "VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH",
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval artifact hash does not match");
  });

  it("rejects malformed guarded-user approval config", () => {
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "yes");

    expect(() => getProductRuntimeConfig()).toThrow("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED");
  });

  it("rejects unpinned production privacy claims approval", () => {
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_PRODUCTION_PRIVACY_CLAIMS_APPROVED", "true");
    vi.stubEnv(
      "VITE_NULLARK_PRODUCTION_PRIVACY_CLAIMS_APPROVAL_ARTIFACT_HASH",
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );

    expect(() => getProductRuntimeConfig()).toThrow("Production privacy claims approval has no pinned approved artifact hash");
  });

  it("rejects mainnet runtime config with missing pool binding", () => {
    stubMainnetEnv();
    vi.stubEnv("VITE_SHIELDED_POOL_ADDRESS", "");

    expect(() => getProductRuntimeConfig()).toThrow("VITE_SHIELDED_POOL_ADDRESS");
  });

  it("keeps the checked-in env example internally consistent with approval-gated mainnet runtime parsing", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    const exampleEnv = readEnvExample();
    for (const [key, value] of Object.entries(exampleEnv)) {
      vi.stubEnv(key, value);
    }

    const config = getProductRuntimeConfig();

    expect(config).toMatchObject({
      chainId: 4326,
      poolAddress: MAINNET_NULLARK_POOL,
      poolDeploymentBlockHex: MAINNET_POOL_DEPLOYMENT_BLOCK,
      withdrawVerifierAddress: MAINNET_VERIFIER,
      withdrawVerifierBytecodeHash: MAINNET_VERIFIER_HASH,
      relayerEndpoint: MAINNET_RELAYER,
      mainnetValueMovingApproved: true,
      guardedUsersApproved: true,
      productionPrivacyClaimsApproved: false
    });
  });
});

function stubMainnetEnv(
  options: {
    relayerEndpoint?: string;
    mainnetValueMovingApproved?: boolean;
    mainnetValueMovingApprovalHash?: string;
  } = {}
) {
  vi.stubEnv("VITE_SHIELDED_TRANSFERS_ENVIRONMENT", "megaeth-mainnet");
  vi.stubEnv("VITE_MEGAETH_CHAIN_ID", "4326");
  vi.stubEnv("VITE_MEGAETH_RPC_URL", "https://mainnet.megaeth.com/rpc");
  vi.stubEnv("VITE_SHIELDED_POOL_ADDRESS", MAINNET_NULLARK_POOL);
  vi.stubEnv("VITE_SHIELDED_POOL_DEPLOYMENT_BLOCK", MAINNET_POOL_DEPLOYMENT_BLOCK);
  vi.stubEnv("VITE_MERKLE_TREE_DEPTH", "20");
  vi.stubEnv("VITE_PROVER_MANIFEST_URL", "/proving/withdraw-artifacts.manifest.json");
  if (options.relayerEndpoint) {
    vi.stubEnv("VITE_RELAYER_ENDPOINT", options.relayerEndpoint);
  }
  if (options.mainnetValueMovingApproved !== undefined) {
    vi.stubEnv("VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVED", String(options.mainnetValueMovingApproved));
  }
  if (options.mainnetValueMovingApprovalHash) {
    vi.stubEnv("VITE_NULLARK_MAINNET_VALUE_MOVING_APPROVAL_ARTIFACT_HASH", options.mainnetValueMovingApprovalHash);
  }
  vi.stubEnv("VITE_WITHDRAW_VERIFIER_ADDRESS", MAINNET_VERIFIER);
  vi.stubEnv("VITE_WITHDRAW_VERIFIER_BYTECODE_HASH", MAINNET_VERIFIER_HASH);
}

function setLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url)
  });
}

function readEnvExample(): Record<string, string> {
  const cwd = typeof process !== "undefined" && process.cwd ? process.cwd() : ".";
  const file = readFileSync(join(cwd, ".env.example"), "utf8");
  return Object.fromEntries(
    file
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
