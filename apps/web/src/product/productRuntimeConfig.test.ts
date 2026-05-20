import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAINNET_VALUE_MOVING_BLOCKED_MESSAGE,
  PRODUCTION_PRIVACY_CLAIMS_BLOCKED_MESSAGE,
  assertMainnetValueMovingAllowed,
  assertProductionPrivacyClaimsAllowed,
  getProductRuntimeConfig,
  isMainnetValueMovingBlocked,
  setProductRuntimeConfigForTests
} from "./productRuntimeConfig.js";

const LEGACY_MAINNET_DEPTH20_POOL = "0x54af9d54b4edD062daD5581670E9E5f73048c87b";
const MAINNET_NULLARK_POOL = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
const MAINNET_POOL_DEPLOYMENT_BLOCK = "0xf98a11";
const MAINNET_VERIFIER = "0x9023FAfB13320D4A34AAD6C25E0411862b0E3397";
const MAINNET_VERIFIER_HASH = "0x9a20d11112ee8b3c57677de4ba84eccf3928cb8aec734a21a1df5770086ad4f6";
const STALE_MAINNET_POOL = "0xE02D37aCcb2444C8677BbB821F4171465b8cD0fB";
const STALE_MAINNET_POOL_DEPLOYMENT_BLOCK = "0xf87493";
const STALE_MAINNET_VERIFIER = "0x66E84786b323F431a6571578dCd88e33328AdFFa";
const STALE_MAINNET_VERIFIER_HASH = "0xc04104683424f81f2625045c77a73acf355084c1ddaf9ff6b2547c469488dae4";
const MAINNET_RELAYER = "https://relayer.nullark.com/transaction";
const NULLARK_TESTNET_RELAYER = "https://shielded-withdrawal-relayer-testnet.drz-danii.workers.dev/transaction";
const PLACEHOLDER_RELAYER = "https://nullark-relayer.example.com/transaction";
const MAINNET_RC_BLOCKED_STATE_HASH = "0x753591df4299a40ccb5be1eef6987db9d7299747272a8948f5530661b7e44436";
const MAINNET_VALUE_MOVING_APPROVAL_HASH =
  "0x29cc2aa2ae50a74a5b60a897849a947a5060fef378b2474eb0b063d99eb8ef6e";
const MAINNET_GUARDED_USERS_APPROVAL_HASH =
  "0x8014c831c038cb1e4d665676e739c5286612e6f4ea76d00b31481b084eea9a67";
const NULLARK_TESTNET_POOL = "0xfd41bc6473c969d5284B4C01284bD4A50c176f4d";
const NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK = "0x12930a0";
const NULLARK_TESTNET_WITHDRAW_VERIFIER = "0x1E2dE0CE5861E55F1159184F102Ad2a99C5bA46b";

describe("product runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setProductRuntimeConfigForTests(null);
  });

  it("fails closed instead of using checked-in mainnet pool config by default", () => {
    setLocation("http://localhost:5173/");

    expect(() => getProductRuntimeConfig()).toThrow("fresh NullarkPool binding");
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
      withdrawVerifierAddress: NULLARK_TESTNET_WITHDRAW_VERIFIER,
      allowUntrustedLocalDevProver: true,
      allowLocalDevProofServiceFallback: false,
      mainnetValueMovingApproved: false,
      guardedUsersApproved: false
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
      withdrawVerifierAddress: NULLARK_TESTNET_WITHDRAW_VERIFIER,
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

  it("allows the production Pages host to switch to the Nullark testnet runtime by query", () => {
    setLocation("https://shielded-private-transfer.pages.dev/?network=megaeth-testnet-nullark");
    stubMainnetEnv();

    expect(getProductRuntimeConfig()).toMatchObject({
      chainId: 6343,
      chainIdHex: "0x18c7",
      networkBadge: "TESTNET",
      poolAddress: NULLARK_TESTNET_POOL,
      poolDeploymentBlockHex: NULLARK_TESTNET_POOL_DEPLOYMENT_BLOCK,
      merkleTreeDepth: 20,
      withdrawVerifierAddress: NULLARK_TESTNET_WITHDRAW_VERIFIER,
      relayerEndpoint: NULLARK_TESTNET_RELAYER,
      allowUntrustedLocalDevProver: true,
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
    expect(getProductRuntimeConfig().relayerEndpoint).toBeUndefined();
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

  it("refuses guarded-user approval artifacts while no current-pool approval hash is pinned", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval has no pinned approved artifact hash");
  });

  it("keeps guarded-user approval blocked before validating legacy relayer endpoints", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({ relayerEndpoint: "https://relayer.nullark.com/relay-transaction" });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval has no pinned approved artifact hash");
  });

  it("keeps guarded-user approval blocked before validating placeholder relayer endpoints", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({ relayerEndpoint: PLACEHOLDER_RELAYER });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval has no pinned approved artifact hash");
  });

  it("keeps guarded-user approval blocked before validating noncanonical relayer hosts", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv({ relayerEndpoint: "https://attacker.example/transaction" });
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH", MAINNET_GUARDED_USERS_APPROVAL_HASH);

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval has no pinned approved artifact hash");
  });

  it("rejects guarded-user approval artifact hashes that are not pinned", () => {
    setLocation("https://shielded-private-transfer.pages.dev/");
    stubMainnetEnv();
    vi.stubEnv("VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVED", "true");
    vi.stubEnv(
      "VITE_NULLARK_MAINNET_GUARDED_USERS_APPROVAL_ARTIFACT_HASH",
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );

    expect(() => getProductRuntimeConfig()).toThrow("guarded-user approval has no pinned approved artifact hash");
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
