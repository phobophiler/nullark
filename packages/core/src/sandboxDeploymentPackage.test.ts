import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID,
  assertSandboxDeploymentPackageReady,
  type DeployedSandboxDeploymentPackage,
  type LiveStageCNullarkTestnetDeploymentPackage,
  type PreparedStageCNullarkSandboxDeploymentPackage,
} from "./sandboxDeploymentPackage.js";

const packagePath = path.resolve(process.cwd(), "test-fixtures/evidence/megaeth-testnet-sandbox-deployment-package.json");
const loadRecord = () => JSON.parse(fs.readFileSync(packagePath, "utf8")) as DeployedSandboxDeploymentPackage;
const stageCPackagePath = path.resolve(
  process.cwd(),
  "test-fixtures/evidence/megaeth-testnet-nullark-stage-c-prepared-deployment-package.json"
);
const loadStageCRecord = () =>
  JSON.parse(fs.readFileSync(stageCPackagePath, "utf8")) as LiveStageCNullarkTestnetDeploymentPackage;

const makePreparedStageCRecord = (): PreparedStageCNullarkSandboxDeploymentPackage => {
  const live = loadStageCRecord();

  return {
    ...live,
    status: "prepared-stage-c-nullark-testnet-package",
    packageMode: "prepared-no-deployment",
    deploymentApproved: false,
    signingApproved: false,
    rpcBroadcastApproved: false,
    readinessClassification: {
      artifactPromotionStatus: "draft-review-ready-only",
      testnetReadinessStatus: "draft-review-ready-only",
      mainnetReadinessStatus: "blocked",
      testnetDeploymentApproved: false,
      testnetSmokeApproved: false,
      promotionApproved: false,
      checklistRef: live.readinessClassification.checklistRef,
      hardBlockers: [
        "testnet deployment is not approved for the prepared package",
        "testnet smoke evidence is not approved for the prepared package",
        "local untrusted setup artifacts cannot be promoted",
        "mainnet 4326 remains blocked"
      ]
    },
    currentVerificationInputs: {
      focusedCoreTestsPassed: live.currentVerificationInputs.focusedCoreTestsPassed,
      coreTypecheckPassed: live.currentVerificationInputs.coreTypecheckPassed,
      circuitNpmTestPassed: live.currentVerificationInputs.circuitNpmTestPassed,
      verifierPromotionBlocked: live.currentVerificationInputs.verifierPromotionBlocked,
      trustedSetupReadyBlocked: live.currentVerificationInputs.trustedSetupReadyBlocked
    },
    deployedAddresses: null,
    deploymentTransactions: null,
    readOnlyVerification: null,
    initialTestTransaction: null
  };
};

