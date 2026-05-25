import { describe, expect, it } from "vitest";
import {
  assertSourceVerificationPackageReady,
  assertSourceVerificationPackageReleaseCandidate,
  collectSourceVerificationDeploymentPackageBlockers,
  collectSourceVerificationReadOnlyRpcEvidenceBlockers,
  type SourceVerificationConstructorArgRole,
  type SourceVerificationLicenseType,
  type SourceVerificationPackage
} from "./sourceVerification.js";

const labels = ["privateTransferVerifier", "withdrawVerifier", "verifierAdapter", "shieldedPool", "poseidon2"] as const;
const addressesByLabel = {
  depositVerifier: "0x7777777777777777777777777777777777777777",
  privateTransferVerifier: "0x1111111111111111111111111111111111111111",
  withdrawVerifier: "0x2222222222222222222222222222222222222222",
  verifierAdapter: "0x3333333333333333333333333333333333333333",
  shieldedPool: "0x4444444444444444444444444444444444444444",
  poseidon2: "0x5555555555555555555555555555555555555555",
  feeController: "0x6666666666666666666666666666666666666666"
} as const;
const v11AddressesByLabel = {
  privateTransferVerifier: "0x0C78dE1615892205908810bF0129f10165346B57",
  withdrawVerifier: "0x9023FAfB13320D4A34AAD6C25E0411862b0E3397",
  verifierAdapter: "0x311d92DAc355F239B039C4298A7f374E09E23e52",
  shieldedPool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
  poseidon2: "0x9146549928FEABd8c63Ee04371672D958deAc563"
} as const;

function sourcePathFor(label: (typeof labels)[number]): string {
  switch (label) {
    case "privateTransferVerifier":
      return "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol";
    case "withdrawVerifier":
      return "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol";
    case "verifierAdapter":
      return "contracts/src/verifiers/ActionRoutingGroth16Verifier.sol";
    case "shieldedPool":
      return "contracts/src/NullarkPool.sol";
    case "poseidon2":
      return "contracts/src/vendor/SourceVerifiedPoseidon2.sol";
  }
}

function contractNameFor(label: (typeof labels)[number]): string {
  switch (label) {
    case "privateTransferVerifier":
      return "Groth16PrivateTransferVerifier";
    case "withdrawVerifier":
      return "Groth16WithdrawVerifier";
    case "verifierAdapter":
      return "ActionRoutingGroth16Verifier";
    case "shieldedPool":
      return "NullarkPool";
    case "poseidon2":
      return "SourceVerifiedPoseidon2";
  }
}

function licenseTypeFor(label: (typeof labels)[number]): "GPL-3.0" | "MIT" {
  if (label === "privateTransferVerifier" || label === "withdrawVerifier") {
    return "GPL-3.0";
  }
  return "MIT";
}

function constructorArgRolesFor(label: (typeof labels)[number]): readonly SourceVerificationConstructorArgRole[] {
  if (label === "verifierAdapter") {
    return ["privateTransferVerifier", "withdrawVerifier"];
  }
  if (label === "shieldedPool") {
    return ["verifierAdapter", "feeController", "poseidon2"];
  }
  return [];
}

function constructorArgsFor(label: (typeof labels)[number]): readonly `0x${string}`[] {
  if (label === "verifierAdapter") {
    return [addressesByLabel.privateTransferVerifier, addressesByLabel.withdrawVerifier];
  }
  if (label === "shieldedPool") {
    return [
      addressesByLabel.verifierAdapter,
      addressesByLabel.feeController,
      addressesByLabel.poseidon2
    ];
  }
  return [];
}

function constructorArgsAbiEncodedFor(label: (typeof labels)[number]): `0x${string}` {
  const constructorArgs = constructorArgsFor(label);
  if (constructorArgs.length === 0) {
    return "0x";
  }
  return `0x${constructorArgs.map((arg) => arg.slice(2).padStart(64, "0")).join("")}`;
}

