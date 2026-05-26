export const SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID = 6343;
export const SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID = 4326;
export const SANDBOX_DEPLOYMENT_TESTNET_RPC = "https://carrot.megaeth.com/rpc";

export type SandboxDeploymentPackage =
  | DeployedSandboxDeploymentPackage
  | PreparedStageCNullarkSandboxDeploymentPackage
  | LiveStageCNullarkTestnetDeploymentPackage;

export type DeployedSandboxDeploymentPackage = {
  recordVersion: 1;
  status: "approved-for-sandbox-testnet-deploy";
  scope: "sandbox-only-local-untrusted";
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-testnet";
  mainnet4326Blocked: true;
  guardedUsersBlocked: true;
  realFundsApproved: false;
  productionPrivacyClaimsBlocked: true;
  trustedSetupSource: "local-untrusted-development";
  localUntrustedArtifactsAcceptedForSandboxOnly: true;
  cannotSatisfyVerifierPromotion: true;
  cannotSatisfyProductionDeployment: true;
  ownerRiskAcceptanceRef: string;
  localUntrustedArtifactRecordPath: string;
  signer: {
    account: string;
    address: `0x${string}`;
    keystoreDir: string;
    envPath: ".env.local";
    privateKeysInRepo: false;
    rawPrivateKeyStoredInEvidence: false;
  };
  funding: {
    requiredForDryRunDeployEth: string;
    currentBalanceWei: string;
    status: "blocked-awaiting-official-web-faucet" | "funded";
    officialFaucetUrl: string;
    faucetNotes: string;
  };
  constructorArgs: {
    privateTransferVerifier: readonly string[];
    withdrawVerifier: readonly string[];
    verifierAdapter: readonly string[];
    shieldedPool: readonly string[];
  };
  dryRun: {
    status: "passed";
    command: string;
    estimatedGasPriceGwei: string;
    estimatedGasUsed: string;
    estimatedRequiredEth: string;
    predictedCreateAddressesAtNonceZero: {
      privateTransferVerifier: `0x${string}`;
      withdrawVerifier: `0x${string}`;
      verifierAdapter: `0x${string}`;
      poseidon2: `0x${string}`;
      shieldedPool: `0x${string}`;
    };
    dryRunBroadcastPath: string;
  };
  scripts: {
    dryRun: string;
    broadcast: string;
    readOnlyVerify: string;
    beginSandboxTest: string;
  };
  deployedAddresses: null | {
    privateTransferVerifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    verifierAdapter: `0x${string}`;
    poseidon2: `0x${string}`;
    shieldedPool: `0x${string}`;
  };
  deploymentTransactions?: readonly {
    contractName: string;
    contractAddress: `0x${string}`;
    transactionHash: `0x${string}`;
    status: "0x1";
    blockNumber: `0x${string}`;
    from: `0x${string}`;
    gasUsedHex: `0x${string}`;
  }[];
  readOnlyVerification?: {
    status: "passed";
    shieldedPool: `0x${string}`;
    initialRoot: `0x${string}`;
  };
  sandboxGasEvidenceReportPath: string;
  initialTestTransaction: null | {
    type: "deposit";
    transactionHash: `0x${string}`;
    status: "0x1";
    gasUsedHex: `0x${string}`;
    shieldedPool: `0x${string}`;
    depositWei: string;
    commitment: `0x${string}`;
    commitmentRecorded: true;
    currentRootAfter: `0x${string}`;
    poolBalanceWeiAfter: string;
  };
  notes: string;
};

export type PreparedStageCNullarkSandboxDeploymentPackage = {
  recordVersion: 2;
  status: "prepared-stage-c-nullark-testnet-package";
  scope: "sandbox-only-local-untrusted";
  packageMode: "prepared-no-deployment";
  stage: "stage-c-v1-1";
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-testnet";
  mainnet4326Blocked: true;
  guardedUsersBlocked: true;
  realFundsApproved: false;
  productionPrivacyClaimsBlocked: true;
  deploymentApproved: false;
  signingApproved: false;
  rpcBroadcastApproved: false;
  trustedSetupSource: "local-untrusted-development";
  localUntrustedArtifactsAcceptedForSandboxOnly: true;
  cannotSatisfyVerifierPromotion: true;
  cannotSatisfyProductionDeployment: true;
  promotionBlockedReason: string;
  trustedSetupReadyBlockedReason: string;
  readinessClassification: {
    artifactPromotionStatus: "draft-review-ready-only";
    testnetReadinessStatus: "draft-review-ready-only";
    mainnetReadinessStatus: "blocked";
    testnetDeploymentApproved: false;
    testnetSmokeApproved: false;
    promotionApproved: false;
    checklistRef: string;
    hardBlockers: readonly string[];
  };
  currentVerificationInputs: {
    focusedCoreTestsPassed: true;
    coreTypecheckPassed: true;
    circuitNpmTestPassed: true;
    verifierPromotionBlocked: "local untrusted setup artifacts cannot be promoted";
    trustedSetupReadyBlocked: string;
  };
  contractCandidate: {
    contractName: "NullarkPool";
    sourcePath: "contracts/src/NullarkPool.sol";
    supportsStageC: true;
    fixedDenominationNativeEthOnly: true;
    fixedArityWithdrawChangeOnly: true;
    noErc20: true;
    noSubsetRoots: true;
    noProxyUpgradeability: true;
    noBackendCustody: true;
  };
  scripts: {
    dryRun: string;
    broadcast: string;
    readOnlyVerify: string;
  };
  constructorRoles: {
    deployerEnv: "MEGAETH_DEPLOYER_ADDRESS";
    feeControllerEnv: "MEGAETH_FEE_CONTROLLER";
    emergencyGuardianEnv: "MEGAETH_EMERGENCY_GUARDIAN";
    sharedRolesRequireAcknowledgementEnv: "MEGAETH_ALLOW_SHARED_SANDBOX_ROLES";
    privateKeysInRecord: false;
    rawPrivateKeyStoredInEvidence: false;
  };
  localArtifactRefs: {
    localUntrustedArtifactRecordPath: string;
    provenanceManifestPath: string;
    generatedPrivateTransferVerifierPath: string;
    generatedWithdrawVerifierPath: string;
    artifactStatus: "UNTRUSTED_LOCAL_DEVELOPMENT_ONLY";
    productionUsable: false;
  };
  deployedAddresses: null;
  deploymentTransactions: null;
  readOnlyVerification: null;
  initialTestTransaction: null;
  notes: string;
};

