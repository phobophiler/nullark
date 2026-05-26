export const SOURCE_VERIFICATION_MAINNET_CHAIN_ID = 4326;
export const SOURCE_VERIFICATION_MAINNET_EXPLORER = "https://mega.etherscan.io";
export const SOURCE_VERIFICATION_SOLC_VERSION = "0.8.34";
export const SOURCE_VERIFICATION_EVM_VERSION = "cancun";
export const SOURCE_VERIFICATION_EXPLORER_LICENSE_TYPES = {
  MIT: "3",
  "GPL-3.0": "5"
} as const;
export const SOURCE_VERIFICATION_FORBIDDEN_ACTIVE_SHIELDED_POOL_ADDRESSES = [
  "0x54af9d54b4edD062daD5581670E9E5f73048c87b"
] as const;
const SOURCE_VERIFICATION_CURRENT_NULLARK_V1_1_ADDRESSES: Partial<Record<SourceVerificationContractLabel, string>> = {
  privateTransferVerifier: "0x0C78dE1615892205908810bF0129f10165346B57",
  withdrawVerifier: "0x9023FAfB13320D4A34AAD6C25E0411862b0E3397",
  verifierAdapter: "0x311d92DAc355F239B039C4298A7f374E09E23e52",
  shieldedPool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
  poseidon2: "0x9146549928FEABd8c63Ee04371672D958deAc563"
} as const;

export type SourceVerificationPackageStatus = "draft" | "review-ready" | "release-candidate" | "approved-for-mainnet";
export type SourceVerificationContractLabel =
  | "depositVerifier"
  | "privateTransferVerifier"
  | "withdrawVerifier"
  | "verifierAdapter"
  | "shieldedPool"
  | "poseidon2";
export type SourceVerificationConstructorArgRole =
  | SourceVerificationContractLabel
  | "feeController";
type SourceVerificationExpectedConstructorArgRole = SourceVerificationConstructorArgRole | "emergencyGuardian";
export type SourceVerificationLicenseType = keyof typeof SOURCE_VERIFICATION_EXPLORER_LICENSE_TYPES;

export type SourceVerificationPackage = {
  recordVersion: 1;
  productVersion?: string;
  scope?: string;
  status: SourceVerificationPackageStatus;
  releaseCandidate?: SourceVerificationReleaseCandidateGate;
  cleanDeploymentObservation?: SourceVerificationCleanDeploymentObservation;
  chainId: number;
  explorerBaseUrl: string;
  ownerApprovalRef?: string;
  noV1_1ApprovalReuse?: boolean;
  compatibilityProofRef?: string;
  compatibilityProofSha256?: string;
  compiler: SourceVerificationCompiler;
  sourceTreeCommit: string;
  contracts: readonly SourceVerificationContractRecord[];
  blockedUntil?: readonly string[];
};

export type SourceVerificationCleanDeploymentObservation = {
  readOnlyRpcCodeRef?: string;
  readOnlyRpcCodeHash?: string;
};

export type SourceVerificationReleaseCandidateGate = {
  productVersion: "Nullark v1.1";
  mainnet4326Blocked: true;
  deploymentApproved: false;
  signingApproved: false;
  broadcastApproved: false;
  realFundsApproved: false;
  guardedUsersBlocked: true;
  productionPrivacyClaimsBlocked: true;
  blockedStateEvidenceRef: string;
};

export type SourceVerificationCompiler = {
  solcVersion: string;
  optimizer: boolean;
  optimizerRuns: number;
  evmVersion: string;
  remappings: readonly string[];
};

export type SourceVerificationContractRecord = {
  label: SourceVerificationContractLabel;
  address: `0x${string}`;
  contractName: string;
  licenseType: SourceVerificationLicenseType;
  sourcePath: string;
  sourceHash: string;
  constructorArgRoles: readonly SourceVerificationConstructorArgRole[];
  constructorArgs: readonly string[];
  constructorArgsAbiEncoded: `0x${string}`;
  creationBytecodeHash: string;
  runtimeBytecodeHash: string;
  runtimeBytecodeHashSource?: string;
  generatedVerifierHash?: string;
  currentReadOnlyRpcCode?: SourceVerificationCurrentReadOnlyRpcCode;
  explorerUrl: string;
  explorerProofArtifactRef: string;
  explorerApiResponseHash: string;
  verificationCommand: string;
  verified: true;
  verifiedAt: string;
};

export type SourceVerificationCurrentReadOnlyRpcCode = {
  evidenceRef: string;
  codePresent: true;
  runtimeByteLength: number;
  runtimeBytecodeHash: string;
};

export type SourceVerificationReadOnlyRpcEvidence = {
  chainId?: number;
  broadcast?: boolean;
  privateKeysUsed?: boolean;
  contracts?: Partial<
    Record<
      SourceVerificationContractLabel,
      {
        address?: string;
        codePresent?: boolean;
        runtimeByteLength?: number;
        runtimeBytecodeHash?: string;
      }
    >
  >;
};

export type SourceVerificationReadOnlyRpcEvidenceResolution = {
  exists: boolean;
  contentHash?: string;
  record?: SourceVerificationReadOnlyRpcEvidence;
};