const record: SourceVerificationPackage = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  cleanDeploymentObservation: {
    readOnlyRpcCodeRef: "docs/evidence/mainnet-readiness/source-verification/current-readonly-rpc-code.json",
    readOnlyRpcCodeHash: `sha256:${"9".repeat(64)}`
  },
  chainId: 4326,
  explorerBaseUrl: "https://mega.etherscan.io",
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  compiler: {
    solcVersion: "0.8.34",
    optimizer: true,
    optimizerRuns: 200,
    evmVersion: "cancun",
    remappings: ["forge-std/=contracts/lib/forge-std/src/"]
  },
  sourceTreeCommit: "abcdef1234567890abcdef1234567890abcdef12",
  contracts: labels.map((label, index) => {
    const address = addressesByLabel[label];
    const constructorArgs = constructorArgsFor(label);
    const constructorArgsAbiEncoded = constructorArgsAbiEncodedFor(label);
    const constructorArgFlags = constructorArgs.length > 0 ? ` --constructor-args ${constructorArgsAbiEncoded}` : "";
    return {
      label,
      address,
      contractName: contractNameFor(label),
      licenseType: licenseTypeFor(label),
      sourcePath: sourcePathFor(label),
      sourceHash: `sha256:${String(index + 2).repeat(64).slice(0, 64)}`,
      constructorArgRoles: constructorArgRolesFor(label),
      constructorArgs,
      constructorArgsAbiEncoded,
      creationBytecodeHash: `sha256:${String(index + 3).repeat(64).slice(0, 64)}`,
      runtimeBytecodeHash: `sha256:${String(index + 4).repeat(64).slice(0, 64)}`,
      runtimeBytecodeHashSource: "docs/evidence/mainnet-readiness/source-verification/current-readonly-rpc-code.json",
      explorerUrl: `https://mega.etherscan.io/address/${address}#code`,
      explorerProofArtifactRef: `docs/evidence/mainnet-readiness/source-verification/${label}.json`,
      explorerApiResponseHash: `sha256:${String(index + 5).repeat(64).slice(0, 64)}`,
      verificationCommand: `forge verify-contract ${address} ${sourcePathFor(
        label
      )}:${contractNameFor(label)} --chain 4326 --compiler-version 0.8.34 --num-of-optimizations 200 --evm-version cancun${constructorArgFlags}`,
      verified: true,
      verifiedAt: "2026-05-07T00:00:00.000Z",
      currentReadOnlyRpcCode: {
        evidenceRef: "docs/evidence/mainnet-readiness/source-verification/current-readonly-rpc-code.json",
        codePresent: true,
        runtimeByteLength: 1000 + index,
        runtimeBytecodeHash: `sha256:${String(index + 4).repeat(64).slice(0, 64)}`
      }
    };
  }),
  blockedUntil: []
};

