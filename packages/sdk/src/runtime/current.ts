import currentRuntime from "../../runtime/current.json" with { type: "json" };
import legacyV11MainnetRuntime from "../../runtime/v1-1-mainnet.json" with { type: "json" };
import testnetRuntime from "../../runtime/testnet.json" with { type: "json" };
import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";

export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export const NULLARK_V1_2_MAX_WITHDRAWAL_FEE_BPS = 100;
export type SupportedMegaEthChainId = typeof MEGAETH_MAINNET_CHAIN_ID | typeof MEGAETH_TESTNET_CHAIN_ID;

export const NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1 = [
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

export const NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2 = [
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

export const NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER = NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1;

export type NullarkWithdrawPublicInputName =
  | (typeof NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1)[number]
  | (typeof NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2)[number];

export type ArtifactResolution =
  | { mode: "package-embedded"; packageArtifactVersion: string }
  | { mode: "https-base-url"; baseUrl: string }
  | { mode: "local-artifact-dir"; artifactDir: string };

export type NullarkCurrentRuntime = {
  schema: "nullark-sdk-runtime-current-v1" | "nullark-sdk-runtime-v1-2-candidate-v1";
  productVersion: string;
  environment: "megaeth-mainnet" | "megaeth-testnet-nullark";
  chainId: SupportedMegaEthChainId;
  rpcUrl: "https://mainnet.megaeth.com/rpc" | "https://carrot.megaeth.com/rpc";
  poolContractName: "NullarkPool";
  pool: HexString;
  poolDeploymentBlock: HexString;
  merkleTreeDepth: number;
  withdrawalFeeBps: number;
  maxWithdrawalFeeBps?: number;
  feeController?: HexString;
  feePolicy?: NullarkRuntimeFeePolicy;
  v1_2Readiness?: {
    approvedForMainnet: boolean;
    ownerApprovedPromotion: boolean;
    promotionEvidence?: readonly {
      path: string;
      sha256: string;
      status: "approved-for-mainnet";
    }[];
  };
  relayerEndpoint: string;
  relayerEndpointLabel: "Machine/API endpoint" | "Testnet relayer endpoint";
  privateTransferVerifier: HexString;
  withdrawVerifier: HexString;
  depositVerifier?: HexString;
  verifierAdapter: HexString;
  poseidon2?: HexString;
  withdrawVerifierBytecodeHash: HexString;
  withdrawSelector: HexString;
  artifactTrustMode?: "mainnet-trusted-setup" | "testnet-local-dev-untrusted";
  proverManifest: { path: string; sha256: string };
  trustedSetupRecord: { path: string; sha256: string };
  artifacts: {
    depositWasm?: { path: string; sha256: string };
    depositFinalZkey?: { path: string; sha256: string };
    privateTransferWasm?: { path: string; sha256: string };
    privateTransferFinalZkey?: { path: string; sha256: string };
    withdrawWasm: { path: string; sha256: string };
    withdrawFinalZkey: { path: string; sha256: string };
  };
  artifactResolution: ArtifactResolution;
  groth16PublicInputOrder: readonly NullarkWithdrawPublicInputName[];
};

export type RuntimeWithdrawalFeeSource = "runtime-static-v1.1" | "on-chain-feeBps";

export type NullarkRuntimeFeePolicy = {
  activeFeeBps: number;
  maxFeeBps: number;
  pendingFeeState?: {
    pendingFeeBps: number | null;
    pendingFeeActivationTime: string | null;
    source: "on-chain" | "on-chain-feeBps";
  };
};

export type RuntimeWithdrawalFeeState = {
  activeFeeBps: number;
  maxFeeBps: number;
  pendingFeeBps?: number | undefined;
  pendingFeeActivationTime?: string | undefined;
  pendingFeeActive: false;
  source: RuntimeWithdrawalFeeSource;
};

type RuntimeFeeReadFunctionName = "feeBps" | "MAX_FEE_BPS" | "pendingFeeBps" | "pendingFeeActivationTime";

export type RuntimeFeeReadContractClient = {
  readContract(input: {
    address: HexString;
    abi: typeof NULLARK_POOL_FEE_STATE_ABI;
    functionName: RuntimeFeeReadFunctionName;
  }): Promise<unknown>;
};

export type NullarkRuntimeState = {
  schema: "nullark-sdk-runtime-state-v1";
  currentRuntime: "v1_1" | "v1_2";
  defaultDepositRuntime: "v1_1" | "v1_2";
  mainnet4326Blocked: boolean;
  v1_1: NullarkCurrentRuntime;
  v1_2: NullarkCurrentRuntime;
  v1_2Status: NullarkV12RuntimeStatus;
};

export type NullarkV12RuntimeStatus = {
  status: "draft-blocked" | "ready";
  advertised: boolean;
  ready: boolean;
  finalReadinessEvidencePinned: boolean;
  reason: string;
};

type PackagePinnedV12PromotionEvidence = {
  path: string;
  sha256: string;
  kind: "ready-validator-output" | "public-runtime-state";
};

type V12PromotionEvidenceEntry = {
  path: string;
  sha256: string;
  status: "approved-for-mainnet";
};

const PACKAGE_PINNED_V12_PROMOTION_EVIDENCE: readonly PackagePinnedV12PromotionEvidence[] = [
  {
    path: "apps/web/public/proving/trusted-setup-record.json",
    sha256: "b87aa47a407f0347a920fcebe76f84d402be8bd5e82f5fe5980ffea557bfa996",
    kind: "ready-validator-output"
  },
  {
    path: "public-artifacts/current.json",
    sha256: "66def458e16ea6ed9d1df9c15a79ec83c23d4d4ccdec631d868f614cc0e94ff4",
    kind: "public-runtime-state"
  }
];

export function getCurrentRuntime(): NullarkCurrentRuntime {
  return assertCurrentRuntime(currentRuntime);
}

export type NullarkNetwork = "megaeth-mainnet" | "megaeth-testnet";

export function getRuntimeForNetwork(network: NullarkNetwork = "megaeth-mainnet"): NullarkCurrentRuntime {
  if (network === "megaeth-mainnet") {
    return getCurrentRuntime();
  }
  return assertRuntime(testnetRuntime);
}

export function getLegacyV11MainnetRuntime(): NullarkCurrentRuntime {
  return assertCurrentRuntime(legacyV11MainnetRuntime);
}

export function getRuntimeForRecoveryKitV1(input: {
  chainId: number;
  poolAddress: HexString;
  runtimeId: string;
}): NullarkCurrentRuntime {
  const candidates = [getCurrentRuntime(), getLegacyV11MainnetRuntime(), getRuntimeForNetwork("megaeth-testnet")];
  const matches = candidates.filter(
    (runtime) =>
      runtime.chainId === input.chainId &&
      runtime.pool.toLowerCase() === input.poolAddress.toLowerCase() &&
      runtime.productVersion === input.runtimeId
  );
  if (matches.length !== 1) {
    throw new Error("No Nullark SDK runtime matches recovery kit chain, pool, and runtime ID.");
  }
  return matches[0] as NullarkCurrentRuntime;
}

export function assertCurrentRuntime(value: unknown): NullarkCurrentRuntime {
  const input = value as Partial<NullarkCurrentRuntime>;
  if (input.schema !== "nullark-sdk-runtime-v1-2-candidate-v1" && input.v1_2Readiness !== undefined) {
    throw new Error("Nullark SDK current runtime must not carry v1.2 promotion approval metadata.");
  }
  if (
    (input.schema !== "nullark-sdk-runtime-current-v1" || input.productVersion !== "nullark-v1.1-mainnet") &&
    (input.schema !== "nullark-sdk-runtime-v1-2-candidate-v1" ||
      input.productVersion !== "nullark-v1.2-fee-governance" ||
      !hasVerifiedV12PromotionEvidence(input as NullarkCurrentRuntime))
  ) {
    throw new Error("Nullark SDK current runtime must be the approved v1.1 mainnet runtime or package-pinned v1.2 mainnet runtime.");
  }
  const runtime = assertRuntime(value);
  if (runtime.environment !== "megaeth-mainnet" || runtime.chainId !== MEGAETH_MAINNET_CHAIN_ID) {
    throw new Error("Nullark SDK current runtime must target MegaETH mainnet 4326.");
  }
  if (runtime.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
    throw new Error("Nullark SDK current runtime must use the approved MegaETH mainnet RPC.");
  }
  if (runtime.schema === "nullark-sdk-runtime-v1-2-candidate-v1") {
    assertV12CandidateAddress(runtime.depositVerifier, "deposit verifier");
    assertV12CandidateAddress(runtime.poseidon2, "Poseidon2");
  }
  return runtime;
}

export function assertRuntime(value: unknown): NullarkCurrentRuntime {
  const runtime = value as Partial<NullarkCurrentRuntime>;
  if (runtime.schema !== "nullark-sdk-runtime-current-v1" && runtime.schema !== "nullark-sdk-runtime-v1-2-candidate-v1") {
    throw new Error("Unsupported Nullark SDK runtime schema.");
  }
  assertV12ReadinessEvidenceIsPackagePinned(runtime);
  if (runtime.environment === "megaeth-mainnet") {
    if (runtime.chainId !== MEGAETH_MAINNET_CHAIN_ID || runtime.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
      throw new Error("Nullark SDK mainnet runtime must target MegaETH mainnet 4326.");
    }
  } else if (runtime.environment === "megaeth-testnet-nullark") {
    if (runtime.chainId !== MEGAETH_TESTNET_CHAIN_ID || runtime.rpcUrl !== "https://carrot.megaeth.com/rpc") {
      throw new Error("Nullark SDK testnet runtime must target MegaETH testnet 6343.");
    }
  } else {
    throw new Error("Nullark SDK runtime must target an approved MegaETH network.");
  }
  for (const [label, address] of [
    ["pool", runtime.pool],
    ["withdrawVerifier", runtime.withdrawVerifier],
    ["verifierAdapter", runtime.verifierAdapter]
  ] as const) {
    if (typeof address !== "string" || !isEvmAddress(address)) {
      throw new Error(`Nullark SDK current runtime ${label} must be an EVM address.`);
    }
  }
  if (
    typeof runtime.privateTransferVerifier !== "string" ||
    (!isEvmAddress(runtime.privateTransferVerifier) && runtime.privateTransferVerifier !== "0x0000000000000000000000000000000000000000")
  ) {
    throw new Error("Nullark SDK current runtime privateTransferVerifier must be an EVM address.");
  }
  if (runtime.withdrawVerifierBytecodeHash === undefined || !isHexBytes32(runtime.withdrawVerifierBytecodeHash)) {
    throw new Error("Nullark SDK current runtime withdraw verifier bytecode hash must be bytes32.");
  }
  if (runtime.withdrawSelector !== "0x678d8506") {
    throw new Error("Nullark SDK current runtime must use the proof-bound withdrawal selector.");
  }
  if (
    typeof runtime.merkleTreeDepth !== "number" ||
    !Number.isSafeInteger(runtime.merkleTreeDepth) ||
    runtime.merkleTreeDepth <= 0
  ) {
    throw new Error("Nullark SDK current runtime Merkle depth must be a positive safe integer.");
  }
  if (!runtimePublicInputOrderMatches(runtime)) {
    throw new Error("Nullark SDK current runtime must define the approved Groth16 public input order.");
  }
  assertSafeSha256(runtime.proverManifest?.sha256, "prover manifest");
  assertSafeSha256(runtime.trustedSetupRecord?.sha256, "trusted setup record");
  const requiresFullV12ProvingArtifactHashes =
    runtime.schema === "nullark-sdk-runtime-v1-2-candidate-v1" &&
    (runtime.artifactTrustMode === "mainnet-trusted-setup" ||
      runtime.v1_2Readiness?.approvedForMainnet === true ||
      runtime.v1_2Readiness?.ownerApprovedPromotion === true);
  if (requiresFullV12ProvingArtifactHashes && runtime.depositVerifier !== undefined) {
    assertSafeSha256(runtime.artifacts?.depositWasm?.sha256, "deposit wasm");
    assertSafeSha256(runtime.artifacts?.depositFinalZkey?.sha256, "deposit final zkey");
  }
  if (
    requiresFullV12ProvingArtifactHashes &&
    runtime.privateTransferVerifier !== "0x0000000000000000000000000000000000000000"
  ) {
    assertSafeSha256(runtime.artifacts?.privateTransferWasm?.sha256, "private transfer wasm");
    assertSafeSha256(runtime.artifacts?.privateTransferFinalZkey?.sha256, "private transfer final zkey");
  }
  assertSafeSha256(runtime.artifacts?.withdrawWasm?.sha256, "withdraw wasm");
  assertSafeSha256(runtime.artifacts?.withdrawFinalZkey?.sha256, "withdraw final zkey");
  const runtimeWithoutReadinessEvidence = { ...runtime, v1_2Readiness: undefined };
  if (String(JSON.stringify(runtimeWithoutReadinessEvidence)).includes("docs/evidence/")) {
    throw new Error("Nullark SDK current runtime must not expose private operation paths.");
  }
  const asserted = runtime as NullarkCurrentRuntime;
  const feeState = resolveRuntimeWithdrawalFeeState(asserted);
  asserted.withdrawalFeeBps = feeState.activeFeeBps;
  return asserted;
}

function runtimePublicInputOrderMatches(runtime: Partial<NullarkCurrentRuntime>): boolean {
  if (!Array.isArray(runtime.groth16PublicInputOrder)) {
    return false;
  }
  const expected =
    runtime.schema === "nullark-sdk-runtime-v1-2-candidate-v1"
      ? NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2
      : NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_1;
  return (
    runtime.groth16PublicInputOrder.length === expected.length &&
    runtime.groth16PublicInputOrder.every((name, index) => name === expected[index])
  );
}

export function assertRuntimeState(value: unknown): NullarkRuntimeState {
  const state = value as Partial<NullarkRuntimeState>;
  if (state.schema !== "nullark-sdk-runtime-state-v1") {
    throw new Error("Unsupported Nullark SDK runtime state schema.");
  }
  if (state.currentRuntime !== "v1_1" && state.currentRuntime !== "v1_2") {
    throw new Error("Nullark SDK runtime state must choose v1_1 or v1_2 as current runtime.");
  }
  if (state.defaultDepositRuntime !== "v1_1" && state.defaultDepositRuntime !== "v1_2") {
    throw new Error("Nullark SDK runtime state must choose v1_1 or v1_2 as default deposit runtime.");
  }
  const v1_1 = assertRuntime(state.v1_1);
  const v1_2 = assertRuntime(state.v1_2);
  if (v1_1.productVersion !== "nullark-v1.1-mainnet") {
    throw new Error("Nullark SDK runtime state must preserve the current v1.1 runtime.");
  }
  if (v1_2.schema !== "nullark-sdk-runtime-v1-2-candidate-v1") {
    throw new Error("Nullark SDK runtime state v1.2 must be an explicit candidate runtime.");
  }
  if (v1_2.pool.toLowerCase() === v1_1.pool.toLowerCase()) {
    throw new Error("Nullark SDK v1.2 candidate runtime must be distinct from v1.1.");
  }
  assertV12CandidatePublication(state, v1_1, v1_2);
  const hasVerifiedPromotion = hasVerifiedV12PromotionEvidence(v1_2);
  return {
    schema: "nullark-sdk-runtime-state-v1",
    currentRuntime: state.currentRuntime === "v1_2" && hasVerifiedPromotion ? "v1_2" : "v1_1",
    defaultDepositRuntime: state.defaultDepositRuntime === "v1_2" && hasVerifiedPromotion ? "v1_2" : "v1_1",
    mainnet4326Blocked: state.mainnet4326Blocked !== false,
    v1_1,
    v1_2,
    v1_2Status: v12RuntimeStatus(hasVerifiedPromotion)
  };
}

function v12RuntimeStatus(hasVerifiedPromotion: boolean): NullarkV12RuntimeStatus {
  if (hasVerifiedPromotion) {
    return {
      status: "ready",
      advertised: true,
      ready: true,
      finalReadinessEvidencePinned: true,
      reason: "v1.2 has package-pinned final readiness and owner promotion evidence."
    };
  }
  return {
    status: "draft-blocked",
    advertised: false,
    ready: false,
    finalReadinessEvidencePinned: false,
    reason: "v1.2 remains blocked until package-pinned final readiness and owner promotion evidence is present."
  };
}

function assertV12CandidatePublication(
  state: Partial<NullarkRuntimeState>,
  v1_1: NullarkCurrentRuntime,
  v1_2: NullarkCurrentRuntime
): void {
  const hasApprovedPromotion = hasVerifiedV12PromotionEvidence(v1_2);
  if (v1_2.productVersion !== "nullark-v1.2-fee-governance") {
    throw new Error("Nullark SDK v1.2 candidate runtime must be labeled nullark-v1.2-fee-governance.");
  }
  if (v1_2.environment !== "megaeth-mainnet" || v1_2.chainId !== MEGAETH_MAINNET_CHAIN_ID || v1_2.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
    throw new Error("Nullark SDK v1.2 candidate runtime publication must target MegaETH mainnet 4326.");
  }
  if (state.mainnet4326Blocked !== true && !hasApprovedPromotion) {
    throw new Error("Nullark SDK v1.2 candidate runtime publication must remain mainnet-blocked until approved promotion evidence exists.");
  }
  assertV12CandidateAddress(v1_2.pool, "pool");
  assertV12CandidateAddress(v1_2.depositVerifier, "deposit verifier");
  assertV12CandidateAddress(v1_2.withdrawVerifier, "withdraw verifier");
  assertV12CandidateAddress(v1_2.verifierAdapter, "verifier adapter");
  assertV12CandidateAddress(v1_2.poseidon2, "Poseidon2");
  assertV12CandidateAddress(v1_2.feeController, "feeController");
  if (
    v1_2.feeController.toLowerCase() === v1_1.pool.toLowerCase() ||
    v1_2.feeController.toLowerCase() === v1_1.withdrawVerifier.toLowerCase() ||
    v1_2.feeController.toLowerCase() === v1_1.verifierAdapter.toLowerCase()
  ) {
    throw new Error("Nullark SDK v1.2 candidate feeController cannot reuse a v1.1 runtime contract address.");
  }
  if (!v1_2.feePolicy?.pendingFeeState) {
    throw new Error("Nullark SDK v1.2 candidate runtime must publish explicit pending fee state.");
  }
  if (v1_2.feePolicy.pendingFeeState.source !== "on-chain-feeBps") {
    throw new Error("Nullark SDK v1.2 candidate pending fee state must be sourced from on-chain feeBps.");
  }
  const feeState = resolveRuntimeWithdrawalFeeState(v1_2);
  if (
    (feeState.pendingFeeBps === undefined) !== (feeState.pendingFeeActivationTime === undefined) ||
    (feeState.pendingFeeBps !== undefined && feeState.pendingFeeBps <= feeState.activeFeeBps)
  ) {
    throw new Error("Nullark SDK v1.2 candidate pending fee state must be null or a scheduled fee increase with activation time.");
  }
  if (!hasApprovedPromotion && reusesV11ArtifactHashes(v1_1, v1_2)) {
    throw new Error("Nullark SDK v1.2 candidate runtime cannot reuse v1.1 artifact hashes without approved promotion evidence.");
  }
}

function assertV12CandidateAddress(value: unknown, label: string): asserts value is HexString {
  if (typeof value !== "string" || !isEvmAddress(value) || isObviousPlaceholderAddress(value)) {
    throw new Error(`Nullark SDK v1.2 candidate runtime requires a non-placeholder ${label} address.`);
  }
}

function isObviousPlaceholderAddress(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "0x0000000000000000000000000000000000000000" ||
    normalized === "0xdead000000000000000000000000000000000000" ||
    /^0x([0-9a-f])\1{39}$/.test(normalized)
  );
}

function reusesV11ArtifactHashes(v1_1: NullarkCurrentRuntime, v1_2: NullarkCurrentRuntime): boolean {
  return (
    v1_2.proverManifest.sha256 === v1_1.proverManifest.sha256 ||
    v1_2.trustedSetupRecord.sha256 === v1_1.trustedSetupRecord.sha256 ||
    v1_2.artifacts.withdrawWasm.sha256 === v1_1.artifacts.withdrawWasm.sha256 ||
    v1_2.artifacts.withdrawFinalZkey.sha256 === v1_1.artifacts.withdrawFinalZkey.sha256
  );
}

function hasVerifiedV12PromotionEvidence(runtime: NullarkCurrentRuntime): boolean {
  const readiness = runtime.v1_2Readiness;
  const promotionEvidence = readiness?.promotionEvidence;
  if (
    readiness?.approvedForMainnet !== true ||
    readiness.ownerApprovedPromotion !== true ||
    !Array.isArray(promotionEvidence)
  ) {
    return false;
  }

  return (
    PACKAGE_PINNED_V12_PROMOTION_EVIDENCE.every((pinned) =>
      promotionEvidence.some((evidence) => isPackagePinnedV12PromotionEvidence(evidence, pinned))
    )
  );
}

function assertV12ReadinessEvidenceIsPackagePinned(runtime: Partial<NullarkCurrentRuntime>): void {
  if (runtime.schema !== "nullark-sdk-runtime-v1-2-candidate-v1" || runtime.v1_2Readiness === undefined) {
    return;
  }
  const readiness = runtime.v1_2Readiness;
  const claimsMainnetReady = readiness.approvedForMainnet === true || readiness.ownerApprovedPromotion === true;
  if (claimsMainnetReady && !hasVerifiedV12PromotionEvidence(runtime as NullarkCurrentRuntime)) {
    throw new Error("Nullark SDK v1.2 readiness approval requires package-pinned final readiness evidence.");
  }
}

function isPackagePinnedV12PromotionEvidence(evidence: unknown, pinned: PackagePinnedV12PromotionEvidence): boolean {
  const candidate = evidence as Partial<V12PromotionEvidenceEntry>;
  if (candidate.status !== "approved-for-mainnet" || typeof candidate.path !== "string") {
    return false;
  }
  const sha256 = normalizePromotionEvidenceSha256(candidate.sha256);
  if (sha256 === undefined) {
    return false;
  }
  return candidate.path === pinned.path && sha256 === pinned.sha256;
}

export function resolveRuntimeWithdrawalFeeState(runtime: NullarkCurrentRuntime): RuntimeWithdrawalFeeState {
  if (!runtime.feePolicy) {
    const activeFeeBps = normalizeFeeBps(runtime.withdrawalFeeBps, "withdrawal fee bps");
    return {
      activeFeeBps,
      maxFeeBps: activeFeeBps,
      pendingFeeActive: false,
      source: "runtime-static-v1.1"
    };
  }
  const activeFeeBps = normalizeFeeBps(runtime.feePolicy.activeFeeBps, "active withdrawal fee bps");
  const maxFeeBps = normalizeFeeBps(runtime.feePolicy.maxFeeBps, "max withdrawal fee bps");
  if (maxFeeBps !== NULLARK_V1_2_MAX_WITHDRAWAL_FEE_BPS) {
    throw new Error("Nullark SDK runtime max withdrawal fee bps must equal the v1.2 immutable max fee bps.");
  }
  if (activeFeeBps > maxFeeBps) {
    throw new Error("active withdrawal fee bps cannot exceed max fee bps");
  }
  if (runtime.maxWithdrawalFeeBps !== undefined && normalizeFeeBps(runtime.maxWithdrawalFeeBps, "max withdrawal fee bps") !== maxFeeBps) {
    throw new Error("runtime fee policy max fee must match maxWithdrawalFeeBps.");
  }
  const pendingFeeState = runtime.feePolicy.pendingFeeState;
  const pendingFeeBps =
    pendingFeeState?.pendingFeeBps === undefined || pendingFeeState.pendingFeeBps === null
      ? undefined
      : normalizeFeeBps(pendingFeeState.pendingFeeBps, "pending withdrawal fee bps");
  if (pendingFeeBps !== undefined && pendingFeeBps > maxFeeBps) {
    throw new Error("pending withdrawal fee bps cannot exceed max fee bps");
  }
  const pendingFeeActivationTime =
    pendingFeeState?.pendingFeeActivationTime === undefined || pendingFeeState.pendingFeeActivationTime === null
      ? undefined
      : pendingFeeState.pendingFeeActivationTime;
  if (pendingFeeActivationTime !== undefined && Number.isNaN(Date.parse(pendingFeeActivationTime))) {
    throw new Error("pending withdrawal fee activation time must be an ISO timestamp.");
  }
  return {
    activeFeeBps,
    maxFeeBps,
    ...(pendingFeeBps === undefined ? {} : { pendingFeeBps }),
    ...(pendingFeeActivationTime === undefined ? {} : { pendingFeeActivationTime }),
    pendingFeeActive: false,
    source: "on-chain-feeBps"
  };
}

const NULLARK_POOL_FEE_STATE_ABI = [
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }]
  },
  {
    type: "function",
    name: "MAX_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }]
  },
  {
    type: "function",
    name: "pendingFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }]
  },
  {
    type: "function",
    name: "pendingFeeActivationTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }]
  }
] as const;