export type SourceVerificationReadOnlyRpcEvidenceResolver = (
  evidenceRef: string
) => SourceVerificationReadOnlyRpcEvidenceResolution;

export type SourceVerificationDeploymentPackageRecord = {
  contract?: SourceVerificationContractLabel;
  address?: string;
  chainId?: number;
  explorerUrl?: string;
  sourceHash?: string;
  runtimeBytecodeHash?: string;
  verified?: boolean;
};

export const SOURCE_VERIFICATION_REQUIRED_CONTRACTS = [
  {
    label: "privateTransferVerifier",
    contractName: "Groth16PrivateTransferVerifier",
    licenseType: "GPL-3.0",
    sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol",
    constructorArgRoles: []
  },
  {
    label: "withdrawVerifier",
    contractName: "Groth16WithdrawVerifier",
    licenseType: "GPL-3.0",
    sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol",
    constructorArgRoles: []
  },
  {
    label: "verifierAdapter",
    contractName: "ActionRoutingGroth16Verifier",
    licenseType: "MIT",
    sourcePath: "contracts/src/verifiers/ActionRoutingGroth16Verifier.sol",
    constructorArgRoles: ["privateTransferVerifier", "withdrawVerifier"]
  },
  {
    label: "shieldedPool",
    contractName: "NullarkPool",
    licenseType: "MIT",
    sourcePath: "contracts/src/NullarkPool.sol",
    constructorArgRoles: ["verifierAdapter", "feeController", "poseidon2"]
  },
  {
    label: "poseidon2",
    contractName: "SourceVerifiedPoseidon2",
    licenseType: "MIT",
    sourcePath: "contracts/src/vendor/SourceVerifiedPoseidon2.sol",
    constructorArgRoles: []
  }
] as const;

export const SOURCE_VERIFICATION_V1_2_REQUIRED_CONTRACTS = [
  {
    label: "depositVerifier",
    contractName: "Groth16DepositVerifier",
    licenseType: "GPL-3.0",
    sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16DepositVerifier.sol",
    constructorArgRoles: []
  },
  {
    label: "privateTransferVerifier",
    contractName: "Groth16PrivateTransferVerifier",
    licenseType: "GPL-3.0",
    sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol",
    constructorArgRoles: []
  },
  {
    label: "withdrawVerifier",
    contractName: "Groth16WithdrawVerifier",
    licenseType: "GPL-3.0",
    sourcePath: "contracts/src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol",
    constructorArgRoles: []
  },
  {
    label: "verifierAdapter",
    contractName: "ActionRoutingGroth16V12Verifier",
    licenseType: "MIT",
    sourcePath: "contracts/src/verifiers/ActionRoutingGroth16V12Verifier.sol",
    constructorArgRoles: ["depositVerifier", "privateTransferVerifier", "withdrawVerifier"]
  },
  {
    label: "shieldedPool",
    contractName: "NullarkPool",
    licenseType: "MIT",
    sourcePath: "contracts/src/v1_2/NullarkPool.sol",
    constructorArgRoles: ["verifierAdapter", "feeController", "poseidon2"]
  },
  {
    label: "poseidon2",
    contractName: "SourceVerifiedPoseidon2",
    licenseType: "MIT",
    sourcePath: "contracts/src/vendor/SourceVerifiedPoseidon2.sol",
    constructorArgRoles: []
  }
] as const;

type SourceVerificationRequiredContract =
  | (typeof SOURCE_VERIFICATION_REQUIRED_CONTRACTS)[number]
  | (typeof SOURCE_VERIFICATION_V1_2_REQUIRED_CONTRACTS)[number];

const REQUIRED_LABELS = SOURCE_VERIFICATION_REQUIRED_CONTRACTS.map((contract) => contract.label);
const REQUIRED_CONTRACT_BY_LABEL = new Map<SourceVerificationContractLabel, SourceVerificationRequiredContract>(
  SOURCE_VERIFICATION_REQUIRED_CONTRACTS.map((contract) => [contract.label, contract])
);
const V1_2_REQUIRED_LABELS = SOURCE_VERIFICATION_V1_2_REQUIRED_CONTRACTS.map((contract) => contract.label);
const V1_2_REQUIRED_CONTRACT_BY_LABEL = new Map<SourceVerificationContractLabel, SourceVerificationRequiredContract>(
  SOURCE_VERIFICATION_V1_2_REQUIRED_CONTRACTS.map((contract) => [contract.label, contract])
);

export function assertSourceVerificationPackageReady(record: SourceVerificationPackage): SourceVerificationPackage {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported source verification package record version");
  }
  assertNoEmergencyGuardianConstructorSurface(record.contracts);
  if (record.status === "draft") {
    throw new Error("source verification package is still draft");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("source verification package must be approved-for-mainnet");
  }
  if (record.chainId !== SOURCE_VERIFICATION_MAINNET_CHAIN_ID || record.explorerBaseUrl !== SOURCE_VERIFICATION_MAINNET_EXPLORER) {
    throw new Error("source verification package must target MegaETH mainnet explorer");
  }
  assertOwnerApprovalRef(record.ownerApprovalRef);
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("source verification package cannot have remaining blockers");
  }
  assertCompiler(record.compiler);
  if (!/^[0-9a-f]{40}$/i.test(record.sourceTreeCommit)) {
    throw new Error("source verification package requires source tree commit hash");
  }
  assertContractRecords(record.contracts, { packageRecord: record });
  assertReadOnlyRpcEvidenceBindings(record);
  return record;
}