export type LiveStageCNullarkTestnetDeploymentPackage = Omit<
  PreparedStageCNullarkSandboxDeploymentPackage,
  | "status"
  | "packageMode"
  | "deploymentApproved"
  | "signingApproved"
  | "rpcBroadcastApproved"
  | "deployedAddresses"
  | "deploymentTransactions"
  | "readOnlyVerification"
  | "initialTestTransaction"
  | "readinessClassification"
> & {
  status: "live-stage-c-nullark-testnet-package";
  packageMode: "live-testnet-deployment";
  deploymentApproved: true;
  signingApproved: true;
  rpcBroadcastApproved: true;
  readinessClassification: Omit<
    PreparedStageCNullarkSandboxDeploymentPackage["readinessClassification"],
    "testnetReadinessStatus" | "testnetDeploymentApproved" | "testnetSmokeApproved"
  > & {
    testnetReadinessStatus: "live-testnet-deployed" | "live-testnet-deployed-with-replacement2-smoke";
    testnetDeploymentApproved: true;
    testnetSmokeApproved: boolean;
    testnetSmokeArtifact?: string;
  };
  deployedAddresses: {
    privateTransferVerifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    verifierAdapter: `0x${string}`;
    poseidon2: `0x${string}`;
    nullarkPool: `0x${string}`;
    shieldedPool: `0x${string}`;
  };
  deploymentTransactions: readonly {
    contractName: string;
    contractAddress: `0x${string}`;
    transactionHash: `0x${string}`;
    status: "0x1";
    blockNumber: `0x${string}`;
    gasUsed: `0x${string}`;
  }[];
  readOnlyVerification: {
    verifiedAt: string;
    command: string;
    result: "passed";
    MERKLE_TREE_DEPTH: 20;
    MERKLE_TREE_CAPACITY: 1048576;
    initialRoot: `0x${string}`;
    liveCastChecks: {
      MERKLE_TREE_DEPTH: 20;
      MERKLE_TREE_CAPACITY: 1048576;
      codePresent: true;
    };
  };
  verifierCompatibility: {
    checkedAt: string;
    command: string;
    result: "passed";
    localSnarkjsVerifyStatus: 0;
    proofPackingMatchesSolidityCalldata: true;
    publicInputsMatchSolidityCalldata: true;
    mutatedPublicInput10Rejected: true;
    withdrawVerifierMatchesCompiledDeploymentArtifact: true;
    deployedVerifierAbiSignalType: "uint256[12]";
    deployedVerifierExposesExpected12SignalSelector: true;
    withdrawVerifyReturned: true;
    adapterVerifyReturned: true;
    adapterVerifyMutatedPublicInput10Returned: false;
  };
  initialTestTransaction: null;
};

export function assertSandboxDeploymentPackageReady(record: SandboxDeploymentPackage): SandboxDeploymentPackage {
  if (record.recordVersion === 2) {
    if (record.packageMode === "live-testnet-deployment") {
      return assertLiveStageCNullarkTestnetPackage(record as LiveStageCNullarkTestnetDeploymentPackage);
    }
    return assertPreparedStageCNullarkSandboxPackage(record as PreparedStageCNullarkSandboxDeploymentPackage);
  }

  if (record.recordVersion !== 1) {
    throw new Error("unsupported sandbox deployment package version");
  }

  if (record.status !== "approved-for-sandbox-testnet-deploy" || record.scope !== "sandbox-only-local-untrusted") {
    throw new Error("sandbox deployment package must be sandbox-only local-untrusted");
  }

  if (record.chainId === SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID) {
    throw new Error("sandbox deployment package cannot target MegaETH mainnet 4326");
  }

  if (record.chainId !== SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID) {
    throw new Error(`sandbox deployment package must target MegaETH testnet ${SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID}`);
  }

  if (record.rpcUrl !== SANDBOX_DEPLOYMENT_TESTNET_RPC || record.environment !== "megaeth-testnet") {
    throw new Error("sandbox deployment package must target the approved MegaETH testnet RPC");
  }

  if (!record.mainnet4326Blocked || !record.guardedUsersBlocked || !record.productionPrivacyClaimsBlocked) {
    throw new Error("sandbox deployment package must keep mainnet, guarded users, and production claims blocked");
  }

  if (record.realFundsApproved || record.signer.privateKeysInRepo || record.signer.rawPrivateKeyStoredInEvidence) {
    throw new Error("sandbox deployment package cannot approve real funds or private-key evidence");
  }

  if (
    record.trustedSetupSource !== "local-untrusted-development" ||
    !record.localUntrustedArtifactsAcceptedForSandboxOnly ||
    !record.cannotSatisfyVerifierPromotion ||
    !record.cannotSatisfyProductionDeployment
  ) {
    throw new Error("sandbox deployment package must keep local-untrusted artifacts out of trusted gates");
  }

  assertPath(record.ownerRiskAcceptanceRef, "owner risk acceptance ref");
  assertPath(record.localUntrustedArtifactRecordPath, "local untrusted artifact record path");
  if (!record.localUntrustedArtifactRecordPath.includes("local-untrusted-sandbox-artifacts.json")) {
    throw new Error("sandbox deployment package must reference the local untrusted artifact record");
  }

  assertNonPlaceholder(record.signer.account, "signer account");
  assertAddress(record.signer.address, "signer address");
  assertNonPlaceholder(record.signer.keystoreDir, "signer keystore dir");
  if (record.signer.envPath !== ".env.local") {
    throw new Error("sandbox deployment package signer must use gitignored .env.local");
  }

  assertNonPlaceholder(record.funding.requiredForDryRunDeployEth, "funding requirement");
  assertNonPlaceholder(record.funding.currentBalanceWei, "funding balance");
  assertNonPlaceholder(record.funding.faucetNotes, "faucet notes");
  if (record.funding.officialFaucetUrl !== "https://testnet.megaeth.com") {
    throw new Error("sandbox deployment package must point to the official MegaETH testnet faucet");
  }

  assertDryRun(record);
  assertScripts(record.scripts);
  assertConstructorArgs(record);
  assertDeploymentEvidence(record);
  assertNonPlaceholder(record.notes, "notes");

  return record;
}

