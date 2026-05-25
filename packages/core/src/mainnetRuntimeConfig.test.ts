import { describe, expect, it } from "vitest";
import {
  assertMainnetRuntimeConfigReady,
  LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL,
  MAINNET_RUNTIME_RELAYER_ENDPOINT,
  type MainnetRuntimeConfigRecord
} from "./mainnetRuntimeConfig.js";

const record: MainnetRuntimeConfigRecord = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  environment: "megaeth-mainnet",
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  deploymentPackageRef: "docs/evidence/megaeth-mainnet-deployment-package.json",
  sourceVerificationPackageRef: "docs/evidence/mainnet-readiness/source-verification-package.approved.json",
  proverManifestRef: "docs/evidence/mainnet-readiness/browser-prover-manifest.approved.json",
  relayerOpsRecordRef: "docs/evidence/mainnet-readiness/relayer-ops-record.approved.json",
  app: {
    deploymentUrl: "https://private-transfer.megaeth.app",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    poolContractName: "NullarkPool",
    poolSourcePath: "contracts/src/NullarkPool.sol",
    pool: "0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9",
    verifier: "0x4b2a8C9d7F11E39b66A0A2eAc599D912b3CEf6a0",
    verifierBytecodeHash: `0x${"3".repeat(64)}`,
    trustedSetupManifestTrustLevel: "trusted-setup-recorded",
    localProofServiceEnabled: false,
    localRelayerEnabled: false,
    walletUnlockSupportsMainnet: true
  },
  recovery: {
    apiUrl: "https://recovery.megaeth.app/merkle-path",
    chainId: 4326,
    pool: "0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9",
    indexerSupportsMainnet: true,
    differentDeviceRecoveryTestRef: "docs/evidence/mainnet-readiness/different-device-recovery.md",
    evidenceMode: "owner-accepted-testnet-recovery-substitute",
    indexerContinuityEvidenceRef: "docs/evidence/mainnet-readiness/recovery-indexer-continuity.approved.md",
    ownerAcceptanceRef: "private-owner-approval-record-not-in-public-repo"
  },
  relayer: {
    endpoint: MAINNET_RUNTIME_RELAYER_ENDPOINT,
    chainId: 4326,
    pool: "0x8a2D31b4C75e940d780987f2fB7a2D091cECb1F9",
    boundedSelectorsOnly: true,
    deploymentSelfTestRef: "docs/evidence/mainnet-readiness/relayer-deployment-self-test.approved.json"
  },
  blockedUntil: []
};

