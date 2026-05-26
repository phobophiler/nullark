export const REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER = [
  "root",
  "nullifier",
  "newCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "spentCommitment",
  "noteAmount",
  "proofContextHash",
  "encryptedNoteHash"
] as const;

export const V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER = [
  "root",
  "nullifier",
  "outputCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "proofContextHash",
  "encryptedOutputNoteHash"
] as const;

export const V12_DEPOSIT_VERIFIER_PUBLIC_INPUT_ORDER = [
  "commitment",
  "amount",
  "chainId",
  "verifyingContract",
  "depositContextHash",
  "encryptedDepositNoteHash"
] as const;

export const VERIFIER_PROMOTION_TESTNET_CHAIN_ID = 6343;
export const VERIFIER_PROMOTION_MAINNET_CHAIN_ID = 4326;
export const VERIFIER_PROMOTION_BLOCKED_MAINNET_CHAIN_ID = 4326;

export const REQUIRED_VERIFIER_CIRCUITS = ["private_transfer", "withdraw"] as const;
export const REQUIRED_VERIFIER_TOOLCHAIN_COMPONENTS = ["node", "circom", "snarkjs", "solc"] as const;
export const V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH =
  "98ae722255351a03402cd3ad1cdf9a65d5ca270f5c11b7ad48322ff0fc77f110";
export const V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH =
  "e27e4ffa491a6d61a5f537b72b30510ecf0458730b195a8b294ed788ccdc4b83";
const V11_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH: string =
  "53d060ccfb5d02a590b8fd0abeb6b828359fe6d5d52de3b14359b5d55c1dae32";
export const V11_BROWSER_PROVER_MANIFEST_HASH = "b4514173425aa34d6092e4b024341ed5a5696a8528c98f7a971521c69822a1a7";
export const V11_TRUSTED_SETUP_RECORD_HASH = "7cf2ba6c7d482179a5a246ad4fa0ab7c4bbebb6a48108d0fe0963b8a364c825e";
export const V11_NULLARK_POOL_ADDRESS = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15";
export const REQUIRED_V12_TRUSTED_SETUP_CIRCUITS = ["deposit", "privateTransfer", "withdraw"] as const;
export const REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS = [
  "circuitSource",
  "r1cs",
  "wasm",
  "zkey",
  "verificationKey",
  "generatedVerifier"
] as const;
export const REQUIRED_V12_TRUSTED_SETUP_GLOBAL_ARTIFACTS = [
  "adapterRuntimeBytecode",
  "browserManifest"
] as const;
export const REQUIRED_V12_TRUSTED_SETUP_ARTIFACTS = [
  "withdrawCircuitSource",
  "withdrawR1cs",
  "withdrawWasm",
  "withdrawZkey",
  "withdrawVerificationKey",
  "generatedVerifier",
  ...REQUIRED_V12_TRUSTED_SETUP_GLOBAL_ARTIFACTS
] as const;

export type TrustedSetupSource =
  | "local-untrusted-development"
  | "public-accepted-ptau"
  | "project-specific-ceremony"
  | "external-audited-ceremony";

export type VerifierCircuitName = (typeof REQUIRED_VERIFIER_CIRCUITS)[number];

export type VerifierPromotionRecordStatus = "draft" | "release-candidate" | "review-ready" | "externally-reviewed" | "promoted";

export type VerifierPromotionReviewGate = {
  status: "pending" | "complete";
  reference: string;
  reviewer: string;
  openHighOrCriticalFindings: number;
};

export type VerifierPromotionCircuitRecord = {
  name: VerifierCircuitName;
  generatedVerifierContractName: string;
  sourcePath: string;
  sourceHash: string;
  dependencyHashes: readonly string[];
  r1csHash: string;
  wasmHash: string;
  symHash: string;
  zkeyHash: string;
  vkeyHash: string;
  provingKeyHash: string;
  verificationKeyHash: string;
  generatedSolidityVerifierHash: string;
  generatedVerifierPath: string;
  publicInputOrder: readonly string[];
};

export type TrustedSetupVerifierPromotionRecord = {
  recordVersion: 1;
  status: VerifierPromotionRecordStatus;
  trustedSetupSource: TrustedSetupSource;
  chainId: number;
  mainnet4326Blocked: boolean;
  deploymentApproved: boolean;
  signingApproved: boolean;
  broadcastApproved?: false;
  privateKeysIncluded: boolean;
  realFundsApproved: boolean;
  guardedUsersBlocked?: true;
  productionPrivacyClaimsBlocked: boolean;
  productionRelayerOperationApproved?: false;
  trustedSetupProvenanceRef: string;
  trustedSetupProvenanceArtifactRef: string;
  trustedSetupProvenanceArtifactHash: string;
  ptauSource: string;
  powersOfTauHash: string;
  powersOfTauArtifactRef: string;
  ceremonyTranscriptHashes: readonly string[];
  ceremonyTranscriptArtifactRefs: readonly string[];
  contributionHashes: readonly string[];
  contributionArtifactRefs: readonly string[];
  circuits: readonly VerifierPromotionCircuitRecord[];
  adapterSourcePath: string;
  adapterSourceHash: string;
  adapterExpectedPublicInputOrder: readonly string[];
  adapterRouting: {
    privateTransferCircuit: VerifierCircuitName;
    withdrawCircuit: VerifierCircuitName;
  };
  reproducibleBuildCommand: string;
  commandLogHash: string;
  toolchainVersions: readonly string[];
  reviewPacketPath: string;
  circuitReview: VerifierPromotionReviewGate;
  contractReview: VerifierPromotionReviewGate;
  trustedSetupReview: VerifierPromotionReviewGate;
  issueDisposition: VerifierPromotionReviewGate;
  ownerApprovalRef?: string;
  deployedVerifierAddresses?: {
    privateTransferVerifier: `0x${string}`;
    withdrawVerifier: `0x${string}`;
    actionRoutingVerifier: `0x${string}`;
  };
  blockedUntil: readonly string[];
  quarantine?: {
    manifestPath: string;
    manifestStatus: string;
    manifestPublicInputs: readonly string[];
    trustedVerifierGenerated: boolean;
    deploymentAuthorized: boolean;
    realFundsAllowed: boolean;
    verifierOutputDirectory: string;
    reviewReadyExpectedFailure: string;
    stageCForbidden: boolean;
  };
};