function assertLiveStageCNullarkTestnetPackage(
  record: LiveStageCNullarkTestnetDeploymentPackage
): LiveStageCNullarkTestnetDeploymentPackage {
  if (
    record.status !== "live-stage-c-nullark-testnet-package" ||
    record.scope !== "sandbox-only-local-untrusted" ||
    record.packageMode !== "live-testnet-deployment" ||
    record.stage !== "stage-c-v1-1"
  ) {
    throw new Error("live Stage C package must be a deployed sandbox-only testnet package");
  }

  assertTestnetBoundary(record);

  if (!record.deploymentApproved || !record.signingApproved || !record.rpcBroadcastApproved) {
    throw new Error("live Stage C package must record explicit testnet deployment, signing, and RPC broadcast approval");
  }

  if (record.realFundsApproved) {
    throw new Error("live Stage C package cannot approve real funds");
  }

  if (
    record.trustedSetupSource !== "local-untrusted-development" ||
    !record.localUntrustedArtifactsAcceptedForSandboxOnly ||
    !record.cannotSatisfyVerifierPromotion ||
    !record.cannotSatisfyProductionDeployment
  ) {
    throw new Error("live Stage C package must keep local-untrusted artifacts out of trusted gates");
  }

  if (
    record.currentVerificationInputs.verifierPromotionBlocked !== "local untrusted setup artifacts cannot be promoted" ||
    !record.currentVerificationInputs.focusedCoreTestsPassed ||
    !record.currentVerificationInputs.coreTypecheckPassed ||
    !record.currentVerificationInputs.circuitNpmTestPassed
  ) {
    throw new Error("live Stage C package must bind the current verification and promotion blockers");
  }

  assertNonPlaceholder(record.currentVerificationInputs.trustedSetupReadyBlocked, "trusted setup ready blocker");
  assertNonPlaceholder(record.promotionBlockedReason, "promotion blocker");
  assertNonPlaceholder(record.trustedSetupReadyBlockedReason, "trusted setup blocker");
  assertLiveStageCReadinessClassification(record.readinessClassification);
  assertStageCContractCandidate(record.contractCandidate);
  assertPreparedStageCScripts(record.scripts);
  assertConstructorRoles(record.constructorRoles);
  assertLocalArtifactRefs(record.localArtifactRefs);
  assertLiveStageCDeploymentEvidence(record);
  assertLiveStageCVerifierCompatibility(record.verifierCompatibility, record.deployedAddresses);

  if (record.initialTestTransaction !== null) {
    throw new Error("live Stage C package must leave smoke transaction evidence to the repeated-withdrawal smoke artifact");
  }

  assertNonPlaceholder(record.notes, "notes");

  return record;
}

function assertPreparedStageCNullarkSandboxPackage(
  record: PreparedStageCNullarkSandboxDeploymentPackage
): PreparedStageCNullarkSandboxDeploymentPackage {
  if (record.recordVersion !== 2) {
    throw new Error("prepared Stage C package must use recordVersion 2");
  }

  if (
    record.status !== "prepared-stage-c-nullark-testnet-package" ||
    record.scope !== "sandbox-only-local-untrusted" ||
    record.packageMode !== "prepared-no-deployment" ||
    record.stage !== "stage-c-v1-1"
  ) {
    throw new Error("prepared Stage C package must be a non-deployed sandbox-only package");
  }

  assertTestnetBoundary(record);

  if (record.deploymentApproved || record.signingApproved || record.rpcBroadcastApproved || record.realFundsApproved) {
    throw new Error("prepared Stage C package cannot approve deployment, signing, RPC broadcast, or real funds");
  }

  if (
    record.trustedSetupSource !== "local-untrusted-development" ||
    !record.localUntrustedArtifactsAcceptedForSandboxOnly ||
    !record.cannotSatisfyVerifierPromotion ||
    !record.cannotSatisfyProductionDeployment
  ) {
    throw new Error("prepared Stage C package must keep local-untrusted artifacts out of trusted gates");
  }

  if (
    record.currentVerificationInputs.verifierPromotionBlocked !== "local untrusted setup artifacts cannot be promoted" ||
    !record.currentVerificationInputs.focusedCoreTestsPassed ||
    !record.currentVerificationInputs.coreTypecheckPassed ||
    !record.currentVerificationInputs.circuitNpmTestPassed
  ) {
    throw new Error("prepared Stage C package must bind the current verification and promotion blockers");
  }

  assertNonPlaceholder(record.currentVerificationInputs.trustedSetupReadyBlocked, "trusted setup ready blocker");
  assertNonPlaceholder(record.promotionBlockedReason, "promotion blocker");
  assertNonPlaceholder(record.trustedSetupReadyBlockedReason, "trusted setup blocker");
  assertStageCReadinessClassification(record.readinessClassification);
  assertStageCContractCandidate(record.contractCandidate);
  assertPreparedStageCScripts(record.scripts);
  assertConstructorRoles(record.constructorRoles);
  assertLocalArtifactRefs(record.localArtifactRefs);

  if (record.deployedAddresses !== null || record.deploymentTransactions !== null) {
    throw new Error("prepared Stage C package cannot claim deployed addresses without deployment receipts");
  }

  if (record.readOnlyVerification !== null || record.initialTestTransaction !== null) {
    throw new Error("prepared Stage C package cannot include post-deployment verification or test transactions");
  }

  assertNonPlaceholder(record.notes, "notes");

  return record;
}