describe("mainnet runtime config readiness gate", () => {
  it("accepts a mainnet-bound runtime config record", () => {
    expect(assertMainnetRuntimeConfigReady(record)).toBe(record);
  });

  it("rejects draft or blocked records", () => {
    expect(() => assertMainnetRuntimeConfigReady({ ...record, status: "draft" })).toThrow(
      "mainnet runtime config record is still draft"
    );
    expect(() => assertMainnetRuntimeConfigReady({ ...record, blockedUntil: ["runtime-deploy"] })).toThrow(
      "mainnet runtime config record cannot have remaining blockers"
    );
  });

  it("rejects release-candidate or mainnet-blocked ready-mode markers", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        status: "release-candidate" as MainnetRuntimeConfigRecord["status"]
      })
    ).toThrow("mainnet runtime config status cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        status: "mainnet-blocked" as MainnetRuntimeConfigRecord["status"]
      })
    ).toThrow("mainnet runtime config status cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        sourceVerificationPackageRef:
          "docs/evidence/mainnet-readiness/release/nullark-v1-1-release-candidate-source-verification-package.approved.json"
      })
    ).toThrow("mainnet runtime source verification package ref cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        relayerOpsRecordRef: "docs/evidence/mainnet-readiness/relayer-ops-record.mainnet-blocked.json"
      })
    ).toThrow("mainnet runtime relayer ops record ref cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");
  });

  it("rejects testnet or local runtime bindings", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, app: { ...record.app, chainId: 6343, rpcUrl: "https://carrot.megaeth.com/rpc" } })
    ).toThrow("mainnet runtime app must use chain 4326");
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, app: { ...record.app, deploymentUrl: "http://localhost:5173" } })
    ).toThrow("mainnet runtime app deployment URL must be HTTPS");
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, app: { ...record.app, localProofServiceEnabled: true as false } })
    ).toThrow("mainnet runtime app must disable local proof service and local relayer");
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, app: { ...record.app, verifier: record.app.pool } })
    ).toThrow("mainnet runtime app verifier must differ from app pool");
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, relayer: { ...record.relayer, endpoint: "https://relayer.example.com/relay-transaction" } })
    ).toThrow("mainnet runtime relayer endpoint cannot reference placeholder, testnet, or local material");
  });

  it("rejects obvious placeholder deployed addresses", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        app: { ...record.app, pool: "0x1111111111111111111111111111111111111111" },
        recovery: { ...record.recovery, pool: "0x1111111111111111111111111111111111111111" },
        relayer: { ...record.relayer, pool: "0x1111111111111111111111111111111111111111" }
      })
    ).toThrow("mainnet runtime app pool cannot be an obvious placeholder address");
  });

  it("requires recovery and relayer to bind the same mainnet pool", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, recovery: { ...record.recovery, pool: "0x51f3F2E7C673E842D66b8aC34bFA28483edC08E2" } })
    ).toThrow("mainnet runtime recovery pool must match app pool");
    expect(() =>
      assertMainnetRuntimeConfigReady({ ...record, relayer: { ...record.relayer, boundedSelectorsOnly: false as true } })
    ).toThrow("mainnet runtime relayer must use bounded withdrawal selectors only");
  });

  it("rejects legacy Depth20 pool identity for the mainnet runtime target", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        app: {
          ...record.app,
          poolContractName: "ShieldedPoolDepth20" as "NullarkPool"
        }
      })
    ).toThrow("mainnet runtime app pool contract name must be NullarkPool");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        app: {
          ...record.app,
          poolSourcePath: "contracts/src/ShieldedPoolDepth20.sol" as "contracts/src/NullarkPool.sol"
        }
      })
    ).toThrow("mainnet runtime app pool source path must be contracts/src/NullarkPool.sol");
  });

  it("rejects the legacy Depth20 pool address even when relabeled as NullarkPool", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        app: {
          ...record.app,
          poolContractName: "NullarkPool",
          poolSourcePath: "contracts/src/NullarkPool.sol",
          pool: LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL
        },
        recovery: { ...record.recovery, pool: LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL },
        relayer: { ...record.relayer, pool: LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL }
      })
    ).toThrow("mainnet runtime app pool cannot use the legacy ShieldedPoolDepth20 mainnet pool address");
  });

  it("requires final recovery and indexer evidence metadata", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        recovery: {
          ...record.recovery,
          evidenceMode: "owner-accepted-testnet-recovery-substitute",
          ownerAcceptanceRef: "replace-me"
        }
      })
    ).toThrow("mainnet runtime config record requires valid recovery owner acceptance ref");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        recovery: {
          ...record.recovery,
          evidenceMode: "live-mainnet-recovery-indexer-continuity",
          indexerContinuityEvidenceRef: "docs/evidence/mainnet-readiness/runtime.approved.md"
        }
      })
    ).toThrow("mainnet runtime recovery indexer continuity evidence ref must identify recovery or indexer continuity evidence");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        recovery: {
          ...record.recovery,
          ownerAcceptanceRef: "docs/evidence/owner-approval/mainnet-recovery-evidence-acceptance.superseded.md"
        }
      })
    ).toThrow("mainnet runtime recovery owner acceptance ref cannot reference draft, review-ready, superseded, or historical evidence");
  });

  it("requires mainnet evidence refs to bind expected packages", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-runtime-owner-approval.md"
      })
    ).toThrow("mainnet runtime owner approval ref must live under docs/evidence/owner-approval");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        deploymentPackageRef: "private-owner-approval-record-not-in-public-repo"
      })
    ).toThrow("mainnet runtime deployment package ref must identify the MegaETH mainnet deployment package");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        proverManifestRef: "docs/evidence/mainnet-readiness/prover-notes.approved.json"
      })
    ).toThrow("mainnet runtime prover manifest ref must identify the expected evidence package");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        relayerOpsRecordRef: "docs/evidence/mainnet-readiness/relayer-ops-record.draft.json"
      })
    ).toThrow("mainnet runtime relayer ops record ref cannot reference draft, review-ready, release-candidate, or mainnet-blocked material");
  });

  it("requires owner approval refs to point at approved evidence", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        ownerApprovalRef: "docs/evidence/owner-approval/mainnet-runtime.md"
      })
    ).toThrow("mainnet runtime owner approval ref must reference approved owner evidence");

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        recovery: {
          ...record.recovery,
          ownerAcceptanceRef: "docs/evidence/owner-approval/mainnet-recovery-evidence-acceptance.md"
        }
      })
    ).toThrow("mainnet runtime recovery owner acceptance ref must reference approved owner evidence");
  });

  it("requires relayer runtime binding to the canonical transaction route and self-test evidence", () => {
    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        relayer: { ...record.relayer, endpoint: "https://relayer.megaeth.app/status" }
      })
    ).toThrow(`mainnet runtime relayer endpoint must equal ${MAINNET_RUNTIME_RELAYER_ENDPOINT}`);

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        relayer: { ...record.relayer, endpoint: "https://relayer.megaeth.app/transaction" }
      })
    ).toThrow(`mainnet runtime relayer endpoint must equal ${MAINNET_RUNTIME_RELAYER_ENDPOINT}`);

    expect(() =>
      assertMainnetRuntimeConfigReady({
        ...record,
        relayer: { ...record.relayer, deploymentSelfTestRef: "docs/evidence/mainnet-readiness/relayer-ops-record.approved.json" }
      })
    ).toThrow("mainnet runtime relayer deployment self-test ref must bind to relayer self-test evidence");
  });
});