export type VerifierPromotionCandidate = {
  trustedSetupSource: TrustedSetupSource;
  chainId: number;
  circuitSourceHashes: readonly string[];
  r1csHashes: readonly string[];
  witnessCalculatorHashes: readonly string[];
  provingKeyHashes: readonly string[];
  verificationKeyHashes: readonly string[];
  generatedSolidityVerifierHashes: readonly string[];
  adapterSourceHash: string;
  publicInputOrder: readonly string[];
  verifierAddresses: readonly `0x${string}`[];
  generatedVerifierPath: string;
  reproducibleBuildCommand: string;
  ownerApprovalRecorded: boolean;
  circuitReviewComplete: boolean;
  externalSecurityReviewComplete: boolean;
  noHighOrCriticalFindings: boolean;
};

export type V12TrustedSetupArtifactName = (typeof REQUIRED_V12_TRUSTED_SETUP_ARTIFACTS)[number];
export type V12TrustedSetupCircuitName = (typeof REQUIRED_V12_TRUSTED_SETUP_CIRCUITS)[number];
export type V12TrustedSetupCircuitArtifactName = (typeof REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS)[number];
export type V12TrustedSetupGlobalArtifactName = (typeof REQUIRED_V12_TRUSTED_SETUP_GLOBAL_ARTIFACTS)[number];

export type V12TrustedSetupArtifactRef = {
  path: string;
  sha256: string;
};

export type V12TrustedSetupCircuitArtifactRecord = {
  publicInputOrder?: readonly string[];
  publicInputOrderHash?: string;
  generatedVerifierHash?: string | null;
  artifacts?: Partial<Record<V12TrustedSetupCircuitArtifactName, V12TrustedSetupArtifactRef>>;
};

export type V12TrustedSetupAdapterRouteBinding = {
  verifier?: "depositVerifier" | "privateTransferVerifier" | "withdrawVerifier";
  publicInputCount?: number;
  publicInputOrderHash?: string;
};

export type V12TrustedSetupReviewGate = {
  status: "pending" | "complete";
  reference: string;
  reviewer: string;
  openHighOrCriticalFindings: number;
};

export type V12TrustedSetupProverPromotionRecord = {
  schema?: string;
  productVersion?: string;
  scope?: string;
  lane?: string;
  status?: string;
  chainId?: number;
  environment?: string;
  rpcUrl?: string;
  mainnet4326Blocked?: boolean;
  ownerApprovalRef?: string;
  ownerApprovalSha256?: string;
  currentV1_1ApprovalRef?: {
    publicRuntimeRef?: string;
    proverManifestSha256?: string;
    trustedSetupRecordSha256?: string;
    pool?: `0x${string}`;
    withdrawSelector?: `0x${string}`;
  };
  v1_1Preservation?: {
    currentRuntimeUnchanged?: boolean;
    withdrawalsPreserved?: boolean;
    doesNotApproveV1_2?: boolean;
  };
  noV1_1ApprovalReuse?: boolean;
  approvesDeployment?: boolean;
  approvesSigning?: boolean;
  approvesFunding?: boolean;
  approvesRelayerEnablement?: boolean;
  approvesGuardedUsers?: boolean;
  approvesPrivacyClaims?: boolean;
  evidenceRefs?: readonly {
    label?: string;
    path?: string;
    sha256?: string;
  }[];
  artifactBoundary?: "new-v1.2-artifacts" | "byte-for-byte-v1.1-compatible" | string;
  circuitApproach?: "contract-enforced-fee-formula" | "feeBps-public-input" | string;
  publicInputOrder?: readonly string[];
  publicInputOrderChangeAcknowledged?: boolean;
  generatedVerifierHash?: string | null;
  adapterBinding?: {
    chainId?: number;
    chain?: number;
    pool?: `0x${string}` | null;
    depositVerifier?: `0x${string}` | null;
    privateTransferVerifier?: `0x${string}` | null;
    withdrawVerifier?: `0x${string}` | null;
    verifier?: `0x${string}` | null;
    adapter?: `0x${string}` | null;
    selector?: `0x${string}`;
    publicInputOrderHash?: string;
    routing?: Partial<Record<V12TrustedSetupCircuitName, V12TrustedSetupAdapterRouteBinding>>;
  };
  browserManifestHash?: string | null;
  artifacts?: Partial<Record<V12TrustedSetupArtifactName, V12TrustedSetupArtifactRef>>;
  circuitArtifacts?: Partial<Record<V12TrustedSetupCircuitName, V12TrustedSetupCircuitArtifactRecord>>;
  compatibilityProof?: {
    status?: string;
    reference?: string;
    sha256?: string;
    perArtifactHashes?: Partial<Record<V12TrustedSetupGlobalArtifactName, string>>;
    perCircuitArtifactHashes?: Partial<
      Record<V12TrustedSetupCircuitName, Partial<Record<V12TrustedSetupCircuitArtifactName, string>>>
    >;
    publicInputOrderHash?: string;
    publicInputOrderHashes?: Partial<Record<V12TrustedSetupCircuitName, string>>;
  };
  reviews?: {
    circuitReview?: V12TrustedSetupReviewGate;
    contractReview?: V12TrustedSetupReviewGate;
    trustedSetupReview?: V12TrustedSetupReviewGate;
    issueDisposition?: V12TrustedSetupReviewGate;
  };
  doesNotBroadenV1_1Approval?: boolean;
  blockedUntil?: readonly string[];
};