function assertStageCReadinessClassification(
  readiness: PreparedStageCNullarkSandboxDeploymentPackage["readinessClassification"]
): void {
  if (
    readiness.artifactPromotionStatus !== "draft-review-ready-only" ||
    readiness.testnetReadinessStatus !== "draft-review-ready-only" ||
    readiness.mainnetReadinessStatus !== "blocked"
  ) {
    throw new Error("prepared Stage C package readiness must be draft/review-ready only with mainnet blocked");
  }

  if (readiness.testnetDeploymentApproved || readiness.testnetSmokeApproved || readiness.promotionApproved) {
    throw new Error("prepared Stage C package cannot approve testnet deployment, smoke, or promotion");
  }

  assertPath(readiness.checklistRef, "Stage C readiness checklist ref");
  if (readiness.checklistRef !== "docs/evidence/stage-c-testnet-artifact-promotion-readiness.md") {
    throw new Error("prepared Stage C package must reference the Stage C testnet readiness checklist");
  }

  if (!Array.isArray(readiness.hardBlockers) || readiness.hardBlockers.length < 3) {
    throw new Error("prepared Stage C package must record hard readiness blockers");
  }

  for (const blocker of readiness.hardBlockers) {
    assertNonPlaceholder(blocker, "Stage C readiness blocker");
  }

  if (!readiness.hardBlockers.some((blocker) => /mainnet 4326.*blocked/i.test(blocker))) {
    throw new Error("prepared Stage C package must keep mainnet 4326 blocked");
  }
}

function assertLiveStageCReadinessClassification(
  readiness: LiveStageCNullarkTestnetDeploymentPackage["readinessClassification"]
): void {
  const smokeApproved = readiness.testnetSmokeApproved === true;
  const statusMatchesSmokeState =
    (readiness.testnetReadinessStatus === "live-testnet-deployed" && !smokeApproved) ||
    (readiness.testnetReadinessStatus === "live-testnet-deployed-with-replacement2-smoke" && smokeApproved);

  if (
    readiness.artifactPromotionStatus !== "draft-review-ready-only" ||
    !statusMatchesSmokeState ||
    readiness.mainnetReadinessStatus !== "blocked" ||
    !readiness.testnetDeploymentApproved ||
    readiness.promotionApproved
  ) {
    throw new Error("live Stage C package readiness must be live testnet only with promotion and mainnet blocked");
  }

  assertPath(readiness.checklistRef, "Stage C readiness checklist ref");
  if (readiness.checklistRef !== "docs/evidence/stage-c-testnet-artifact-promotion-readiness.md") {
    throw new Error("live Stage C package must reference the Stage C testnet readiness checklist");
  }

  if (!Array.isArray(readiness.hardBlockers) || readiness.hardBlockers.length < 2) {
    throw new Error("live Stage C package must record hard readiness blockers");
  }

  for (const blocker of readiness.hardBlockers) {
    assertNonPlaceholder(blocker, "Stage C readiness blocker");
  }

  if (!smokeApproved && !readiness.hardBlockers.some((blocker) => /smoke/i.test(blocker))) {
    throw new Error("live Stage C package must keep testnet smoke blocked until smoke evidence exists");
  }

  if (smokeApproved) {
    const smokeArtifact = readiness.testnetSmokeArtifact;
    assertPath(smokeArtifact, "Stage C live smoke artifact ref");
    if (!smokeArtifact?.includes("live-repeated-withdrawal-smoke")) {
      throw new Error("live Stage C package must bind approved smoke to the repeated-withdrawal smoke artifact");
    }
  }

  if (!readiness.hardBlockers.some((blocker) => /mainnet 4326.*blocked/i.test(blocker))) {
    throw new Error("live Stage C package must keep mainnet 4326 blocked");
  }
}

function assertTestnetBoundary(record: {
  chainId: number;
  rpcUrl: string;
  environment: "megaeth-testnet";
  mainnet4326Blocked: true;
  guardedUsersBlocked: true;
  productionPrivacyClaimsBlocked: true;
}): void {
  if (record.chainId === SANDBOX_DEPLOYMENT_BLOCKED_MAINNET_CHAIN_ID) {
    throw new Error("sandbox deployment package cannot target MegaETH mainnet 4326");
  }

  if (record.chainId !== SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID) {
    throw new Error(`sandbox deployment package must target MegaETH testnet ${SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID}`);
  }

  if (record.rpcUrl !== SANDBOX_DEPLOYMENT_TESTNET_RPC || record.environment !== "megaeth-testnet") {
    throw new Error("sandbox deployment package must target the approved MegaETH testnet RPC");
  }

  if (!record.mainnet4326Blocked || !record.guardedUsersBlocked || !record.productionPrivacyClaimsBlocked) {
    throw new Error("sandbox deployment package must keep mainnet, guarded users, and production claims blocked");
  }
}