export function assertSourceVerificationPackageReleaseCandidate(record: SourceVerificationPackage): SourceVerificationPackage {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported source verification package record version");
  }
  assertNoEmergencyGuardianConstructorSurface(record.contracts);
  if (record.status !== "release-candidate") {
    throw new Error("source verification package must be release-candidate");
  }
  if (record.chainId !== SOURCE_VERIFICATION_MAINNET_CHAIN_ID || record.explorerBaseUrl !== SOURCE_VERIFICATION_MAINNET_EXPLORER) {
    throw new Error("source verification release candidate must target MegaETH mainnet explorer");
  }
  assertReleaseCandidateGate(record.releaseCandidate);
  const blockers = record.blockedUntil ?? [];
  if (blockers.length === 0) {
    throw new Error("source verification release candidate must list remaining blockers");
  }
  for (const blocker of blockers) {
    assertNonPlaceholder(blocker, "source verification release-candidate blocker");
  }
  assertCompiler(record.compiler);
  if (!/^[0-9a-f]{40}$/i.test(record.sourceTreeCommit)) {
    throw new Error("source verification package requires source tree commit hash");
  }
  assertContractRecords(record.contracts, { packageRecord: record });
  assertReadOnlyRpcEvidenceBindings(record);
  return record;
}

export function collectSourceVerificationReadOnlyRpcEvidenceBlockers(
  record: SourceVerificationPackage,
  resolveEvidence?: SourceVerificationReadOnlyRpcEvidenceResolver
): string[] {
  const blockers: string[] = [];
  const contracts = new Map((record.contracts ?? []).map((contract) => [contract.label, contract]));
  const readOnlyRpcCodeRef = record.cleanDeploymentObservation?.readOnlyRpcCodeRef;
  const readOnlyRpcCodeHash = record.cleanDeploymentObservation?.readOnlyRpcCodeHash;
  const evidenceRefs = new Set<string>();

  if (!isValidMainnetReadinessRef(readOnlyRpcCodeRef)) {
    blockers.push("source verification package requires clean deployment read-only RPC code evidence ref");
  } else {
    evidenceRefs.add(readOnlyRpcCodeRef);
  }

  if (readOnlyRpcCodeHash !== undefined && !isValidHash(readOnlyRpcCodeHash)) {
    blockers.push("source verification package requires valid clean deployment read-only RPC code evidence hash");
  }

  for (const label of requiredLabelsForRecord(record)) {
    const contract = contracts.get(label);
    if (!contract) {
      continue;
    }
    const current = contract.currentReadOnlyRpcCode;
    if (!current || typeof current !== "object") {
      blockers.push(`${label} source verification record requires current read-only RPC code evidence`);
      continue;
    }
    if (!isValidMainnetReadinessRef(current.evidenceRef)) {
      blockers.push(`${label} current read-only RPC evidence ref must live under docs/evidence/mainnet-readiness`);
    } else {
      evidenceRefs.add(current.evidenceRef);
      if (isValidMainnetReadinessRef(readOnlyRpcCodeRef) && current.evidenceRef !== readOnlyRpcCodeRef) {
        blockers.push(`${label} current read-only RPC evidence ref must match clean deployment observation`);
      }
      if (isV12FeeGovernancePackage(record) && contract.runtimeBytecodeHashSource !== current.evidenceRef) {
        blockers.push(`${label} v1.2 source verification runtime bytecode hash source must match current read-only RPC evidence ref`);
      }
      if (contract.runtimeBytecodeHashSource !== undefined && contract.runtimeBytecodeHashSource !== current.evidenceRef) {
        blockers.push(`${label} runtime bytecode hash source must match current read-only RPC evidence ref`);
      }
    }
    if (current.codePresent !== true) {
      blockers.push(`${label} current read-only RPC evidence must prove deployed code is present`);
    }
    if (!Number.isInteger(current.runtimeByteLength) || current.runtimeByteLength <= 0) {
      blockers.push(`${label} current read-only RPC evidence requires positive runtime byte length`);
    }
    if (!isValidHash(current.runtimeBytecodeHash)) {
      blockers.push(`${label} current read-only RPC evidence requires runtime bytecode hash`);
    } else if (contract.runtimeBytecodeHash !== current.runtimeBytecodeHash) {
      blockers.push(`${label} source verification runtime bytecode hash does not match current read-only RPC evidence`);
    }
  }

  if (!resolveEvidence) {
    return blockers;
  }

  const resolutions = new Map<string, SourceVerificationReadOnlyRpcEvidenceResolution>();
  for (const evidenceRef of evidenceRefs) {
    const resolution = resolveEvidence(evidenceRef);
    resolutions.set(evidenceRef, resolution);
    if (!resolution.exists) {
      blockers.push(`source verification read-only RPC evidence file is missing: ${evidenceRef}`);
      continue;
    }
    if (readOnlyRpcCodeRef === evidenceRef && isValidHash(readOnlyRpcCodeHash) && resolution.contentHash !== readOnlyRpcCodeHash) {
      blockers.push("source verification read-only RPC evidence file hash does not match clean deployment observation");
    }
    if (resolution.record?.chainId !== SOURCE_VERIFICATION_MAINNET_CHAIN_ID) {
      blockers.push(`source verification read-only RPC evidence must target MegaETH mainnet 4326: ${evidenceRef}`);
    }
    if (resolution.record?.broadcast !== false || resolution.record?.privateKeysUsed !== false) {
      blockers.push(`source verification read-only RPC evidence must be read-only with no signing material: ${evidenceRef}`);
    }
  }

  for (const label of requiredLabelsForRecord(record)) {
    const contract = contracts.get(label);
    const current = contract?.currentReadOnlyRpcCode;
    if (!contract || !current || !isValidMainnetReadinessRef(current.evidenceRef)) {
      continue;
    }
    const resolution = resolutions.get(current.evidenceRef);
    if (!resolution?.exists || !resolution.record) {
      continue;
    }
    const evidenceContract = resolution.record.contracts?.[label];
    if (!evidenceContract) {
      blockers.push(`${label} read-only RPC evidence is missing contract entry`);
      continue;
    }
    if (String(evidenceContract.address ?? "").toLowerCase() !== contract.address.toLowerCase()) {
      blockers.push(`${label} read-only RPC evidence address does not match source verification package`);
    }
    if (evidenceContract.codePresent !== true) {
      blockers.push(`${label} read-only RPC evidence must prove code is present`);
    }
    if (evidenceContract.runtimeByteLength !== current.runtimeByteLength) {
      blockers.push(`${label} read-only RPC evidence runtime byte length does not match source verification package`);
    }
    if (evidenceContract.runtimeBytecodeHash !== current.runtimeBytecodeHash) {
      blockers.push(`${label} read-only RPC evidence runtime bytecode hash does not match source verification package`);
    }
  }

  return blockers;
}

