export const DEPLOYMENT_PACKAGE_TESTNET_CHAIN_ID = 6343;
export const DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID = 4326;
export const DEPLOYMENT_PACKAGE_BLOCKED_MAINNET_CHAIN_ID = 4326;
export const DEPLOYMENT_PACKAGE_TESTNET_RPC = "https://carrot.megaeth.com/rpc";
export const DEPLOYMENT_PACKAGE_MAINNET_RPC = "https://mainnet.megaeth.com/rpc";
export const FORBIDDEN_LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_ADDRESS = "0x54af9d54b4edD062daD5581670E9E5f73048c87b";

export type DeploymentPackageStatus = "draft" | "review-ready" | "release-candidate" | "approved-for-dry-run" | "approved-for-mainnet";

export type DeploymentPackageAddresses = {
  privateTransferVerifier: `0x${string}`;
  withdrawVerifier: `0x${string}`;
  verifierAdapter: `0x${string}`;
  shieldedPool: `0x${string}`;
  poseidon2: `0x${string}`;
  feeController: `0x${string}`;
  adminOwner?: `0x${string}`;
};

export type DeploymentSignerPolicy = {
  privateKeysInRepo: false;
  broadcastDefault: false;
  signerDescription: string;
  approvedSignerOrSafeAddress?: `0x${string}`;
  signerApprovalRef?: string;
  ownerApprovalRef?: string;
};

export type DeploymentFundingOrder = {
  fundingIsFinalStep: true;
  fundingBeforeNonFundingGatesReady: false;
  fundingStepDescription: string;
  requiredBeforeFunding: readonly string[];
  fundingCapApprovalRef?: string;
  fundingTargets: readonly {
    label: string;
    address: `0x${string}`;
    purpose: string;
    maxBalanceWei?: string;
  }[];
};

export type DeploymentConstructorArgs = {
  privateTransferVerifier: readonly string[];
  withdrawVerifier: readonly string[];
  verifierAdapter: readonly string[];
  shieldedPool: readonly string[];
};

export type DeploymentAddressMode = "predicted-create2" | "deployed";

export type PredictedAddressEvidence = {
  deployer: `0x${string}`;
  salt: string;
  initCodeHash: string;
  derivationCommand: string;
  contracts: readonly PredictedContractAddress[];
};

export type PredictedContractAddress = {
  label: keyof DeploymentPackageAddresses;
  expectedAddress: `0x${string}`;
  deployer: `0x${string}`;
  salt: string;
  initCodeHash: string;
  derivationCommand: string;
};

export type DeploymentRecordContractLabel =
  | "privateTransferVerifier"
  | "withdrawVerifier"
  | "verifierAdapter"
  | "shieldedPool"
  | "poseidon2";

export type DeploymentTransactionRecord = {
  contract: DeploymentRecordContractLabel;
  address: `0x${string}`;
  txHash: `0x${string}`;
  chainId: number;
  receiptArtifactRef: string;
  receiptArtifactHash: string;
};

export type SourceVerificationRecord = {
  contract: DeploymentRecordContractLabel;
  address: `0x${string}`;
  chainId: number;
  explorerUrl: string;
  sourceHash: string;
  runtimeBytecodeHash: string;
  verified: boolean;
};

export type DeploymentPackageCandidate = {
  recordVersion: 1;
  status: DeploymentPackageStatus;
  releaseCandidate?: DeploymentPackageReleaseCandidateGate;
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-testnet" | "megaeth-mainnet";
  mainnet4326Blocked: boolean;
  broadcast: false;
  deploymentApproved: boolean;
  signingApproved: boolean;
  privateKeysInRepo: false;
  realFundsApproved: boolean;
  guardedUsersBlocked: boolean;
  productionPrivacyClaimsBlocked: boolean;
  addressMode: DeploymentAddressMode;
  predictedAddressEvidence?: PredictedAddressEvidence;
  addresses: DeploymentPackageAddresses;
  adminCustody?: {
    feeControllerMultisig: boolean;
    feeControllerCustodyRef: string;
    roleSeparationApproved: boolean;
    keyCompromiseRunbookRef: string;
  };
  signerPolicy: DeploymentSignerPolicy;
  fundingOrder?: DeploymentFundingOrder;
  constructorArgs: DeploymentConstructorArgs;
  verifierPromotionRecordPath: string;
  trustedSetupRecordPath: string;
  gasEvidencePlanPath: string;
  gasEvidenceReportPath?: string;
  slitherReportPath: string;
  launchReadinessRecordPath?: string;
  deploymentDryRunCommand: string;
  postDeployReadOnlyCheckCommand: string;
  constructorArgsRecorded: boolean;
  noMainnetConfigPresent?: boolean;
  deploymentTransactions?: readonly DeploymentTransactionRecord[];
  sourceVerificationRecords?: readonly SourceVerificationRecord[];
  ownerApprovalRef?: string;
  remoteGasEvidenceRef?: string;
  relayerOpsRecordPath?: string;
  incidentResponseRef?: string;
  blockedUntil?: readonly string[];
};