function assertDeploymentEvidence(record: DeployedSandboxDeploymentPackage): void {
  if (record.deployedAddresses === null) {
    throw new Error("sandbox deployment package must record deployed addresses");
  }

  const predicted = record.dryRun.predictedCreateAddressesAtNonceZero;
  for (const [label, address] of Object.entries(record.deployedAddresses)) {
    assertAddress(address, `${label} deployed address`);
    if (address.toLowerCase() !== predicted[label as keyof typeof predicted].toLowerCase()) {
      throw new Error(`sandbox deployed ${label} must match the dry-run predicted address`);
    }
  }

  if (!Array.isArray(record.deploymentTransactions) || record.deploymentTransactions.length !== 5) {
    throw new Error("sandbox deployment package must record all deployment transactions");
  }

  const deployedByAddress = new Set(Object.values(record.deployedAddresses).map((address) => address.toLowerCase()));
  for (const transaction of record.deploymentTransactions) {
    assertNonPlaceholder(transaction.contractName, "deployment transaction contract name");
    assertAddress(transaction.contractAddress, `${transaction.contractName} contract address`);
    assertTxHash(transaction.transactionHash, `${transaction.contractName} deployment transaction hash`);
    if (transaction.status !== "0x1") {
      throw new Error(`sandbox deployment transaction ${transaction.contractName} must have succeeded`);
    }
    assertHex(transaction.blockNumber, `${transaction.contractName} deployment block number`);
    assertAddress(transaction.from, `${transaction.contractName} deployment sender`);
    assertHex(transaction.gasUsedHex, `${transaction.contractName} deployment gas used`);
    if (!deployedByAddress.has(transaction.contractAddress.toLowerCase())) {
      throw new Error(`sandbox deployment transaction ${transaction.contractName} must reference a deployed address`);
    }
    if (transaction.from.toLowerCase() !== record.signer.address.toLowerCase()) {
      throw new Error(`sandbox deployment transaction ${transaction.contractName} must be from the approved signer`);
    }
  }

  if (!record.readOnlyVerification || record.readOnlyVerification.status !== "passed") {
    throw new Error("sandbox deployment package must include passed read-only verification");
  }
  assertAddress(record.readOnlyVerification.shieldedPool, "read-only verification shielded pool");
  assertBytes32(record.readOnlyVerification.initialRoot, "read-only verification initial root");
  if (record.readOnlyVerification.shieldedPool.toLowerCase() !== record.deployedAddresses.shieldedPool.toLowerCase()) {
    throw new Error("sandbox read-only verification must target deployed shieldedPool");
  }
  assertPath(record.sandboxGasEvidenceReportPath, "sandbox gas evidence report path");
  if (!record.sandboxGasEvidenceReportPath.includes("megaeth-testnet-sandbox-gas-evidence.json")) {
    throw new Error("sandbox deployment package must reference the sandbox gas evidence report");
  }

  if (record.initialTestTransaction === null) {
    throw new Error("sandbox deployment package must record the initial test transaction");
  }
  if (record.initialTestTransaction.type !== "deposit" || record.initialTestTransaction.status !== "0x1") {
    throw new Error("sandbox initial test transaction must be a successful deposit");
  }
  assertTxHash(record.initialTestTransaction.transactionHash, "initial test transaction hash");
  assertHex(record.initialTestTransaction.gasUsedHex, "initial test transaction gas used");
  assertAddress(record.initialTestTransaction.shieldedPool, "initial test transaction shielded pool");
  assertBytes32(record.initialTestTransaction.commitment, "initial test transaction commitment");
  assertBytes32(record.initialTestTransaction.currentRootAfter, "initial test transaction current root");
  assertPositiveDecimal(record.initialTestTransaction.depositWei, "initial test transaction deposit wei");
  assertPositiveDecimal(record.initialTestTransaction.poolBalanceWeiAfter, "initial test transaction pool balance");
  if (!record.initialTestTransaction.commitmentRecorded) {
    throw new Error("sandbox initial test transaction must record the inserted commitment");
  }
  if (record.initialTestTransaction.shieldedPool.toLowerCase() !== record.deployedAddresses.shieldedPool.toLowerCase()) {
    throw new Error("sandbox initial test transaction must target deployed shieldedPool");
  }
}