describe("sandbox deployment package", () => {
  it("accepts the checked sandbox testnet package", () => {
    const record = loadRecord();

    expect(assertSandboxDeploymentPackageReady(record)).toBe(record);
  });

  it("blocks mainnet, production flags, and trusted-gate claims", () => {
    const record = loadRecord();

    expect(() => assertSandboxDeploymentPackageReady({ ...record, chainId: SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID })).toThrow(
      "sandbox deployment package cannot target MegaETH mainnet 4326"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, realFundsApproved: true as false })).toThrow(
      "sandbox deployment package cannot approve real funds or private-key evidence"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, cannotSatisfyVerifierPromotion: false as true })).toThrow(
      "sandbox deployment package must keep local-untrusted artifacts out of trusted gates"
    );
  });

  it("requires constructor args to match the dry-run deployment order", () => {
    const record = loadRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        constructorArgs: {
          ...record.constructorArgs,
          shieldedPool: [
            record.dryRun.predictedCreateAddressesAtNonceZero.poseidon2,
            record.signer.address,
            record.signer.address,
            record.dryRun.predictedCreateAddressesAtNonceZero.verifierAdapter
          ]
        }
      })
    ).toThrow("sandbox shielded pool constructor args order mismatch");
  });

  it("requires explicit legacy opt-in for stale ShieldedPool testnet scripts", () => {
    const record = loadRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          dryRun:
            "forge script contracts/script/DeployMegaEthTestnet.s.sol:DeployMegaEthTestnet --root contracts --rpc-url https://carrot.megaeth.com/rpc"
        }
      })
    ).toThrow("dry-run script uses legacy ShieldedPool testnet script without explicit legacy opt-in");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          readOnlyVerify:
            "forge script contracts/script/VerifyMegaEthTestnet.s.sol:VerifyMegaEthTestnet --root contracts --rpc-url https://carrot.megaeth.com/rpc"
        }
      })
    ).toThrow("read-only verify script uses legacy ShieldedPool testnet script without explicit legacy opt-in");
  });

  it("requires deployed-address and initial test transaction evidence", () => {
    const record = loadRecord();

    expect(() => assertSandboxDeploymentPackageReady({ ...record, deployedAddresses: null })).toThrow(
      "sandbox deployment package must record deployed addresses"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, initialTestTransaction: null })).toThrow(
      "sandbox deployment package must record the initial test transaction"
    );
    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readOnlyVerification: { ...record.readOnlyVerification!, shieldedPool: record.deployedAddresses!.verifierAdapter }
      })
    ).toThrow("sandbox read-only verification must target deployed shieldedPool");
  });

  it("rejects private-key and mainnet material in commands", () => {
    const record = loadRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: { ...record.scripts, broadcast: `${record.scripts.broadcast} --private-key 0x${"1".repeat(64)}` }
      })
    ).toThrow("sandbox deployment package broadcast script contains blocked secret or mainnet material");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: { ...record.scripts, dryRun: "forge script contracts/script/DeployMegaEthTestnet.s.sol --rpc-url https://mainnet.megaeth.com/rpc" }
      })
    ).toThrow("sandbox deployment package dry-run script contains blocked secret or mainnet material");
  });
});

