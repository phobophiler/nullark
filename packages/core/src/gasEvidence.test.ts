import { describe, expect, it } from "vitest";
import {
  GAS_EVIDENCE_OPERATIONS,
  MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID,
  MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID,
  MEGAETH_GAS_EVIDENCE_TESTNET_RPC,
  assertMegaEthGasEvidencePlanReady,
  assertMegaEthGasEvidenceReady,
  duplicateGasEvidencePlanOperations,
  missingGasEvidencePlanOperations,
  missingGasEvidenceOperations,
  type MegaEthGasEvidencePlan,
  type MegaEthGasEvidenceReport,
  type RemoteGasMeasurementEntry
} from "./gasEvidence.js";
import type { DeploymentPackageAddresses } from "./deploymentPackage.js";

const addresses: DeploymentPackageAddresses = {
  privateTransferVerifier: "0x1111111111111111111111111111111111111111",
  withdrawVerifier: "0x2222222222222222222222222222222222222222",
  verifierAdapter: "0x3333333333333333333333333333333333333333",
  shieldedPool: "0x4444444444444444444444444444444444444444",
  poseidon2: "0x5555555555555555555555555555555555555555",
  feeController: "0x6666666666666666666666666666666666666666"
};

const user = "0x8888888888888888888888888888888888888888";

const completeReport: MegaEthGasEvidenceReport = {
  chainId: MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID,
  rpcUrl: "https://carrot.megaeth.com/rpc",
  source: "megaeth-testnet-rpc",
  broadcast: false,
  collectedAt: "2026-05-01T00:00:00.000Z",
  entries: GAS_EVIDENCE_OPERATIONS.map((operation, index) =>
    operation === "volatileBlockMetadataReview"
      ? {
          operation,
          chainId: MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID,
          rpcUrl: "https://carrot.megaeth.com/rpc",
          evidenceKind: "manual-review",
          blockNumber: 12_345n,
          target: "0x1111111111111111111111111111111111111111",
          usesVolatileBlockMetadata: false,
          volatileFieldsReviewed: ["block.timestamp", "block.prevrandao", "blockhash", "coinbase", "basefee"],
          notes: "manual volatile metadata review completed"
        }
      : {
          operation,
          chainId: MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID,
          rpcUrl: "https://carrot.megaeth.com/rpc",
          evidenceKind: "remote-estimate",
          gasUsedOrEstimated: BigInt(100_000 + index),
          blockNumber: 12_345n,
          target: "0x1111111111111111111111111111111111111111",
          from: "0x2222222222222222222222222222222222222222",
          notes: `${operation} scaffold estimate`
        }
  )
};

const completePlan: MegaEthGasEvidencePlan = {
  chainId: MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID,
  rpcUrl: MEGAETH_GAS_EVIDENCE_TESTNET_RPC,
  broadcast: false,
  operations: GAS_EVIDENCE_OPERATIONS.map((operation) =>
    operation === "volatileBlockMetadataReview"
      ? {
          operation,
          to: addresses.shieldedPool,
          data: "0x",
          value: "0x0",
          usesVolatileBlockMetadata: false,
          volatileFieldsReviewed: ["block.timestamp", "block.prevrandao", "blockhash", "coinbase", "basefee"],
          notes: "manual volatile metadata review completed"
        }
      : {
          operation,
          to: addresses.shieldedPool,
          from: operation === "feeSweep" ? addresses.feeController : user,
          data: "0x1234",
          value: operation === "deposit" || operation === "commitmentInsertionStorageGrowth" ? "0x1" : "0x0",
          notes: `${operation} remote estimate plan`
        }
  )
};

describe("MegaETH gas evidence gate", () => {
  it("accepts complete remote testnet evidence", () => {
    expect(assertMegaEthGasEvidenceReady(completeReport)).toBe(completeReport);
    expect(missingGasEvidenceOperations(completeReport)).toEqual([]);
  });

  it("blocks mainnet gas evidence", () => {
    expect(() =>
      assertMegaEthGasEvidenceReady({
        ...completeReport,
        chainId: MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID,
        entries: completeReport.entries.map((entry) => ({ ...entry, chainId: MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID }))
      })
    ).toThrow("MegaETH mainnet gas evidence is blocked");
  });

  it("requires every Phase 1 evidence operation", () => {
    const incomplete = {
      ...completeReport,
      entries: completeReport.entries.filter((entry) => entry.operation !== "feeSweep")
    };

    expect(missingGasEvidenceOperations(incomplete)).toEqual(["feeSweep"]);
    expect(() => assertMegaEthGasEvidenceReady(incomplete)).toThrow("gas evidence missing operations: feeSweep");
  });

  it("rejects local or malformed entries", () => {
    expect(() =>
      assertMegaEthGasEvidenceReady({
        ...completeReport,
        source: "local-anvil" as MegaEthGasEvidenceReport["source"]
      })
    ).toThrow("gas evidence must come from MegaETH testnet RPC");

    expect(() =>
      assertMegaEthGasEvidenceReady({
        ...completeReport,
        entries: [
          { ...(completeReport.entries[0] as RemoteGasMeasurementEntry), gasUsedOrEstimated: 0n },
          ...completeReport.entries.slice(1)
        ]
      })
    ).toThrow("gas evidence entry deposit must record positive gas");
  });

  it("keeps volatile block metadata review separate from gas estimates", () => {
    expect(() =>
      assertMegaEthGasEvidenceReady({
        ...completeReport,
        entries: completeReport.entries.map((entry) =>
          entry.operation === "volatileBlockMetadataReview" ? { ...entry, evidenceKind: "remote-estimate" as const } : entry
        ) as MegaEthGasEvidenceReport["entries"]
      })
    ).toThrow("volatile block metadata review must be manual-review evidence");
  });

  it("requires concrete volatile block metadata fields", () => {
    expect(() =>
      assertMegaEthGasEvidenceReady({
        ...completeReport,
        entries: completeReport.entries.map((entry) =>
          entry.operation === "volatileBlockMetadataReview" ? { ...entry, volatileFieldsReviewed: [] } : entry
        )
      })
    ).toThrow("volatile block metadata review must list reviewed fields");
  });
});