function assertLiveStageCDeploymentEvidence(record: LiveStageCNullarkTestnetDeploymentPackage): void {
  const addresses = record.deployedAddresses;
  assertAddress(addresses.privateTransferVerifier, "private transfer verifier deployed address");
  assertAddress(addresses.withdrawVerifier, "withdraw verifier deployed address");
  assertAddress(addresses.verifierAdapter, "verifier adapter deployed address");
  assertAddress(addresses.poseidon2, "poseidon2 deployed address");
  assertAddress(addresses.nullarkPool, "NullarkPool deployed address");
  assertAddress(addresses.shieldedPool, "shieldedPool deployed address");

  if (addresses.nullarkPool.toLowerCase() !== addresses.shieldedPool.toLowerCase()) {
    throw new Error("live Stage C package NullarkPool and shieldedPool aliases must match");
  }

  const uniqueContracts = [
    addresses.privateTransferVerifier,
    addresses.withdrawVerifier,
    addresses.verifierAdapter,
    addresses.poseidon2,
    addresses.nullarkPool
  ].map((address) => address.toLowerCase());
  if (new Set(uniqueContracts).size !== uniqueContracts.length) {
    throw new Error("live Stage C package deployed contract addresses must be unique except NullarkPool/shieldedPool alias");
  }

  if (!Array.isArray(record.deploymentTransactions) || record.deploymentTransactions.length !== 5) {
    throw new Error("live Stage C package must record all deployment transactions");
  }

  const expectedReceiptAddresses = new Map<string, `0x${string}`>([
    ["UntrustedLocalGroth16PrivateTransferVerifier", addresses.privateTransferVerifier],
    ["UntrustedLocalGroth16WithdrawVerifier", addresses.withdrawVerifier],
    ["ActionRoutingGroth16Verifier", addresses.verifierAdapter],
    ["PoseidonT3", addresses.poseidon2],
    ["NullarkPool", addresses.nullarkPool]
  ]);
  const seenContractNames = new Set<string>();
  const seenTransactionHashes = new Set<string>();

  for (const transaction of record.deploymentTransactions) {
    assertNonPlaceholder(transaction.contractName, "deployment transaction contract name");
    assertAddress(transaction.contractAddress, `${transaction.contractName} contract address`);
    assertTxHash(transaction.transactionHash, `${transaction.contractName} deployment transaction hash`);
    if (transaction.status !== "0x1") {
      throw new Error(`live Stage C deployment transaction ${transaction.contractName} must have succeeded`);
    }
    assertHex(transaction.blockNumber, `${transaction.contractName} deployment block number`);
    assertHex(transaction.gasUsed, `${transaction.contractName} deployment gas used`);

    const expectedAddress = expectedReceiptAddresses.get(transaction.contractName);
    if (!expectedAddress) {
      throw new Error(`live Stage C deployment transaction ${transaction.contractName} must be an expected contract receipt`);
    }
    if (seenContractNames.has(transaction.contractName)) {
      throw new Error("live Stage C deployment transactions must include one receipt per deployed contract");
    }
    seenContractNames.add(transaction.contractName);

    const txHash = transaction.transactionHash.toLowerCase();
    if (seenTransactionHashes.has(txHash)) {
      throw new Error("live Stage C deployment transactions must have unique transaction hashes");
    }
    seenTransactionHashes.add(txHash);

    if (transaction.contractAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error(`live Stage C deployment transaction ${transaction.contractName} must match deployed ${deploymentAddressLabel(transaction.contractName)} address`);
    }
  }
  if (seenContractNames.size !== expectedReceiptAddresses.size) {
    throw new Error("live Stage C deployment transactions must include one receipt per deployed contract");
  }

  if (!record.readOnlyVerification || record.readOnlyVerification.result !== "passed") {
    throw new Error("live Stage C package must include passed read-only verification");
  }
  assertCommand(record.readOnlyVerification.command, "read-only verification command");
  assertLiveReadOnlyVerificationCommand(record.readOnlyVerification.command, addresses);
  assertBytes32(record.readOnlyVerification.initialRoot, "read-only verification initial root");
  if (
    record.readOnlyVerification.MERKLE_TREE_DEPTH !== 20 ||
    record.readOnlyVerification.MERKLE_TREE_CAPACITY !== 1048576 ||
    record.readOnlyVerification.liveCastChecks.MERKLE_TREE_DEPTH !== 20 ||
    record.readOnlyVerification.liveCastChecks.MERKLE_TREE_CAPACITY !== 1048576 ||
    !record.readOnlyVerification.liveCastChecks.codePresent
  ) {
    throw new Error("live Stage C package read-only verification must prove depth, capacity, and deployed code");
  }
}

function assertLiveStageCVerifierCompatibility(
  compatibility: LiveStageCNullarkTestnetDeploymentPackage["verifierCompatibility"],
  addresses?: LiveStageCNullarkTestnetDeploymentPackage["deployedAddresses"]
): void {
  assertNonPlaceholder(compatibility.checkedAt, "verifier compatibility timestamp");
  assertCommand(compatibility.command, "verifier compatibility command");
  if (addresses) {
    assertLiveVerifierCompatibilityCommand(compatibility.command, addresses);
  }

  if (compatibility.result !== "passed") {
    throw new Error("live Stage C package verifier compatibility must pass");
  }

  if (
    compatibility.localSnarkjsVerifyStatus !== 0 ||
    !compatibility.proofPackingMatchesSolidityCalldata ||
    !compatibility.publicInputsMatchSolidityCalldata ||
    !compatibility.mutatedPublicInput10Rejected
  ) {
    throw new Error("live Stage C package must prove local proof packing and mutation evidence");
  }

  if (
    !compatibility.withdrawVerifierMatchesCompiledDeploymentArtifact ||
    compatibility.deployedVerifierAbiSignalType !== "uint256[12]" ||
    !compatibility.deployedVerifierExposesExpected12SignalSelector
  ) {
    throw new Error("live Stage C package must prove the deployed withdraw verifier is the 12-public-input artifact");
  }

  if (
    !compatibility.withdrawVerifyReturned ||
    !compatibility.adapterVerifyReturned ||
    compatibility.adapterVerifyMutatedPublicInput10Returned
  ) {
    throw new Error("live Stage C package must prove deployed verifier acceptance and mutated-input rejection");
  }
}

function deploymentAddressLabel(contractName: string): string {
  const labels = new Map<string, string>([
    ["UntrustedLocalGroth16PrivateTransferVerifier", "privateTransferVerifier"],
    ["UntrustedLocalGroth16WithdrawVerifier", "withdrawVerifier"],
    ["ActionRoutingGroth16Verifier", "verifierAdapter"],
    ["PoseidonT3", "poseidon2"],
    ["NullarkPool", "nullarkPool"]
  ]);
  return labels.get(contractName) ?? contractName;
}