function v12SourceVerificationRecord(): SourceVerificationPackage {
  const readOnlyRef = "docs/evidence/mainnet-readiness/source-verification/current-readonly-rpc-code.json";
  const v12Labels = ["depositVerifier", "privateTransferVerifier", "withdrawVerifier", "verifierAdapter", "shieldedPool", "poseidon2"] as const;
  const v12SourcePathFor = (label: (typeof v12Labels)[number]): string => {
    switch (label) {
      case "depositVerifier":
        return "contracts/src/verifiers/generated/mainnet/Groth16DepositVerifier.sol";
      case "privateTransferVerifier":
        return "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol";
      case "withdrawVerifier":
        return "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol";
      case "verifierAdapter":
        return "contracts/src/verifiers/ActionRoutingGroth16V12Verifier.sol";
      case "shieldedPool":
        return "contracts/src/v1_2/NullarkPool.sol";
      case "poseidon2":
        return "contracts/src/vendor/SourceVerifiedPoseidon2.sol";
    }
  };
  const v12ContractNameFor = (label: (typeof v12Labels)[number]): string => {
    switch (label) {
      case "depositVerifier":
        return "Groth16DepositVerifier";
      case "privateTransferVerifier":
        return "Groth16PrivateTransferVerifier";
      case "withdrawVerifier":
        return "Groth16WithdrawVerifier";
      case "verifierAdapter":
        return "ActionRoutingGroth16V12Verifier";
      case "shieldedPool":
        return "NullarkPool";
      case "poseidon2":
        return "SourceVerifiedPoseidon2";
    }
  };
  const v12ConstructorArgsFor = (label: (typeof v12Labels)[number]): readonly `0x${string}`[] => {
    if (label === "verifierAdapter") {
      return [addressesByLabel.depositVerifier, addressesByLabel.privateTransferVerifier, addressesByLabel.withdrawVerifier];
    }
    if (label === "shieldedPool") {
      return [addressesByLabel.verifierAdapter, addressesByLabel.feeController, addressesByLabel.poseidon2];
    }
    return [];
  };
  const v12ConstructorArgRolesFor = (label: (typeof v12Labels)[number]): readonly SourceVerificationConstructorArgRole[] => {
    if (label === "verifierAdapter") {
      return ["depositVerifier", "privateTransferVerifier", "withdrawVerifier"];
    }
    if (label === "shieldedPool") {
      return ["verifierAdapter", "feeController", "poseidon2"];
    }
    return [];
  };
  return {
    ...record,
    productVersion: "nullark-v1.2-fee-governance",
    noV1_1ApprovalReuse: true,
    contracts: v12Labels.map((label, index) => {
      const address = addressesByLabel[label];
      const sourcePath = v12SourcePathFor(label);
      const contractName = v12ContractNameFor(label);
      const constructorArgs = v12ConstructorArgsFor(label);
      const constructorArgsAbiEncoded = `0x${constructorArgs.map((arg) => arg.slice(2).padStart(64, "0")).join("")}`;
      const constructorArgFlags = constructorArgs.length > 0 ? ` --constructor-args ${constructorArgsAbiEncoded}` : "";
      const sourceHash = `sha256:${String(index + 2).repeat(64).slice(0, 64)}`;
      const runtimeBytecodeHash = `sha256:${String(index + 4).repeat(64).slice(0, 64)}`;
      const licenseType: SourceVerificationLicenseType =
        label === "depositVerifier" || label === "privateTransferVerifier" || label === "withdrawVerifier" ? "GPL-3.0" : "MIT";
      const contract = {
        label,
        address,
        contractName,
        licenseType,
        sourcePath,
        sourceHash,
        constructorArgRoles: v12ConstructorArgRolesFor(label),
        constructorArgs,
        constructorArgsAbiEncoded: constructorArgsAbiEncoded as `0x${string}`,
        creationBytecodeHash: `sha256:${String(index + 3).repeat(64).slice(0, 64)}`,
        runtimeBytecodeHash,
        runtimeBytecodeHashSource: readOnlyRef,
        explorerUrl: `https://mega.etherscan.io/address/${address}#code`,
        explorerProofArtifactRef: `docs/evidence/mainnet-readiness/source-verification/${label}.json`,
        explorerApiResponseHash: `sha256:${String(index + 5).repeat(64).slice(0, 64)}`,
        verificationCommand: `forge verify-contract ${address} ${sourcePath}:${contractName} --chain 4326 --compiler-version 0.8.34 --num-of-optimizations 200 --evm-version cancun${constructorArgFlags}`,
        verified: true as const,
        verifiedAt: "2026-05-07T00:00:00.000Z",
        currentReadOnlyRpcCode: {
          evidenceRef: readOnlyRef,
          codePresent: true as const,
          runtimeByteLength: 1000 + index,
          runtimeBytecodeHash
        }
      };
      if (label === "depositVerifier" || label === "privateTransferVerifier" || label === "withdrawVerifier") {
        return { ...contract, generatedVerifierHash: sourceHash };
      }
      return contract;
    })
  };
}