export function assertVerifierPromotionReady(candidate: VerifierPromotionCandidate): VerifierPromotionCandidate {
  if (candidate.trustedSetupSource === "local-untrusted-development") {
    throw new Error("local untrusted setup artifacts cannot be promoted");
  }

  if (candidate.chainId === VERIFIER_PROMOTION_MAINNET_CHAIN_ID) {
    throw new Error("use a verifier promotion record for MegaETH mainnet 4326 promotion");
  }

  if (candidate.chainId !== VERIFIER_PROMOTION_TESTNET_CHAIN_ID) {
    throw new Error("verifier promotion must target MegaETH testnet 6343");
  }

  assertNonEmptyHashes(candidate.circuitSourceHashes, "circuit source hashes");
  assertNonEmptyHashes(candidate.r1csHashes, "r1cs hashes");
  assertNonEmptyHashes(candidate.witnessCalculatorHashes, "witness calculator hashes");
  assertNonEmptyHashes(candidate.provingKeyHashes, "proving key hashes");
  assertNonEmptyHashes(candidate.verificationKeyHashes, "verification key hashes");
  assertNonEmptyHashes(candidate.generatedSolidityVerifierHashes, "generated Solidity verifier hashes");
  assertHash(candidate.adapterSourceHash, "adapter source hash");

  if (candidate.publicInputOrder.join("|") !== REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER.join("|")) {
    throw new Error("verifier public input order mismatch");
  }

  if (candidate.verifierAddresses.length === 0 || candidate.verifierAddresses.some((address) => !isNonZeroAddress(address))) {
    throw new Error("verifier promotion must record nonzero verifier addresses");
  }

  assertUniqueAddresses(candidate.verifierAddresses, "verifier promotion");

  if (candidate.generatedVerifierPath.includes("UNTRUSTED") || candidate.generatedVerifierPath.includes("test/generated")) {
    throw new Error("quarantined generated verifier path cannot be promoted");
  }

  assertReproducibleBuildCommand(candidate.reproducibleBuildCommand);

  if (!candidate.ownerApprovalRecorded) {
    throw new Error("verifier promotion requires owner approval");
  }

  if (!candidate.circuitReviewComplete || !candidate.externalSecurityReviewComplete || !candidate.noHighOrCriticalFindings) {
    throw new Error("verifier promotion requires completed reviews with no high or critical findings");
  }

  return candidate;
}

export function assertV12TrustedSetupProverPromotionReady(
  record: V12TrustedSetupProverPromotionRecord
): V12TrustedSetupProverPromotionRecord {
  const label = "v1.2 trusted setup/prover promotion";

  if (
    record.schema !== "nullark-v1-2-trusted-setup-prover-promotion-v1" ||
    record.productVersion !== "nullark-v1.2-fee-governance" ||
    record.scope !== "nullark-v1.2-fee-governance" ||
    record.lane !== "trusted-setup-prover-promotion"
  ) {
    throw new Error(`${label} must target the Nullark v1.2 trusted setup/prover promotion lane`);
  }

  if (record.status !== "approved-for-mainnet") {
    throw new Error(`${label} must be approved-for-mainnet before readiness`);
  }

  if (record.chainId !== VERIFIER_PROMOTION_MAINNET_CHAIN_ID || record.environment !== "megaeth-mainnet") {
    throw new Error(`${label} must target MegaETH mainnet 4326`);
  }

  if (record.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
    throw new Error(`${label} must bind the MegaETH mainnet RPC`);
  }

  if (record.mainnet4326Blocked !== false) {
    throw new Error(`${label} must unblock mainnet only in an approved-for-mainnet record`);
  }

  assertV12NonAuthorizingFlags(record, label);

  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error(`${label} cannot have remaining blockers`);
  }

  assertV12PromotionPath(record.ownerApprovalRef, "v1.2 trusted setup/prover promotion owner approval ref");
  assertSha256(record.ownerApprovalSha256, `${label} owner approval hash`);
  assertV12PreservationContext(record, label);
  assertV12EvidenceRefs(record, label);
  assertV12PublicInputOrder(record, label);
  assertV12ArtifactBoundary(record, label);
  assertV12AdapterBinding(record, label);
  assertV12Artifacts(record, label);
  assertV12NoUnprovenV11Reuse(record, label);
  assertV12ReviewGate(record.reviews?.circuitReview, "circuit review", label);
  assertV12ReviewGate(record.reviews?.contractReview, "contract review", label);
  assertV12ReviewGate(record.reviews?.trustedSetupReview, "trusted setup review", label);
  assertV12ReviewGate(record.reviews?.issueDisposition, "issue disposition", label);

  if (record.doesNotBroadenV1_1Approval !== true) {
    throw new Error(`${label} must prove it does not broaden v1.1 approval`);
  }

  return record;
}

export function assertVerifierPromotionRecordReleaseCandidate(
  record: TrustedSetupVerifierPromotionRecord
): TrustedSetupVerifierPromotionRecord {
  assertVerifierPromotionRecordCommon(record, {
    allowLocalUntrustedArtifacts: true,
    allowMissingBlockedSafetyFlags: true
  });

  if (record.status !== "release-candidate") {
    throw new Error("verifier promotion record is not release-candidate evidence");
  }

  if (record.chainId !== VERIFIER_PROMOTION_TESTNET_CHAIN_ID) {
    throw new Error("release-candidate verifier promotion record must target MegaETH testnet 6343");
  }

  if (record.trustedSetupSource === "local-untrusted-development") {
    assertLocalUntrustedQuarantine(record);
  }

  return record;
}

export function assertVerifierPromotionRecordReviewReady(
  record: TrustedSetupVerifierPromotionRecord
): TrustedSetupVerifierPromotionRecord {
  assertVerifierPromotionRecordCommon(record);

  if (record.status === "draft") {
    throw new Error("verifier promotion record is still draft");
  }

  if (record.status === "release-candidate") {
    throw new Error("verifier promotion record is release-candidate evidence only");
  }

  assertNonPlaceholderRef(record.reviewPacketPath, "review packet path");
  assertReviewGate(record.circuitReview, "circuit review");
  assertReviewGate(record.contractReview, "contract review");
  assertReviewGate(record.trustedSetupReview, "trusted setup review");
  assertReviewGate(record.issueDisposition, "issue disposition");

  if (record.chainId === VERIFIER_PROMOTION_MAINNET_CHAIN_ID) {
    assertMainnetPromotionRecord(record);
  }

  return record;
}