function assertLiveReadOnlyVerificationCommand(
  command: string,
  addresses: LiveStageCNullarkTestnetDeploymentPackage["deployedAddresses"]
): void {
  const requiredFragments = [
    "contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool",
    `--rpc-url ${SANDBOX_DEPLOYMENT_TESTNET_RPC}`,
    `--chain-id ${SANDBOX_DEPLOYMENT_TESTNET_CHAIN_ID}`,
    `MEGAETH_PRIVATE_TRANSFER_VERIFIER=${addresses.privateTransferVerifier}`,
    `MEGAETH_WITHDRAW_VERIFIER=${addresses.withdrawVerifier}`,
    `MEGAETH_VERIFIER_ADAPTER=${addresses.verifierAdapter}`,
    `MEGAETH_POSEIDON2=${addresses.poseidon2}`,
    `MEGAETH_NULLARK_POOL=${addresses.nullarkPool}`
  ];

  if (!requiredFragments.every((fragment) => command.includes(fragment))) {
    throw new Error("live Stage C package read-only verification must bind the approved testnet RPC, chain ID, script, and deployed addresses");
  }
}

function assertLiveVerifierCompatibilityCommand(
  command: string,
  addresses: LiveStageCNullarkTestnetDeploymentPackage["deployedAddresses"]
): void {
  const requiredFragments = [
    "scripts/diagnose-withdraw-verifier-compatibility.mjs",
    `MEGAETH_WITHDRAW_VERIFIER=${addresses.withdrawVerifier}`,
    `MEGAETH_VERIFIER_ADAPTER=${addresses.verifierAdapter}`
  ];

  if (!requiredFragments.every((fragment) => command.includes(fragment))) {
    throw new Error("live Stage C package verifier compatibility command must bind deployed verifier and adapter addresses");
  }
}

function assertDryRun(record: DeployedSandboxDeploymentPackage): void {
  if (record.dryRun.status !== "passed") {
    throw new Error("sandbox deployment package requires a passed dry-run");
  }

  assertCommand(record.dryRun.command, "dry-run command");
  assertNonPlaceholder(record.dryRun.estimatedGasPriceGwei, "estimated gas price");
  assertNonPlaceholder(record.dryRun.estimatedGasUsed, "estimated gas used");
  assertNonPlaceholder(record.dryRun.estimatedRequiredEth, "estimated required ETH");
  assertPath(record.dryRun.dryRunBroadcastPath, "dry-run broadcast path");

  for (const [label, address] of Object.entries(record.dryRun.predictedCreateAddressesAtNonceZero)) {
    assertAddress(address, `${label} predicted address`);
  }
}

function assertConstructorArgs(record: DeployedSandboxDeploymentPackage): void {
  const predicted = record.dryRun.predictedCreateAddressesAtNonceZero;
  if (record.constructorArgs.privateTransferVerifier.length !== 0 || record.constructorArgs.withdrawVerifier.length !== 0) {
    throw new Error("sandbox generated verifier constructor args must be empty");
  }

  assertAddressArray(record.constructorArgs.verifierAdapter, [predicted.privateTransferVerifier, predicted.withdrawVerifier], "verifier adapter");
  assertAddressArray(record.constructorArgs.shieldedPool, [predicted.verifierAdapter, record.signer.address, record.signer.address, predicted.poseidon2], "shielded pool");
}

function assertScripts(scripts: DeployedSandboxDeploymentPackage["scripts"]): void {
  assertCommand(scripts.dryRun, "dry-run script");
  assertCommand(scripts.readOnlyVerify, "read-only verify script");
  assertCommand(scripts.broadcast, "broadcast script");
  assertCommand(scripts.beginSandboxTest, "begin sandbox test script");
  assertLegacyShieldedPoolScriptsAreQuarantined(scripts);

  if (!scripts.broadcast.includes("--broadcast") || !scripts.beginSandboxTest.includes("--broadcast")) {
    throw new Error("sandbox broadcast scripts must explicitly include --broadcast");
  }
}

function assertLegacyShieldedPoolScriptsAreQuarantined(scripts: DeployedSandboxDeploymentPackage["scripts"]): void {
  const legacyDeploy = "contracts/script/DeployMegaEthTestnet.s.sol:DeployMegaEthTestnet";
  const legacyVerify = "contracts/script/VerifyMegaEthTestnet.s.sol:VerifyMegaEthTestnet";
  const legacyOptIn = "ALLOW_LEGACY_SHIELDED_POOL_TESTNET_SCRIPT=true";
  const values = [scripts.dryRun, scripts.broadcast, scripts.readOnlyVerify];

  if (values.some((value) => value.includes(legacyDeploy) || value.includes(legacyVerify))) {
    for (const [label, value] of [
      ["dry-run script", scripts.dryRun],
      ["broadcast script", scripts.broadcast],
      ["read-only verify script", scripts.readOnlyVerify]
    ] as const) {
      if ((value.includes(legacyDeploy) || value.includes(legacyVerify)) && !value.includes(legacyOptIn)) {
        throw new Error(`${label} uses legacy ShieldedPool testnet script without explicit legacy opt-in`);
      }
    }
  }
}