export async function readRuntimeWithdrawalFeeStateFromPool(
  runtime: NullarkCurrentRuntime,
  client: RuntimeFeeReadContractClient
): Promise<RuntimeWithdrawalFeeState> {
  if (!runtime.feePolicy) {
    return resolveRuntimeWithdrawalFeeState(runtime);
  }

  const [activeFeeBps, maxFeeBps, pendingFeeBps, pendingFeeActivationTime] = await Promise.all([
    readPoolFeeStateValue(runtime, client, "feeBps"),
    readPoolFeeStateValue(runtime, client, "MAX_FEE_BPS"),
    readPoolFeeStateValue(runtime, client, "pendingFeeBps"),
    readPoolFeeStateValue(runtime, client, "pendingFeeActivationTime")
  ]);
  const active = normalizeChainFeeBps(activeFeeBps, "active withdrawal fee bps");
  const max = normalizeChainFeeBps(maxFeeBps, "max withdrawal fee bps");
  if (max !== NULLARK_V1_2_MAX_WITHDRAWAL_FEE_BPS) {
    throw new Error("Nullark SDK on-chain max withdrawal fee bps must equal the v1.2 immutable max fee bps.");
  }
  if (active > max) {
    throw new Error("on-chain active withdrawal fee bps cannot exceed max fee bps.");
  }

  const pending = normalizeChainFeeBps(pendingFeeBps, "pending withdrawal fee bps");
  if (pending > max) {
    throw new Error("on-chain pending withdrawal fee bps cannot exceed max fee bps.");
  }
  const activationEpochSeconds = normalizeChainUint(pendingFeeActivationTime, "pending withdrawal fee activation time");
  if ((pending === 0) !== (activationEpochSeconds === 0n)) {
    throw new Error("on-chain pending withdrawal fee state must pair fee bps with activation time.");
  }

  return {
    activeFeeBps: active,
    maxFeeBps: max,
    ...(pending === 0 ? {} : { pendingFeeBps: pending }),
    ...(activationEpochSeconds === 0n ? {} : { pendingFeeActivationTime: new Date(Number(activationEpochSeconds) * 1000).toISOString() }),
    pendingFeeActive: false,
    source: "on-chain-feeBps"
  };
}

function readPoolFeeStateValue(
  runtime: NullarkCurrentRuntime,
  client: RuntimeFeeReadContractClient,
  functionName: RuntimeFeeReadFunctionName
): Promise<unknown> {
  return client.readContract({
    address: runtime.pool,
    abi: NULLARK_POOL_FEE_STATE_ABI,
    functionName
  });
}

function normalizeChainFeeBps(value: unknown, label: string): number {
  const parsed = normalizeChainUint(value, label);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Nullark SDK on-chain ${label} must be a safe integer.`);
  }
  return normalizeFeeBps(Number(parsed), label);
}

function normalizeChainUint(value: unknown, label: string): bigint {
  if (typeof value === "bigint" && value >= 0n) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new Error(`Nullark SDK on-chain ${label} must be a nonnegative integer.`);
}

function normalizeFeeBps(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Nullark SDK runtime ${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function assertSafeSha256(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Nullark SDK current runtime ${label} sha256 must be lowercase hex.`);
  }
}

function normalizePromotionEvidenceSha256(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}