export function collectSourceVerificationDeploymentPackageBlockers(
  record: SourceVerificationPackage,
  deploymentRecords: readonly SourceVerificationDeploymentPackageRecord[] | undefined
): string[] {
  const blockers: string[] = [];
  const sourceContracts = new Map((record.contracts ?? []).map((contract) => [contract.label, contract]));
  const deploymentContracts = new Map<SourceVerificationContractLabel, SourceVerificationDeploymentPackageRecord>();
  const requiredLabels = requiredLabelsForRecord(record);
  for (const deploymentRecord of deploymentRecords ?? []) {
    const contract = deploymentRecord.contract;
    if (!isRequiredContractLabel(contract, record)) {
      blockers.push(`${String(contract ?? "<missing>")} deployment package source verification record is not an expected source verification contract`);
      continue;
    }
    if (deploymentContracts.has(contract)) {
      blockers.push(`${contract} deployment package source verification record must be unique`);
      continue;
    }
    deploymentContracts.set(contract, deploymentRecord);
  }

  for (const label of requiredLabels) {
    const sourceContract = sourceContracts.get(label);
    if (!sourceContract) {
      continue;
    }

    const deploymentRecord = deploymentContracts.get(label);
    if (!deploymentRecord) {
      blockers.push(`${label} source verification record is missing from deployment package assumptions`);
      continue;
    }

    if (deploymentRecord.chainId !== SOURCE_VERIFICATION_MAINNET_CHAIN_ID) {
      blockers.push(`${label} deployment package source verification record must target MegaETH mainnet 4326`);
    }
    if (deploymentRecord.verified !== true) {
      blockers.push(`${label} deployment package source verification record must be verified`);
    }
    if (String(deploymentRecord.address ?? "").toLowerCase() !== sourceContract.address.toLowerCase()) {
      blockers.push(`${label} source verification package address does not match deployment package`);
    }
    if (deploymentRecord.explorerUrl !== sourceContract.explorerUrl) {
      blockers.push(`${label} source verification package explorer URL does not match deployment package`);
    }
    if (deploymentRecord.sourceHash !== sourceContract.sourceHash) {
      blockers.push(`${label} source verification package source hash does not match deployment package`);
    }
    if (deploymentRecord.runtimeBytecodeHash !== sourceContract.runtimeBytecodeHash) {
      blockers.push(`${label} source verification package runtime bytecode hash does not match deployment package`);
    }
  }

  return blockers;
}

function assertReadOnlyRpcEvidenceBindings(record: SourceVerificationPackage): void {
  const blockers = collectSourceVerificationReadOnlyRpcEvidenceBlockers(record);
  if (blockers.length > 0) {
    throw new Error(blockers[0]);
  }
}