function assertPreparedStageCScripts(scripts: PreparedStageCNullarkSandboxDeploymentPackage["scripts"]): void {
  assertCommand(scripts.dryRun, "dry-run script");
  assertCommand(scripts.broadcast, "broadcast script");
  assertCommand(scripts.readOnlyVerify, "read-only verify script");

  if (
    !scripts.dryRun.includes("contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool") ||
    !scripts.broadcast.includes("contracts/script/DeployMegaEthTestnetNullarkPool.s.sol:DeployMegaEthTestnetNullarkPool")
  ) {
    throw new Error("prepared Stage C package must use the NullarkPool testnet deployment script");
  }

  if (!scripts.readOnlyVerify.includes("contracts/script/VerifyMegaEthTestnetNullarkPool.s.sol:VerifyMegaEthTestnetNullarkPool")) {
    throw new Error("prepared Stage C package must use the NullarkPool testnet verification script");
  }

  if (
    !scripts.dryRun.includes(SANDBOX_DEPLOYMENT_TESTNET_RPC) ||
    !scripts.broadcast.includes(SANDBOX_DEPLOYMENT_TESTNET_RPC) ||
    !scripts.readOnlyVerify.includes(SANDBOX_DEPLOYMENT_TESTNET_RPC)
  ) {
    throw new Error("prepared Stage C package scripts must target the approved MegaETH testnet RPC");
  }
}

function assertStageCContractCandidate(
  candidate: PreparedStageCNullarkSandboxDeploymentPackage["contractCandidate"]
): void {
  if (candidate.contractName !== "NullarkPool") {
    throw new Error("prepared Stage C package contract name must be NullarkPool");
  }

  if (candidate.sourcePath !== "contracts/src/NullarkPool.sol") {
    throw new Error("prepared Stage C package source path must be contracts/src/NullarkPool.sol");
  }

  if (
    !candidate.supportsStageC ||
    !candidate.fixedDenominationNativeEthOnly ||
    !candidate.fixedArityWithdrawChangeOnly ||
    !candidate.noErc20 ||
    !candidate.noSubsetRoots ||
    !candidate.noProxyUpgradeability ||
    !candidate.noBackendCustody
  ) {
    throw new Error("prepared Stage C package must preserve the fixed native ETH Nullark scope");
  }
}

function assertConstructorRoles(roles: PreparedStageCNullarkSandboxDeploymentPackage["constructorRoles"]): void {
  if (
    roles.deployerEnv !== "MEGAETH_DEPLOYER_ADDRESS" ||
    roles.feeControllerEnv !== "MEGAETH_FEE_CONTROLLER" ||
    roles.emergencyGuardianEnv !== "MEGAETH_EMERGENCY_GUARDIAN" ||
    roles.sharedRolesRequireAcknowledgementEnv !== "MEGAETH_ALLOW_SHARED_SANDBOX_ROLES"
  ) {
    throw new Error("prepared Stage C package constructor roles must bind the Nullark deployment env vars");
  }

  if (roles.privateKeysInRecord || roles.rawPrivateKeyStoredInEvidence) {
    throw new Error("prepared Stage C package cannot include private-key material");
  }
}

function assertLocalArtifactRefs(refs: PreparedStageCNullarkSandboxDeploymentPackage["localArtifactRefs"]): void {
  assertPath(refs.localUntrustedArtifactRecordPath, "local untrusted artifact record path");
  assertPath(refs.provenanceManifestPath, "provenance manifest path");
  assertPath(refs.generatedPrivateTransferVerifierPath, "private transfer verifier path");
  assertPath(refs.generatedWithdrawVerifierPath, "withdraw verifier path");

  if (!refs.localUntrustedArtifactRecordPath.includes("local-untrusted-sandbox-artifacts.json")) {
    throw new Error("prepared Stage C package must reference the local untrusted artifact record");
  }

  if (!refs.provenanceManifestPath.includes("circuits/build/provenance/manifest.json")) {
    throw new Error("prepared Stage C package must reference the circuit provenance manifest");
  }

  if (
    !refs.generatedPrivateTransferVerifierPath.includes("UNTRUSTED_DO_NOT_USE_YET/Groth16PrivateTransferVerifier.sol") ||
    !refs.generatedWithdrawVerifierPath.includes("UNTRUSTED_DO_NOT_USE_YET/Groth16WithdrawVerifier.sol")
  ) {
    throw new Error("prepared Stage C package must reference quarantined local generated verifiers");
  }

  if (refs.artifactStatus !== "UNTRUSTED_LOCAL_DEVELOPMENT_ONLY" || refs.productionUsable) {
    throw new Error("prepared Stage C package must mark Groth16 artifacts as local-untrusted only");
  }
}

function assertAddressArray(actual: readonly string[], expected: readonly `0x${string}`[], label: string): void {
  if (actual.length !== expected.length) {
    throw new Error(`sandbox ${label} constructor args length mismatch`);
  }

  for (let i = 0; i < expected.length; i++) {
    if (actual[i]?.toLowerCase() !== expected[i]!.toLowerCase()) {
      throw new Error(`sandbox ${label} constructor args order mismatch`);
    }
  }
}

function assertCommand(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  const lower = value.toLowerCase();
  const blocked = ["private_key", "--private-key", "mnemonic", "--mnemonic", "https://mainnet.megaeth.com/rpc", " 4326"];
  if (blocked.some((fragment) => lower.includes(fragment))) {
    throw new Error(`sandbox deployment package ${label} contains blocked secret or mainnet material`);
  }
}

function assertPath(value: string | undefined, label: string): void {
  assertNonPlaceholder(value, label);
  if (value.includes("..")) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertAddress(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertBytes32(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || value.toLowerCase() === `0x${"0".repeat(64)}`) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertTxHash(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertHex(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertPositiveDecimal(value: string, label: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(todo|tbd|placeholder|replace-me|dummy|sample|example)/i.test(value)) {
    throw new Error(`sandbox deployment package requires valid ${label}`);
  }
}