export function assertVerifierPromotionRecordPromoted(
  record: TrustedSetupVerifierPromotionRecord
): TrustedSetupVerifierPromotionRecord {
  assertVerifierPromotionRecordReviewReady(record);

  if (record.status !== "promoted") {
    throw new Error("verifier promotion record is not promoted");
  }

  if (record.blockedUntil.length !== 0) {
    throw new Error("promoted verifier promotion record cannot have remaining blockers");
  }

  assertCompleteReviewGate(record.circuitReview, "circuit review");
  assertCompleteReviewGate(record.contractReview, "contract review");
  assertCompleteReviewGate(record.trustedSetupReview, "trusted setup review");
  assertCompleteReviewGate(record.issueDisposition, "issue disposition");
  assertNonPlaceholderRef(record.ownerApprovalRef, "owner approval ref");

  return record;
}

type VerifierPromotionRecordCommonOptions = {
  allowLocalUntrustedArtifacts?: boolean;
  allowMissingBlockedSafetyFlags?: boolean;
};

function assertVerifierPromotionRecordCommon(
  record: TrustedSetupVerifierPromotionRecord,
  options: VerifierPromotionRecordCommonOptions = {}
): void {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported verifier promotion record version");
  }

  if (record.trustedSetupSource === "local-untrusted-development" && !options.allowLocalUntrustedArtifacts) {
    throw new Error("local untrusted setup artifacts cannot be promoted");
  }

  if (!isSupportedMegaEthChain(record.chainId)) {
    throw new Error("verifier promotion record must target MegaETH testnet 6343 or mainnet 4326");
  }

  assertSafetyFlags(record, options);
  assertNonPlaceholderRef(record.trustedSetupProvenanceRef, "trusted setup provenance ref");
  assertVerifierArtifactPath(record.trustedSetupProvenanceArtifactRef, "trusted setup provenance artifact ref", options);
  assertHash(record.trustedSetupProvenanceArtifactHash, "trusted setup provenance artifact hash");
  assertNonPlaceholderRef(record.ptauSource, "ptau source");
  assertHash(record.powersOfTauHash, "powers of tau hash");
  assertVerifierArtifactPath(record.powersOfTauArtifactRef, "powers of tau artifact ref", options);
  assertNonEmptyHashes(record.ceremonyTranscriptHashes, "ceremony transcript hashes");
  assertMatchingArtifactRefs(
    record.ceremonyTranscriptArtifactRefs,
    record.ceremonyTranscriptHashes,
    "ceremony transcript artifact refs",
    options
  );
  assertNonEmptyHashes(record.contributionHashes, "contribution hashes");
  assertMatchingArtifactRefs(record.contributionArtifactRefs, record.contributionHashes, "contribution artifact refs", options);
  assertVerifierArtifactPath(record.adapterSourcePath, "adapter source path", options);
  assertHash(record.adapterSourceHash, "adapter source hash");
  assertPublicInputOrder(record.adapterExpectedPublicInputOrder, "adapter");
  assertAdapterRouting(record.adapterRouting);
  assertReproducibleBuildCommand(record.reproducibleBuildCommand);
  assertHash(record.commandLogHash, "command log hash");
  assertToolchainVersions(record.toolchainVersions);
  assertCircuitRecords(record.circuits, options);
  assertOptionalDeployedAddresses(record);
}

function assertSafetyFlags(record: TrustedSetupVerifierPromotionRecord, options: VerifierPromotionRecordCommonOptions): void {
  const isMainnet = record.chainId === VERIFIER_PROMOTION_MAINNET_CHAIN_ID;
  if (isMainnet) {
    if (record.mainnet4326Blocked) {
      throw new Error("mainnet verifier promotion record must unblock MegaETH mainnet 4326");
    }
  } else if (!record.mainnet4326Blocked) {
    throw new Error("testnet verifier promotion record must keep mainnet 4326 blocked");
  }

  if (!isMainnet && record.status === "promoted") {
    throw new Error("non-mainnet verifier promotion records cannot be promoted");
  }

  if (record.deploymentApproved || record.signingApproved || record.realFundsApproved) {
    throw new Error("verifier promotion record cannot approve deployment, signing, or real funds; use a deployment package");
  }

  const allowLegacyBlockedSafetyFlags =
    options.allowMissingBlockedSafetyFlags && record.status === "release-candidate" && record.mainnet4326Blocked === true;

  if (record.broadcastApproved !== false && !(allowLegacyBlockedSafetyFlags && record.broadcastApproved === undefined)) {
    throw new Error("verifier promotion record cannot approve broadcast; use a deployment package");
  }

  if (record.privateKeysIncluded) {
    throw new Error("verifier promotion record cannot include private keys");
  }

  if (record.guardedUsersBlocked !== true && !(allowLegacyBlockedSafetyFlags && record.guardedUsersBlocked === undefined)) {
    throw new Error("verifier promotion record must keep guarded users blocked");
  }

  if (!record.productionPrivacyClaimsBlocked) {
    throw new Error("verifier promotion record must block production privacy claims");
  }

  if (
    record.productionRelayerOperationApproved !== false &&
    !(allowLegacyBlockedSafetyFlags && record.productionRelayerOperationApproved === undefined)
  ) {
    throw new Error("verifier promotion record cannot approve production relayer operation; use a relayer ops record");
  }
}

function assertMainnetPromotionRecord(record: TrustedSetupVerifierPromotionRecord): void {
  if (record.status !== "promoted") {
    throw new Error("mainnet verifier promotion record must be promoted");
  }

  if (record.blockedUntil.length !== 0) {
    throw new Error("mainnet verifier promotion record cannot have remaining blockers");
  }

  assertCompleteReviewGate(record.circuitReview, "circuit review");
  assertCompleteReviewGate(record.contractReview, "contract review");
  assertCompleteReviewGate(record.trustedSetupReview, "trusted setup review");
  assertCompleteReviewGate(record.issueDisposition, "issue disposition");
  assertNonPlaceholderRef(record.ownerApprovalRef, "owner approval ref");

  if (!record.deployedVerifierAddresses) {
    throw new Error("mainnet verifier promotion record requires deployed verifier addresses");
  }
}

