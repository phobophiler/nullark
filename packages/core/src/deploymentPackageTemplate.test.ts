import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDeploymentPackageReady, type DeploymentPackageCandidate } from "./deploymentPackage.js";
import {
  assertDeploymentPackageTemplateReady,
  getDeploymentPackageTemplateReadinessReport
} from "./deploymentPackageTemplate.js";

const templatePath = path.resolve(process.cwd(), "test-fixtures/evidence/megaeth-testnet-deployment-package.template.json");
const finalAddresses = {
  privateTransferVerifier: "0x1000000000000000000000000000000000000001",
  withdrawVerifier: "0x2000000000000000000000000000000000000002",
  verifierAdapter: "0x3000000000000000000000000000000000000003",
  shieldedPool: "0x4000000000000000000000000000000000000004",
  poseidon2: "0x5000000000000000000000000000000000000005",
  feeController: "0x6000000000000000000000000000000000000006"
} as const;

function readTemplate(): DeploymentPackageCandidate {
  return JSON.parse(fs.readFileSync(templatePath, "utf8")) as DeploymentPackageCandidate;
}

function finalTemplateCandidate(): DeploymentPackageCandidate {
  const template = readTemplate();
  return {
    ...template,
    status: "review-ready",
    addresses: finalAddresses,
    predictedAddressEvidence: {
      deployer: "0x7000000000000000000000000000000000000007",
      salt: "nullark-v1.2-megaeth-testnet-2026-05-22",
      initCodeHash: `sha256:${"a".repeat(64)}`,
      derivationCommand:
        "forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --rpc-url https://carrot.megaeth.com/rpc",
      contracts: Object.entries(finalAddresses).map(([label, expectedAddress], index) => ({
        label: label as keyof typeof finalAddresses,
        expectedAddress,
        deployer: "0x7000000000000000000000000000000000000007",
        salt: `nullark-v1.2-megaeth-testnet-${label}`,
        initCodeHash: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
        derivationCommand: `forge script contracts/script/DeriveMegaEthTestnetAddresses.s.sol --sig derive${label} --rpc-url https://carrot.megaeth.com/rpc`
      }))
    },
    signerPolicy: {
      ...template.signerPolicy,
      signerDescription: "External signer only after explicit deployment approval; no private keys in repository."
    },
    constructorArgs: {
      privateTransferVerifier: [],
      withdrawVerifier: [],
      verifierAdapter: [finalAddresses.privateTransferVerifier, finalAddresses.withdrawVerifier],
      shieldedPool: [finalAddresses.verifierAdapter, finalAddresses.feeController, finalAddresses.poseidon2]
    },
    constructorArgsRecorded: true
  };
}

describe("MegaETH testnet deployment package template", () => {
  it("keeps the checked-in template blocked until real addresses and approvals exist", () => {
    const deploymentPackage = readTemplate();

    expect(deploymentPackage.chainId).toBe(6343);
    expect(deploymentPackage.rpcUrl).toBe("https://carrot.megaeth.com/rpc");
    expect(deploymentPackage.status).toBe("draft");
    expect(deploymentPackage.mainnet4326Blocked).toBe(true);
    expect(deploymentPackage.broadcast).toBe(false);
    expect(deploymentPackage.deploymentApproved).toBe(false);
    expect(deploymentPackage.signingApproved).toBe(false);
    expect(deploymentPackage.privateKeysInRepo).toBe(false);
    expect(deploymentPackage.realFundsApproved).toBe(false);
    expect(deploymentPackage.guardedUsersBlocked).toBe(true);
    expect(deploymentPackage.productionPrivacyClaimsBlocked).toBe(true);
    expect(deploymentPackage.addressMode).toBe("predicted-create2");
    expect(deploymentPackage.signerPolicy.privateKeysInRepo).toBe(false);
    expect(deploymentPackage.signerPolicy.broadcastDefault).toBe(false);
    expect(deploymentPackage.constructorArgsRecorded).toBe(false);
    expect(() => assertDeploymentPackageReady(deploymentPackage)).toThrow();
    expect(() => assertDeploymentPackageTemplateReady(deploymentPackage)).toThrow(
      "deployment package template readiness blockers"
    );
    expect(getDeploymentPackageTemplateReadinessReport(deploymentPackage).blockers).toEqual(
      expect.arrayContaining([
        "deployment package template privateTransferVerifier address must be a final non-placeholder address",
        "deployment package template predicted address salt must be final",
        "deployment package template shieldedPool ABI constructor address binding mismatch"
      ])
    );
  });

  it("accepts only a final non-broadcast testnet template candidate", () => {
    const candidate = finalTemplateCandidate();

    expect(assertDeploymentPackageTemplateReady(candidate)).toBe(candidate);
  });

  it("rejects placeholder addresses before they can look readiness-ready", () => {
    const candidate = finalTemplateCandidate();
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    expect(() =>
      assertDeploymentPackageTemplateReady({
        ...candidate,
        addresses: {
          ...candidate.addresses,
          privateTransferVerifier: zeroAddress
        },
        predictedAddressEvidence: {
          ...candidate.predictedAddressEvidence!,
          contracts: candidate.predictedAddressEvidence!.contracts.map((contract) =>
            contract.label === "privateTransferVerifier" ? { ...contract, expectedAddress: zeroAddress } : contract
          )
        },
        constructorArgs: {
          ...candidate.constructorArgs,
          verifierAdapter: [zeroAddress, candidate.addresses.withdrawVerifier]
        }
      })
    ).toThrow("deployment package template privateTransferVerifier address must be a final non-placeholder address");
  });

  it("rejects reused deployment addresses even when constructor args are internally consistent", () => {
    const candidate = finalTemplateCandidate();
    const reusedAddress = candidate.addresses.privateTransferVerifier;
    const addresses = {
      ...candidate.addresses,
      withdrawVerifier: reusedAddress
    };

    expect(() =>
      assertDeploymentPackageTemplateReady({
        ...candidate,
        addresses,
        predictedAddressEvidence: {
          ...candidate.predictedAddressEvidence!,
          contracts: candidate.predictedAddressEvidence!.contracts.map((contract) =>
            contract.label === "withdrawVerifier" ? { ...contract, expectedAddress: reusedAddress } : contract
          )
        },
        constructorArgs: {
          ...candidate.constructorArgs,
          verifierAdapter: [addresses.privateTransferVerifier, addresses.withdrawVerifier]
        }
      })
    ).toThrow("deployment package template addresses must not reuse");
  });

  it("rejects ABI constructor address mismatches against final deployment addresses", () => {
    const candidate = finalTemplateCandidate();

    expect(() =>
      assertDeploymentPackageTemplateReady({
        ...candidate,
        constructorArgs: {
          ...candidate.constructorArgs,
          verifierAdapter: [candidate.addresses.withdrawVerifier, candidate.addresses.privateTransferVerifier]
        }
      })
    ).toThrow("deployment package template verifierAdapter ABI constructor address binding mismatch");
  });
});