function assertReleaseCandidateGate(gate: SourceVerificationReleaseCandidateGate | undefined): void {
  if (!gate) {
    throw new Error("source verification release candidate requires blocked-state evidence");
  }
  if (gate.productVersion !== "Nullark v1.1") {
    throw new Error("source verification release candidate must target Nullark v1.1");
  }
  if (
    gate.mainnet4326Blocked !== true ||
    gate.deploymentApproved !== false ||
    gate.signingApproved !== false ||
    gate.broadcastApproved !== false ||
    gate.realFundsApproved !== false ||
    gate.guardedUsersBlocked !== true ||
    gate.productionPrivacyClaimsBlocked !== true
  ) {
    throw new Error("source verification release candidate must keep mainnet deployment, signing, broadcast, funding, users, and production claims blocked");
  }
  assertMainnetReadinessRef(gate.blockedStateEvidenceRef, "blocked-state evidence ref");
}

function assertCompiler(compiler: SourceVerificationCompiler): void {
  if (!/^0\.8\.34(?:\+commit\.[0-9a-f]+)?$/i.test(compiler.solcVersion)) {
    throw new Error("source verification package requires solc 0.8.34");
  }
  if (compiler.optimizer !== true || compiler.optimizerRuns !== 200) {
    throw new Error("source verification package requires optimizer enabled with 200 runs");
  }
  if (compiler.evmVersion !== SOURCE_VERIFICATION_EVM_VERSION) {
    throw new Error("source verification package requires evmVersion cancun");
  }
  if (!Array.isArray(compiler.remappings) || compiler.remappings.length === 0) {
    throw new Error("source verification package requires compiler remappings");
  }
  for (const remapping of compiler.remappings) {
    assertNonPlaceholder(remapping, "compiler remapping");
    if (/\/Users\/|\/tmp\/|\.\.|replace-me|placeholder/i.test(remapping)) {
      throw new Error("source verification package compiler remapping cannot reference local absolute or placeholder paths");
    }
  }
}

function assertContractRecords(
  records: readonly SourceVerificationContractRecord[],
  options: { allowBlockedLegacyEmergencyGuardianConstructor?: boolean; packageRecord?: SourceVerificationPackage } = {}
): void {
  const requiredLabels = requiredLabelsForRecord(options.packageRecord);
  const requiredContractByLabel = requiredContractByLabelForRecord(options.packageRecord);
  if (!Array.isArray(records) || records.length !== requiredLabels.length) {
    throw new Error("source verification package requires records for every deployed contract");
  }
  const byLabel = new Map(records.map((record) => [record.label, record]));
  if (byLabel.size !== records.length) {
    throw new Error("source verification package contract records must be unique");
  }
  const seenAddresses = new Set<string>();
  for (const label of requiredLabels) {
    const record = byLabel.get(label);
    const expected = requiredContractByLabel.get(label)!;
    if (!record) {
      throw new Error(`source verification package missing ${label}`);
    }
    assertContractRecord(record, expected, byLabel, options);
    const address = record.address.toLowerCase();
    if (seenAddresses.has(address)) {
      throw new Error("source verification package contract addresses must be unique");
    }
    seenAddresses.add(address);
  }
}

function assertNoEmergencyGuardianConstructorSurface(records: readonly SourceVerificationContractRecord[]): void {
  for (const record of records ?? []) {
    const constructorArgRoles = (record as { constructorArgRoles?: readonly string[] }).constructorArgRoles;
    if ((constructorArgRoles ?? []).some((role) => role === "emergencyGuardian")) {
      throw new Error("source verification package must not include emergencyGuardian constructor roles for the no-guardian Nullark v1.1 path");
    }
  }
}

function assertContractRecord(
  record: SourceVerificationContractRecord,
  expected: SourceVerificationRequiredContract,
  recordsByLabel: ReadonlyMap<SourceVerificationContractLabel, SourceVerificationContractRecord>,
  options: { allowBlockedLegacyEmergencyGuardianConstructor?: boolean; packageRecord?: SourceVerificationPackage } = {}
): void {
  if (!isNonZeroAddress(record.address)) {
    throw new Error(`${record.label} source verification record requires nonzero address`);
  }
  assertActiveShieldedPoolAddress(record);
  if (record.contractName !== expected.contractName) {
    throw new Error(`${record.label} source verification contract name must be ${expected.contractName}`);
  }
  assertV12AddressReuse(record, options.packageRecord);
  if (record.licenseType !== expected.licenseType) {
    throw new Error(`${record.label} source verification licenseType must be ${expected.licenseType}`);
  }
  if ("sourcePath" in expected && record.sourcePath !== expected.sourcePath) {
    throw new Error(`${record.label} source verification source path must be ${expected.sourcePath}`);
  }
  assertSourcePath(record.sourcePath, `${record.label} source path`);
  assertHash(record.sourceHash, `${record.label} source hash`);
  assertHash(record.creationBytecodeHash, `${record.label} creation bytecode hash`);
  assertHash(record.runtimeBytecodeHash, `${record.label} runtime bytecode hash`);
  assertV12GeneratedVerifierHash(record, options.packageRecord);
  if (record.creationBytecodeHash === record.runtimeBytecodeHash) {
    throw new Error(`${record.label} source verification creation and runtime bytecode hashes must be distinct`);
  }
  let expectedConstructorArgRoles: readonly SourceVerificationExpectedConstructorArgRole[] = expected.constructorArgRoles;
  if (
    options.allowBlockedLegacyEmergencyGuardianConstructor &&
    record.label === "shieldedPool" &&
    ((record.constructorArgRoles ?? []) as readonly string[]).some((role) => role === "emergencyGuardian")
  ) {
    expectedConstructorArgRoles = [
      ...expected.constructorArgRoles.slice(0, 2),
      "emergencyGuardian",
      ...expected.constructorArgRoles.slice(2)
    ];
  }
  assertConstructorArgs(record, expectedConstructorArgRoles, recordsByLabel);
  if (!record.explorerUrl.startsWith(`${SOURCE_VERIFICATION_MAINNET_EXPLORER}/address/`) || !record.explorerUrl.endsWith("#code")) {
    throw new Error(`${record.label} source verification record requires MegaETH mainnet explorer URL`);
  }
  if (!record.explorerUrl.toLowerCase().includes(`/address/${record.address.toLowerCase()}`)) {
    throw new Error(`${record.label} source verification explorer URL must match deployed address`);
  }
  assertExplorerProofArtifactRef(record.explorerProofArtifactRef, `${record.label} explorer proof artifact ref`);
  assertHash(record.explorerApiResponseHash, `${record.label} explorer API response hash`);
  if (record.verified !== true) {
    throw new Error(`${record.label} source verification record must be verified`);
  }
  if (!isIsoTimestamp(record.verifiedAt)) {
    throw new Error(`${record.label} source verification record requires ISO verifiedAt`);
  }
  assertVerificationCommand(record);
}