export type DeploymentPackageReleaseCandidateGate = {
  productVersion: "Nullark v1.1";
  mainnet4326Blocked: true;
  deploymentApproved: false;
  signingApproved: false;
  broadcastApproved: false;
  realFundsApproved: false;
  guardedUsersBlocked: true;
  productionPrivacyClaimsBlocked: true;
  blockedStateEvidenceRef: string;
  testnetDryRunEvidenceRef?: string;
};

export function assertDeploymentPackageReady(candidate: DeploymentPackageCandidate): DeploymentPackageCandidate {
  if (candidate.recordVersion !== 1) {
    throw new Error("unsupported deployment package record version");
  }

  assertNoEmergencyGuardianSurface(candidate);

  if (candidate.status === "draft") {
    throw new Error("deployment package is still draft");
  }

  if (candidate.status === "release-candidate") {
    throw new Error("deployment package must be approved-for-mainnet");
  }

  assertChainAndEnvironment(candidate);

  assertSafetyFlags(candidate);

  if (candidate.broadcast !== false || candidate.signerPolicy.broadcastDefault !== false) {
    throw new Error("deployment package scaffold must not broadcast by default");
  }

  if (candidate.privateKeysInRepo !== false || candidate.signerPolicy.privateKeysInRepo !== false) {
    throw new Error("deployment package must not place private keys in repo");
  }

  assertNonPlaceholder(candidate.signerPolicy.signerDescription, "signer policy description");
  assertNoOperationalSecretsOrBroadcast(candidate.signerPolicy.signerDescription, "signer policy description");

  if (candidate.status === "approved-for-dry-run") {
    assertNonPlaceholder(candidate.signerPolicy.signerApprovalRef, "signer approval ref");
    assertNonPlaceholder(candidate.signerPolicy.ownerApprovalRef, "owner approval ref");
  }

  assertAddresses(candidate.addresses);
  assertNoForbiddenLegacyActiveShieldedPoolTarget(candidate.addresses);
  assertAddressMode(candidate);
  assertConstructorArgs(candidate.constructorArgs, candidate.addresses);
  assertPromotionArtifactPath(candidate.verifierPromotionRecordPath, "verifier promotion record path");
  assertPromotionArtifactPath(candidate.trustedSetupRecordPath, "trusted setup record path");
  assertPath(candidate.gasEvidencePlanPath, "gas evidence plan path");
  assertPath(candidate.slitherReportPath, "slither report path");

  if (candidate.launchReadinessRecordPath !== undefined) {
    assertPath(candidate.launchReadinessRecordPath, "launch readiness record path");
  }

  if (candidate.gasEvidenceReportPath !== undefined) {
    assertPromotionArtifactPath(candidate.gasEvidenceReportPath, "gas evidence report path");
  }

  assertNonPlaceholder(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNonPlaceholder(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");
  if (candidate.deploymentDryRunCommand.includes("--broadcast")) {
    throw new Error("deployment package requires a dry-run command without broadcast");
  }
  assertNoOperationalSecretsOrBroadcast(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNoOperationalSecretsOrBroadcast(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");
  assertNoLegacyDepth20Target(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNoLegacyDepth20Target(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");

  if (!candidate.constructorArgsRecorded) {
    throw new Error("deployment package must record constructor arguments");
  }

  if (candidate.chainId === DEPLOYMENT_PACKAGE_TESTNET_CHAIN_ID && !candidate.noMainnetConfigPresent) {
    throw new Error("deployment package must not include mainnet config");
  }

  return candidate;
}

export function assertDeploymentPackageReleaseCandidate(candidate: DeploymentPackageCandidate): DeploymentPackageCandidate {
  if (candidate.recordVersion !== 1) {
    throw new Error("unsupported deployment package record version");
  }
  assertNoEmergencyGuardianSurface(candidate);
  if (candidate.status !== "release-candidate") {
    throw new Error("deployment package must be release-candidate");
  }
  assertChainAndEnvironment(candidate);
  if (candidate.chainId !== DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
    throw new Error("deployment package release candidate must target MegaETH mainnet 4326 while blocked");
  }
  assertReleaseCandidateGate(candidate.releaseCandidate);
  if (
    candidate.mainnet4326Blocked !== true ||
    candidate.deploymentApproved !== false ||
    candidate.signingApproved !== false ||
    candidate.realFundsApproved !== false ||
    candidate.guardedUsersBlocked !== true ||
    candidate.productionPrivacyClaimsBlocked !== true
  ) {
    throw new Error("deployment package release candidate must keep mainnet deployment, signing, funding, users, and production claims blocked");
  }
  if (candidate.broadcast !== false || candidate.signerPolicy.broadcastDefault !== false) {
    throw new Error("deployment package scaffold must not broadcast by default");
  }
  if (candidate.privateKeysInRepo !== false || candidate.signerPolicy.privateKeysInRepo !== false) {
    throw new Error("deployment package must not place private keys in repo");
  }
  assertNonPlaceholder(candidate.signerPolicy.signerDescription, "signer policy description");
  assertNoOperationalSecretsOrBroadcast(candidate.signerPolicy.signerDescription, "signer policy description");
  assertAddresses(candidate.addresses);
  assertNoForbiddenLegacyActiveShieldedPoolTarget(candidate.addresses);
  if (candidate.addressMode !== "deployed") {
    throw new Error("deployment package release candidate must record deployed evidence addresses");
  }
  assertConstructorArgs(candidate.constructorArgs, candidate.addresses);
  assertPromotionArtifactPath(candidate.verifierPromotionRecordPath, "verifier promotion record path");
  assertPromotionArtifactPath(candidate.trustedSetupRecordPath, "trusted setup record path");
  assertPath(candidate.gasEvidencePlanPath, "gas evidence plan path");
  assertPath(candidate.slitherReportPath, "slither report path");
  assertNonPlaceholder(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNonPlaceholder(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");
  if (candidate.deploymentDryRunCommand.includes("--broadcast")) {
    throw new Error("deployment package requires a dry-run command without broadcast");
  }
  assertNoOperationalSecretsOrBroadcast(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNoOperationalSecretsOrBroadcast(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");
  assertNoLegacyDepth20Target(candidate.deploymentDryRunCommand, "deployment dry-run command");
  assertNoLegacyDepth20Target(candidate.postDeployReadOnlyCheckCommand, "post-deploy read-only check command");
  if (!candidate.constructorArgsRecorded) {
    throw new Error("deployment package must record constructor arguments");
  }
  assertDeploymentTransactionRecords(candidate);
  assertSourceVerificationRecords(candidate);
  const blockers = candidate.blockedUntil ?? [];
  if (blockers.length === 0) {
    throw new Error("deployment package release candidate must list remaining blockers");
  }
  for (const blocker of blockers) {
    assertNonPlaceholder(blocker, "deployment package release-candidate blocker");
  }
  assertReleaseCandidateFundingCapBlockers(candidate, blockers);
  assertReleaseCandidateSignerBlockers(candidate, blockers);
  return candidate;
}

function assertApprovedSignerOrSafeAddress(value: string | undefined): void {
  if (typeof value !== "string" || !isNonZeroAddress(value)) {
    throw new Error("mainnet deployment package signerPolicy must record approvedSignerOrSafeAddress");
  }
  assertNotObviousPlaceholderAddress(value, "approved signer or Safe address");
}

function assertReleaseCandidateSignerBlockers(candidate: DeploymentPackageCandidate, blockers: readonly string[]): void {
  const signerOrSafeAddress = candidate.signerPolicy.approvedSignerOrSafeAddress;
  if (signerOrSafeAddress !== undefined) {
    assertApprovedSignerOrSafeAddress(signerOrSafeAddress);
    return;
  }

  const hasBlocker = blockers.some((blocker) => {
    const normalized = blocker.toLowerCase();
    return normalized.includes("approvedsignerorsafeaddress") || (normalized.includes("signer") && normalized.includes("safe"));
  });
  if (!hasBlocker) {
    throw new Error("deployment package release candidate must record missing approved signer or Safe address as a blocker");
  }
}

function assertReleaseCandidateGate(gate: DeploymentPackageReleaseCandidateGate | undefined): void {
  if (!gate) {
    throw new Error("deployment package release candidate requires blocked-state evidence");
  }
  if (gate.productVersion !== "Nullark v1.1") {
    throw new Error("deployment package release candidate must target Nullark v1.1");
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
    throw new Error("deployment package release candidate must keep mainnet deployment, signing, broadcast, funding, users, and production claims blocked");
  }
  assertMainnetReadinessRef(gate.blockedStateEvidenceRef, "release-candidate blocked-state evidence ref", /release-candidate|required-inputs|deployment|source-verification/i);
  if (gate.testnetDryRunEvidenceRef !== undefined) {
    assertMainnetReadinessRef(gate.testnetDryRunEvidenceRef, "release-candidate testnet dry-run evidence ref", /dry-run|deployment|required-inputs/i);
  }
}

function assertAddressMode(candidate: DeploymentPackageCandidate): void {
  if (candidate.addressMode === "deployed") {
    if (candidate.chainId !== DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
      throw new Error("deployed address mode is only valid after MegaETH mainnet broadcast");
    }
    if (!Array.isArray(candidate.deploymentTransactions) || candidate.deploymentTransactions.length === 0) {
      throw new Error("deployed address mode requires deployment transaction records");
    }
    return;
  }

  if (candidate.addressMode !== "predicted-create2") {
    throw new Error("pre-deploy deployment package must use predicted CREATE2 addresses");
  }

  if (!candidate.predictedAddressEvidence) {
    throw new Error("pre-deploy deployment package requires predicted address evidence");
  }

  if (!isNonZeroAddress(candidate.predictedAddressEvidence.deployer)) {
    throw new Error("deployment package requires nonzero predicted address deployer");
  }

  assertNonPlaceholder(candidate.predictedAddressEvidence.salt, "predicted address salt");
  assertHash(candidate.predictedAddressEvidence.initCodeHash, "predicted address init code hash");
  assertNonPlaceholder(candidate.predictedAddressEvidence.derivationCommand, "predicted address derivation command");
  assertNoOperationalSecretsOrBroadcast(candidate.predictedAddressEvidence.derivationCommand, "predicted address derivation command");
  assertPredictedAddressChainBinding(candidate.chainId, candidate.predictedAddressEvidence);
  assertPredictedContractTuples(candidate.predictedAddressEvidence.contracts, candidate.addresses);
}

function assertSafetyFlags(candidate: DeploymentPackageCandidate): void {
  const isMainnet = candidate.chainId === DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID;
  if (isMainnet) {
    const isDeployedEvidencePackage = candidate.status === "review-ready" && candidate.addressMode === "deployed";
    if (candidate.status !== "approved-for-mainnet" && !isDeployedEvidencePackage) {
      throw new Error("mainnet deployment package must be approved-for-mainnet or review-ready with deployed evidence");
    }
    if (candidate.mainnet4326Blocked) {
      throw new Error("mainnet deployment package must unblock MegaETH mainnet 4326");
    }
    if (!candidate.deploymentApproved || !candidate.signingApproved || !candidate.realFundsApproved) {
      throw new Error("mainnet deployment package must approve deployment, signing, and real funds");
    }
    assertMainnetFundingOrder(candidate);
    if (candidate.status === "approved-for-mainnet") {
      if (candidate.guardedUsersBlocked || candidate.productionPrivacyClaimsBlocked) {
        throw new Error("mainnet deployment package must unblock guarded users and production privacy claims");
      }
      if ((candidate.blockedUntil ?? []).length !== 0) {
        throw new Error("approved mainnet deployment package cannot have remaining blockers");
      }
    } else {
      if (!candidate.guardedUsersBlocked || !candidate.productionPrivacyClaimsBlocked) {
        throw new Error("review-ready mainnet deployment package must keep guarded users and production privacy claims blocked");
      }
      assertReviewReadyMainnetBlockers(candidate);
    }
    assertMainnetCustody(candidate);
    return;
  }

  if (!candidate.mainnet4326Blocked) {
    throw new Error("testnet deployment package must keep mainnet 4326 blocked");
  }

  if (candidate.deploymentApproved || candidate.signingApproved || candidate.realFundsApproved) {
    throw new Error("testnet deployment package cannot approve deployment, signing, or real funds");
  }

  if (!candidate.guardedUsersBlocked) {
    throw new Error("testnet deployment package must keep guarded users blocked");
  }

  if (!candidate.productionPrivacyClaimsBlocked) {
    throw new Error("testnet deployment package must block production privacy claims");
  }
}

function assertMainnetFundingOrder(candidate: DeploymentPackageCandidate): void {
  const fundingOrder = candidate.fundingOrder;
  if (!fundingOrder) {
    throw new Error("mainnet deployment package must make funding the final step");
  }
  if (fundingOrder.fundingIsFinalStep !== true || fundingOrder.fundingBeforeNonFundingGatesReady !== false) {
    throw new Error("mainnet deployment package must make funding the final step");
  }
  assertNonPlaceholder(fundingOrder.fundingStepDescription, "funding step description");
  const requiredBeforeFunding = fundingOrder.requiredBeforeFunding ?? [];
  if (requiredBeforeFunding.length < 5) {
    throw new Error("mainnet deployment package must list non-funding gates before funding");
  }
  for (const item of requiredBeforeFunding) {
    assertNonPlaceholder(item, "pre-funding gate");
  }
  assertNonPlaceholder(fundingOrder.fundingCapApprovalRef, "funding cap approval ref");
  const targets = fundingOrder.fundingTargets ?? [];
  if (targets.length === 0) {
    throw new Error("mainnet deployment package must record final funding targets");
  }
  for (const target of targets) {
    assertNonPlaceholder(target.label, "funding target label");
    assertNonPlaceholder(target.purpose, "funding target purpose");
    if (!isNonZeroAddress(target.address)) {
      throw new Error("mainnet deployment package requires nonzero funding target address");
    }
    if (target.maxBalanceWei === undefined) {
      throw new Error(`mainnet deployment package funding target ${target.label} must record maxBalanceWei cap`);
    }
    if (!/^[1-9]\d*$/.test(target.maxBalanceWei)) {
      throw new Error("mainnet deployment package funding target max balance must be positive wei");
    }
  }
}

function assertReleaseCandidateFundingCapBlockers(candidate: DeploymentPackageCandidate, blockers: readonly string[]): void {
  const targets = candidate.fundingOrder?.fundingTargets ?? [];
  const missingCapTargets = targets.filter((target) => !/^[1-9]\d*$/.test(String(target.maxBalanceWei ?? "")));
  if (missingCapTargets.length === 0) {
    return;
  }

  for (const target of missingCapTargets) {
    const label = target.label.toLowerCase();
    const hasBlocker = blockers.some((blocker) => {
      const normalized = blocker.toLowerCase();
      return normalized.includes(label) && (normalized.includes("maxbalancewei") || normalized.includes("funding cap"));
    });
    if (!hasBlocker) {
      throw new Error("deployment package release candidate must record missing funding target caps as blockers");
    }
  }
}

function assertChainAndEnvironment(candidate: DeploymentPackageCandidate): void {
  if (candidate.chainId === DEPLOYMENT_PACKAGE_TESTNET_CHAIN_ID) {
    if (candidate.rpcUrl !== DEPLOYMENT_PACKAGE_TESTNET_RPC || candidate.environment !== "megaeth-testnet") {
      throw new Error("deployment package must target the approved MegaETH testnet RPC");
    }
    return;
  }

  if (candidate.chainId === DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
    if (candidate.rpcUrl !== DEPLOYMENT_PACKAGE_MAINNET_RPC || candidate.environment !== "megaeth-mainnet") {
      throw new Error("deployment package must target the approved MegaETH mainnet RPC");
    }
    return;
  }

  throw new Error("deployment package must target MegaETH testnet 6343 or mainnet 4326");
}

function assertMainnetCustody(candidate: DeploymentPackageCandidate): void {
  assertNonPlaceholder(candidate.ownerApprovalRef, "mainnet owner approval ref");
  assertNonPlaceholder(candidate.signerPolicy.signerApprovalRef, "signer approval ref");
  assertNonPlaceholder(candidate.signerPolicy.ownerApprovalRef, "owner approval ref");
  assertNonPlaceholder(candidate.remoteGasEvidenceRef, "mainnet remote gas evidence ref");
  assertPromotionArtifactPath(candidate.relayerOpsRecordPath ?? "", "mainnet relayer ops record path");
  assertPromotionArtifactPath(candidate.incidentResponseRef ?? "", "mainnet incident response ref");
  assertOwnerApprovalRef(candidate.ownerApprovalRef, "mainnet owner approval ref");
  assertOwnerApprovalRef(candidate.signerPolicy.signerApprovalRef, "signer approval ref");
  assertOwnerApprovalRef(candidate.signerPolicy.ownerApprovalRef, "owner approval ref");
  assertApprovedSignerOrSafeAddress(candidate.signerPolicy.approvedSignerOrSafeAddress);
  if (candidate.incidentResponseRef?.toLowerCase() === candidate.relayerOpsRecordPath?.toLowerCase()) {
    throw new Error("mainnet deployment package incident response ref must be distinct from relayer ops record");
  }
  assertMainnetReadinessRef(candidate.remoteGasEvidenceRef, "mainnet remote gas evidence ref", /gas/i);
  assertMainnetReadinessRef(candidate.relayerOpsRecordPath ?? "", "mainnet relayer ops record path", /relayer-ops/i);
  assertMainnetReadinessRef(candidate.incidentResponseRef ?? "", "mainnet incident response ref", /incident-response/i);

  assertDeploymentTransactionRecords(candidate);
  assertSourceVerificationRecords(candidate);

  const custody = candidate.adminCustody;
  if (!custody?.feeControllerMultisig || !custody.roleSeparationApproved) {
    throw new Error("mainnet deployment package requires multisig fee controller custody evidence");
  }

  assertPromotionArtifactPath(custody.feeControllerCustodyRef, "fee controller custody ref");
  assertPromotionArtifactPath(custody.keyCompromiseRunbookRef, "key compromise runbook ref");
  assertMainnetReadinessRef(custody.feeControllerCustodyRef, "fee controller custody ref", /fee-controller.*custody|custody.*fee-controller/i);
  assertMainnetReadinessRef(custody.keyCompromiseRunbookRef, "key compromise runbook ref", /key-compromise.*runbook|runbook.*key-compromise/i);
  assertMainnetAdminRolesDoNotUseDeployer(candidate);
}

function assertMainnetAdminRolesDoNotUseDeployer(candidate: DeploymentPackageCandidate): void {
  const deployerAddress =
    candidate.predictedAddressEvidence?.deployer ??
    candidate.fundingOrder?.fundingTargets.find((target) => /deployer/i.test(target.label))?.address;
  if (!deployerAddress) {
    throw new Error("mainnet deployment package must record deployment deployer address");
  }
  const deployer = deployerAddress.toLowerCase();
  const adminRoles = [
    candidate.addresses.feeController,
    candidate.addresses.adminOwner
  ].filter((address): address is `0x${string}` => typeof address === "string");
  if (adminRoles.some((address) => address.toLowerCase() === deployer)) {
    throw new Error("mainnet deployment package admin roles cannot use deployer address");
  }
}

function assertNoEmergencyGuardianSurface(candidate: DeploymentPackageCandidate): void {
  const record = candidate as DeploymentPackageCandidate & {
    addresses?: DeploymentPackageAddresses & { emergencyGuardian?: string };
    adminCustody?: DeploymentPackageCandidate["adminCustody"] & {
      emergencyGuardianMultisig?: boolean;
      emergencyGuardianCustodyRef?: string;
    };
  };
  if (record.addresses && Object.hasOwn(record.addresses, "emergencyGuardian")) {
    throw new Error("deployment package must not include emergencyGuardian for the no-guardian Nullark v1.1 path");
  }
  if (
    record.adminCustody &&
    (Object.hasOwn(record.adminCustody, "emergencyGuardianMultisig") ||
      Object.hasOwn(record.adminCustody, "emergencyGuardianCustodyRef"))
  ) {
    throw new Error("deployment package admin custody must not include emergencyGuardian for the no-guardian Nullark v1.1 path");
  }
}

function assertReviewReadyMainnetBlockers(candidate: DeploymentPackageCandidate): void {
  const blockers = candidate.blockedUntil ?? [];
  if (blockers.length === 0) {
    throw new Error("review-ready mainnet deployment package must list remaining launch blockers");
  }
  for (const blocker of blockers) {
    assertNonPlaceholder(blocker, "review-ready mainnet blocker");
  }
}

function assertPredictedAddressChainBinding(chainId: number, predictedAddressEvidence: PredictedAddressEvidence): void {
  if (chainId !== DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
    return;
  }

  assertNoWrongChainFragments(predictedAddressEvidence.salt, "predicted address salt");
  assertNoWrongChainFragments(predictedAddressEvidence.derivationCommand, "predicted address derivation command");
  for (const contract of predictedAddressEvidence.contracts) {
    assertNoWrongChainFragments(contract.salt, `${contract.label} predicted address salt`);
    assertNoWrongChainFragments(contract.derivationCommand, `${contract.label} predicted address derivation command`);
  }
}

function assertDeploymentTransactionRecords(candidate: DeploymentPackageCandidate): void {
  const records = candidate.deploymentTransactions;
  if (!Array.isArray(records)) {
    throw new Error("mainnet deployment package requires deployment transaction records");
  }

  assertExactDeploymentLabels(records, "deployment transaction records");
  const txHashes = new Set<string>();
  for (const record of records) {
    assertMainnetRecordAddress(record.contract, record.address, candidate.addresses, "deployment transaction");
    assertTxHash(record.txHash, `${record.contract} deployment transaction hash`);
    const normalizedTxHash = record.txHash.toLowerCase();
    if (txHashes.has(normalizedTxHash)) {
      throw new Error("mainnet deployment package deployment transaction hashes must be unique");
    }
    txHashes.add(normalizedTxHash);
    if (record.chainId !== DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
      throw new Error(`${record.contract} deployment transaction record must target MegaETH mainnet 4326`);
    }
    assertPromotionArtifactPath(record.receiptArtifactRef, `${record.contract} deployment receipt artifact ref`);
    assertMainnetReadinessRef(record.receiptArtifactRef, `${record.contract} deployment receipt artifact ref`, /deployment-receipts/i);
    assertHash(record.receiptArtifactHash, `${record.contract} deployment receipt artifact hash`);
  }
}

function assertSourceVerificationRecords(candidate: DeploymentPackageCandidate): void {
  const records = candidate.sourceVerificationRecords;
  if (!Array.isArray(records)) {
    throw new Error("mainnet deployment package requires source verification records for deployed contracts");
  }

  assertExactDeploymentLabels(records, "source verification records");
  const requiresCompleteVerification = candidate.status === "approved-for-mainnet";
  for (const record of records) {
    assertMainnetRecordAddress(record.contract, record.address, candidate.addresses, "source verification");
    if (record.chainId !== DEPLOYMENT_PACKAGE_MAINNET_CHAIN_ID) {
      throw new Error(`${record.contract} source verification record must target MegaETH mainnet 4326`);
    }
    if (requiresCompleteVerification && record.verified !== true) {
      throw new Error(`${record.contract} source verification record must be verified`);
    }
    if (!/^https:\/\/mega\.etherscan\.io\//i.test(record.explorerUrl)) {
      throw new Error(`${record.contract} source verification record requires MegaETH mainnet explorer URL`);
    }
    if (!record.explorerUrl.toLowerCase().includes(`/address/${record.address.toLowerCase()}`)) {
      throw new Error(`${record.contract} source verification explorer URL must match deployed address`);
    }
    assertHash(record.sourceHash, `${record.contract} source hash`);
    assertHash(record.runtimeBytecodeHash, `${record.contract} runtime bytecode hash`);
  }
}

function assertExactDeploymentLabels(
  records: readonly { contract: DeploymentRecordContractLabel }[],
  label: string
): void {
  const requiredLabels: DeploymentRecordContractLabel[] = [
    "privateTransferVerifier",
    "withdrawVerifier",
    "verifierAdapter",
    "shieldedPool",
    "poseidon2"
  ];
  if (records.length !== requiredLabels.length) {
    throw new Error(`mainnet deployment package requires ${label} for every deployed contract`);
  }

  const actual = new Set(records.map((record) => record.contract));
  for (const requiredLabel of requiredLabels) {
    if (!actual.has(requiredLabel)) {
      throw new Error(`mainnet deployment package ${label} missing ${requiredLabel}`);
    }
  }
  if (actual.size !== records.length) {
    throw new Error(`mainnet deployment package ${label} contain duplicate contracts`);
  }
}

function assertMainnetRecordAddress(
  contract: DeploymentRecordContractLabel,
  address: string,
  addresses: DeploymentPackageAddresses,
  label: string
): void {
  if (!isNonZeroAddress(address) || address.toLowerCase() !== addresses[contract].toLowerCase()) {
    throw new Error(`${contract} ${label} record address must match deployment package address`);
  }
}

function assertAddresses(addresses: DeploymentPackageAddresses): void {
  const entries = Object.entries(addresses);
  for (const [label, value] of entries) {
    if (!isNonZeroAddress(value)) {
      throw new Error(`deployment package requires nonzero ${label}`);
    }
  }

  const unique = new Set(entries.map(([, value]) => value.toLowerCase()));
  if (unique.size !== entries.length) {
    throw new Error("deployment package addresses must be unique");
  }
}

function assertNoForbiddenLegacyActiveShieldedPoolTarget(addresses: DeploymentPackageAddresses): void {
  if (addresses.shieldedPool.toLowerCase() !== FORBIDDEN_LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_ADDRESS.toLowerCase()) {
    return;
  }

  throw new Error(
    "deployment package shieldedPool address must not reuse legacy ShieldedPoolDepth20 address as the active NullarkPool deployment target"
  );
}

function assertConstructorArgs(
  args: DeploymentConstructorArgs,
  addresses: DeploymentPackageAddresses,
  options: { allowBlockedLegacyEmergencyGuardianConstructor?: boolean } = {}
): void {
  const requiredKeys = ["privateTransferVerifier", "withdrawVerifier", "verifierAdapter", "shieldedPool"] as const;
  for (const key of requiredKeys) {
    if (!Array.isArray(args[key])) {
      throw new Error(`deployment package must record ${key} constructor arguments`);
    }
  }

  if (args.privateTransferVerifier.length !== 0 || args.withdrawVerifier.length !== 0) {
    throw new Error("deployment package generated verifier constructor args must be empty");
  }

  assertAddressArgs(args.verifierAdapter, [addresses.privateTransferVerifier, addresses.withdrawVerifier], "verifier adapter");
  const maybeLegacyGuardian = (addresses as DeploymentPackageAddresses & { emergencyGuardian?: `0x${string}` }).emergencyGuardian;
  const expectedShieldedPoolArgs =
    options.allowBlockedLegacyEmergencyGuardianConstructor && typeof maybeLegacyGuardian === "string"
      ? [addresses.verifierAdapter, addresses.feeController, maybeLegacyGuardian, addresses.poseidon2]
      : [addresses.verifierAdapter, addresses.feeController, addresses.poseidon2];
  assertAddressArgs(args.shieldedPool, expectedShieldedPoolArgs, "shieldedPool");
}

function assertAddressArgs(actual: readonly string[], expected: readonly `0x${string}`[], label: string): void {
  if (actual.length !== expected.length) {
    throw new Error(`deployment package ${label} constructor args length mismatch`);
  }

  for (let i = 0; i < expected.length; i++) {
    const expectedValue = expected[i]!;
    if (actual[i]?.toLowerCase() !== expectedValue.toLowerCase()) {
      throw new Error(`deployment package ${label} constructor args order mismatch`);
    }
  }
}

function assertPredictedContractTuples(
  contracts: readonly PredictedContractAddress[],
  addresses: DeploymentPackageAddresses
): void {
  const addressEntries = Object.entries(addresses) as Array<[keyof DeploymentPackageAddresses, `0x${string}`]>;
  if (contracts.length !== addressEntries.length) {
    throw new Error("deployment package predicted address evidence must include every expected address");
  }

  const byLabel = new Map(contracts.map((contract) => [contract.label, contract]));
  if (byLabel.size !== contracts.length) {
    throw new Error("deployment package predicted address evidence contains duplicate labels");
  }

  for (const [label, expectedAddress] of addressEntries) {
    const contract = byLabel.get(label);
    if (!contract) {
      throw new Error(`deployment package predicted address evidence missing ${label}`);
    }

    if (contract.expectedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error(`deployment package predicted address evidence mismatches ${label}`);
    }

    if (!isNonZeroAddress(contract.deployer)) {
      throw new Error(`deployment package predicted address evidence requires nonzero ${label} deployer`);
    }

    assertNonPlaceholder(contract.salt, `${label} predicted address salt`);
    assertHash(contract.initCodeHash, `${label} predicted address init code hash`);
    assertNonPlaceholder(contract.derivationCommand, `${label} predicted address derivation command`);
    assertNoOperationalSecretsOrBroadcast(contract.derivationCommand, `${label} predicted address derivation command`);
  }
}

function assertPath(value: string, label: string): void {
  if (value.trim().length === 0 || value.includes("..") || /(todo|tbd|placeholder|replace-me|pending|dummy|sample|example)/i.test(value)) {
    throw new Error(`deployment package requires valid ${label}`);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`deployment package requires valid ${label}`);
  }
}

function assertTxHash(value: string, label: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`deployment package requires valid ${label}`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(todo|tbd|placeholder|replace-me|pending|dummy|sample|example)/i.test(value)) {
    throw new Error(`deployment package requires valid ${label}`);
  }
}

function assertPromotionArtifactPath(value: string, label: string): void {
  assertPath(value, label);

  const lower = value.toLowerCase();
  const blockedFragments = ["circuits/build", "untrusted", "contracts/test/generated", "contracts/test/", "local", "sandbox", "pot13", "/tmp/", "dev"];
  if (blockedFragments.some((fragment) => lower.includes(fragment))) {
    throw new Error(`deployment package ${label} cannot reference local or quarantined artifacts`);
  }
}

function assertOwnerApprovalRef(value: string | undefined, label: string): void {
  assertPromotionArtifactPath(value ?? "", label);
  if (!isPrivateOwnerApprovalRef(value) && !/^docs\/evidence\/owner-approval\/.+/i.test(value ?? "")) {
    throw new Error(`deployment package ${label} must live under docs/evidence/owner-approval`);
  }
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertMainnetReadinessRef(value: string, label: string, pattern: RegExp): void {
  assertPromotionArtifactPath(value, label);
  if (!/^docs\/evidence\/mainnet-readiness\/.+/i.test(value)) {
    throw new Error(`deployment package ${label} must live under docs/evidence/mainnet-readiness`);
  }
  if (!pattern.test(value)) {
    throw new Error(`deployment package ${label} must identify the expected evidence package`);
  }
}

function assertNoOperationalSecretsOrBroadcast(value: string, label: string): void {
  const lower = value.toLowerCase();
  const blockedFragments = [
    "private_key",
    "mnemonic",
    "seed_phrase",
    "--private-key",
    "--mnemonic",
    "--ledger",
    "cast send",
    "forge create",
    "sendrawtransaction",
    "rawtransaction",
    "eth_sendrawtransaction",
    "eth_sendrawtransactionsync",
    "deployedtransactionhash",
  ];

  if (blockedFragments.some((fragment) => lower.includes(fragment))) {
    throw new Error(`deployment package ${label} contains blocked signing, broadcast, or mainnet material`);
  }
}

function assertNoWrongChainFragments(value: string, label: string): void {
  const lower = value.toLowerCase();
  const blockedFragments = ["testnet", "carrot", "6343"];
  if (blockedFragments.some((fragment) => lower.includes(fragment))) {
    throw new Error(`mainnet deployment package ${label} contains testnet material`);
  }
}

function assertNoLegacyDepth20Target(value: string, label: string): void {
  if (/(ShieldedPoolDepth20|Depth20)/i.test(value)) {
    throw new Error(`deployment package ${label} must not reference legacy Depth20 pool artifacts`);
  }
}

function assertNotObviousPlaceholderAddress(value: string, label: string): void {
  const hex = value.slice(2).toLowerCase();
  if (/^([0-9a-f])\1{39}$/.test(hex)) {
    throw new Error(`deployment package ${label} cannot be an obvious placeholder address`);
  }
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}