describe("prepared Stage C Nullark sandbox deployment package", () => {
  it("accepts a prepared-but-not-deployed Stage C Nullark package", () => {
    const record = makePreparedStageCRecord();

    expect(assertSandboxDeploymentPackageReady(record)).toBe(record);
    expect(record.deployedAddresses).toBeNull();
    expect(record.deploymentTransactions).toBeNull();
    expect(record.contractCandidate.contractName).toBe("NullarkPool");
    expect(record.readinessClassification.artifactPromotionStatus).toBe("draft-review-ready-only");
    expect(record.readinessClassification.mainnetReadinessStatus).toBe("blocked");
  });

  it("blocks accidental mainnet chain and RPC material", () => {
    const record = makePreparedStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        chainId: SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID
      })
    ).toThrow("sandbox deployment package cannot target MegaETH mainnet 4326");
    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          dryRun:
            "forge script contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool --rpc-url https://mainnet.megaeth.com/rpc"
        }
      })
    ).toThrow("sandbox deployment package dry-run script contains blocked secret or mainnet material");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          readOnlyVerify: "forge script contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool --root contracts"
        }
      })
    ).toThrow("prepared Stage C package scripts must target the approved MegaETH testnet RPC");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          readOnlyVerify:
            "forge script contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool --root contracts --rpc-url https://carrot-alt.megaeth.com/rpc"
        }
      })
    ).toThrow("prepared Stage C package scripts must target the approved MegaETH testnet RPC");
  });

  it("blocks real funds, signing approval, and RPC broadcast approval", () => {
    const record = makePreparedStageCRecord();

    expect(() => assertSandboxDeploymentPackageReady({ ...record, realFundsApproved: true as false })).toThrow(
      "prepared Stage C package cannot approve deployment, signing, RPC broadcast, or real funds"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, signingApproved: true as false })).toThrow(
      "prepared Stage C package cannot approve deployment, signing, RPC broadcast, or real funds"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, rpcBroadcastApproved: true as false })).toThrow(
      "prepared Stage C package cannot approve deployment, signing, RPC broadcast, or real funds"
    );
    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readinessClassification: {
          ...record.readinessClassification,
          promotionApproved: true as false
        }
      })
    ).toThrow("prepared Stage C package cannot approve testnet deployment, smoke, or promotion");
  });

  it("rejects deployed-address claims without deployment receipts", () => {
    const record = makePreparedStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        deployedAddresses: {
          nullarkPool: "0x1111111111111111111111111111111111111111"
        } as unknown as null
      })
    ).toThrow("prepared Stage C package cannot claim deployed addresses without deployment receipts");
  });

  it("rejects stale ShieldedPool naming and old deployment scripts", () => {
    const record = makePreparedStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        contractCandidate: {
          ...record.contractCandidate,
          contractName: "ShieldedPool" as "NullarkPool"
        }
      })
    ).toThrow("prepared Stage C package contract name must be NullarkPool");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          dryRun:
            "forge script contracts/script/DeployMegaEthTestnet.s.sol:DeployMegaEthTestnet --root contracts --rpc-url https://carrot.megaeth.com/rpc"
        }
      })
    ).toThrow("prepared Stage C package must use the NullarkPool testnet deployment script");
  });

  it("keeps local Groth16 artifacts blocked from trusted promotion", () => {
    const record = makePreparedStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        localArtifactRefs: {
          ...record.localArtifactRefs,
          productionUsable: true as false
        }
      })
    ).toThrow("prepared Stage C package must mark Groth16 artifacts as local-untrusted only");
    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        currentVerificationInputs: {
          ...record.currentVerificationInputs,
          verifierPromotionBlocked: "ready" as "local untrusted setup artifacts cannot be promoted"
        }
      })
    ).toThrow("prepared Stage C package must bind the current verification and promotion blockers");
    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readinessClassification: {
          ...record.readinessClassification,
          artifactPromotionStatus: "promoted" as "draft-review-ready-only"
        }
      })
    ).toThrow("prepared Stage C package readiness must be draft/review-ready only with mainnet blocked");
  });
});