function assertActiveShieldedPoolAddress(record: SourceVerificationContractRecord): void {
  if (record.label !== "shieldedPool") {
    return;
  }
  const forbidden = SOURCE_VERIFICATION_FORBIDDEN_ACTIVE_SHIELDED_POOL_ADDRESSES.some(
    (address) => address.toLowerCase() === record.address.toLowerCase()
  );
  if (forbidden) {
    throw new Error("shieldedPool source verification record must not reuse legacy ShieldedPoolDepth20 pool address");
  }
}

function assertV12AddressReuse(record: SourceVerificationContractRecord, packageRecord: SourceVerificationPackage | undefined): void {
  if (!isV12FeeGovernancePackage(packageRecord)) {
    return;
  }
  const v11Address = SOURCE_VERIFICATION_CURRENT_NULLARK_V1_1_ADDRESSES[record.label];
  if (!v11Address || record.address.toLowerCase() !== v11Address.toLowerCase()) {
    return;
  }
  if (packageRecord && hasExplicitV11CompatibilityProof(packageRecord)) {
    return;
  }
  throw new Error(`${record.label} v1.2 source verification must not reuse Nullark v1.1 mainnet address without compatibility proof`);
}

function assertV12GeneratedVerifierHash(record: SourceVerificationContractRecord, packageRecord: SourceVerificationPackage | undefined): void {
  if (!isV12FeeGovernancePackage(packageRecord)) {
    return;
  }
  if (!isGeneratedVerifierLabel(record.label)) {
    if (record.generatedVerifierHash !== undefined) {
      throw new Error(`${record.label} generated verifier hash is only allowed for generated verifier contracts`);
    }
    return;
  }
  if (!isValidHash(record.generatedVerifierHash)) {
    throw new Error(`${record.label} generated verifier hash is required for v1.2 source verification`);
  }
  if (record.generatedVerifierHash !== record.sourceHash) {
    throw new Error(`${record.label} generated verifier hash must match source hash`);
  }
}