function assertAdapterRouting(routing: TrustedSetupVerifierPromotionRecord["adapterRouting"]): void {
  if (routing.privateTransferCircuit !== "private_transfer" || routing.withdrawCircuit !== "withdraw") {
    throw new Error("verifier promotion record adapter routing mismatch");
  }
}

function assertCircuitRecords(
  circuits: readonly VerifierPromotionCircuitRecord[],
  options: VerifierPromotionRecordCommonOptions
): void {
  if (circuits.length !== REQUIRED_VERIFIER_CIRCUITS.length) {
    throw new Error("verifier promotion record must include private_transfer and withdraw circuits");
  }

  const names = new Set(circuits.map((circuit) => circuit.name));
  for (const requiredName of REQUIRED_VERIFIER_CIRCUITS) {
    if (!names.has(requiredName)) {
      throw new Error(`verifier promotion record missing ${requiredName} circuit`);
    }
  }

  if (names.size !== circuits.length) {
    throw new Error("verifier promotion record contains duplicate circuits");
  }

  for (const circuit of circuits) {
    assertNonPlaceholderRef(circuit.generatedVerifierContractName, `${circuit.name} generated verifier contract name`);
    assertVerifierArtifactPath(circuit.sourcePath, `${circuit.name} source path`, options);
    assertHash(circuit.sourceHash, `${circuit.name} source hash`);
    assertNonEmptyHashes(circuit.dependencyHashes, `${circuit.name} dependency hashes`);
    assertHash(circuit.r1csHash, `${circuit.name} r1cs hash`);
    assertHash(circuit.wasmHash, `${circuit.name} wasm hash`);
    assertHash(circuit.symHash, `${circuit.name} sym hash`);
    assertHash(circuit.zkeyHash, `${circuit.name} zkey hash`);
    assertHash(circuit.vkeyHash, `${circuit.name} vkey hash`);
    assertHash(circuit.provingKeyHash, `${circuit.name} proving key hash`);
    assertHash(circuit.verificationKeyHash, `${circuit.name} verification key hash`);
    assertHash(circuit.generatedSolidityVerifierHash, `${circuit.name} generated Solidity verifier hash`);
    assertVerifierArtifactPath(circuit.generatedVerifierPath, `${circuit.name} generated verifier path`, options);

    assertPublicInputOrder(circuit.publicInputOrder, circuit.name);
  }
}

function assertLocalUntrustedQuarantine(record: TrustedSetupVerifierPromotionRecord): void {
  const quarantine = record.quarantine;
  if (!quarantine) {
    throw new Error("local untrusted release-candidate evidence requires a quarantine record");
  }

  assertVerifierArtifactPath(quarantine.manifestPath, "quarantine manifest path", { allowLocalUntrustedArtifacts: true });
  if (quarantine.manifestStatus !== "local-groth16-artifacts-quarantined") {
    throw new Error("local untrusted release-candidate evidence must be quarantined");
  }

  assertPublicInputOrder(quarantine.manifestPublicInputs, "quarantine manifest");

  if (quarantine.trustedVerifierGenerated || quarantine.deploymentAuthorized || quarantine.realFundsAllowed) {
    throw new Error("local untrusted release-candidate evidence cannot authorize trusted verifiers, deployment, or real funds");
  }

  assertVerifierArtifactPath(quarantine.verifierOutputDirectory, "quarantine verifier output directory", {
    allowLocalUntrustedArtifacts: true
  });
  if (!/UNTRUSTED/i.test(quarantine.verifierOutputDirectory)) {
    throw new Error("local untrusted release-candidate evidence must keep generated verifiers in an UNTRUSTED path");
  }

  assertNonPlaceholderRef(quarantine.reviewReadyExpectedFailure, "quarantine review-ready expected failure");
  if (!/local untrusted setup artifacts cannot be promoted/i.test(quarantine.reviewReadyExpectedFailure)) {
    throw new Error("local untrusted release-candidate evidence must record the final-promotion blocker");
  }

  if (!quarantine.stageCForbidden) {
    throw new Error("local untrusted release-candidate evidence must keep Stage C forbidden");
  }
}

function assertPublicInputOrder(values: readonly string[], label: string): void {
  if (values.join("|") !== REQUIRED_VERIFIER_PUBLIC_INPUT_ORDER.join("|")) {
    throw new Error(`${label} verifier public input order mismatch`);
  }
}

function assertOptionalDeployedAddresses(record: TrustedSetupVerifierPromotionRecord): void {
  if (!record.deployedVerifierAddresses) {
    return;
  }

  if (record.status !== "promoted") {
    throw new Error("deployed verifier addresses can only be recorded after verifier promotion");
  }

  const verifierAddresses = [
    record.deployedVerifierAddresses.privateTransferVerifier,
    record.deployedVerifierAddresses.withdrawVerifier,
    record.deployedVerifierAddresses.actionRoutingVerifier
  ] as const;
  if (verifierAddresses.some((address) => !isNonZeroAddress(address))) {
    throw new Error("deployed verifier address record requires nonzero verifier addresses");
  }
  assertUniqueAddresses(verifierAddresses, "deployed verifier address record");
}

function assertReproducibleBuildCommand(command: string): void {
  assertNonPlaceholderRef(command, "reproducible build command");

  const normalized = command.trim();
  if (
    /\b(private[_-]?key|mnemonic|seed phrase|secret)\b/i.test(normalized) ||
    /\b(cast\s+send|sendRawTransaction|eth_sendRawTransaction|--broadcast|deploy|mainnet-deploy)\b/i.test(normalized) ||
    /\bwrangler\s+secret\b/i.test(normalized)
  ) {
    throw new Error("verifier promotion reproducible build command cannot include signing, deployment, or secret material");
  }

  if (!/^npm\s+run\s+[-:\w]+/.test(normalized) || !/(circuit|trusted|verifier)/i.test(normalized)) {
    throw new Error("verifier promotion reproducible build command must be a repo npm script for circuit or verifier artifacts");
  }
}

