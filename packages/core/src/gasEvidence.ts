import type { DeploymentPackageAddresses } from "./deploymentPackage.js";

export const MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID = 6343;
export const MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID = 4326;
export const MEGAETH_GAS_EVIDENCE_TESTNET_RPC = "https://carrot.megaeth.com/rpc";

export const GAS_EVIDENCE_OPERATIONS = [
  "deposit",
  "privateTransfer",
  "withdrawal",
  "feeAccrual",
  "feeSweep",
  "commitmentInsertionStorageGrowth",
  "nullifierInsertionStorageGrowth",
  "volatileBlockMetadataReview"
] as const;

export type GasEvidenceOperation = (typeof GAS_EVIDENCE_OPERATIONS)[number];

export type RemoteGasEvidenceOperation = Exclude<GasEvidenceOperation, "volatileBlockMetadataReview">;

export type RemoteGasMeasurementEntry = {
  operation: RemoteGasEvidenceOperation;
  chainId: number;
  rpcUrl: string;
  evidenceKind: "remote-estimate" | "remote-receipt";
  gasUsedOrEstimated: bigint;
  blockNumber: bigint;
  target: `0x${string}`;
  from: `0x${string}`;
  transactionHash?: `0x${string}`;
  notes: string;
};

export type VolatileBlockMetadataReviewEntry = {
  operation: "volatileBlockMetadataReview";
  chainId: number;
  rpcUrl: string;
  evidenceKind: "manual-review";
  blockNumber: bigint;
  target: `0x${string}`;
  usesVolatileBlockMetadata: boolean;
  volatileFieldsReviewed: string[];
  notes: string;
};

export type RemoteGasEvidenceEntry = RemoteGasMeasurementEntry | VolatileBlockMetadataReviewEntry;

export type MegaEthGasEvidenceReport = {
  chainId: number;
  rpcUrl: string;
  source: "megaeth-testnet-rpc";
  broadcast: false;
  collectedAt: string;
  entries: RemoteGasEvidenceEntry[];
};

export type MegaEthGasEvidencePlanOperation =
  | {
      operation: RemoteGasEvidenceOperation;
      to: `0x${string}`;
      from: `0x${string}`;
      data: `0x${string}`;
      value: `0x${string}`;
      notes: string;
    }
  | {
      operation: "volatileBlockMetadataReview";
      to: `0x${string}`;
      data: `0x${string}`;
      value: `0x${string}`;
      usesVolatileBlockMetadata: boolean;
      volatileFieldsReviewed: string[];
      notes: string;
    };

export type MegaEthGasEvidencePlan = {
  chainId: number;
  rpcUrl: string;
  broadcast: false;
  operations: MegaEthGasEvidencePlanOperation[];
};

const REQUIRED_OPERATION_SET = new Set<GasEvidenceOperation>(GAS_EVIDENCE_OPERATIONS);

export function missingGasEvidenceOperations(report: MegaEthGasEvidenceReport): GasEvidenceOperation[] {
  const observed = new Set(report.entries.map((entry) => entry.operation));
  return GAS_EVIDENCE_OPERATIONS.filter((operation) => !observed.has(operation));
}

export function assertMegaEthGasEvidenceReady(report: MegaEthGasEvidenceReport): MegaEthGasEvidenceReport {
  if (report.chainId === MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID) {
    throw new Error("MegaETH mainnet gas evidence is blocked");
  }

  if (report.chainId !== MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID) {
    throw new Error(`gas evidence must be collected on MegaETH testnet ${MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID}`);
  }

  if (report.source !== "megaeth-testnet-rpc") {
    throw new Error("gas evidence must come from MegaETH testnet RPC");
  }

  if (report.broadcast !== false) {
    throw new Error("gas evidence scaffold must not broadcast transactions");
  }

  if (Number.isNaN(Date.parse(report.collectedAt))) {
    throw new Error("gas evidence collectedAt must be an ISO timestamp");
  }

  const missing = missingGasEvidenceOperations(report);
  if (missing.length > 0) {
    throw new Error(`gas evidence missing operations: ${missing.join(", ")}`);
  }

  for (const entry of report.entries) {
    assertGasEvidenceEntry(entry, report.chainId, report.rpcUrl);
  }

  return report;
}

export function assertMegaEthGasEvidencePlanReady(
  plan: MegaEthGasEvidencePlan,
  addresses: DeploymentPackageAddresses
): MegaEthGasEvidencePlan {
  if (plan.chainId === MEGAETH_GAS_EVIDENCE_MAINNET_CHAIN_ID) {
    throw new Error("MegaETH mainnet gas evidence plan is blocked");
  }

  if (plan.chainId !== MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID) {
    throw new Error(`gas evidence plan must target MegaETH testnet ${MEGAETH_GAS_EVIDENCE_TESTNET_CHAIN_ID}`);
  }

  if (plan.rpcUrl !== MEGAETH_GAS_EVIDENCE_TESTNET_RPC) {
    throw new Error("gas evidence plan must target the approved MegaETH testnet RPC");
  }

  if (plan.broadcast !== false) {
    throw new Error("gas evidence plan must not broadcast transactions");
  }

  const duplicates = duplicateGasEvidencePlanOperations(plan);
  if (duplicates.length > 0) {
    throw new Error(`gas evidence plan contains duplicate operations: ${duplicates.join(", ")}`);
  }

  const missing = missingGasEvidencePlanOperations(plan);
  if (missing.length > 0) {
    throw new Error(`gas evidence plan missing operations: ${missing.join(", ")}`);
  }

  for (const operation of plan.operations) {
    assertGasEvidencePlanOperation(operation, addresses);
  }

  return plan;
}