describe("source verification package gate", () => {
  it("accepts a complete MegaETH mainnet source verification package", () => {
    expect(assertSourceVerificationPackageReady(record)).toBe(record);
  });

  it("accepts a Nullark v1.1 release candidate only with explicit blocked-state evidence", () => {
    const releaseCandidate: SourceVerificationPackage = {
      ...record,
      status: "release-candidate",
      releaseCandidate: {
        productVersion: "Nullark v1.1",
        mainnet4326Blocked: true,
        deploymentApproved: false,
        signingApproved: false,
        broadcastApproved: false,
        realFundsApproved: false,
        guardedUsersBlocked: true,
        productionPrivacyClaimsBlocked: true,
        blockedStateEvidenceRef: "docs/evidence/mainnet-readiness/nullark-v1.1-deployment-source-verification-required-inputs.md"
      },
      blockedUntil: ["final owner approval is not recorded"]
    };

    expect(assertSourceVerificationPackageReleaseCandidate(releaseCandidate)).toBe(releaseCandidate);
    expect(() => assertSourceVerificationPackageReady(releaseCandidate)).toThrow(
      "source verification package must be approved-for-mainnet"
    );
    const { releaseCandidate: _releaseCandidateGate, ...missingReleaseCandidateGate } = releaseCandidate;
    expect(() =>
      assertSourceVerificationPackageReleaseCandidate(missingReleaseCandidateGate)
    ).toThrow("source verification release candidate requires blocked-state evidence");
    expect(() =>
      assertSourceVerificationPackageReleaseCandidate({
        ...releaseCandidate,
        releaseCandidate: {
          ...releaseCandidate.releaseCandidate!,
          deploymentApproved: true as false
        }
      })
    ).toThrow("source verification release candidate must keep mainnet deployment, signing, broadcast, funding, users, and production claims blocked");
    expect(() => assertSourceVerificationPackageReleaseCandidate({ ...releaseCandidate, blockedUntil: [] })).toThrow(
      "source verification release candidate must list remaining blockers"
    );
  });

  it("rejects draft or blocked packages", () => {
    expect(() => assertSourceVerificationPackageReady({ ...record, status: "draft" })).toThrow(
      "source verification package is still draft"
    );
    expect(() => assertSourceVerificationPackageReady({ ...record, blockedUntil: ["poseidon-verification"] })).toThrow(
      "source verification package cannot have remaining blockers"
    );
  });

  it("binds declared runtime bytecode hashes to current read-only RPC code evidence", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            currentReadOnlyRpcCode: {
              ...record.contracts[0]!.currentReadOnlyRpcCode!,
              runtimeBytecodeHash: `sha256:${"f".repeat(64)}`
            }
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification runtime bytecode hash does not match current read-only RPC evidence");

    const { currentReadOnlyRpcCode: _currentReadOnlyRpcCode, ...contractWithoutCurrentReadOnlyRpcCode } = record.contracts[0]!;
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          contractWithoutCurrentReadOnlyRpcCode,
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification record requires current read-only RPC code evidence");
  });

  it("rejects missing or non-code read-only RPC code evidence", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        cleanDeploymentObservation: {}
      })
    ).toThrow("source verification package requires clean deployment read-only RPC code evidence ref");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            currentReadOnlyRpcCode: {
              ...record.contracts[0]!.currentReadOnlyRpcCode!,
              codePresent: false as true
            }
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier current read-only RPC evidence must prove deployed code is present");
  });

  it("collects missing and mismatched read-only RPC evidence file blockers", () => {
    expect(
      collectSourceVerificationReadOnlyRpcEvidenceBlockers(record, () => ({
        exists: false
      }))
    ).toContain(
      "source verification read-only RPC evidence file is missing: docs/evidence/mainnet-readiness/source-verification/current-readonly-rpc-code.json"
    );

    const evidenceContracts = Object.fromEntries(
      record.contracts.map((contract) => [
        contract.label,
        {
          address: contract.address,
          codePresent: true,
          runtimeByteLength: contract.currentReadOnlyRpcCode!.runtimeByteLength,
          runtimeBytecodeHash: contract.currentReadOnlyRpcCode!.runtimeBytecodeHash
        }
      ])
    ) as Record<
      (typeof labels)[number],
      {
        address: `0x${string}`;
        codePresent: boolean;
        runtimeByteLength: number;
        runtimeBytecodeHash: string;
      }
    >;
    evidenceContracts.privateTransferVerifier.runtimeBytecodeHash = `sha256:${"e".repeat(64)}`;

    expect(
      collectSourceVerificationReadOnlyRpcEvidenceBlockers(record, () => ({
        exists: true,
        contentHash: record.cleanDeploymentObservation!.readOnlyRpcCodeHash!,
        record: {
          chainId: 4326,
          broadcast: false,
          privateKeysUsed: false,
          contracts: evidenceContracts
        }
      }))
    ).toContain("privateTransferVerifier read-only RPC evidence runtime bytecode hash does not match source verification package");
  });

  it("cross-checks source verification records against deployment package assumptions", () => {
    const deploymentRecords = record.contracts.map((contract) => ({
      contract: contract.label,
      address: contract.address,
      chainId: record.chainId,
      explorerUrl: contract.explorerUrl,
      sourceHash: contract.sourceHash,
      runtimeBytecodeHash: contract.runtimeBytecodeHash,
      verified: true
    }));

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, [
        {
          ...deploymentRecords[3]!,
          address: addressesByLabel.privateTransferVerifier
        },
        ...deploymentRecords.slice(0, 3),
        ...deploymentRecords.slice(4)
      ])
    ).toContain("shieldedPool source verification package address does not match deployment package");

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, [
        {
          ...deploymentRecords[3]!,
          runtimeBytecodeHash: `sha256:${"a".repeat(64)}`
        },
        ...deploymentRecords.slice(0, 3),
        ...deploymentRecords.slice(4)
      ])
    ).toContain("shieldedPool source verification package runtime bytecode hash does not match deployment package");

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, [
        {
          ...deploymentRecords[0]!,
          sourceHash: `sha256:${"b".repeat(64)}`
        },
        ...deploymentRecords.slice(1)
      ])
    ).toContain("privateTransferVerifier source verification package source hash does not match deployment package");

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, deploymentRecords.slice(1))
    ).toContain("privateTransferVerifier source verification record is missing from deployment package assumptions");
  });

  it("rejects duplicate or unknown deployment package source-verification bindings", () => {
    const deploymentRecords = record.contracts.map((contract) => ({
      contract: contract.label,
      address: contract.address,
      chainId: record.chainId,
      explorerUrl: contract.explorerUrl,
      sourceHash: contract.sourceHash,
      runtimeBytecodeHash: contract.runtimeBytecodeHash,
      verified: true
    }));

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, [
        deploymentRecords[0]!,
        deploymentRecords[0]!,
        ...deploymentRecords.slice(1)
      ])
    ).toContain("privateTransferVerifier deployment package source verification record must be unique");

    expect(
      collectSourceVerificationDeploymentPackageBlockers(record, [
        ...deploymentRecords,
        {
          contract: "unexpectedVerifier" as "withdrawVerifier",
          address: "0x7777777777777777777777777777777777777777",
          chainId: record.chainId,
          explorerUrl: "https://mega.etherscan.io/address/0x7777777777777777777777777777777777777777#code",
          sourceHash: `sha256:${"7".repeat(64)}`,
          runtimeBytecodeHash: `sha256:${"8".repeat(64)}`,
          verified: true
        }
      ])
    ).toContain("unexpectedVerifier deployment package source verification record is not an expected source verification contract");
  });

  it("requires exact contract coverage", () => {
    expect(() => assertSourceVerificationPackageReady({ ...record, contracts: record.contracts.slice(1) })).toThrow(
      "source verification package requires records for every deployed contract"
    );
  });

  it("requires MegaETH mainnet explorer verification records", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-source-verification.md"
      })
    ).toThrow("source verification package owner approval ref must live under docs/evidence/owner-approval");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, explorerUrl: "https://testnet-mega.etherscan.io/address/0xabc#code" }, ...record.contracts.slice(1)]
      })
    ).toThrow("privateTransferVerifier source verification record requires MegaETH mainnet explorer URL");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, explorerUrl: `https://mega.etherscan.io/address/${record.contracts[1]!.address}#code` },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification explorer URL must match deployed address");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, verified: false as true }, ...record.contracts.slice(1)]
      })
    ).toThrow("privateTransferVerifier source verification record must be verified");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, explorerProofArtifactRef: "replace-me" }, ...record.contracts.slice(1)]
      })
    ).toThrow("source verification package requires valid privateTransferVerifier explorer proof artifact ref");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, explorerApiResponseHash: "replace-me" }, ...record.contracts.slice(1)]
      })
    ).toThrow("source verification package requires valid privateTransferVerifier explorer API response hash");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, explorerProofArtifactRef: undefined as unknown as string }, ...record.contracts.slice(1)]
      })
    ).toThrow("source verification package requires valid privateTransferVerifier explorer proof artifact ref");
  });

  it("binds verification commands to the recorded address, source, chain, and compiler settings", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            verificationCommand: record.contracts[0]!.verificationCommand.replace(
              record.contracts[0]!.address,
              record.contracts[1]!.address
            )
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must include the deployed contract address");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            verificationCommand: record.contracts[0]!.verificationCommand.replace(
              record.contracts[0]!.sourcePath,
              "contracts/src/ShieldedPool.sol"
            )
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must include the verified source path");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, verificationCommand: record.contracts[0]!.verificationCommand.replace("--chain 4326", "--chain 1") },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must target MegaETH mainnet chain 4326");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, verificationCommand: record.contracts[0]!.verificationCommand.replace("--compiler-version 0.8.34", "--compiler-version 0.8.26") },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must pin solc 0.8.34");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, verificationCommand: record.contracts[0]!.verificationCommand.replace("--num-of-optimizations 200", "--num-of-optimizations 1000000") },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must pin optimizer runs to 200");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, verificationCommand: record.contracts[0]!.verificationCommand.replace("--evm-version cancun", "--evm-version paris") },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier verification command must pin evmVersion cancun");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            verificationCommand: record.contracts[2]!.verificationCommand.replace(/ --constructor-args .+$/, "")
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter verification command must include constructor args");
  });

  it("requires exact contract names, source paths, and constructor role bindings", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, contractName: "WrongVerifier" }, ...record.contracts.slice(1)]
      })
    ).toThrow("privateTransferVerifier source verification contract name must be Groth16PrivateTransferVerifier");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [{ ...record.contracts[0]!, licenseType: "MIT" }, ...record.contracts.slice(1)]
      })
    ).toThrow("privateTransferVerifier source verification licenseType must be GPL-3.0");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          ...record.contracts.slice(0, 2),
          { ...record.contracts[2]!, licenseType: "GPL-3.0" },
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter source verification licenseType must be MIT");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          ...record.contracts.slice(0, 3),
          { ...record.contracts[3]!, contractName: "ShieldedPoolDepth20" },
          ...record.contracts.slice(4)
        ]
      })
    ).toThrow("shieldedPool source verification contract name must be NullarkPool");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          ...record.contracts.slice(0, 3),
          { ...record.contracts[3]!, sourcePath: "contracts/src/ShieldedPoolDepth20.sol" },
          ...record.contracts.slice(4)
        ]
      })
    ).toThrow("shieldedPool source verification source path must be contracts/src/NullarkPool.sol");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol"
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow(
      "privateTransferVerifier source verification source path must be contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol"
    );

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            constructorArgRoles: ["withdrawVerifier", "privateTransferVerifier"]
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter source verification constructor arg roles must match privateTransferVerifier, withdrawVerifier");
  });

  it("requires ABI-encoded constructor args and binds dependent contract addresses", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            constructorArgsAbiEncoded: "0x1234",
            verificationCommand: record.contracts[2]!.verificationCommand.replace(
              record.contracts[2]!.constructorArgsAbiEncoded,
              "0x1234"
            )
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter constructor args ABI encoding must include privateTransferVerifier address");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            constructorArgs: [addressesByLabel.withdrawVerifier, addressesByLabel.privateTransferVerifier],
            constructorArgsAbiEncoded: `0x${[
              addressesByLabel.withdrawVerifier,
              addressesByLabel.privateTransferVerifier
            ].map((arg) => arg.slice(2).padStart(64, "0")).join("")}`
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter constructor arg privateTransferVerifier must match privateTransferVerifier address");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            verificationCommand: record.contracts[2]!.verificationCommand.replace(
              record.contracts[2]!.constructorArgsAbiEncoded,
              record.contracts[2]!.constructorArgs.join(" ")
            )
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter verification command must include ABI-encoded constructor args");
  });

  it("requires ABI-encoded constructor args to preserve role order", () => {
    const reversedConstructorArgsAbiEncoded = `0x${[
      addressesByLabel.withdrawVerifier,
      addressesByLabel.privateTransferVerifier
    ].map((arg) => arg.slice(2).padStart(64, "0")).join("")}` as `0x${string}`;

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            constructorArgsAbiEncoded: reversedConstructorArgsAbiEncoded,
            verificationCommand: record.contracts[2]!.verificationCommand.replace(
              record.contracts[2]!.constructorArgsAbiEncoded,
              reversedConstructorArgsAbiEncoded
            )
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter constructor args ABI encoding must match constructor arg role order");
  });

  it("requires v1.2 generated verifier hashes to match generated verifier source records", () => {
    const v12Record = v12SourceVerificationRecord();

    expect(assertSourceVerificationPackageReady(v12Record)).toBe(v12Record);

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: v12Record.contracts.map((contract) =>
          contract.label === "withdrawVerifier"
            ? {
                ...contract,
                generatedVerifierHash: `sha256:${"a".repeat(64)}`
              }
            : contract
        )
      })
    ).toThrow("withdrawVerifier generated verifier hash must match source hash");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: v12Record.contracts.map((contract) => {
          if (contract.label !== "privateTransferVerifier") {
            return contract;
          }
          const { generatedVerifierHash: _generatedVerifierHash, ...withoutGeneratedVerifierHash } = contract;
          return withoutGeneratedVerifierHash;
        })
      })
    ).toThrow("privateTransferVerifier generated verifier hash is required for v1.2 source verification");
  });

  it("rejects v1.2 verification commands whose positional address differs from the recorded address", () => {
    const v12Record = v12SourceVerificationRecord();
    const privateTransferVerifier = v12Record.contracts.find((contract) => contract.label === "privateTransferVerifier")!;
    const wrongAddressCommand = privateTransferVerifier.verificationCommand.replace(
      privateTransferVerifier.address,
      addressesByLabel.withdrawVerifier
    );

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: [
          {
            ...privateTransferVerifier,
            verificationCommand: `${wrongAddressCommand} --expected-address ${privateTransferVerifier.address}`
          },
          ...v12Record.contracts.filter((contract) => contract.label !== "privateTransferVerifier")
        ]
      })
    ).toThrow("privateTransferVerifier verification command must verify the deployed contract address");
  });

  it("rejects v1.2 verification commands whose positional source target differs from the recorded source", () => {
    const v12Record = v12SourceVerificationRecord();
    const privateTransferVerifier = v12Record.contracts.find((contract) => contract.label === "privateTransferVerifier")!;
    const wrongTargetCommand = privateTransferVerifier.verificationCommand.replace(
      `${privateTransferVerifier.sourcePath}:${privateTransferVerifier.contractName}`,
      "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol:Groth16WithdrawVerifier"
    );

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: [
          {
            ...privateTransferVerifier,
            verificationCommand: `${wrongTargetCommand} --expected-target ${privateTransferVerifier.sourcePath}:${privateTransferVerifier.contractName}`
          },
          ...v12Record.contracts.filter((contract) => contract.label !== "privateTransferVerifier")
        ]
      })
    ).toThrow("privateTransferVerifier verification command must verify the recorded source target");
  });

  it("rejects v1.2 runtime bytecode evidence without an explicit current read-only source binding", () => {
    const v12Record = v12SourceVerificationRecord();
    const privateTransferVerifier = v12Record.contracts.find((contract) => contract.label === "privateTransferVerifier")!;
    const {
      runtimeBytecodeHashSource: _runtimeBytecodeHashSource,
      ...privateTransferVerifierWithoutRuntimeSource
    } = privateTransferVerifier;

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: [
          privateTransferVerifierWithoutRuntimeSource,
          ...v12Record.contracts.filter((contract) => contract.label !== "privateTransferVerifier")
        ]
      })
    ).toThrow("privateTransferVerifier v1.2 source verification runtime bytecode hash source must match current read-only RPC evidence ref");
  });

  it("rejects v1.2 constructor verification commands whose flag value differs from recorded ABI args", () => {
    const v12Record = v12SourceVerificationRecord();
    const verifierAdapter = v12Record.contracts.find((contract) => contract.label === "verifierAdapter")!;
    const wrongConstructorArgs = `0x${[
      addressesByLabel.depositVerifier,
      addressesByLabel.withdrawVerifier,
      addressesByLabel.privateTransferVerifier
    ].map((arg) => arg.slice(2).padStart(64, "0")).join("")}`;

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: [
          {
            ...verifierAdapter,
            verificationCommand: `${verifierAdapter.verificationCommand.replace(
              verifierAdapter.constructorArgsAbiEncoded,
              wrongConstructorArgs
            )} --expected-constructor-args ${verifierAdapter.constructorArgsAbiEncoded}`
          },
          ...v12Record.contracts.filter((contract) => contract.label !== "verifierAdapter")
        ]
      })
    ).toThrow("verifierAdapter verification command must verify the recorded ABI-encoded constructor args");
  });

  it("rejects v1.2 generated verifier hashes on non-generated contracts", () => {
    const v12Record = v12SourceVerificationRecord();

    expect(() =>
      assertSourceVerificationPackageReady({
        ...v12Record,
        contracts: v12Record.contracts.map((contract) =>
          contract.label === "verifierAdapter"
            ? {
                ...contract,
                generatedVerifierHash: contract.sourceHash
              }
            : contract
        )
      })
    ).toThrow("verifierAdapter generated verifier hash is only allowed for generated verifier contracts");
  });

  it("rejects v1.2 reuse of current v1.1 mainnet addresses without compatibility proof", () => {
    const v12Record: SourceVerificationPackage = {
      ...v12SourceVerificationRecord(),
      contracts: v12SourceVerificationRecord().contracts.map((contract) =>
        contract.label === "privateTransferVerifier"
          ? {
              ...contract,
              address: v11AddressesByLabel.privateTransferVerifier,
              explorerUrl: `https://mega.etherscan.io/address/${v11AddressesByLabel.privateTransferVerifier}#code`,
              verificationCommand: contract.verificationCommand.replace(contract.address, v11AddressesByLabel.privateTransferVerifier),
              currentReadOnlyRpcCode: {
                ...contract.currentReadOnlyRpcCode!,
                runtimeBytecodeHash: contract.runtimeBytecodeHash
              }
            }
          : contract
      )
    };

    expect(() => assertSourceVerificationPackageReady(v12Record)).toThrow(
      "privateTransferVerifier v1.2 source verification must not reuse Nullark v1.1 mainnet address without compatibility proof"
    );
  });

  it("rejects local-untrusted generated verifier paths", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          { ...record.contracts[0]!, sourcePath: "contracts/test/generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16WithdrawVerifier.sol" },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow(
      "privateTransferVerifier source verification source path must be contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol"
    );
  });

  it("rejects symbolic or zero-address constructor args", () => {
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[0]!,
            address: "0x0000000000000000000000000000000000000000"
          },
          ...record.contracts.slice(1)
        ]
      })
    ).toThrow("privateTransferVerifier source verification record requires nonzero address");

    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[2]!,
            constructorArgs: ["privateTransferVerifier", "withdrawVerifier"]
          },
          ...record.contracts.slice(0, 2),
          ...record.contracts.slice(3)
        ]
      })
    ).toThrow("verifierAdapter source verification constructor args must be nonzero addresses");
    expect(() =>
      assertSourceVerificationPackageReady({
        ...record,
        contracts: [
          {
            ...record.contracts[3]!,
            constructorArgs: [
              addressesByLabel.verifierAdapter,
              addressesByLabel.feeController,
              "0x0000000000000000000000000000000000000000"
            ]
          },
          ...record.contracts.slice(0, 3),
          ...record.contracts.slice(4)
        ]
      })
    ).toThrow("shieldedPool source verification constructor args must be nonzero addresses");
  });

  it("rejects legacy emergencyGuardian constructor roles for the no-guardian Nullark v1.1 path", () => {
    const shieldedPool = record.contracts.find((contract) => contract.label === "shieldedPool")!;
    const legacyGuardianPackage = {
      ...record,
      status: "release-candidate",
      releaseCandidate: {
        productVersion: "Nullark v1.1",
        mainnet4326Blocked: true,
        deploymentApproved: false,
        signingApproved: false,
        broadcastApproved: false,
        realFundsApproved: false,
        guardedUsersBlocked: true,
        productionPrivacyClaimsBlocked: true,
        blockedStateEvidenceRef: "docs/evidence/mainnet-readiness/source-verification-blocked.md"
      },
      blockedUntil: ["final owner approval is not recorded"],
      contracts: record.contracts.map((contract) =>
        contract.label === "shieldedPool"
          ? {
              ...shieldedPool,
              constructorArgRoles: ["verifierAdapter", "feeController", "emergencyGuardian", "poseidon2"],
              constructorArgs: [
                addressesByLabel.verifierAdapter,
                addressesByLabel.feeController,
                "0x7777777777777777777777777777777777777777",
                addressesByLabel.poseidon2
              ],
              constructorArgsAbiEncoded:
                "0x0000000000000000000000003333333333333333333333333333333333333333000000000000000000000000666666666666666666666666666666666666666600000000000000000000000077777777777777777777777777777777777777770000000000000000000000005555555555555555555555555555555555555555"
            }
          : contract
      )
    } as unknown as SourceVerificationPackage;

    expect(() =>
      assertSourceVerificationPackageReleaseCandidate(legacyGuardianPackage)
    ).toThrow("source verification package must not include emergencyGuardian constructor roles for the no-guardian Nullark v1.1 path");
  });
});