function assertToolchainVersions(values: readonly string[]): void {
  assertNonEmptyRefs(values, "toolchain versions");

  for (const component of REQUIRED_VERIFIER_TOOLCHAIN_COMPONENTS) {
    if (!values.some((value) => new RegExp(`\\b${component}\\b`, "i").test(value))) {
      throw new Error(`verifier promotion toolchain versions must include ${component}`);
    }
  }
}

function assertUniqueAddresses(values: readonly string[], label: string): void {
  const normalized = values.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} requires unique verifier addresses`);
  }
}

function assertNonEmptyHashes(values: readonly string[], label: string): void {
  if (values.length === 0) {
    throw new Error(`verifier promotion requires ${label}`);
  }

  for (const value of values) {
    assertHash(value, label);
  }
}

function assertHash(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value) || isObviousPlaceholderSha256(value)) {
    throw new Error(`invalid ${label}`);
  }
}

function assertNonEmptyRefs(values: readonly string[], label: string): void {
  if (values.length === 0) {
    throw new Error(`verifier promotion requires ${label}`);
  }

  for (const value of values) {
    assertNonPlaceholderRef(value, label);
  }
}

function assertMatchingArtifactRefs(
  refs: readonly string[],
  hashes: readonly string[],
  label: string,
  options: VerifierPromotionRecordCommonOptions
): void {
  if (!Array.isArray(refs) || refs.length !== hashes.length || refs.length === 0) {
    throw new Error(`verifier promotion requires ${label} for every recorded hash`);
  }
  for (const ref of refs) {
    assertVerifierArtifactPath(ref, label, options);
  }
}

function assertNonPlaceholderRef(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0 || /(todo|tbd|placeholder|replace-me|pending|dummy|sample|example)/i.test(value.trim())) {
    throw new Error(`verifier promotion requires ${label}`);
  }
}

function assertPromotionArtifactPath(value: string, label: string): void {
  assertNonPlaceholderRef(value, label);

  if (
    /circuits\/build/i.test(value) ||
    /UNTRUSTED/i.test(value) ||
    /contracts\/test\/generated/i.test(value) ||
    /sandbox/i.test(value) ||
    /(^|\/|-)local($|\/|-)/i.test(value) ||
    /pot13/i.test(value) ||
    /(^|\/|-)dev($|\/|-)/i.test(value) ||
    /\/tmp\//i.test(value)
  ) {
    throw new Error(`verifier promotion ${label} cannot reference local or quarantined artifacts`);
  }
}

function assertVerifierArtifactPath(value: string, label: string, options: VerifierPromotionRecordCommonOptions): void {
  if (!options.allowLocalUntrustedArtifacts) {
    assertPromotionArtifactPath(value, label);
    return;
  }

  assertNonPlaceholderRef(value, label);
  if (/\/tmp\//i.test(value)) {
    throw new Error(`verifier promotion ${label} cannot reference temporary artifacts`);
  }
}

function assertReviewGate(gate: VerifierPromotionReviewGate, label: string): void {
  if (!gate) {
    throw new Error(`verifier promotion requires ${label}`);
  }

  assertNonPlaceholderRef(gate.reference, `${label} reference`);
  assertNonPlaceholderRef(gate.reviewer, `${label} reviewer`);

  if (!Number.isInteger(gate.openHighOrCriticalFindings) || gate.openHighOrCriticalFindings < 0) {
    throw new Error(`invalid ${label} open high or critical findings count`);
  }
}

function assertCompleteReviewGate(gate: VerifierPromotionReviewGate, label: string): void {
  assertReviewGate(gate, label);

  if (gate.status !== "complete" || gate.openHighOrCriticalFindings !== 0) {
    throw new Error(`promoted verifier promotion record requires complete ${label} with no high or critical findings`);
  }
}

function assertV12NonAuthorizingFlags(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  const flags = [
    "approvesDeployment",
    "approvesSigning",
    "approvesFunding",
    "approvesRelayerEnablement",
    "approvesGuardedUsers",
    "approvesPrivacyClaims"
  ] as const;

  for (const flag of flags) {
    if (record[flag] !== false) {
      throw new Error(`${label} must keep ${flag} false`);
    }
  }
}

function assertV12PreservationContext(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  if (record.noV1_1ApprovalReuse !== true) {
    throw new Error(`${label} must explicitly avoid v1.1 approval reuse`);
  }

  const preservation = record.v1_1Preservation;
  if (
    preservation?.currentRuntimeUnchanged !== true ||
    preservation.withdrawalsPreserved !== true ||
    preservation.doesNotApproveV1_2 !== true
  ) {
    throw new Error(`${label} must preserve v1.1 withdrawals and mark v1.1 approval as context only`);
  }

  const current = record.currentV1_1ApprovalRef;
  if (
    current?.publicRuntimeRef !== "public-artifacts/current.json" ||
    current.proverManifestSha256 !== V11_BROWSER_PROVER_MANIFEST_HASH ||
    current.trustedSetupRecordSha256 !== V11_TRUSTED_SETUP_RECORD_HASH ||
    current.pool !== V11_NULLARK_POOL_ADDRESS ||
    current.withdrawSelector !== "0x678d8506"
  ) {
    throw new Error(`${label} must bind current v1.1 approval as preservation-only context`);
  }
}

function assertV12EvidenceRefs(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  if (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.length === 0) {
    throw new Error(`${label} evidenceRefs must include hash-bound repo-local evidence`);
  }

  for (const evidence of record.evidenceRefs) {
    assertNonPlaceholderRef(evidence?.label, `${label} evidence label`);
    assertV12PromotionPath(evidence?.path, `${label} evidence ref`);
    assertSha256(evidence?.sha256, `${label} evidence hash`);
  }
}

function assertV12PublicInputOrder(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  const order = record.publicInputOrder ?? [];
  if (
    record.circuitApproach !== "contract-enforced-fee-formula" ||
    order.join("|") !== V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER.join("|")
  ) {
    throw new Error(`${label} circuitApproach and publicInputOrder must be coherent for v1.2 fee governance`);
  }

  if (
    V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH ===
      V11_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH ||
    record.publicInputOrderChangeAcknowledged !== true
  ) {
    throw new Error(`${label} must explicitly acknowledge the v1.2 public-input order change`);
  }
}

function assertV12ArtifactBoundary(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  if (record.artifactBoundary !== "new-v1.2-artifacts" && record.artifactBoundary !== "byte-for-byte-v1.1-compatible") {
    throw new Error(`${label} must declare artifactBoundary as new-v1.2-artifacts or byte-for-byte-v1.1-compatible`);
  }

  if (record.artifactBoundary === "byte-for-byte-v1.1-compatible" && !hasV12CompatibilityProof(record)) {
    throw new Error(`${label} requires structured compatibility proof for v1.1 artifact reuse`);
  }
}

function assertV12AdapterBinding(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  const binding = record.adapterBinding;
  const pool = binding?.pool;
  const depositVerifier = binding?.depositVerifier;
  const privateTransferVerifier = binding?.privateTransferVerifier;
  const withdrawVerifier = binding?.withdrawVerifier ?? binding?.verifier;
  const adapter = binding?.adapter;

  if (
    binding?.chainId !== VERIFIER_PROMOTION_MAINNET_CHAIN_ID ||
    (binding.chain !== undefined && binding.chain !== binding.chainId) ||
    binding.selector !== "0x678d8506"
  ) {
    throw new Error(
      `${label} adapterBinding must bind chain, pool, deposit/privateTransfer/withdraw verifiers, adapter, and selector`
    );
  }

  if (![pool, depositVerifier, privateTransferVerifier, withdrawVerifier, adapter].every(isConcreteV12Address)) {
    throw new Error(`${label} adapterBinding must reject null, zero, or placeholder addresses`);
  }

  assertV12AdapterRouting(binding.routing, label);

  if (binding.publicInputOrderHash !== undefined && binding.publicInputOrderHash !== null) {
    throw new Error(`${label} adapterBinding must use per-circuit public-input order hashes`);
  }

  const addresses = [pool, depositVerifier, privateTransferVerifier, withdrawVerifier, adapter].map((address) =>
    address!.toLowerCase()
  );
  if (new Set(addresses).size !== addresses.length) {
    throw new Error(`${label} adapterBinding must use distinct v1.2 addresses`);
  }
}

function assertV12AdapterRouting(
  routing: Partial<Record<V12TrustedSetupCircuitName, V12TrustedSetupAdapterRouteBinding>> | undefined,
  label: string
): void {
  const expected = {
    deposit: {
      verifier: "depositVerifier",
      publicInputCount: V12_DEPOSIT_VERIFIER_PUBLIC_INPUT_ORDER.length,
      publicInputOrderHash: V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH
    },
    privateTransfer: {
      verifier: "privateTransferVerifier",
      publicInputCount: V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER.length,
      publicInputOrderHash: V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH
    },
    withdraw: {
      verifier: "withdrawVerifier",
      publicInputCount: V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER.length,
      publicInputOrderHash: V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH
    }
  } as const;

  for (const circuitName of REQUIRED_V12_TRUSTED_SETUP_CIRCUITS) {
    const route = routing?.[circuitName];
    const expectedRoute = expected[circuitName];
    if (
      route?.verifier !== expectedRoute.verifier ||
      route.publicInputCount !== expectedRoute.publicInputCount ||
      normalizeSha256(route.publicInputOrderHash) !== expectedRoute.publicInputOrderHash
    ) {
      throw new Error(`${label} adapterBinding must route deposit, privateTransfer, and withdraw verifiers by public-input shape`);
    }
  }
}

function assertV12Artifacts(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  if (record.generatedVerifierHash !== undefined && record.generatedVerifierHash !== null) {
    throw new Error(`${label} must use per-circuit generated verifier hashes`);
  }
  assertSha256(record.browserManifestHash, `${label} browser manifest hash`);

  const artifacts = record.artifacts ?? {};
  for (const artifactName of REQUIRED_V12_TRUSTED_SETUP_GLOBAL_ARTIFACTS) {
    const artifact = artifacts[artifactName];
    if (!artifact || !isSha256(artifact.sha256)) {
      throw new Error(`${label} must include hash-bound per-circuit verifier artifacts plus adapter and browser-manifest artifacts`);
    }
    assertV12PromotionPath(artifact.path, `${label} ${artifactName} artifact`);
  }

  if (normalizeSha256(record.browserManifestHash) !== normalizeSha256(artifacts.browserManifest?.sha256)) {
    throw new Error(`${label} browserManifestHash must match artifacts.browserManifest.sha256`);
  }

  assertV12CircuitArtifacts(record.circuitArtifacts, label);
}

function assertV12CircuitArtifacts(
  circuits: V12TrustedSetupProverPromotionRecord["circuitArtifacts"],
  label: string
): void {
  if (!circuits || typeof circuits !== "object") {
    throw new Error(`${label} must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts`);
  }

  for (const circuitName of REQUIRED_V12_TRUSTED_SETUP_CIRCUITS) {
    const circuit = circuits[circuitName];
    if (!circuit) {
      throw new Error(`${label} must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts`);
    }

    const expectedOrder =
      circuitName === "deposit" ? V12_DEPOSIT_VERIFIER_PUBLIC_INPUT_ORDER : V12_UNLINKABLE_VERIFIER_PUBLIC_INPUT_ORDER;
    const expectedOrderHash =
      circuitName === "deposit"
        ? V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH
        : V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH;

    if (circuit.publicInputOrder?.join("|") !== expectedOrder.join("|")) {
      throw new Error(`${label} ${circuitName} publicInputOrder must match its v1.2 circuit statement`);
    }

    if (normalizeSha256(circuit.publicInputOrderHash) !== expectedOrderHash) {
      throw new Error(`${label} ${circuitName} publicInputOrderHash must match its publicInputOrder`);
    }

    assertSha256(circuit.generatedVerifierHash, `${label} ${circuitName} generated verifier hash`);

    for (const artifactName of REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS) {
      const artifact = circuit.artifacts?.[artifactName];
      if (!artifact || !isSha256(artifact.sha256)) {
        throw new Error(`${label} must include hash-bound deposit, privateTransfer, and withdraw verifier artifacts`);
      }
      assertV12PromotionPath(artifact.path, `${label} ${circuitName} ${artifactName} artifact`);
    }

    if (normalizeSha256(circuit.generatedVerifierHash) !== normalizeSha256(circuit.artifacts?.generatedVerifier?.sha256)) {
      throw new Error(`${label} ${circuitName} generatedVerifierHash must match its generatedVerifier artifact`);
    }
  }
}

function assertV12NoUnprovenV11Reuse(record: V12TrustedSetupProverPromotionRecord, label: string): void {
  if (!hasKnownV11ArtifactHash([record.generatedVerifierHash, record.browserManifestHash, record.artifacts, record.circuitArtifacts])) {
    return;
  }

  if (!hasV12CompatibilityProof(record)) {
    throw new Error(`${label} must not reuse v1.1 artifact hashes without structured compatibility proof`);
  }
}

function assertV12ReviewGate(gate: V12TrustedSetupReviewGate | undefined, reviewLabel: string, label: string): void {
  if (!gate) {
    throw new Error(`${label} requires complete ${reviewLabel} with no high or critical findings`);
  }

  assertNonPlaceholderRef(gate.reference, `${label} ${reviewLabel} reference`);
  assertNonPlaceholderRef(gate.reviewer, `${label} ${reviewLabel} reviewer`);
  if (gate.status !== "complete" || gate.openHighOrCriticalFindings !== 0) {
    throw new Error(`${label} requires complete ${reviewLabel} with no high or critical findings`);
  }
}

function assertV12PromotionPath(value: string | undefined, label: string): asserts value is string {
  assertNonPlaceholderRef(value, label);

  if (
    !value.startsWith("evidence/mainnet-readiness/v1-2/") ||
    /(circuits\/build|UNTRUSTED|contracts\/test\/generated|sandbox|template|draft|placeholder|pending|todo|tbd|\/tmp\/|local|untrusted)/i.test(
      value
    )
  ) {
    if (/evidence ref/i.test(label)) {
      throw new Error(`${label} cannot reference draft, template, local, or quarantined artifacts`);
    }
    throw new Error(`${label} cannot reference local or quarantined artifacts`);
  }
}

function assertSha256(value: string | null | undefined, label: string): asserts value is string {
  if (!isSha256(value)) {
    throw new Error(`invalid ${label}`);
  }
}

function hasV12CompatibilityProof(record: V12TrustedSetupProverPromotionRecord): boolean {
  const proof = record.compatibilityProof;
  if (!proof || proof.status !== "complete") {
    return false;
  }
  if (!proof.reference || !proof.reference.startsWith("evidence/mainnet-readiness/v1-2/") || !isSha256(proof.sha256)) {
    return false;
  }
  if (normalizeSha256(proof.publicInputOrderHash) !== V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH) {
    return false;
  }
  if (normalizeSha256(proof.publicInputOrderHashes?.deposit) !== V12_TRUSTED_SETUP_PROVER_PROMOTION_DEPOSIT_PUBLIC_INPUT_ORDER_HASH) {
    return false;
  }
  if (
    normalizeSha256(proof.publicInputOrderHashes?.privateTransfer) !==
      V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH ||
    normalizeSha256(proof.publicInputOrderHashes?.withdraw) !== V12_TRUSTED_SETUP_PROVER_PROMOTION_PUBLIC_INPUT_ORDER_HASH
  ) {
    return false;
  }

  const globalArtifactsMatch = REQUIRED_V12_TRUSTED_SETUP_GLOBAL_ARTIFACTS.every((name) => {
    const proofHash = proof.perArtifactHashes?.[name];
    const artifactHash = record.artifacts?.[name]?.sha256;
    return isSha256(proofHash) && normalizeSha256(proofHash) === normalizeSha256(artifactHash);
  });

  const circuitArtifactsMatch = REQUIRED_V12_TRUSTED_SETUP_CIRCUITS.every((circuitName) =>
    REQUIRED_V12_TRUSTED_SETUP_CIRCUIT_ARTIFACTS.every((artifactName) => {
      const proofHash = proof.perCircuitArtifactHashes?.[circuitName]?.[artifactName];
      const artifactHash = record.circuitArtifacts?.[circuitName]?.artifacts?.[artifactName]?.sha256;
      return isSha256(proofHash) && normalizeSha256(proofHash) === normalizeSha256(artifactHash);
    })
  );

  return globalArtifactsMatch && circuitArtifactsMatch;
}

function hasKnownV11ArtifactHash(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = normalizeSha256(value);
    return normalized === V11_BROWSER_PROVER_MANIFEST_HASH || normalized === V11_TRUSTED_SETUP_RECORD_HASH;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasKnownV11ArtifactHash);
  }
  return Object.values(value).some(hasKnownV11ArtifactHash);
}

function isSupportedMegaEthChain(chainId: number): boolean {
  return chainId === VERIFIER_PROMOTION_TESTNET_CHAIN_ID || chainId === VERIFIER_PROMOTION_MAINNET_CHAIN_ID;
}

function isNonZeroAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function isConcreteV12Address(value: unknown): value is `0x${string}` {
  if (typeof value !== "string" || !isNonZeroAddress(value)) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized !== V11_NULLARK_POOL_ADDRESS.toLowerCase() && !/^0x([0-9a-f])\1{39}$/.test(normalized);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^(sha256:)?[0-9a-f]{64}$/i.test(value) && !isObviousPlaceholderSha256(value);
}

function normalizeSha256(value: unknown): string | undefined {
  if (!isSha256(value)) {
    return undefined;
  }
  return value.toLowerCase().replace(/^sha256:/, "");
}

function isObviousPlaceholderSha256(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^sha256:/, "");
  return /^([0-9a-f])\1{63}$/.test(normalized);
}