export function missingGasEvidencePlanOperations(plan: MegaEthGasEvidencePlan): GasEvidenceOperation[] {
  const observed = new Set(plan.operations.map((entry) => entry.operation));
  return GAS_EVIDENCE_OPERATIONS.filter((operation) => !observed.has(operation));
}

export function duplicateGasEvidencePlanOperations(plan: MegaEthGasEvidencePlan): GasEvidenceOperation[] {
  const seen = new Set<string>();
  const duplicates = new Set<GasEvidenceOperation>();

  for (const entry of plan.operations) {
    if (seen.has(entry.operation) && REQUIRED_OPERATION_SET.has(entry.operation)) {
      duplicates.add(entry.operation);
    }
    seen.add(entry.operation);
  }

  return GAS_EVIDENCE_OPERATIONS.filter((operation) => duplicates.has(operation));
}

function assertGasEvidenceEntry(entry: RemoteGasEvidenceEntry, chainId: number, rpcUrl: string): void {
  if (!REQUIRED_OPERATION_SET.has(entry.operation)) {
    throw new Error(`unknown gas evidence operation: ${entry.operation}`);
  }

  if (entry.chainId !== chainId) {
    throw new Error(`gas evidence entry ${entry.operation} has mismatched chainId`);
  }

  if (entry.rpcUrl !== rpcUrl) {
    throw new Error(`gas evidence entry ${entry.operation} has mismatched rpcUrl`);
  }

  if (entry.blockNumber <= 0n) {
    throw new Error(`gas evidence entry ${entry.operation} must record a remote block number`);
  }

  if (!isNonZeroAddress(entry.target)) {
    throw new Error(`gas evidence entry ${entry.operation} must record a target contract address`);
  }

  if (entry.notes.trim().length === 0) {
    throw new Error(`gas evidence entry ${entry.operation} must include notes`);
  }

  if (entry.operation === "volatileBlockMetadataReview") {
    if (entry.evidenceKind !== "manual-review") {
      throw new Error("volatile block metadata review must be manual-review evidence");
    }
    if (typeof entry.usesVolatileBlockMetadata !== "boolean") {
      throw new Error("volatile block metadata review must record whether volatile metadata is used");
    }
    if (!Array.isArray(entry.volatileFieldsReviewed) || entry.volatileFieldsReviewed.length === 0) {
      throw new Error("volatile block metadata review must list reviewed fields");
    }
    if (entry.volatileFieldsReviewed.some((field) => field.trim().length === 0)) {
      throw new Error("volatile block metadata review fields must be nonempty");
    }
    return;
  }

  if (entry.evidenceKind !== "remote-estimate" && entry.evidenceKind !== "remote-receipt") {
    throw new Error(`gas evidence entry ${entry.operation} must be remote estimate or receipt evidence`);
  }

  if (entry.gasUsedOrEstimated <= 0n) {
    throw new Error(`gas evidence entry ${entry.operation} must record positive gas`);
  }

  if (!isNonZeroAddress(entry.from)) {
    throw new Error(`gas evidence entry ${entry.operation} must record a from address`);
  }

  if (entry.transactionHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(entry.transactionHash)) {
    throw new Error(`gas evidence entry ${entry.operation} has an invalid transaction hash`);
  }
}

function assertGasEvidencePlanOperation(operation: MegaEthGasEvidencePlanOperation, addresses: DeploymentPackageAddresses): void {
  if (!REQUIRED_OPERATION_SET.has(operation.operation)) {
    throw new Error(`unknown gas evidence plan operation: ${operation.operation}`);
  }

  if (operation.to.toLowerCase() !== addresses.shieldedPool.toLowerCase()) {
    throw new Error(`gas evidence plan ${operation.operation} must target shieldedPool`);
  }

  if (!isNonZeroAddress(operation.to)) {
    throw new Error(`gas evidence plan ${operation.operation} must record nonzero target`);
  }

  if (operation.notes.trim().length === 0) {
    throw new Error(`gas evidence plan ${operation.operation} must include notes`);
  }

  if (operation.operation === "volatileBlockMetadataReview") {
    if (operation.usesVolatileBlockMetadata) {
      throw new Error("volatile block metadata dependency must be resolved before gas evidence readiness");
    }
    if (operation.volatileFieldsReviewed.length === 0 || operation.volatileFieldsReviewed.some((field) => field.trim().length === 0)) {
      throw new Error("volatile block metadata review must list reviewed fields");
    }
    return;
  }

  if (!isNonZeroAddress(operation.from)) {
    throw new Error(`gas evidence plan ${operation.operation} must record nonzero from`);
  }

  if (!isHex(operation.data)) {
    throw new Error(`gas evidence plan ${operation.operation} must include calldata hex`);
  }

  if (!isHex(operation.value)) {
    throw new Error(`gas evidence plan ${operation.operation} must include value hex`);
  }

  if (operation.data === "0x") {
    throw new Error(`gas evidence plan ${operation.operation} must include calldata`);
  }

  if (operation.operation === "feeSweep") {
    if (operation.from.toLowerCase() !== addresses.feeController.toLowerCase()) {
      throw new Error("feeSweep gas evidence must use feeController as from");
    }
    return;
  }

  if (operation.from.toLowerCase() === addresses.feeController.toLowerCase()) {
    throw new Error(`gas evidence plan ${operation.operation} must use a non-controller test caller`);
  }

  if (operation.operation === "deposit" && BigInt(operation.value) <= 0n) {
    throw new Error("deposit gas evidence must include positive value");
  }
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}