function assertVerificationCommand(record: SourceVerificationContractRecord): void {
  assertNonPlaceholder(record.verificationCommand, `${record.label} verification command`);
  if (/private_key|mnemonic|cast send|--broadcast|sendrawtransaction|testnet|carrot|6343/i.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command contains signing, broadcast, or wrong-chain material`);
  }
  const usesForgeVerify = /\bforge\s+verify-contract\b/.test(record.verificationCommand);
  const usesEtherscanStandardJson =
    /\bStandard JSON verification\b/i.test(record.verificationCommand) &&
    /\bEtherscan v2 API\b/i.test(record.verificationCommand);
  if (!usesForgeVerify && !usesEtherscanStandardJson) {
    throw new Error(`${record.label} verification command must use forge verify-contract or Etherscan v2 Standard JSON`);
  }
  if (!record.verificationCommand.includes(record.address)) {
    throw new Error(`${record.label} verification command must include the deployed contract address`);
  }
  const acceptedTargets = verificationTargets(record);
  if (!acceptedTargets.some((target) => record.verificationCommand.includes(target.sourcePath))) {
    throw new Error(`${record.label} verification command must include the verified source path`);
  }
  if (!acceptedTargets.some((target) => record.verificationCommand.includes(target.qualifiedName))) {
    throw new Error(`${record.label} verification command must include the verified contract name`);
  }
  if (usesForgeVerify) {
    assertExactForgeVerifyTarget(record, acceptedTargets);
  }
  if (usesForgeVerify && !/(?:^|\s)--chain\s+4326(?:\s|$)/.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command must target MegaETH mainnet chain 4326`);
  }
  if (usesEtherscanStandardJson && !/\bchain\s+4326\b/i.test(record.verificationCommand)) {
    throw new Error(`${record.label} Standard JSON verification command must target MegaETH mainnet chain 4326`);
  }
  if (usesForgeVerify && !/(?:^|\s)--compiler-version\s+0\.8\.34(?:\s|$)/.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command must pin solc 0.8.34`);
  }
  if (usesEtherscanStandardJson && !/\bcompiler\s+0\.8\.34\b/i.test(record.verificationCommand)) {
    throw new Error(`${record.label} Standard JSON verification command must pin solc 0.8.34`);
  }
  if (usesForgeVerify && !/(?:^|\s)--num-of-optimizations\s+200(?:\s|$)/.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command must pin optimizer runs to 200`);
  }
  if (usesEtherscanStandardJson && !/\boptimizer\s+200\b/i.test(record.verificationCommand)) {
    throw new Error(`${record.label} Standard JSON verification command must pin optimizer runs to 200`);
  }
  if (usesForgeVerify && !/(?:^|\s)--evm-version\s+cancun(?:\s|$)/.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command must pin evmVersion cancun`);
  }
  if (usesEtherscanStandardJson && !/\bevmVersion\s+cancun\b/i.test(record.verificationCommand)) {
    throw new Error(`${record.label} Standard JSON verification command must pin evmVersion cancun`);
  }
  if (record.constructorArgs.length > 0) {
    const includesConstructorArgsFlag = /(?:^|\s)--constructor-args(?:\s|$)/.test(record.verificationCommand);
    const includesStandardJsonConstructorArgs = usesEtherscanStandardJson && /\bconstructor args\b/i.test(record.verificationCommand);
    if (!includesConstructorArgsFlag && !includesStandardJsonConstructorArgs) {
      throw new Error(`${record.label} verification command must include constructor args`);
    }
    if (!record.verificationCommand.includes(record.constructorArgsAbiEncoded)) {
      throw new Error(`${record.label} verification command must include ABI-encoded constructor args`);
    }
    if (usesForgeVerify && !hasExactConstructorArgsFlag(record.verificationCommand, record.constructorArgsAbiEncoded)) {
      throw new Error(`${record.label} verification command must verify the recorded ABI-encoded constructor args`);
    }
  } else if (/(?:^|\s)--constructor-args(?:\s|$)/.test(record.verificationCommand)) {
    throw new Error(`${record.label} verification command must not include constructor args`);
  }
}

function assertExactForgeVerifyTarget(
  record: SourceVerificationContractRecord,
  acceptedTargets: Array<{ sourcePath: string; qualifiedName: string }>
): void {
  const tokens = record.verificationCommand.trim().split(/\s+/);
  const verifyIndex = tokens.findIndex((token, index) => token === "verify-contract" && tokens[index - 1] === "forge");
  const deployedAddress = verifyIndex >= 0 ? tokens[verifyIndex + 1] : undefined;
  const qualifiedName = verifyIndex >= 0 ? tokens[verifyIndex + 2] : undefined;

  if (typeof deployedAddress !== "string" || deployedAddress.toLowerCase() !== record.address.toLowerCase()) {
    throw new Error(`${record.label} verification command must verify the deployed contract address`);
  }
  if (typeof qualifiedName !== "string" || !acceptedTargets.some((target) => target.qualifiedName === qualifiedName)) {
    throw new Error(`${record.label} verification command must verify the recorded source target`);
  }
}

function hasExactConstructorArgsFlag(command: string, expectedConstructorArgs: string): boolean {
  const tokens = command.trim().split(/\s+/);
  return tokens.some((token, index) => token === "--constructor-args" && tokens[index + 1]?.toLowerCase() === expectedConstructorArgs.toLowerCase());
}

function verificationTargets(record: SourceVerificationContractRecord): Array<{ sourcePath: string; qualifiedName: string }> {
  const paths = [record.sourcePath];
  if (record.sourcePath.startsWith("contracts/")) {
    paths.push(record.sourcePath.slice("contracts/".length));
  }
  return paths.map((sourcePath) => ({
    sourcePath,
    qualifiedName: `${sourcePath}:${record.contractName}`
  }));
}

function assertConstructorArgs(
  record: SourceVerificationContractRecord,
  expectedRoles: readonly SourceVerificationExpectedConstructorArgRole[],
  recordsByLabel: ReadonlyMap<SourceVerificationContractLabel, SourceVerificationContractRecord>
): void {
  if (!arraysEqual<string>(record.constructorArgRoles, expectedRoles)) {
    throw new Error(`${record.label} source verification constructor arg roles must match ${expectedRoles.join(", ")}`);
  }
  if (!Array.isArray(record.constructorArgs)) {
    throw new Error(`${record.label} source verification record requires constructor args array`);
  }
  if (record.constructorArgs.length !== expectedRoles.length) {
    throw new Error(`${record.label} source verification constructor args must match ${expectedRoles.join(", ")}`);
  }
  if (expectedRoles.length === 0 && record.constructorArgsAbiEncoded !== "0x") {
    throw new Error(`${record.label} source verification constructor args ABI encoding must be 0x`);
  }
  if (expectedRoles.length > 0 && !/^0x[0-9a-fA-F]+$/.test(record.constructorArgsAbiEncoded)) {
    throw new Error(`${record.label} source verification constructor args require ABI encoding`);
  }
  for (const constructorArg of record.constructorArgs) {
    if (!isNonZeroAddress(constructorArg)) {
      throw new Error(`${record.label} source verification constructor args must be nonzero addresses`);
    }
  }
  expectedRoles.forEach((role, index) => {
    const constructorArg = record.constructorArgs[index]!;
    const dependency = recordsByLabel.get(role as SourceVerificationContractLabel);
    if (dependency && constructorArg.toLowerCase() !== dependency.address.toLowerCase()) {
      throw new Error(`${record.label} constructor arg ${role} must match ${role} address`);
    }
    const unprefixedAddress = constructorArg.slice(2).toLowerCase();
    if (!record.constructorArgsAbiEncoded.toLowerCase().includes(unprefixedAddress)) {
      throw new Error(`${record.label} constructor args ABI encoding must include ${role} address`);
    }
  });
  const expectedConstructorArgsAbiEncoded = encodeAddressConstructorArgs(record.constructorArgs);
  if (record.constructorArgsAbiEncoded.toLowerCase() !== expectedConstructorArgsAbiEncoded) {
    throw new Error(`${record.label} constructor args ABI encoding must match constructor arg role order`);
  }
}

function encodeAddressConstructorArgs(constructorArgs: readonly string[]): `0x${string}` {
  if (constructorArgs.length === 0) {
    return "0x";
  }
  return `0x${constructorArgs.map((arg) => arg.slice(2).toLowerCase().padStart(64, "0")).join("")}`;
}

function assertSourcePath(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  const lower = value.toLowerCase();
  if (/(contracts\/test\/generated|untrusted|local|sandbox|\/tmp\/|\.\.)/.test(lower)) {
    throw new Error(`${label} cannot reference local or quarantined artifacts`);
  }
}

function assertHash(value: string, label: string): void {
  if (!isValidHash(value)) {
    throw new Error(`source verification package requires valid ${label}`);
  }
}

function assertExplorerProofArtifactRef(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  if (/(local|untrusted|sandbox|\/tmp\/|\.\.)/i.test(value)) {
    throw new Error(`source verification package ${label} cannot reference local or quarantined artifacts`);
  }
  if (!/docs\/evidence\/mainnet-readiness\/.+\.(json|md)$/i.test(value)) {
    throw new Error(`source verification package requires ${label} under mainnet readiness evidence`);
  }
}

function assertMainnetReadinessRef(value: string | undefined, label: string): void {
  assertNonPlaceholder(value, label);
  if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value)) {
    throw new Error(`source verification package ${label} must live under docs/evidence/mainnet-readiness`);
  }
  if (/(local|untrusted|sandbox|\/tmp\/|\.\.)/i.test(value)) {
    throw new Error(`source verification package ${label} cannot reference local or quarantined artifacts`);
  }
}

function isValidMainnetReadinessRef(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^docs\/evidence\/mainnet-readiness\/.+/i.test(value) &&
    !/(replace-me|placeholder|pending|todo|tbd|dummy|sample|example|local|untrusted|sandbox|\/tmp\/|\.\.)/i.test(value)
  );
}

function isValidHash(value: string | undefined): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isV12FeeGovernancePackage(record: SourceVerificationPackage | undefined): boolean {
  const productVersion = String(record?.productVersion ?? "").toLowerCase();
  const scope = String(record?.scope ?? "").toLowerCase();
  return productVersion.includes("v1.2") || scope.includes("v1.2");
}

function requiredLabelsForRecord(record: SourceVerificationPackage | undefined): readonly SourceVerificationContractLabel[] {
  return isV12FeeGovernancePackage(record) ? V1_2_REQUIRED_LABELS : REQUIRED_LABELS;
}

function requiredContractByLabelForRecord(
  record: SourceVerificationPackage | undefined
): ReadonlyMap<SourceVerificationContractLabel, SourceVerificationRequiredContract> {
  return isV12FeeGovernancePackage(record) ? V1_2_REQUIRED_CONTRACT_BY_LABEL : REQUIRED_CONTRACT_BY_LABEL;
}

function hasExplicitV11CompatibilityProof(record: SourceVerificationPackage): boolean {
  return isValidMainnetReadinessRef(record.compatibilityProofRef) && isValidHash(record.compatibilityProofSha256);
}

function isGeneratedVerifierLabel(label: SourceVerificationContractLabel): boolean {
  return label === "depositVerifier" || label === "privateTransferVerifier" || label === "withdrawVerifier";
}

function isRequiredContractLabel(label: unknown, record?: SourceVerificationPackage): label is SourceVerificationContractLabel {
  return typeof label === "string" && (requiredLabelsForRecord(record) as readonly string[]).includes(label);
}

function assertOwnerApprovalRef(value: string | undefined): void {
  assertNonPlaceholder(value, "owner approval ref");
  if (!isPrivateOwnerApprovalRef(value) && !/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("source verification package owner approval ref must live under docs/evidence/owner-approval");
  }
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(replace-me|placeholder|pending|todo|tbd|dummy|sample|example)/i.test(value)) {
    throw new Error(`source verification package requires valid ${label}`);
  }
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && /\d{4}-\d{2}-\d{2}T/.test(value);
}

function arraysEqual<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