describe("live Stage C Nullark testnet deployment package", () => {
  it("accepts the live testnet deployment package while keeping promotion and mainnet blocked", () => {
    const record = loadStageCRecord();

    expect(assertSandboxDeploymentPackageReady(record)).toBe(record);
    expect(record.packageMode).toBe("live-testnet-deployment");
    expect(record.readinessClassification.testnetReadinessStatus).toBe("live-testnet-deployed-with-replacement2-smoke");
    expect(record.readinessClassification.mainnetReadinessStatus).toBe("blocked");
    expect(record.readinessClassification.testnetSmokeApproved).toBe(true);
    expect(record.readinessClassification.promotionApproved).toBe(false);
    expect(record.deployedAddresses.nullarkPool).toBe(record.deployedAddresses.shieldedPool);
    expect(record.readOnlyVerification.result).toBe("passed");
    expect(record.verifierCompatibility.result).toBe("passed");
    expect(record.verifierCompatibility.deployedVerifierAbiSignalType).toBe("uint256[12]");
    expect(record.initialTestTransaction).toBeNull();
  });

  it("rejects live package mainnet, guarded-user, production-claim, and real-fund approval drift", () => {
    const record = loadStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        chainId: SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID
      })
    ).toThrow("sandbox deployment package cannot target MegaETH mainnet 4326");
    expect(() => assertSandboxDeploymentPackageReady({ ...record, guardedUsersBlocked: false as true })).toThrow(
      "sandbox deployment package must keep mainnet, guarded users, and production claims blocked"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, productionPrivacyClaimsBlocked: false as true })).toThrow(
      "sandbox deployment package must keep mainnet, guarded users, and production claims blocked"
    );
    expect(() => assertSandboxDeploymentPackageReady({ ...record, realFundsApproved: true as false })).toThrow(
      "live Stage C package cannot approve real funds"
    );
  });

  it("rejects live package private-key command drift and missing deployment evidence", () => {
    const record = loadStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        scripts: {
          ...record.scripts,
          broadcast: `${record.scripts.broadcast} --private-key 0x${"1".repeat(64)}`
        }
      })
    ).toThrow("sandbox deployment package broadcast script contains blocked secret or mainnet material");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        deploymentTransactions: record.deploymentTransactions.slice(0, 4)
      })
    ).toThrow("live Stage C package must record all deployment transactions");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readOnlyVerification: {
          ...record.readOnlyVerification,
          liveCastChecks: { ...record.readOnlyVerification.liveCastChecks, codePresent: false as true }
        }
      })
    ).toThrow("live Stage C package read-only verification must prove depth, capacity, and deployed code");
  });

  it("rejects live package chain and RPC evidence drift", () => {
    const record = loadStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        rpcUrl: "https://carrot-alt.megaeth.com/rpc"
      })
    ).toThrow("sandbox deployment package must target the approved MegaETH testnet RPC");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readOnlyVerification: {
          ...record.readOnlyVerification,
          command: record.readOnlyVerification.command.replace(" --chain-id 6343", "")
        }
      })
    ).toThrow("live Stage C package read-only verification must bind the approved testnet RPC, chain ID, script, and deployed addresses");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        readOnlyVerification: {
          ...record.readOnlyVerification,
          command: record.readOnlyVerification.command.replace(
            "https://carrot.megaeth.com/rpc",
            "https://carrot-alt.megaeth.com/rpc"
          )
        }
      })
    ).toThrow("live Stage C package read-only verification must bind the approved testnet RPC, chain ID, script, and deployed addresses");
  });

  it("rejects live package address and receipt binding drift", () => {
    const record = loadStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        deployedAddresses: {
          ...record.deployedAddresses,
          verifierAdapter: record.deployedAddresses.privateTransferVerifier
        }
      })
    ).toThrow("live Stage C package deployed contract addresses must be unique except NullarkPool/shieldedPool alias");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        deploymentTransactions: record.deploymentTransactions.map((transaction) =>
          transaction.contractName === "NullarkPool"
            ? { ...transaction, contractAddress: record.deployedAddresses.verifierAdapter }
            : transaction
        )
      })
    ).toThrow("live Stage C deployment transaction NullarkPool must match deployed nullarkPool address");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        deploymentTransactions: record.deploymentTransactions.map((transaction, index) =>
          index === 1
            ? { ...transaction, transactionHash: record.deploymentTransactions[0]!.transactionHash }
            : transaction
        )
      })
    ).toThrow("live Stage C deployment transactions must have unique transaction hashes");
  });

  it("rejects live package stale verifier compatibility evidence", () => {
    const record = loadStageCRecord();

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        verifierCompatibility: {
          ...record.verifierCompatibility,
          deployedVerifierAbiSignalType: "uint256[10]" as "uint256[12]"
        }
      })
    ).toThrow("live Stage C package must prove the deployed withdraw verifier is the 12-public-input artifact");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        verifierCompatibility: {
          ...record.verifierCompatibility,
          adapterVerifyMutatedPublicInput10Returned: true as false
        }
      })
    ).toThrow("live Stage C package must prove deployed verifier acceptance and mutated-input rejection");

    expect(() =>
      assertSandboxDeploymentPackageReady({
        ...record,
        verifierCompatibility: {
          ...record.verifierCompatibility,
          command: record.verifierCompatibility.command.replace(
            record.deployedAddresses.withdrawVerifier,
            record.deployedAddresses.privateTransferVerifier
          )
        }
      })
    ).toThrow("live Stage C package verifier compatibility command must bind deployed verifier and adapter addresses");
  });
});