describe("MegaETH gas evidence plan gate", () => {
  it("accepts a complete testnet plan tied to deployment package addresses", () => {
    expect(assertMegaEthGasEvidencePlanReady(completePlan, addresses)).toBe(completePlan);
    expect(missingGasEvidencePlanOperations(completePlan)).toEqual([]);
    expect(duplicateGasEvidencePlanOperations(completePlan)).toEqual([]);
  });

  it("blocks mainnet, wrong RPC, broadcast, missing operations, and duplicates", () => {
    expect(() => assertMegaEthGasEvidencePlanReady({ ...completePlan, chainId: MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID }, addresses)).toThrow(
      "MegaETH mainnet gas evidence plan is blocked"
    );
    expect(() => assertMegaEthGasEvidencePlanReady({ ...completePlan, rpcUrl: "https://mainnet.megaeth.com/rpc" }, addresses)).toThrow(
      "gas evidence plan must target the approved MegaETH testnet RPC"
    );
    expect(() => assertMegaEthGasEvidencePlanReady({ ...completePlan, broadcast: true as false }, addresses)).toThrow(
      "gas evidence plan must not broadcast transactions"
    );

    const missingFeeSweep = { ...completePlan, operations: completePlan.operations.filter((entry) => entry.operation !== "feeSweep") };
    expect(missingGasEvidencePlanOperations(missingFeeSweep)).toEqual(["feeSweep"]);
    expect(() => assertMegaEthGasEvidencePlanReady(missingFeeSweep, addresses)).toThrow("gas evidence plan missing operations: feeSweep");

    const duplicateDeposit = { ...completePlan, operations: [...completePlan.operations, completePlan.operations[0]!] };
    expect(duplicateGasEvidencePlanOperations(duplicateDeposit)).toEqual(["deposit"]);
    expect(() => assertMegaEthGasEvidencePlanReady(duplicateDeposit, addresses)).toThrow(
      "gas evidence plan contains duplicate operations: deposit"
    );

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: [
            ...completePlan.operations,
            { ...completePlan.operations[0]!, operation: "unknownOperation" }
          ] as MegaEthGasEvidencePlan["operations"]
        },
        addresses
      )
    ).toThrow("unknown gas evidence plan operation: unknownOperation");
  });

  it("requires shielded pool target and operation-specific callers", () => {
    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "withdrawal" ? { ...entry, to: addresses.verifierAdapter } : entry
          )
        },
        addresses
      )
    ).toThrow("gas evidence plan withdrawal must target shieldedPool");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "feeSweep" ? { ...entry, from: user } : entry
          )
        },
        addresses
      )
    ).toThrow("feeSweep gas evidence must use feeController as from");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "privateTransfer" ? { ...entry, from: addresses.feeController } : entry
          )
        },
        addresses
      )
    ).toThrow("gas evidence plan privateTransfer must use a non-controller test caller");
  });

  it("requires real calldata, positive deposit value, and resolved volatile metadata review", () => {
    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) => (entry.operation === "withdrawal" ? { ...entry, data: "0x" } : entry))
        },
        addresses
      )
    ).toThrow("gas evidence plan withdrawal must include calldata");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "withdrawal" ? { ...entry, data: "not-hex" as `0x${string}` } : entry
          )
        },
        addresses
      )
    ).toThrow("gas evidence plan withdrawal must include calldata hex");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "withdrawal" ? { ...entry, value: "not-hex" as `0x${string}` } : entry
          )
        },
        addresses
      )
    ).toThrow("gas evidence plan withdrawal must include value hex");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) => (entry.operation === "deposit" ? { ...entry, value: "0x0" } : entry))
        },
        addresses
      )
    ).toThrow("deposit gas evidence must include positive value");

    expect(() =>
      assertMegaEthGasEvidencePlanReady(
        {
          ...completePlan,
          operations: completePlan.operations.map((entry) =>
            entry.operation === "volatileBlockMetadataReview" ? { ...entry, usesVolatileBlockMetadata: true } : entry
          )
        },
        addresses
      )
    ).toThrow("volatile block metadata dependency must be resolved before gas evidence readiness");
  });
});
