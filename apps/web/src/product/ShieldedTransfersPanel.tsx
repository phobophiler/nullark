import { useEffect, useRef, useState, type ReactNode } from "react";
import { encodeFunctionData } from "viem";
import { BPS_DENOMINATOR, WITHDRAWAL_FEE_BPS } from "@nullark/core";
import {
  CURRENT_ROOT_CALLDATA,
  ROOT_ACCEPTED_TOPIC,
  SANDBOX_BROWSER_PROOF_GENERATED_STATUS,
  SANDBOX_COMMITMENT_DERIVATION_STATUS,
  SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS,
  SANDBOX_MERKLE_PATH_STATUS,
  SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SANDBOX_NOTE_WITH_PROOF_STATUS,
  SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
  SANDBOX_PROOF_GENERATION_STATUS,
  TEST_DEPOSIT_VALUE_WEI,
  ZERO_BYTES32,
  assertPrivateTransferPublicInputBinding,
  assertWithdrawPublicInputBinding,
  boolFromEthCallResult,
  bytes32ToDecimal,
  bytes32ToEvmAddress,
  createSandboxSpendMaterial,
  createSandboxSpendMaterialNoteRecord,
  deriveSandboxNoteVaultAvailableBalanceWei,
  encodeCommitmentLookupCalldata,
  encodeDepositWithEncryptedNoteCalldata,
  encodeNullifierLookupCalldata,
  encodePrivateTransferWithEncryptedNoteCalldata,
  encodeWithdrawBoundedCalldata,
  encodeWithdrawCalldata,
  encodeStageCWithdrawChangeNoteCalldata,
  fixedDepositDenominationLabels,
  formatWeiBalance,
  formatWeiToEthDecimal,
  isBn254FieldElement,
  isEvmAddress,
  isHexBytes32,
  isHexString,
  isSupportedFixedDenominationWei,
  loadSandboxNoteVault,
  markSandboxNoteVaultRecordSpent,
  parseEthDecimalToWei,
  parseSingleFixedDepositEthDecimalToWei,
  parsePositiveWeiToHex,
  parseSandboxSpendMaterialNoteRecord,
  reconstructMerklePathFromRootAcceptedLogs,
  saveSandboxNoteVault,
  selectLargestAvailableSandboxNote,
  selectSandboxNoteForWithdrawal,
  serializeSandboxSpendMaterialNoteRecord,
  spendablePublicExitChoicesForNote,
  upsertSandboxNoteVaultRecord,
  type HexString,
  type PrivateReceiveCode,
  type RootAcceptedLogRecord,
  type SandboxNoteVaultEntry,
  type SandboxSpendMaterial,
  type SandboxSpendMaterialNoteRecord
} from "./shieldedTransfersHelpers.js";
import {
  NULLARK_RECOVERY_APP_ID,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  serializeEncryptedNoteEnvelopeToHex,
  type EncryptedNoteV1Action,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import { requestWalletRecoverySignature } from "../recovery/walletUnlock.js";
import { createBrowserPoseidonFieldHash, deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";
import { createEphemeralSecretBag } from "../recovery/ephemeralSecrets.js";
import { validateWithdrawProofIntent } from "../proving/browserWithdrawProver.js";
import { createDefaultWithdrawProofWorkerClient } from "../proving/withdrawProofWorkerClient.js";
import { buildBrowserWithdrawWitness, type RecoveryMerklePathPayload } from "../proving/withdrawWitness.js";
import { loadProductProverTrustStatus } from "../proving/proverArtifactTrust.js";
import { getShieldedTransfersRecoveryEpochId, recoverWalletNotesFromChain } from "./onChainNoteRecovery.js";
import {
  MAINNET_VALUE_MOVING_BLOCKED_MESSAGE,
  NULLARK_TESTNET_POOL_ADDRESS,
  NULLARK_TESTNET_RELAYER_ENDPOINT,
  assertMainnetValueMovingAllowed,
  getProductRuntimeConfig,
  isMainnetValueMovingBlocked,
  type ProductRuntimeConfig
} from "./productRuntimeConfig.js";
import "./ShieldedTransfersPanel.css";

type RpcMethod =
  | "eth_requestAccounts"
  | "eth_signTypedData_v4"
  | "wallet_requestPermissions"
  | "wallet_switchEthereumChain"
  | "wallet_addEthereumChain"
  | "eth_chainId"
  | "eth_call"
  | "eth_getBalance"
  | "eth_sendTransaction"
  | "eth_getTransactionReceipt";

type Eip1193Provider = {
  request<T = unknown>(args: { method: RpcMethod; params?: unknown[] }): Promise<T>;
};

type InjectedWalletProvider = Eip1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
};

type InjectedEthereum = InjectedWalletProvider & {
  providers?: InjectedWalletProvider[];
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: InjectedWalletProvider;
};

type Eip6963AnnounceProviderEvent = Event & {
  detail?: Eip6963ProviderDetail;
};

type WalletProviderOption = {
  id: string;
  label: string;
  provider: InjectedWalletProvider;
};

type WalletError = Error & { code?: number };

type TransactionReceipt = {
  status?: HexString;
  transactionHash?: HexString;
  from?: HexString;
  to?: HexString;
  logs?: Array<{
    address?: string;
    topics?: string[];
  }>;
};

type BrowserWithdrawalProofBundle = {
  proof: HexString;
  publicInputs: HexString[];
  nullifier: HexString;
  destination: HexString;
  grossAmountWei: string;
  feeWei: string;
  netAmountWei: string;
  changeAmountWei: string;
  changeNote: SpendMaterialPlaintext | null;
  encryptedChangeNote: HexString;
};

type BrowserPrivateTransferProofBundle = {
  proof: HexString;
  publicInputs: HexString[];
  nullifier: HexString;
  newCommitment: HexString;
  encryptedNote: HexString;
  noteAmountWei: string;
};

type LocalRelayResponse = {
  ok: true;
  scope: "local-untrusted-dev-only" | "deployed-withdrawal-relayer";
  txHash: HexString;
  relayer: HexString;
  receipt?: TransactionReceipt;
};

type LiveProgressStepState = "done" | "active" | "pending";

type LiveProgressStep = {
  title: string;
  detail: string;
  state: LiveProgressStepState;
};

type LiveProgressModel = {
  title: string;
  detail: string;
  summary: string;
  steps: LiveProgressStep[];
};

type LiveProgressToastRow = {
  step: LiveProgressStep | null;
};

type WithdrawalSuccessToast = {
  title: string;
  detail: string;
  txHash: HexString;
};

type MobileConsoleTab = "deposit" | "pool" | "withdraw";

type PoolStats = {
  currentRoot: HexString;
  nextLeafIndex: string;
  capacity: string;
  withdrawalFeeBps: string;
  totalDepositedWei: string;
  totalWithdrawnWei: string;
  balanceWei: string;
};

type LocalWithdrawalProofServiceChangeNote = Pick<
  SpendMaterialPlaintext,
  "assetId" | "noteAmountWei" | "ownerCommitment" | "noteSecret" | "blinding" | "commitment"
>;

type LocalWithdrawalProofServiceResponse = Omit<BrowserWithdrawalProofBundle, "changeNote"> & {
  ok: true;
  scope: "local-untrusted-dev-only";
  changeNote: LocalWithdrawalProofServiceChangeNote | null;
};
type WithdrawProofWorkerResult = Awaited<ReturnType<ReturnType<typeof createDefaultWithdrawProofWorkerClient>["generate"]>>;

const PRIVATE_BALANCE_UNLOCK_WARNING =
  "This signature can unlock spendable private notes for this wallet. Only approve on the official app domain.";
const PRIVATE_BALANCE_UNLOCKED_STATUS = "private balance unlocked for this session";
const WALLET_RECOVERY_SCOPE_ISSUED_AT = "2026-05-02T00:00:00.000Z";
const LOCAL_WITHDRAW_PROOF_SERVICE_URL = "http://127.0.0.1:63430/generate-withdrawal-proof";
const LOCAL_PRIVATE_TRANSFER_PROOF_SERVICE_URL = "http://127.0.0.1:63430/generate-private-transfer-proof";
const LOCAL_RELAYER_SERVICE_URL = "http://127.0.0.1:63430/transaction";
const DEPLOYED_RELAYER_SERVICE_URL = NULLARK_TESTNET_RELAYER_ENDPOINT;
const WITHDRAWAL_PREFLIGHT_ATTEMPTS = 24;
const WITHDRAWAL_PREFLIGHT_RETRY_DELAY_MS = 750;
const ACCEPTED_MERKLE_PATH_ATTEMPTS = 24;
const ACCEPTED_MERKLE_PATH_RETRY_DELAY_MS = 750;
const WITHDRAWAL_PROOF_VERIFIER_ATTEMPTS = 3;
const WITHDRAWAL_PROOF_VERIFIER_RETRY_DELAY_MS = 250;
const POOL_VERIFIER_SELECTOR = "0x2b7ac3f3" as const;
const ROUTING_VERIFIER_ABI = [
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;
const POOL_STATS_ABI = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "nextLeafIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "MERKLE_TREE_CAPACITY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "WITHDRAWAL_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "totalDepositedAccounting",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "totalWithdrawnAccounting",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

function getInjectedEthereum(): InjectedEthereum | undefined {
  return (window as Window & { ethereum?: InjectedEthereum }).ethereum;
}

function getInjectedWalletOptions(eip6963Providers: Eip6963ProviderDetail[] = []): WalletProviderOption[] {
  const options = new Map<string, WalletProviderOption>();
  for (const detail of eip6963Providers) {
    const rdns = detail.info.rdns?.toLowerCase() ?? "";
    const label = detail.info.name || getInjectedWalletLabel(detail.provider);
    const normalizedLabel = normalizeWalletProviderIdPart(label);
    const id = `eip6963-${detail.info.uuid || rdns || normalizedLabel}`;
    options.set(id, {
      id,
      label,
      provider: detail.provider
    });
  }

  const ethereum = getInjectedEthereum();
  if (ethereum) {
    const providers = Array.isArray(ethereum.providers) && ethereum.providers.length > 0 ? ethereum.providers : [ethereum];
    providers.forEach((provider, index) => {
      const label = getInjectedWalletLabel(provider);
      const id = `injected-${normalizeWalletProviderIdPart(label)}-${index}`;
      if (![...options.values()].some((option) => option.provider === provider)) {
        options.set(id, {
          id,
          label,
          provider
        });
      }
    });
  }

  return [...options.values()];
}

function normalizeWalletProviderIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wallet";
}

function getInjectedWalletLabel(provider: InjectedWalletProvider): string {
  if (provider.isRabby) {
    return "Rabby";
  }
  if (provider.isMetaMask) {
    return "MetaMask";
  }
  if (provider.isBraveWallet) {
    return "Brave";
  }
  if (provider.isCoinbaseWallet) {
    return "Coinbase";
  }
  if (provider.isTrust) {
    return "Trust Wallet";
  }
  return "Browser Wallet";
}

function isNamedInjectedWalletProvider(provider?: InjectedWalletProvider): boolean {
  return !!(
    provider?.isRabby ||
    provider?.isMetaMask ||
    provider?.isBraveWallet ||
    provider?.isCoinbaseWallet ||
    provider?.isTrust
  );
}

function getInjectedProvider(
  selectedProviderId?: string | null,
  eip6963Providers: Eip6963ProviderDetail[] = []
): Eip1193Provider | undefined {
  const options = getInjectedWalletOptions(eip6963Providers);
  if (selectedProviderId) {
    return options.find((option) => option.id === selectedProviderId)?.provider ?? options[0]?.provider;
  }
  return options[0]?.provider;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactErrorText(error.message);
  }
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { message?: unknown; shortMessage?: unknown; data?: unknown; code?: unknown };
    const message =
      typeof maybeError.shortMessage === "string"
        ? maybeError.shortMessage
        : typeof maybeError.message === "string"
          ? maybeError.message
          : "";
    const code = maybeError.code === undefined ? "" : ` code=${String(maybeError.code)}`;
    const data = maybeError.data === undefined ? "" : " data=[redacted]";
    if (message || code || data) {
      return `${redactErrorText(message || "Wallet/RPC error")}${code}${data}`;
    }
  }

  return "Unknown wallet or RPC error.";
}

function redactErrorText(value: string): string {
  return value.replace(/0x[0-9a-fA-F]{64,}/g, "0x[redacted]");
}

function isNullifierAlreadySpentError(error: unknown): boolean {
  return /nullifier already spent/i.test(errorMessage(error));
}

function isUnacceptedRootError(error: unknown): boolean {
  return /unaccepted root/i.test(errorMessage(error));
}

function isUnsupportedWalletMethod(error: unknown): boolean {
  const code = (error as WalletError | undefined)?.code;
  return code === -32601 || code === 4200 || /unsupported|not supported|does not exist|unexpected (?:wallet )?method/i.test(errorMessage(error));
}

class VerifierProofEncodingRejectedError extends Error {
  constructor() {
    super(
      "Browser withdrawal proof failed live verifier self-check before wallet confirmation. The deployed verifier rejected every browser proof encoding."
    );
  }
}

function isVerifierSelfCheckFailure(error: unknown): boolean {
  return error instanceof VerifierProofEncodingRejectedError;
}

function shortAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function relayerEndpointForRuntime(runtimeConfig: ProductRuntimeConfig): string {
  return (
    runtimeConfig.relayerEndpoint ??
    (runtimeConfig.chainId !== 4326 && runtimeConfig.allowUntrustedLocalDevProver ? DEPLOYED_RELAYER_SERVICE_URL : "")
  );
}

function relayerEndpointLabel(endpoint: string): string {
  if (!endpoint) {
    return "not configured";
  }
  try {
    return new URL(endpoint).hostname;
  } catch {
    return shortAddress(endpoint);
  }
}

function megaEthExplorerTxUrl(chainId: number, txHash: HexString): string {
  const baseUrl = chainId === 4326 ? "https://mega.etherscan.io" : "https://testnet-mega.etherscan.io";
  return `${baseUrl}/tx/${txHash}`;
}

function megaEthExplorerAddressUrl(chainId: number, address: string): string {
  const baseUrl = chainId === 4326 ? "https://mega.etherscan.io" : "https://testnet-mega.etherscan.io";
  return `${baseUrl}/address/${address}`;
}

type SvgIconProps = { className?: string };

function IconBase({ className = "", children }: SvgIconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function StrokeIcon({ className = "", children }: SvgIconProps & { children: ReactNode }) {
  return (
    <IconBase className={className}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9">
        {children}
      </g>
    </IconBase>
  );
}

function ArrowDownIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 4.5v14" />
      <path d="m7.2 13.8 4.8 4.7 4.8-4.7" />
    </StrokeIcon>
  );
}

function ArrowUpIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 19.5v-14" />
      <path d="m7.2 10.2 4.8-4.7 4.8 4.7" />
    </StrokeIcon>
  );
}

function ChevronDownIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="m7 9.5 5 5 5-5" />
    </StrokeIcon>
  );
}

function CopyIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="8" y="8" width="10" height="10" rx="2" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </StrokeIcon>
  );
}

function ExternalLinkIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M8 8h8v8" />
      <path d="m16 8-9 9" />
      <path d="M14.5 18.5H6.8a1.3 1.3 0 0 1-1.3-1.3V9.5" />
    </StrokeIcon>
  );
}

function InfoIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7.2h.01" />
    </StrokeIcon>
  );
}

function ShieldIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 3.2 18.5 5.8v5.4c0 4.5-2.8 7.9-6.5 9.6-3.7-1.7-6.5-5.1-6.5-9.6V5.8L12 3.2Z" />
      <circle cx="12" cy="10.7" r="1.45" />
      <path d="M12 12.3v3" />
    </StrokeIcon>
  );
}

function WalletIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M4.5 7.5h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h13" />
      <path d="M16 13h5" />
      <circle cx="17.5" cy="13" r=".7" />
    </StrokeIcon>
  );
}

function NullarkMark({ className = "" }: SvgIconProps) {
  return (
    <svg viewBox="0 0 195 137" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nullarkMetalPanel" x1="0" y1="0" x2="195" y2="137" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f3f4f8" />
          <stop offset="1" stopColor="#b8bbc6" />
        </linearGradient>
        <filter id="nullarkGlowPanel" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#A78BFA" floodOpacity="0.34" />
        </filter>
      </defs>
      <g fill="url(#nullarkMetalPanel)" filter="url(#nullarkGlowPanel)">
        <path d="M0 0L0 137L15 137L16 38L116 136L116 112Z" />
        <path d="M167 0L101 70L171 137L195 137L123 69L190 0Z" />
      </g>
    </svg>
  );
}

function MegaEthMark({ className = "" }: SvgIconProps) {
  return (
    <svg viewBox="0 0 105 105" fill="none" className={className} aria-hidden="true">
      <path d="M62.7534 81.6321C65.9781 81.6321 68.5825 79.0297 68.5825 75.8195C68.5825 72.6093 65.9781 70.0068 62.7534 70.0068C59.5536 70.0068 56.9492 72.6093 56.9492 75.8195C56.9492 79.0297 59.5536 81.6321 62.7534 81.6321Z" fill="currentColor" />
      <path d="M41.8648 81.805C45.0894 81.805 47.6693 79.2026 47.6693 75.9923C47.6693 72.7821 45.0894 70.1797 41.8648 70.1797C38.665 70.1797 36.0605 72.7821 36.0605 75.9923C36.0605 79.2026 38.665 81.805 41.8648 81.805Z" fill="currentColor" />
      <path d="M29.1376 21.0791H42.9855C45.5913 28.1286 52.3911 48.1021 52.8874 49.215C53.0115 48.6586 59.8608 26.8919 61.7966 21.2028H76.1904V70.8582C74.4036 69.8687 72.6166 68.8795 70.6809 67.7662C69.3407 67.0863 68.1 66.344 66.7351 65.7875C66.611 56.1409 66.487 46.5561 66.1892 36.5385C64.2535 42.2894 57.5776 62.5721 57.0316 63.1286H48.1225C48.1225 63.1286 39.4613 38.5172 39.0394 37.4042C38.9154 46.8653 38.7913 56.3264 38.4687 66.0968C33.1579 68.8175 30.0063 70.3635 29.0137 70.7344V21.0791H29.1376Z" fill="currentColor" />
      <path d="M52.5124 8.34804C76.8081 8.34804 96.6616 28.136 96.6616 52.4999C96.6616 76.864 76.8825 96.6519 52.5124 96.6519C28.1423 96.6519 8.36325 76.864 8.36325 52.4999C8.36325 28.136 28.1423 8.34804 52.5124 8.34804ZM52.5124 0C23.5016 0 0 23.4983 0 52.4999C0 81.5016 23.5016 105 52.5124 105C81.4984 105 105 81.5016 105 52.4999C105 23.4983 81.4984 0 52.5124 0Z" fill="currentColor" />
    </svg>
  );
}

function EthDiamondIcon({ className = "" }: SvgIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 2.8 4.8 12 12 21.2 19.2 12 12 2.8Z" fill="currentColor" opacity="0.92" />
      <path d="M12 2.8V21.2" stroke="#0B1113" strokeOpacity="0.32" strokeWidth="1" />
      <path d="M4.8 12h14.4" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
    </svg>
  );
}

function CheckIcon({ className = "" }: SvgIconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </StrokeIcon>
  );
}

function liveStepState(done: boolean, active: boolean): LiveProgressStepState {
  if (done) {
    return "done";
  }

  return active ? "active" : "pending";
}

function createLiveProgressModel(
  title: string,
  detail: string,
  steps: Array<{ title: string; detail: string; done: boolean; active: boolean }>
): LiveProgressModel {
  const normalizedSteps = steps.map((step) => ({
    title: step.title,
    detail: step.detail,
    state: liveStepState(step.done, step.active)
  }));
  const completeCount = normalizedSteps.filter((step) => step.state === "done").length;

  return {
    title,
    detail,
    summary: `${completeCount} / ${normalizedSteps.length}`,
    steps: normalizedSteps
  };
}

function createLiveProgressToastRows(progress: LiveProgressModel): LiveProgressToastRow[] {
  if (progress.steps.length <= 3) {
    return progress.steps.map((step) => ({ step }));
  }

  const activeIndex = progress.steps.findIndex((step) => step.state === "active");
  const pendingIndex = progress.steps.findIndex((step) => step.state === "pending");
  const currentIndex = activeIndex >= 0 ? activeIndex : pendingIndex >= 0 ? pendingIndex : progress.steps.length - 1;

  return [
    { step: progress.steps[currentIndex - 1] ?? null },
    { step: progress.steps[currentIndex] ?? null },
    { step: progress.steps[currentIndex + 1] ?? null }
  ];
}

function calculateWithdrawFeePreview(grossAmountEth: string): { feeWei: string; netWei: string } | null {
  if (!grossAmountEth.trim()) {
    return null;
  }

  try {
    const grossWei = BigInt(parseEthDecimalToWei(grossAmountEth));
    if (grossWei <= 0n) {
      return null;
    }

    const feeWei = (grossWei * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
    const netWei = grossWei > feeWei ? grossWei - feeWei : 0n;

    return {
      feeWei: feeWei.toString(),
      netWei: netWei.toString()
    };
  } catch {
    return null;
  }
}

function formatWholeNumber(value: string): string {
  return BigInt(value).toLocaleString("en-US");
}

function formatEthAmount(valueWei: string): string {
  return `${formatWeiToEthDecimal(valueWei)} ETH`;
}

async function readWalletBalance(walletAddress: string): Promise<{ label: string; wei: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  const response = await fetch(getProductRuntimeConfig().rpcUrl, {
    method: "POST",
    signal: controller.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [walletAddress, "latest"]
    })
  }).finally(() => window.clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`MegaETH RPC eth_getBalance failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "MegaETH RPC eth_getBalance failed.");
  }
  if (typeof body.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.result)) {
    throw new Error("MegaETH RPC eth_getBalance returned malformed result.");
  }

  const balance = body.result;
  return {
    label: formatWeiBalance(balance),
    wei: BigInt(balance).toString()
  };
}

function formatProductStatus(status: string): string {
  const scanMatch = status.match(/Scanned encrypted on-chain notes: (\d+) available of (\d+) recovered\./i);
  if (scanMatch) {
    return `Private balance scan complete: ${scanMatch[1]} spendable of ${scanMatch[2]} recovered.`;
  }

  const emptyScanMatch = status.match(/Scanned encrypted on-chain notes: 0 available of (\d+) recovered\./i);
  if (emptyScanMatch) {
    return `Private balance scan complete: 0 spendable of ${emptyScanMatch[1]} recovered.`;
  }

  if (/Scanned encrypted on-chain notes: none recovered/i.test(status)) {
    return "Private balance scan complete: no recoverable notes found for this wallet.";
  }

  if (/Scanned encrypted on-chain notes: using the loaded note/i.test(status)) {
    return "Private balance scan complete: using the loaded private note for this session.";
  }

  return status;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isLocalDevHost(): boolean {
  const hostname =
    (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname ??
    window.location.hostname;
  return ["localhost", "127.0.0.1", ""].includes(hostname);
}

async function waitForReceipt(provider: Eip1193Provider, hash: HexString): Promise<TransactionReceipt> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const receipt = await provider.request<TransactionReceipt | null>({
      method: "eth_getTransactionReceipt",
      params: [hash]
    });
    if (receipt) {
      return receipt;
    }
    await delay(1500);
  }

  throw new Error("Transaction was submitted, but no receipt was available yet.");
}

async function requestWalletAccounts(provider: Eip1193Provider, forceAccountPicker: boolean): Promise<string[]> {
  if (forceAccountPicker) {
    try {
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch (error) {
      if (!isUnsupportedWalletMethod(error)) {
        throw error;
      }
    }
  }

  return provider.request<string[]>({ method: "eth_requestAccounts" });
}

async function ensureConfiguredWalletChain(provider: Eip1193Provider): Promise<void> {
  const runtimeConfig = getProductRuntimeConfig();
  try {
    const activeChainId = await provider.request<string>({ method: "eth_chainId" });
    if (typeof activeChainId === "string" && activeChainId.toLowerCase() === runtimeConfig.chainIdHex.toLowerCase()) {
      return;
    }
  } catch (error) {
    if (isUnsupportedWalletMethod(error)) {
      return;
    }
    throw error;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: runtimeConfig.chainIdHex }]
    });
  } catch (switchError) {
    if (!isUnrecognizedWalletChainError(switchError)) {
      throw switchError;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: runtimeConfig.chainIdHex,
          chainName: runtimeConfig.walletChainName,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [runtimeConfig.rpcUrl]
        }
      ]
    });
  }
}

function receiptIncludesCommitment(receipt: TransactionReceipt, commitment: string): boolean {
  const normalizedCommitment = commitment.toLowerCase();

  return (
    receipt.logs?.some(
      (log) =>
        log.address?.toLowerCase() === getProductRuntimeConfig().poolAddress.toLowerCase() &&
        log.topics?.some((topic) => topic.toLowerCase() === normalizedCommitment)
    ) ?? false
  );
}

async function waitForCommitmentInserted(
  provider: Eip1193Provider,
  commitment: string,
  attempts = 6
): Promise<boolean> {
  const calldata = encodeCommitmentLookupCalldata(commitment);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await provider.request<string>({
      method: "eth_call",
      params: [{ to: getProductRuntimeConfig().poolAddress, data: calldata }, "latest"]
    });
    if (boolFromEthCallResult(result)) {
      return true;
    }
    if (await commitmentInsertedViaMegaEthRpc(calldata)) {
      return true;
    }
    await delay(750);
  }

  return false;
}

async function commitmentInsertedViaMegaEthRpc(calldata: HexString): Promise<boolean> {
  return megaEthRpcCall(calldata)
    .then(boolFromEthCallResult)
    .catch(() => false);
}

async function megaEthRpcCall(calldata: HexString): Promise<string> {
  return megaEthRpcCallTo(getProductRuntimeConfig().poolAddress, calldata);
}

async function megaEthRpcCallTo(to: HexString, calldata: HexString): Promise<string> {
  const response = await fetch(getProductRuntimeConfig().rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data: calldata }, "latest"]
    })
  });
  if (!response.ok) {
    throw new Error(`MegaETH RPC eth_call failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: string; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "MegaETH RPC eth_call failed.");
  }
  if (typeof body.result !== "string") {
    throw new Error("MegaETH RPC eth_call returned malformed result.");
  }
  return body.result;
}

async function readPoolStatsFromRpc(): Promise<PoolStats> {
  const callPoolGetter = (functionName: (typeof POOL_STATS_ABI)[number]["name"]) =>
    megaEthRpcCall(
      encodeFunctionData({
        abi: POOL_STATS_ABI,
        functionName
      })
    );
  const [currentRoot, nextLeafIndex, capacity, withdrawalFeeBps, totalDepositedWei, totalWithdrawnWei, balanceWei] =
    await Promise.all([
      callPoolGetter("currentRoot"),
      callPoolGetter("nextLeafIndex").then(bytes32ToDecimal),
      callPoolGetter("MERKLE_TREE_CAPACITY").then(bytes32ToDecimal),
      callPoolGetter("WITHDRAWAL_FEE_BPS").then(bytes32ToDecimal),
      callPoolGetter("totalDepositedAccounting").then(bytes32ToDecimal),
      callPoolGetter("totalWithdrawnAccounting").then(bytes32ToDecimal),
      fetch(getProductRuntimeConfig().rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [getProductRuntimeConfig().poolAddress, "latest"]
        })
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`MegaETH RPC eth_getBalance failed with HTTP ${response.status}`);
          }
          const body = (await response.json()) as { result?: string; error?: { message?: string } };
          if (body.error) {
            throw new Error(body.error.message ?? "MegaETH RPC eth_getBalance failed.");
          }
          if (typeof body.result !== "string") {
            throw new Error("MegaETH RPC eth_getBalance returned malformed result.");
          }
          return BigInt(body.result).toString();
        })
    ]);

  return {
    currentRoot: currentRoot as HexString,
    nextLeafIndex,
    capacity,
    withdrawalFeeBps,
    totalDepositedWei,
    totalWithdrawnWei,
    balanceWei
  };
}

async function fetchPoolRoutingVerifierAddress(): Promise<HexString> {
  return bytes32ToEvmAddress(await megaEthRpcCall(POOL_VERIFIER_SELECTOR));
}

async function routingVerifierAcceptsWithdrawalProof(
  proof: HexString,
  publicInputs: readonly HexString[]
): Promise<boolean> {
  const verifier = await fetchPoolRoutingVerifierAddress();
  const calldata = encodeFunctionData({
    abi: ROUTING_VERIFIER_ABI,
    functionName: "verify",
    args: [proof, publicInputs]
  });
  return boolFromEthCallResult(await megaEthRpcCallTo(verifier, calldata));
}

async function selectVerifierAcceptedWithdrawalProof(input: {
  proof: HexString;
  proofCandidates?: readonly HexString[];
  publicInputs: readonly HexString[];
}): Promise<HexString> {
  const candidates = Array.from(new Set([input.proof, ...(input.proofCandidates ?? [])]))
    .filter((candidate): candidate is HexString => isHexString(candidate) && candidate.length === 514);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      if (await routingVerifierAcceptsWithdrawalProof(candidate, input.publicInputs)) {
        return candidate;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`Browser withdrawal proof failed live verifier self-check before wallet confirmation. ${errorMessage(lastError)}`);
  }
  throw new VerifierProofEncodingRejectedError();
}

async function assertProductProverTrustedForBrowserProof(): Promise<void> {
  const runtimeConfig = getProductRuntimeConfig();
  if (runtimeConfig.chainId !== 4326 && runtimeConfig.allowUntrustedLocalDevProver) {
    return;
  }

  const trustStatusInput: Parameters<typeof loadProductProverTrustStatus>[0] = {
    deployment: {
      chainId: runtimeConfig.chainId,
      pool: runtimeConfig.poolAddress,
      verifier: runtimeConfig.withdrawVerifierAddress,
      verifierBytecodeHash: runtimeConfig.withdrawVerifierBytecodeHash
    }
  };
  if (runtimeConfig.proverManifestUrl) {
    trustStatusInput.manifestUrl = runtimeConfig.proverManifestUrl;
  }

  const trustedSetupManifestTrustLevel = await loadProductProverTrustStatus(trustStatusInput);
  if (!trustedSetupManifestTrustLevel.trusted) {
    throw new Error(
      `Trusted prover gate blocked browser withdrawal proof generation: ${trustedSetupManifestTrustLevel.reason}.`
    );
  }
}

async function megaEthRpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(getProductRuntimeConfig().rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) {
    throw new Error(`MegaETH RPC ${method} failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `MegaETH RPC ${method} failed.`);
  }
  return body.result as T;
}

async function fetchRootAcceptedLogs(): Promise<RootAcceptedLogRecord[]> {
  type RawRootAcceptedLog = {
    topics?: string[];
  };
  const logs = await megaEthRpcRequest<RawRootAcceptedLog[]>("eth_getLogs", [
    {
      address: getProductRuntimeConfig().poolAddress,
      fromBlock: getProductRuntimeConfig().poolDeploymentBlockHex,
      toBlock: "latest",
      topics: [ROOT_ACCEPTED_TOPIC]
    }
  ]);

  return logs
    .map((log) => {
      const root = log.topics?.[1];
      const previousRoot = log.topics?.[2];
      const insertedCommitment = log.topics?.[3];
      if (!isHexBytes32(root ?? "") || !isHexBytes32(previousRoot ?? "") || !isHexBytes32(insertedCommitment ?? "")) {
        return null;
      }
      return { root, previousRoot, insertedCommitment };
    })
    .filter((log): log is RootAcceptedLogRecord => log !== null);
}

async function rootIsAccepted(root: HexString): Promise<boolean> {
  const calldata = `0xbbccdbc4${root.slice(2)}` as HexString;
  return megaEthRpcCall(calldata)
    .then(boolFromEthCallResult)
    .catch(() => false);
}

async function reconstructAcceptedBrowserMerklePath(commitment: HexString): Promise<RecoveryMerklePathPayload> {
  const hash = await createBrowserPoseidonFieldHash();
  let lastError: unknown;
  for (let attempt = 0; attempt < ACCEPTED_MERKLE_PATH_ATTEMPTS; attempt += 1) {
    try {
      const logs = await fetchRootAcceptedLogs();
      for (let end = logs.length; end > 0; end -= 1) {
        const acceptedRoot = logs[end - 1]?.root;
        if (!acceptedRoot || !await rootIsAccepted(acceptedRoot)) {
          continue;
        }
        const merklePath = reconstructMerklePathFromRootAcceptedLogs({
          logs: logs.slice(0, end),
          commitment,
          hash,
          depth: getProductRuntimeConfig().merkleTreeDepth
        });
        if (!merklePath.root) {
          throw new Error("Reconstructed Merkle path did not produce a root.");
        }
        if (await rootIsAccepted(merklePath.root)) {
          return {
            commitment,
            leafIndex: merklePath.leafIndex,
            root: merklePath.root,
            pathElements: merklePath.siblings,
            pathIndices: merklePath.pathIndices,
            chainId: getProductRuntimeConfig().chainId,
            pool: getProductRuntimeConfig().poolAddress,
            latestCheckedBlock: "latest"
          };
        }
      }
      throw new Error("Imported note commitment was not found under an accepted on-chain root.");
    } catch (error) {
      lastError = error;
      if (attempt === ACCEPTED_MERKLE_PATH_ATTEMPTS - 1) {
        break;
      }
      if (!/commitment was not found|accepted on-chain root/i.test(errorMessage(error))) {
        break;
      }
      await delay(ACCEPTED_MERKLE_PATH_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function restoredMerklePathPayload(record: SandboxSpendMaterialNoteRecord): RecoveryMerklePathPayload | null {
  const root = record.merklePath.root;
  if (
    record.leafIndex === null ||
    record.leafIndex === undefined ||
    record.merklePath.status !== SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS ||
    !isHexBytes32(root ?? "") ||
    record.merklePath.siblings.length !== getProductRuntimeConfig().merkleTreeDepth ||
    record.merklePath.pathIndices.length !== getProductRuntimeConfig().merkleTreeDepth
  ) {
    return null;
  }

  return {
    commitment: record.commitment,
    leafIndex: record.leafIndex,
    root: root as HexString,
    pathElements: record.merklePath.siblings,
    pathIndices: record.merklePath.pathIndices,
    chainId: getProductRuntimeConfig().chainId,
    pool: getProductRuntimeConfig().poolAddress,
    latestCheckedBlock: "restored-note-record"
  };
}

async function withdrawalPreflightSucceedsViaMegaEthRpc(calldata: HexString): Promise<boolean> {
  await megaEthRpcCall(calldata);
  return true;
}

async function assertWithdrawalPreflightSucceeds(
  provider: Eip1193Provider,
  calldata: HexString,
  options: {
    attempts?: number;
    onRetry?: (attempt: number, maxAttempts: number) => void;
  } = {}
): Promise<void> {
  const attempts = options.attempts ?? WITHDRAWAL_PREFLIGHT_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await tryWithdrawalPreflight(provider, calldata);
    if (result.ok) {
      return;
    }

    lastError = result.error;
    if (!result.retriable || attempt === attempts) {
      break;
    }

    options.onRetry?.(attempt, attempts);
    await delay(WITHDRAWAL_PREFLIGHT_RETRY_DELAY_MS);
  }

  throw new Error(`Withdrawal preflight failed before wallet confirmation: ${errorMessage(lastError)}`);
}

async function tryWithdrawalPreflight(
  provider: Eip1193Provider,
  calldata: HexString
): Promise<{ ok: true } | { ok: false; retriable: boolean; error: unknown }> {
  try {
    await provider.request<string>({
      method: "eth_call",
      params: [{ to: getProductRuntimeConfig().poolAddress, data: calldata }, "latest"]
    });
    return { ok: true };
  } catch (error) {
    try {
      await withdrawalPreflightSucceedsViaMegaEthRpc(calldata);
      return { ok: true };
    } catch (fallbackError) {
      return {
        ok: false,
        retriable: isUnacceptedRootError(error) || isUnacceptedRootError(fallbackError),
        error: fallbackError ?? error
      };
    }
  }
}

async function generateLocalUntrustedWithdrawalProof(
  record: SandboxSpendMaterialNoteRecord,
  destination: HexString,
  grossAmountWei: string
): Promise<BrowserWithdrawalProofBundle> {
  try {
    const response = await fetch(LOCAL_WITHDRAW_PROOF_SERVICE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        noteRecord: record,
        destination,
        grossAmountWei
      })
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(failure.error ?? `local proof service returned HTTP ${response.status}`);
    }
    const bundle = (await response.json()) as Partial<LocalWithdrawalProofServiceResponse>;
    if (
      bundle.ok !== true ||
      bundle.scope !== "local-untrusted-dev-only" ||
      !bundle.proof ||
      !Array.isArray(bundle.publicInputs) ||
      !bundle.nullifier ||
      !bundle.destination ||
      !bundle.grossAmountWei ||
      !bundle.feeWei ||
      !bundle.netAmountWei ||
      !bundle.changeAmountWei ||
      typeof bundle.encryptedChangeNote !== "string"
    ) {
      throw new Error("local proof service returned malformed withdrawal proof bundle");
    }
    const changeNote: SpendMaterialPlaintext | null = bundle.changeNote
      ? {
          version: "spend-material-v1" as const,
          chainId: getProductRuntimeConfig().chainId,
          pool: getProductRuntimeConfig().poolAddress as HexString,
          assetId: bundle.changeNote.assetId,
          noteAmountWei: bundle.changeNote.noteAmountWei,
          ownerCommitment: bundle.changeNote.ownerCommitment,
          noteSecret: bundle.changeNote.noteSecret,
          blinding: bundle.changeNote.blinding,
          commitment: bundle.changeNote.commitment,
          createdAt: new Date().toISOString()
        }
      : null;

    return {
      proof: bundle.proof,
      publicInputs: bundle.publicInputs,
      nullifier: bundle.nullifier,
      destination: bundle.destination,
      grossAmountWei: bundle.grossAmountWei,
      feeWei: bundle.feeWei,
      netAmountWei: bundle.netAmountWei,
      changeAmountWei: bundle.changeAmountWei,
      encryptedChangeNote: bundle.encryptedChangeNote as HexString,
      changeNote
    };
  } catch (error) {
    throw new Error(`Local-untrusted withdrawal proof service failed: ${errorMessage(error)}`);
  }
}

async function generateLocalUntrustedPrivateTransferProof(
  record: SandboxSpendMaterialNoteRecord,
  receiveCode: PrivateReceiveCode
): Promise<BrowserPrivateTransferProofBundle> {
  try {
    const response = await fetch(LOCAL_PRIVATE_TRANSFER_PROOF_SERVICE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        noteRecord: record,
        receiveCode
      })
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(failure.error ?? `local proof service returned HTTP ${response.status}`);
    }
    const bundle = (await response.json()) as Partial<BrowserPrivateTransferProofBundle> & {
      ok?: boolean;
      scope?: string;
    };
    if (
      bundle.ok !== true ||
      bundle.scope !== "local-untrusted-dev-only" ||
      !bundle.proof ||
      !Array.isArray(bundle.publicInputs) ||
      !bundle.nullifier ||
      !bundle.newCommitment ||
      !bundle.encryptedNote ||
      !bundle.noteAmountWei
    ) {
      throw new Error("local proof service returned malformed private transfer proof bundle");
    }

    return {
      proof: bundle.proof,
      publicInputs: bundle.publicInputs,
      nullifier: bundle.nullifier,
      newCommitment: bundle.newCommitment,
      encryptedNote: bundle.encryptedNote,
      noteAmountWei: bundle.noteAmountWei
    };
  } catch (error) {
    throw new Error(`Local-untrusted private transfer proof service failed: ${errorMessage(error)}`);
  }
}

async function relayPoolTransaction(calldata: HexString): Promise<LocalRelayResponse> {
  const runtimeConfig = getProductRuntimeConfig();
  assertMainnetValueMovingAllowed(runtimeConfig);
  const requestBody = {
    chainId: runtimeConfig.chainId,
    to: runtimeConfig.poolAddress,
    value: "0x0",
    data: calldata,
    deadlineEpochSeconds: Math.floor(Date.now() / 1000) + 120
  };
  const relayerEndpoint =
    runtimeConfig.relayerEndpoint ??
    (runtimeConfig.chainId !== 4326 && runtimeConfig.allowUntrustedLocalDevProver ? DEPLOYED_RELAYER_SERVICE_URL : "");
  if (!relayerEndpoint) {
    throw new Error("No deployed relayer endpoint is configured for this runtime.");
  }
  const response = await fetch(relayerEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    if (isLocalDevHost()) {
      return relayPoolTransactionThroughLocalDevService(calldata);
    }
    const failure = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(failure.error ?? `deployed relayer returned HTTP ${response.status}`);
  }
  const relayed = (await response.json()) as Partial<LocalRelayResponse>;
  if (
    relayed.ok !== true ||
    (relayed.scope !== "deployed-withdrawal-relayer" && relayed.scope !== "local-untrusted-dev-only") ||
    !relayed.txHash ||
    !relayed.relayer
  ) {
    throw new Error("deployed relayer returned malformed response");
  }
  return relayed as LocalRelayResponse;
}

async function relayPoolTransactionThroughLocalDevService(calldata: HexString): Promise<LocalRelayResponse> {
  const response = await fetch(LOCAL_RELAYER_SERVICE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to: getProductRuntimeConfig().poolAddress,
      value: "0x0",
      data: calldata
    })
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(failure.error ?? `local relayer returned HTTP ${response.status}`);
  }
  const relayed = (await response.json()) as Partial<LocalRelayResponse>;
  if (relayed.ok !== true || relayed.scope !== "local-untrusted-dev-only" || !relayed.txHash || !relayed.relayer) {
    throw new Error("local relayer returned malformed response");
  }
  return relayed as LocalRelayResponse;
}

function parsePublicInputsText(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function spendMaterialFromNoteRecord(record: SandboxSpendMaterialNoteRecord): SandboxSpendMaterial {
  return {
    assetId: record.assetId,
    ownerCommitment: record.ownerCommitment,
    noteSecret: record.noteSecret,
    blinding: record.blinding,
    commitment: record.commitment
  };
}

function normalizeSandboxNoteCommitment(commitment: string): string {
  return commitment.toLowerCase();
}

function getBrowserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getInitialNoteVaultState(): {
  entries: SandboxNoteVaultEntry[];
  record: SandboxSpendMaterialNoteRecord | null;
  recordText: string;
} {
  try {
    const entries = loadSandboxNoteVault(getBrowserLocalStorage());

    return {
      entries,
      record: null,
      recordText: ""
    };
  } catch {
    return { entries: [], record: null, recordText: "" };
  }
}

function switchProductRuntimeNetwork(network: "mainnet" | "testnet") {
  const url = new URL(window.location.href);
  if (network === "testnet") {
    url.searchParams.set("network", "megaeth-testnet-nullark");
  } else {
    url.searchParams.delete("network");
  }
  window.location.assign(url.toString());
}

function isUnrecognizedWalletChainError(error: unknown): boolean {
  const walletError = error as WalletError;
  const message = typeof walletError.message === "string" ? walletError.message.toLowerCase() : "";
  return walletError.code === 4902 || message.includes("unrecognized chain") || message.includes("unknown chain");
}

export function ShieldedTransfersPanel() {
  const runtimeConfig = getProductRuntimeConfig();
  const destinationInputRef = useRef<HTMLInputElement | null>(null);
  const networkDropdownRef = useRef<HTMLDivElement | null>(null);
  const noteRecordInputRef = useRef<HTMLTextAreaElement | null>(null);
  const actionInFlightRef = useRef<boolean>(false);
  const initialNoteVaultRef = useRef<ReturnType<typeof getInitialNoteVaultState> | null>(null);
  if (!initialNoteVaultRef.current) {
    initialNoteVaultRef.current = getInitialNoteVaultState();
  }
  const initialNoteVault = initialNoteVaultRef.current;
  const initialVaultRecord = initialNoteVault.record;
  const showDeveloperDiagnostics =
    ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false) &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  const usesFixedDenominationExitChoices =
    runtimeConfig.chainId === 4326 ||
    runtimeConfig.poolAddress.toLowerCase() === NULLARK_TESTNET_POOL_ADDRESS.toLowerCase();
  const [providerStatus, setProviderStatus] = useState<"unchecked" | "available" | "missing">("unchecked");
  const [account, setAccount] = useState<string>("");
  const [walletBalanceLabel, setWalletBalanceLabel] = useState<string>("");
  const [walletBalanceWei, setWalletBalanceWei] = useState<string>("");
  const [currentRoot, setCurrentRoot] = useState<string>(initialVaultRecord?.currentRootAfter ?? "");
  const [poolBalance, setPoolBalance] = useState<string>("");
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [commitment, setCommitment] = useState<string>(initialVaultRecord?.commitment ?? "");
  const [depositAmountEth, setDepositAmountEth] = useState<string>(
    formatWeiToEthDecimal(initialVaultRecord?.noteAmountWei ?? TEST_DEPOSIT_VALUE_WEI.toString())
  );
  const [commitmentInserted, setCommitmentInserted] = useState<boolean | null>(null);
  const [txHash, setTxHash] = useState<string>(initialVaultRecord?.depositTxHash ?? "");
  const [withdrawProof, setWithdrawProof] = useState<string>("");
  const [withdrawPublicInputs, setWithdrawPublicInputs] = useState<string>("");
  const [withdrawNullifier, setWithdrawNullifier] = useState<string>("");
  const [withdrawDestination, setWithdrawDestination] = useState<string>("");
  const [withdrawGrossAmountEth, setWithdrawGrossAmountEth] = useState<string>(
    initialVaultRecord?.noteAmountWei ? formatWeiToEthDecimal(initialVaultRecord.noteAmountWei) : ""
  );
  const [withdrawFeeWei, setWithdrawFeeWei] = useState<string>("");
  const [withdrawNetAmountWei, setWithdrawNetAmountWei] = useState<string>("");
  const [withdrawChangeAmountWei, setWithdrawChangeAmountWei] = useState<string>("");
  const [withdrawTxHash, setWithdrawTxHash] = useState<string>("");
  const [lastRelaySender, setLastRelaySender] = useState<string>("");
  const [lastRelayTarget, setLastRelayTarget] = useState<string>("");
  const [nullifierSpent, setNullifierSpent] = useState<boolean | null>(null);
  const [pendingChangeNote, setPendingChangeNote] = useState<SpendMaterialPlaintext | null>(null);
  const [pendingEncryptedChangeNote, setPendingEncryptedChangeNote] = useState<HexString>("0x");
  const [changeNoteRecordText, setChangeNoteRecordText] = useState<string>("");
  const [changeNoteStatus, setChangeNoteStatus] = useState<string>("No private change note generated.");
  const [withdrawalSuccessToast, setWithdrawalSuccessToast] = useState<WithdrawalSuccessToast | null>(null);
  const [privateTransferDestination, setPrivateTransferDestination] = useState<string>("");
  const [privateTransferTxHash, setPrivateTransferTxHash] = useState<string>("");
  const [privateTransferNullifier, setPrivateTransferNullifier] = useState<string>("");
  const [useLocalRelayer, setUseLocalRelayer] = useState<boolean>(true);
  const [privateBalanceUnlockSignature, setPrivateBalanceUnlockSignature] = useState<string>("");
  const [recoveryScanFailed, setRecoveryScanFailed] = useState<boolean>(false);
  const [noteVaultEntries, setNoteVaultEntries] = useState<SandboxNoteVaultEntry[]>(initialNoteVault.entries);
  const [sessionVisibleCommitments, setSessionVisibleCommitments] = useState<ReadonlySet<string>>(() => new Set());
  const [noteRecordText, setNoteRecordText] = useState<string>(initialNoteVault.recordText);
  const [noteRecordStatus, setNoteRecordStatus] = useState<string>(
    initialVaultRecord
      ? "Recovered note metadata loaded for this wallet session."
      : "No deposit note record loaded."
  );
  const [noteRecordAmountWei, setNoteRecordAmountWei] = useState<string>(initialVaultRecord?.noteAmountWei ?? "");
  const [noteRecordPool, setNoteRecordPool] = useState<string>(initialVaultRecord?.pool ?? "");
  const [noteRecordCommitmentDerivationStatus, setNoteRecordCommitmentDerivationStatus] =
    useState<string>(initialVaultRecord?.commitmentDerivationStatus ?? SANDBOX_COMMITMENT_DERIVATION_STATUS);
  const [noteRecordMerklePathStatus, setNoteRecordMerklePathStatus] = useState<string>(
    initialVaultRecord?.merklePath.status ?? SANDBOX_MERKLE_PATH_STATUS
  );
  const [noteRecordProofGenerationStatus, setNoteRecordProofGenerationStatus] =
    useState<string>(initialVaultRecord?.proofGenerationStatus ?? SANDBOX_PROOF_GENERATION_STATUS);
  const [spendMaterial, setSpendMaterial] = useState<SandboxSpendMaterial | null>(
    initialVaultRecord ? spendMaterialFromNoteRecord(initialVaultRecord) : null
  );
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string>("");
  const [actionInFlight, setActionInFlight] = useState<boolean>(false);
  const [guidedAttention, setGuidedAttention] = useState<"destination" | "note" | "">("");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [depositMoreOpen, setDepositMoreOpen] = useState<boolean>(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState<boolean>(false);
  const [walletPickerOpen, setWalletPickerOpen] = useState<boolean>(false);
  const [selectedWalletProviderId, setSelectedWalletProviderId] = useState<string>("");
  const [eip6963Providers, setEip6963Providers] = useState<Eip6963ProviderDetail[]>([]);
  const [mobileConsoleTab, setMobileConsoleTab] = useState<MobileConsoleTab>("deposit");
  const walletProviderOptions = getInjectedWalletOptions(eip6963Providers);
  const visibleNoteVaultEntries = noteVaultEntries.filter((entry) =>
    sessionVisibleCommitments.has(normalizeSandboxNoteCommitment(entry.record.commitment))
  );
  const savedAvailableNoteCount = visibleNoteVaultEntries.filter((entry) => !entry.spent).length;
  const savedSpentNoteCount = visibleNoteVaultEntries.length - savedAvailableNoteCount;
  const savedAvailableBalanceWei = deriveSandboxNoteVaultAvailableBalanceWei(visibleNoteVaultEntries);
  const savedAvailableBalanceEth = formatWeiToEthDecimal(savedAvailableBalanceWei);
  const networkSignal = `MegaETH ${
    runtimeConfig.networkBadge.toLowerCase() === "mainnet" ? "Mainnet" : "Testnet"
  }`;
  const activeRuntimeNetwork = runtimeConfig.chainId === 4326 ? "mainnet" : "testnet";
  const activeRuntimeNetworkLabel = activeRuntimeNetwork === "mainnet" ? "MegaETH Mainnet" : "MegaETH Testnet";
  const activeRuntimeNetworkShortLabel = activeRuntimeNetwork === "mainnet" ? "Mainnet" : "Testnet";
  const mainnetValueMovingBlocked = isMainnetValueMovingBlocked(runtimeConfig);
  const valueMovingDisabled = actionInFlight || mainnetValueMovingBlocked;

  const selectedWalletProviderLabel =
    walletProviderOptions.find((option) => option.id === selectedWalletProviderId)?.label ??
    (selectedWalletProviderId ? "Selected wallet" : "");

  useEffect(() => {
    if (!networkDropdownOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!networkDropdownRef.current?.contains(event.target as Node)) {
        setNetworkDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNetworkDropdownOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [networkDropdownOpen]);

  useEffect(() => {
    function handleAnnounceProvider(event: Event) {
      const detail = (event as Eip6963AnnounceProviderEvent).detail;
      if (!detail?.provider || !detail.info?.uuid) {
        return;
      }
      setEip6963Providers((previous) => {
        if (previous.some((providerDetail) => providerDetail.info.uuid === detail.info.uuid)) {
          return previous;
        }
        return [...previous, detail];
      });
    }

    window.addEventListener("eip6963:announceProvider", handleAnnounceProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handleAnnounceProvider);
  }, []);

  useEffect(() => {
    let cancelled = false;

    readPoolStatsFromRpc()
      .then((stats) => {
        if (cancelled) {
          return;
        }
        setPoolStats(stats);
        setCurrentRoot(stats.currentRoot);
        setPoolBalance(formatEthAmount(stats.balanceWei));
      })
      .catch(() => {
        // Keep the UI usable if a public RPC read is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeConfig.poolAddress, runtimeConfig.rpcUrl]);

  const getProviderOrThrow = () => {
    const provider = getInjectedProvider(selectedWalletProviderId || null, eip6963Providers);
    if (!provider) {
      setProviderStatus("missing");
      throw new Error("No injected wallet provider found on window.ethereum.");
    }

    setProviderStatus("available");
    return provider;
  };

  const runAction = async (label: string, action: (provider: Eip1193Provider) => Promise<void>) => {
    if (actionInFlightRef.current) {
      return;
    }

    actionInFlightRef.current = true;
    setActionInFlight(true);
    setError("");
    setStatus(label);

    try {
      await action(getProviderOrThrow());
      setStatus("Ready");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setStatus("Needs attention");
    } finally {
      actionInFlightRef.current = false;
      setActionInFlight(false);
    }
  };

  const persistNoteVaultEntries = (entries: SandboxNoteVaultEntry[]) => {
    setNoteVaultEntries(entries);
    saveSandboxNoteVault(getBrowserLocalStorage(), entries);
  };

  const showNoteRecordInCurrentSession = (record: SandboxSpendMaterialNoteRecord) => {
    setSessionVisibleCommitments((previous) => {
      const next = new Set(previous);
      next.add(normalizeSandboxNoteCommitment(record.commitment));
      return next;
    });
  };

  const showRecoveredNoteRecordsInCurrentSession = (records: SandboxSpendMaterialNoteRecord[]) => {
    setSessionVisibleCommitments(
      new Set(records.map((record) => normalizeSandboxNoteCommitment(record.commitment)))
    );
  };

  const storeNoteRecordInVault = (record: SandboxSpendMaterialNoteRecord, updatedAt = new Date().toISOString()) => {
    const entries = upsertSandboxNoteVaultRecord({ entries: noteVaultEntries, record, updatedAt });
    persistNoteVaultEntries(entries);
    showNoteRecordInCurrentSession(record);
    return entries;
  };

  const clampWithdrawalAmountForNote = (
    record: SandboxSpendMaterialNoteRecord,
    options: { preserveCurrentSelection?: boolean } = {}
  ) => {
    const preserveCurrentSelection = options.preserveCurrentSelection ?? true;
    const availableWei = BigInt(record.noteAmountWei);
    if (usesFixedDenominationExitChoices) {
      const choices = spendablePublicExitChoicesForNote(record.noteAmountWei);
      if (preserveCurrentSelection && withdrawGrossAmountEth.trim()) {
        try {
          const requestedWei = parseEthDecimalToWei(withdrawGrossAmountEth);
          if (choices.some((choice) => choice.grossAmountWei === requestedWei)) {
            return withdrawGrossAmountEth;
          }
        } catch {
          // Invalid input is replaced with the selected note's largest spendable exit below.
        }
      }
      return choices[0]?.grossAmountEth ?? "";
    }

    if (withdrawGrossAmountEth.trim()) {
      try {
        const requestedWei = BigInt(parseEthDecimalToWei(withdrawGrossAmountEth));
        if (requestedWei > 0n && requestedWei <= availableWei) {
          return withdrawGrossAmountEth;
        }
      } catch {
        // Invalid input is replaced with the selected note amount below.
      }
    }
    return formatWeiToEthDecimal(record.noteAmountWei);
  };

  const selectNoteRecordForWithdrawal = (
    record: SandboxSpendMaterialNoteRecord,
    statusMessage: string,
    options: { preserveCurrentWithdrawalAmount?: boolean } = {}
  ) => {
    setNoteRecordText(serializeSandboxSpendMaterialNoteRecord(record));
    setSpendMaterial(spendMaterialFromNoteRecord(record));
    setCommitment(record.commitment);
    setTxHash(record.depositTxHash);
    setCurrentRoot(record.currentRootAfter ?? "");
    setDepositAmountEth(formatWeiToEthDecimal(record.noteAmountWei));
    setWithdrawGrossAmountEth(
      clampWithdrawalAmountForNote(record, {
        preserveCurrentSelection: options.preserveCurrentWithdrawalAmount ?? true
      })
    );
    setNoteRecordAmountWei(record.noteAmountWei);
    setNoteRecordPool(record.pool);
    setNoteRecordCommitmentDerivationStatus(record.commitmentDerivationStatus);
    setNoteRecordMerklePathStatus(record.merklePath.status);
    setNoteRecordProofGenerationStatus(record.proofGenerationStatus);
    setNoteRecordStatus(statusMessage);
  };

  const assertRecoveryScanHealthyForSpend = () => {
    if (privateBalanceUnlockSignature && recoveryScanFailed) {
      throw new Error("Encrypted on-chain note recovery failed for this session. Unlock private balance again before spending a loaded note.");
    }
  };

  const selectNextUnspentNoteAfterWithdrawal = (
    entries: SandboxNoteVaultEntry[],
    spentCommitment: HexString
  ) => {
    const spent = normalizeSandboxNoteCommitment(spentCommitment);
    const nextRecord = selectLargestAvailableSandboxNote(
      entries.filter((entry) => {
        const commitment = normalizeSandboxNoteCommitment(entry.record.commitment);
        return (
          commitment !== spent &&
          !entry.spent &&
          entry.record.pool.toLowerCase() === runtimeConfig.poolAddress.toLowerCase() &&
          sessionVisibleCommitments.has(commitment)
        );
      })
    );
    if (!nextRecord) {
      return;
    }
    showNoteRecordInCurrentSession(nextRecord);
    selectNoteRecordForWithdrawal(
      nextRecord,
      `Selected remaining ${formatWeiToEthDecimal(nextRecord.noteAmountWei)} ETH private note for the next exit.`,
      { preserveCurrentWithdrawalAmount: false }
    );
    clearWithdrawalProofBundle();
  };

  const markPrivateTransferSourceSpent = ({
    record,
    nullifier,
    updatedAt = new Date().toISOString()
  }: {
    record: SandboxSpendMaterialNoteRecord;
    nullifier: HexString;
    updatedAt?: string;
  }) => {
    const nextVaultEntries = markSandboxNoteVaultRecordSpent({
      entries: noteVaultEntries,
      commitment: record.commitment,
      spentNullifier: nullifier,
      updatedAt
    });
    persistNoteVaultEntries(nextVaultEntries);
    setNullifierSpent(true);
    setPrivateTransferNullifier(nullifier);
    return nextVaultEntries;
  };

  const parsedNoteRecord = (() => {
    if (!noteRecordText.trim()) {
      return { record: null, error: "No recoverable note is available for withdrawal. Deposit first or unlock private balance." };
    }

    try {
      return { record: parseSandboxSpendMaterialNoteRecord(noteRecordText, runtimeConfig.poolAddress), error: "" };
    } catch (caughtError) {
      return { record: null, error: errorMessage(caughtError) };
    }
  })();
  const fixedDenominationExitChoices = parsedNoteRecord.record
    ? spendablePublicExitChoicesForNote(parsedNoteRecord.record.noteAmountWei)
    : [];
  const fixedDenominationUnsupportedNoteMessage =
    usesFixedDenominationExitChoices && parsedNoteRecord.record && fixedDenominationExitChoices.length === 0
      ? `This private note is ${formatWeiToEthDecimal(
          parsedNoteRecord.record.noteAmountWei
        )} ETH, which this pool cannot exit. Use a supported private note.`
      : "";
  const clearWithdrawalProofBundle = () => {
    setWithdrawProof("");
    setWithdrawPublicInputs("");
    setWithdrawNullifier("");
    setWithdrawFeeWei("");
    setWithdrawNetAmountWei("");
    setWithdrawChangeAmountWei("");
    setPendingChangeNote(null);
    setPendingEncryptedChangeNote("0x");
    setChangeNoteRecordText("");
    setChangeNoteStatus("No private change note generated.");
    setNullifierSpent(null);
  };

  const clearSelectedSessionNote = () => {
    setSessionVisibleCommitments(new Set());
    setNoteRecordText("");
    setSpendMaterial(null);
    setCommitment("");
    setCommitmentInserted(null);
    setTxHash("");
    setCurrentRoot("");
    setDepositAmountEth(formatWeiToEthDecimal(TEST_DEPOSIT_VALUE_WEI.toString()));
    setWithdrawGrossAmountEth("");
    setNoteRecordStatus("No deposit note record loaded.");
    setNoteRecordAmountWei("");
    setNoteRecordPool("");
    setNoteRecordCommitmentDerivationStatus(SANDBOX_COMMITMENT_DERIVATION_STATUS);
    setNoteRecordMerklePathStatus(SANDBOX_MERKLE_PATH_STATUS);
    setNoteRecordProofGenerationStatus(SANDBOX_PROOF_GENERATION_STATUS);
    setGuidedAttention("");
    setRecoveryScanFailed(false);
  };

  const refreshWalletBalance = (walletAddress: string) => {
    if (!walletAddress) {
      setWalletBalanceLabel("");
      setWalletBalanceWei("");
      return;
    }

    setWalletBalanceLabel("Reading balance...");
    setWalletBalanceWei("");
    readWalletBalance(walletAddress)
      .then(({ label, wei }) => {
        setWalletBalanceLabel(label);
        setWalletBalanceWei(wei);

        const affordableDenominations = fixedDepositDenominationLabels().filter(
          (amount) => BigInt(parseEthDecimalToWei(amount)) <= BigInt(wei)
        );
        if (affordableDenominations.length > 0 && !affordableDenominations.includes(depositAmountEth)) {
          setDepositAmountEth(affordableDenominations[affordableDenominations.length - 1] ?? depositAmountEth);
        }
      })
      .catch(() => {
        setWalletBalanceLabel("Balance unavailable");
        setWalletBalanceWei("");
      });
  };

  const getWithdrawalProofIssue = () => {
    const proof = withdrawProof.trim();
    if (!proof || !/^0x[0-9a-fA-F]+$/.test(proof)) {
      return "Generate a browser withdrawal proof before sending.";
    }

    const publicInputs = parsePublicInputsText(withdrawPublicInputs);
    const publicChangeCommitment = publicInputs[2] ?? ZERO_BYTES32;
    if (publicChangeCommitment !== ZERO_BYTES32 && !pendingChangeNote) {
      return "Proof includes private change, but matching private change note material is not loaded.";
    }

    try {
      const withdrawGrossAmountWei = withdrawGrossAmountEth.trim()
        ? parseEthDecimalToWei(withdrawGrossAmountEth)
        : "0";
      assertWithdrawPublicInputBinding({
        publicInputs,
        nullifier: withdrawNullifier,
        destination: withdrawDestination,
        grossAmountWei: withdrawGrossAmountWei,
        currentRoot: isHexBytes32(currentRoot) ? currentRoot : publicInputs[0] ?? "",
        changeCommitment: pendingChangeNote?.commitment,
        expectedPool: runtimeConfig.poolAddress,
        expectedChainId: runtimeConfig.chainId
      });
    } catch (caughtError) {
      return errorMessage(caughtError);
    }

    return "";
  };

  const withdrawalProofIssue = getWithdrawalProofIssue();
  const destinationReady = isEvmAddress(withdrawDestination.trim());

  const focusDestinationForGuidedFlow = () => {
    setGuidedAttention("destination");
    setError("");
    setStatus("Enter a valid withdrawal destination address.");
    window.setTimeout(() => destinationInputRef.current?.focus(), 0);
  };

  const focusNoteForGuidedFlow = (message: string) => {
    setGuidedAttention("note");
    setError("");
    setStatus(message);
    window.setTimeout(() => noteRecordInputRef.current?.focus(), 0);
  };

  const handleGuidedWithdrawalCta = async () => {
    if (actionInFlightRef.current) {
      return;
    }

    if (mainnetValueMovingBlocked) {
      setError(MAINNET_VALUE_MOVING_BLOCKED_MESSAGE);
      setStatus("Needs mainnet value-moving approval");
      return;
    }

    if (privateBalanceUnlockSignature && recoveryScanFailed) {
      focusNoteForGuidedFlow("Encrypted on-chain note recovery failed for this session. Unlock private balance again before spending a loaded note.");
      return;
    }

    if (!destinationReady) {
      focusDestinationForGuidedFlow();
      return;
    }

    if (fixedDenominationUnsupportedNoteMessage) {
      focusNoteForGuidedFlow(fixedDenominationUnsupportedNoteMessage);
      return;
    }

    const requestedGrossAmountWei = withdrawGrossAmountEth.trim() ? parseEthDecimalToWei(withdrawGrossAmountEth) : null;
    const selectedRecord =
      requestedGrossAmountWei === null
        ? parsedNoteRecord.record
        : selectSandboxNoteForWithdrawal({ entries: visibleNoteVaultEntries, grossAmountWei: requestedGrossAmountWei });
    if (!selectedRecord) {
      if (requestedGrossAmountWei !== null) {
        const largestRecord = selectLargestAvailableSandboxNote(visibleNoteVaultEntries);
        const requestedEth = formatWeiToEthDecimal(requestedGrossAmountWei);
        const message = largestRecord
          ? `No single recoverable note can cover ${requestedEth} ETH. Withdraw at most ${formatWeiToEthDecimal(
              largestRecord.noteAmountWei
            )} ETH, or withdraw multiple notes separately.`
          : parsedNoteRecord.error;
        focusNoteForGuidedFlow(message);
        return;
      }
      focusNoteForGuidedFlow(parsedNoteRecord.error);
      return;
    }

    if (parsedNoteRecord.record?.commitment.toLowerCase() !== selectedRecord.commitment.toLowerCase()) {
      selectNoteRecordForWithdrawal(
        selectedRecord,
        `Loaded ${formatWeiToEthDecimal(selectedRecord.noteAmountWei)} ETH note for this withdrawal amount.`
      );
    }

    actionInFlightRef.current = true;
    setActionInFlight(true);
    try {
      await restoreProveAndSendWithdrawal(selectedRecord);
    } finally {
      actionInFlightRef.current = false;
      setActionInFlight(false);
    }
  };

  const checkProvider = () => {
    setError("");
    const provider = getInjectedProvider(selectedWalletProviderId || null, eip6963Providers);
    setProviderStatus(provider ? "available" : "missing");
    setStatus(provider ? "Provider available" : "Provider missing");
  };

  const connectWalletWithProvider = (providerOption?: WalletProviderOption) =>
    runAction(account ? "Changing wallet account" : "Requesting wallet account", async (fallbackProvider) => {
      const provider = providerOption?.provider ?? fallbackProvider;
      if (providerOption) {
        setSelectedWalletProviderId(providerOption.id);
      }
      const previousAccount = account;
      const accounts = await requestWalletAccounts(provider, !!previousAccount);
      const nextAccount = accounts[0] ?? "";
      setAccount(nextAccount);
      if (nextAccount.toLowerCase() !== previousAccount.toLowerCase()) {
        setPrivateBalanceUnlockSignature("");
        clearWithdrawalProofBundle();
        clearSelectedSessionNote();
      }
      refreshWalletBalance(nextAccount);
      const walletLabel = providerOption?.label ?? selectedWalletProviderLabel;
      setStatus(
        nextAccount
          ? `Wallet connected${walletLabel ? ` with ${walletLabel}` : ""}: ${shortAddress(nextAccount)}`
          : "No wallet account selected"
      );
    });

  const connectWallet = () => {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const onlyProvider = walletProviderOptions[0]?.provider;
    if (
      walletProviderOptions.length !== 1 ||
      (account && isNamedInjectedWalletProvider(onlyProvider)) ||
      (!selectedWalletProviderId && isNamedInjectedWalletProvider(onlyProvider))
    ) {
      setWalletPickerOpen((open) => !open);
      setStatus("Choose wallet provider");
      return;
    }
    connectWalletWithProvider(walletProviderOptions[0]);
  };

  const disconnectWallet = () => {
    setError("");
    setAccount("");
    setWalletBalanceLabel("");
    setWalletBalanceWei("");
    setPrivateBalanceUnlockSignature("");
    clearWithdrawalProofBundle();
    clearSelectedSessionNote();
    setSelectedWalletProviderId("");
    setWalletPickerOpen(false);
    setProviderStatus(getInjectedWalletOptions(eip6963Providers).length > 0 ? "available" : "missing");
    setStatus("Wallet disconnected");
  };

  const unlockPrivateBalance = async () => {
    setError("");
    setStatus("Requesting private balance unlock");

    try {
      const provider = getProviderOrThrow();
      let selectedAccount = account;
      if (!selectedAccount) {
        setStatus("Requesting wallet account");
        const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
        selectedAccount = accounts[0] ?? "";
        setAccount(selectedAccount);
        refreshWalletBalance(selectedAccount);
      }
      if (!selectedAccount) {
        throw new Error("Connect a wallet account before unlocking private balance.");
      }

      setStatus("Checking configured MegaETH network");
      await ensureConfiguredWalletChain(provider);
      setStatus("Open wallet to unlock private balance");
      const signature = await requestWalletRecoverySignature({
        provider,
        wallet: selectedAccount,
        chainId: runtimeConfig.chainId,
        pool: runtimeConfig.poolAddress,
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt: WALLET_RECOVERY_SCOPE_ISSUED_AT
      });
      setPrivateBalanceUnlockSignature(signature);
      setStatus("Scanning encrypted on-chain notes");
      try {
        const recoveredEntries = await recoverWalletNotesFromChain({
          walletSignature: signature as HexString,
          chainId: runtimeConfig.chainId,
          rpcUrl: runtimeConfig.rpcUrl,
          pool: runtimeConfig.poolAddress,
          fromBlock: runtimeConfig.poolDeploymentBlockHex
        });
        let nextVaultEntries = noteVaultEntries;
        let firstAvailable: SandboxSpendMaterialNoteRecord | null = null;
        const updatedAt = new Date().toISOString();
        let availableRecoveredCount = 0;
        for (const recovered of recoveredEntries) {
          nextVaultEntries = upsertSandboxNoteVaultRecord({
            entries: nextVaultEntries,
            record: recovered.record,
            updatedAt
          });
          if (recovered.spent && recovered.spentNullifier) {
            nextVaultEntries = markSandboxNoteVaultRecordSpent({
              entries: nextVaultEntries,
              commitment: recovered.record.commitment,
              spentNullifier: recovered.spentNullifier,
              updatedAt
            });
          } else if (!firstAvailable) {
            availableRecoveredCount += 1;
            firstAvailable = recovered.record;
          } else {
            availableRecoveredCount += 1;
          }
        }
        if (recoveredEntries.length > 0) {
          persistNoteVaultEntries(nextVaultEntries);
          showRecoveredNoteRecordsInCurrentSession(recoveredEntries.map((recovered) => recovered.record));
          if (firstAvailable) {
            selectNoteRecordForWithdrawal(
              firstAvailable,
              `Recovered ${recoveredEntries.length} encrypted on-chain note${recoveredEntries.length === 1 ? "" : "s"} from configured MegaETH network.`
            );
            setStatus(
              `Scanned encrypted on-chain notes: ${availableRecoveredCount} available of ${recoveredEntries.length} recovered.`
            );
          } else {
            setNoteRecordText("");
            setSpendMaterial(null);
            setWithdrawGrossAmountEth("");
            setNoteRecordStatus(
              `Recovered ${recoveredEntries.length} encrypted on-chain note${recoveredEntries.length === 1 ? "" : "s"}, but no unspent notes are available.`
            );
            setStatus(
              `Scanned encrypted on-chain notes: 0 available of ${recoveredEntries.length} recovered.`
            );
          }
        } else if (!parsedNoteRecord.record) {
          setNoteRecordStatus("Private balance unlocked, but no encrypted on-chain notes were recovered for this wallet.");
          setStatus("Scanned encrypted on-chain notes: none recovered for this wallet.");
        } else {
          setStatus("Scanned encrypted on-chain notes: using the loaded note for this session.");
        }
        setRecoveryScanFailed(false);
      } catch (recoveryError) {
        const recoveryErrorText = errorMessage(recoveryError);
        setRecoveryScanFailed(true);
        setStatus("Private balance unlocked; encrypted on-chain note scan did not complete.");
        setError(`Encrypted on-chain note scan failed: ${recoveryErrorText}`);
        setNoteRecordStatus(`Private balance unlocked, but on-chain recovery scan did not complete: ${recoveryErrorText}`);
      }
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setStatus("Needs attention");
    }
  };

  const switchToConfiguredNetwork = () =>
    runAction("Switching to configured MegaETH network", async (provider) => {
      await ensureConfiguredWalletChain(provider);
    });

  const readCurrentRoot = () =>
    runAction("Reading current root", async (provider) => {
      const root = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
      });
      setCurrentRoot(root);
    });

  const readPoolBalance = () =>
    runAction("Reading pool balance", async (provider) => {
      const balance = await provider.request<string>({
        method: "eth_getBalance",
        params: [getProductRuntimeConfig().poolAddress, "latest"]
      });
      setPoolBalance(formatWeiBalance(balance));
    });

  const createDerivedSpendMaterial = async (amountWei: string): Promise<SandboxSpendMaterial> => {
    const cryptoProvider = window.crypto;
    if (!cryptoProvider?.getRandomValues) {
      throw new Error("Browser crypto randomness is unavailable.");
    }

    const randomMaterial = createSandboxSpendMaterial(cryptoProvider.getRandomValues);
    const materialWithoutCommitment = {
      assetId: randomMaterial.assetId,
      ownerCommitment: randomMaterial.ownerCommitment,
      noteSecret: randomMaterial.noteSecret,
      blinding: randomMaterial.blinding
    };
    const commitment = await deriveBrowserNoteCommitment({
      assetId: materialWithoutCommitment.assetId,
      noteAmountWei: amountWei,
      ownerCommitment: materialWithoutCommitment.ownerCommitment,
      noteSecret: materialWithoutCommitment.noteSecret
    });

    return { ...materialWithoutCommitment, commitment };
  };

  const generateSpendMaterial = async () => {
    setError("");
    setStatus("Generating Poseidon-derived spend material");

    try {
      const material = await createDerivedSpendMaterial(parseSingleFixedDepositEthDecimalToWei(depositAmountEth));
      setSpendMaterial(material);
      setCommitment(material.commitment);
      setCommitmentInserted(null);
      setTxHash("");
      setPendingChangeNote(null);
      setChangeNoteRecordText("");
      setChangeNoteStatus("No private change note generated.");
      setNoteRecordStatus("Fresh Poseidon-derived spend material generated. Export the note after deposit.");
      setNoteRecordAmountWei("");
      setNoteRecordPool("");
      setNoteRecordCommitmentDerivationStatus(SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS);
      setNoteRecordMerklePathStatus(SANDBOX_MERKLE_PATH_STATUS);
      setNoteRecordProofGenerationStatus(SANDBOX_PROOF_GENERATION_STATUS);
      setStatus("Fresh spend material generated");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setStatus("Needs attention");
    }
  };

  const checkCommitment = (candidate = commitment) =>
    runAction("Checking commitment", async (provider) => {
      if (!isHexBytes32(candidate)) {
        throw new Error("Generate a valid bytes32 commitment first.");
      }

      const result = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: encodeCommitmentLookupCalldata(candidate) }, "latest"]
      });
      setCommitmentInserted(boolFromEthCallResult(result));
    });

  const sendDeposit = () =>
    runAction("Sending deposit transaction", async (provider) => {
      assertMainnetValueMovingAllowed(runtimeConfig);
      const depositAmount = parseSingleFixedDepositEthDecimalToWei(depositAmountEth);
      const depositValueHex = parsePositiveWeiToHex(depositAmount);
      let sender = account;
      if (!sender) {
        setStatus("Requesting wallet account");
        const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
        sender = accounts[0] ?? "";
        setAccount(sender);
        refreshWalletBalance(sender);
      }
      if (!sender) {
        throw new Error("Connect a wallet account before sending a deposit.");
      }

      if (!privateBalanceUnlockSignature) {
        throw new Error("Unlock private balance before depositing so the recovery note can be encrypted to your wallet.");
      }

      const secretBag = createEphemeralSecretBag();
      let depositMaterial: SandboxSpendMaterial;
      let depositCommitment: HexString;
      let createdAt: string;
      let hash: HexString;
      try {
        setStatus("Creating browser Poseidon-derived note material");
        depositMaterial = secretBag.trackReference(await createDerivedSpendMaterial(depositAmount));
        depositCommitment = depositMaterial.commitment;
        if (!isHexBytes32(depositCommitment) || !isBn254FieldElement(depositCommitment)) {
          throw new Error("Generated commitment is outside the BN254 field. Try again.");
        }
        setCommitment(depositCommitment);
        setSpendMaterial(depositMaterial);

        createdAt = new Date().toISOString();
        const plaintext = secretBag.trackReference<SpendMaterialPlaintext>({
          version: "spend-material-v1",
          chainId: getProductRuntimeConfig().chainId,
          pool: getProductRuntimeConfig().poolAddress,
          assetId: depositMaterial.assetId,
          noteAmountWei: depositAmount,
          ownerCommitment: depositMaterial.ownerCommitment,
          noteSecret: depositMaterial.noteSecret,
          blinding: depositMaterial.blinding,
          commitment: depositCommitment,
          createdAt
        });
        const recoveryKey = secretBag.trackReference(await deriveWalletRecoveryKey({
          walletSignature: privateBalanceUnlockSignature as HexString,
          chainId: getProductRuntimeConfig().chainId,
          pool: getProductRuntimeConfig().poolAddress,
          appId: NULLARK_RECOVERY_APP_ID,
          recoveryVersion: 1
        }));
        const noteKey = secretBag.trackReference(await deriveNoteKey(recoveryKey, {
          commitment: depositCommitment,
          epochId: getShieldedTransfersRecoveryEpochId({ chainId: getProductRuntimeConfig().chainId })
        }));
        const aad = secretBag.trackBytes(makeRecoveryAssociatedData({
          chainId: getProductRuntimeConfig().chainId,
          pool: getProductRuntimeConfig().poolAddress,
          action: "deposit",
          commitment: depositCommitment,
          encryptionVersion: 1
        }));
        const encryptedEnvelope = secretBag.trackReference(await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad }));
        const encryptedNoteHex = serializeEncryptedNoteEnvelopeToHex(encryptedEnvelope);

        hash = await provider.request<HexString>({
          method: "eth_sendTransaction",
          params: [
            {
              from: sender,
              to: getProductRuntimeConfig().poolAddress,
              value: depositValueHex,
              data: encodeDepositWithEncryptedNoteCalldata(depositCommitment, encryptedNoteHex)
            }
          ]
        });
      } finally {
        secretBag.clear();
      }
      setTxHash(hash);
      setStatus("Waiting for deposit receipt");

      const receipt = await waitForReceipt(provider, hash);
      if (receipt.status !== "0x1") {
        throw new Error("Deposit transaction receipt did not report success.");
      }

      setStatus("Deposit mined; checking commitment");

      const receiptShowsCommitment = receiptIncludesCommitment(receipt, depositCommitment);
      const inserted = receiptShowsCommitment || (await waitForCommitmentInserted(provider, depositCommitment));
      setCommitmentInserted(inserted);

      const root = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
      });
      setCurrentRoot(root);
      const noteRecord = createSandboxSpendMaterialNoteRecord({
        commitment: depositCommitment,
        noteAmountWei: depositAmount,
        ownerCommitment: depositMaterial.ownerCommitment,
        noteSecret: depositMaterial.noteSecret,
        blinding: depositMaterial.blinding,
        depositTxHash: hash,
        currentRootAfter: isHexBytes32(root) ? root : null,
        createdAt,
        commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
        commitmentDerivedFromSpendMaterial: true,
        chainId: runtimeConfig.chainId,
        rpcUrl: runtimeConfig.rpcUrl,
        pool: runtimeConfig.poolAddress
      });
      storeNoteRecordInVault(noteRecord, createdAt);
      setNoteRecordText(serializeSandboxSpendMaterialNoteRecord(noteRecord));
      setNoteRecordStatus(
        inserted
          ? "Encrypted note payload prepared for wallet-level recovery. Unlock private balance to recover spendable notes."
          : "Deposit mined, but the RPC has not confirmed the commitment lookup yet. Use Check commitment again before relying on the record."
      );
      setNoteRecordAmountWei(noteRecord.noteAmountWei);
      setNoteRecordPool(noteRecord.pool);
      setNoteRecordCommitmentDerivationStatus(noteRecord.commitmentDerivationStatus);
      setNoteRecordMerklePathStatus(noteRecord.merklePath.status);
      setNoteRecordProofGenerationStatus(noteRecord.proofGenerationStatus);
      setWithdrawGrossAmountEth(formatWeiToEthDecimal(noteRecord.noteAmountWei));
      setWithdrawFeeWei("");
      setWithdrawNetAmountWei("");
      setWithdrawChangeAmountWei("");
      setPendingChangeNote(null);
      setChangeNoteRecordText("");
      setChangeNoteStatus("No private change note generated.");
    });

  const sendPrivateTransfer = () =>
    runAction("Sending private transfer", async (provider) => {
      assertMainnetValueMovingAllowed(runtimeConfig);
      const record = parsedNoteRecord.record;
      if (!record) {
        throw new Error(parsedNoteRecord.error);
      }

      const destination = privateTransferDestination.trim();
      if (!isEvmAddress(destination)) {
        throw new Error("Enter a valid private transfer destination address.");
      }

      const inserted = await waitForCommitmentInserted(provider, record.commitment, 2);
      if (!inserted) {
        throw new Error("Recovered note commitment was not found on-chain for this shielded pool.");
      }

      const recipientMaterial = await createDerivedSpendMaterial(record.noteAmountWei);
      const receiveCode: PrivateReceiveCode = {
        version: "shielded-receive-code-v1",
        chainId: getProductRuntimeConfig().chainId,
        pool: getProductRuntimeConfig().poolAddress,
        assetId: recipientMaterial.assetId,
        noteAmountWei: record.noteAmountWei,
        ownerCommitment: recipientMaterial.ownerCommitment,
        noteSecret: recipientMaterial.noteSecret,
        commitment: recipientMaterial.commitment,
        encryptedNote: "0x",
        createdAt: new Date().toISOString()
      };

      setStatus("Generating private transfer proof with local-untrusted proof service");
      const bundle = await generateLocalUntrustedPrivateTransferProof(record, receiveCode);
      const proofRoot = bundle.publicInputs[0] ?? "";
      assertPrivateTransferPublicInputBinding({
        publicInputs: bundle.publicInputs,
        nullifier: bundle.nullifier,
        newCommitment: bundle.newCommitment,
        currentRoot: proofRoot,
        expectedPool: runtimeConfig.poolAddress,
        expectedChainId: runtimeConfig.chainId
      });
      const calldata = encodePrivateTransferWithEncryptedNoteCalldata({
        proof: bundle.proof,
        publicInputs: bundle.publicInputs,
        nullifier: bundle.nullifier,
        newCommitment: bundle.newCommitment,
        encryptedNote: bundle.encryptedNote
      });

      try {
        setStatus("Preflighting private transfer against configured MegaETH network");
        await provider.request<string>({
          method: "eth_call",
          params: [{ to: getProductRuntimeConfig().poolAddress, data: calldata }, "latest"]
        });

        let hash: HexString;
        let receipt: TransactionReceipt | undefined;
        if (useLocalRelayer) {
          setStatus("Submitting private transfer through local relayer");
          const relayed = await relayPoolTransaction(calldata);
          hash = relayed.txHash;
          receipt = relayed.receipt;
        } else {
          let sender = account;
          if (!sender) {
            setStatus("Open wallet to connect");
            const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
            sender = accounts[0] ?? "";
            setAccount(sender);
            refreshWalletBalance(sender);
          }
          if (!sender) {
            throw new Error("Connect a wallet account before sending without the local relayer.");
          }
          setStatus("Open wallet to confirm private transfer");
          hash = await provider.request<HexString>({
            method: "eth_sendTransaction",
            params: [{ from: sender, to: getProductRuntimeConfig().poolAddress, value: "0x0", data: calldata }]
          });
        }

        setPrivateTransferTxHash(hash);
        setPrivateTransferNullifier(bundle.nullifier);
        setStatus("Waiting for private transfer receipt");
        const finalReceipt = receipt?.logs?.length ? receipt : await waitForReceipt(provider, hash);
        if (finalReceipt.status !== "0x1") {
          throw new Error("Private transfer transaction receipt did not report success.");
        }
        markPrivateTransferSourceSpent({ record, nullifier: bundle.nullifier });
        setNoteRecordStatus(
          `Private transfer sent to ${shortAddress(destination)}. The old local note is marked spent and the new shielded commitment is ${bundle.newCommitment}.`
        );
        const commitmentInserted =
          receiptIncludesCommitment(finalReceipt, bundle.newCommitment) ||
          (await waitForCommitmentInserted(provider, bundle.newCommitment, 12));
        if (!commitmentInserted) {
          throw new Error("Private transfer mined, but the recipient commitment lookup did not confirm yet.");
        }
      } catch (caughtError) {
        if (isNullifierAlreadySpentError(caughtError)) {
          markPrivateTransferSourceSpent({ record, nullifier: bundle.nullifier });
          setNoteRecordStatus(
            "Selected note was already spent on-chain. It has been marked spent locally; unlock or select another note before sending again."
          );
          throw new Error(
            "Selected note was already spent on-chain. Marked it spent locally; unlock or select another note before sending again."
          );
        }
        throw caughtError;
      }
      setStatus("Ready");
    });

  const importNoteRecord = async () => {
    setError("");
    try {
      const record = parseSandboxSpendMaterialNoteRecord(noteRecordText, runtimeConfig.poolAddress);
      setCommitment(record.commitment);
      setCommitmentInserted(null);
      setTxHash(record.depositTxHash);
      setCurrentRoot(record.currentRootAfter ?? "");
      setDepositAmountEth(formatWeiToEthDecimal(record.noteAmountWei));
      setWithdrawGrossAmountEth(formatWeiToEthDecimal(record.noteAmountWei));
      clearWithdrawalProofBundle();
      setSpendMaterial(spendMaterialFromNoteRecord(record));
      storeNoteRecordInVault(record);
      setNoteRecordText(serializeSandboxSpendMaterialNoteRecord(record));
      setNoteRecordStatus(
        record.commitmentDerivedFromSpendMaterial
          ? "Existing spend-material note restored into the local sandbox note vault. Enter a destination and send withdrawal; the sandbox will generate the local-untrusted proof before wallet confirmation."
          : "Spend-material note imported, but its commitment is not Poseidon-derived and cannot generate a contract-verifiable proof."
      );
      setNoteRecordAmountWei(record.noteAmountWei);
      setNoteRecordPool(record.pool);
      setNoteRecordCommitmentDerivationStatus(record.commitmentDerivationStatus);
      setNoteRecordMerklePathStatus(record.merklePath.status);
      setNoteRecordProofGenerationStatus(record.proofGenerationStatus);
      setGuidedAttention("");

      const provider = getInjectedProvider(selectedWalletProviderId || null, eip6963Providers);
      if (!provider) {
        setProviderStatus("missing");
        setStatus("Saved note restored; commitment not checked");
        return;
      }

      setProviderStatus("available");
      setStatus("Saved note restored; checking commitment");
      const inserted = await waitForCommitmentInserted(provider, record.commitment, 2);
      setCommitmentInserted(inserted);
      setStatus("Saved note restored");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setStatus("Needs attention");
    }
  };

  const checkNullifier = (candidate = withdrawNullifier) =>
    runAction("Checking nullifier", async (provider) => {
      if (!isHexBytes32(candidate)) {
        throw new Error("Enter a valid bytes32 nullifier first.");
      }

      const result = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: encodeNullifierLookupCalldata(candidate) }, "latest"]
      });
      setNullifierSpent(boolFromEthCallResult(result));
    });

  const selectedWithdrawalGrossAmountWei = (record: SandboxSpendMaterialNoteRecord): string => {
    if (usesFixedDenominationExitChoices) {
      const choices = spendablePublicExitChoicesForNote(record.noteAmountWei);
      if (choices.length === 0) {
        throw new Error("No available exit amount for the selected private note.");
      }
      if (withdrawGrossAmountEth.trim()) {
        try {
          const selectedWei = parseEthDecimalToWei(withdrawGrossAmountEth);
          if (choices.some((choice) => choice.grossAmountWei === selectedWei)) {
            return selectedWei;
          }
        } catch {
          // Fall through to the largest valid choice for the selected note.
        }
      }
      const largestChoice = choices[0];
      if (!largestChoice) {
        throw new Error("No available exit amount for the selected private note.");
      }
      return largestChoice.grossAmountWei;
    }

    return withdrawGrossAmountEth.trim() ? parseEthDecimalToWei(withdrawGrossAmountEth) : record.noteAmountWei;
  };

  const spendPlaintextFromNoteRecord = (record: SandboxSpendMaterialNoteRecord): SpendMaterialPlaintext => ({
    version: "spend-material-v1",
    chainId: getProductRuntimeConfig().chainId,
    pool: getProductRuntimeConfig().poolAddress,
    assetId: record.assetId,
    noteAmountWei: record.noteAmountWei,
    ownerCommitment: record.ownerCommitment,
    noteSecret: record.noteSecret,
    blinding: record.blinding,
    commitment: record.commitment,
    createdAt: record.createdAt
  });

  const encryptSpendMaterialForWalletRecovery = async (
    plaintext: SpendMaterialPlaintext,
    action: EncryptedNoteV1Action
  ): Promise<HexString> => {
    if (!privateBalanceUnlockSignature) {
      throw new Error("Unlock private balance before sending a transaction that creates recoverable shielded change.");
    }

    const secretBag = createEphemeralSecretBag();
    try {
      const recoveryKey = secretBag.trackReference(await deriveWalletRecoveryKey({
        walletSignature: privateBalanceUnlockSignature as HexString,
        chainId: getProductRuntimeConfig().chainId,
        pool: getProductRuntimeConfig().poolAddress,
        appId: NULLARK_RECOVERY_APP_ID,
        recoveryVersion: 1
      }));
      const noteKey = secretBag.trackReference(await deriveNoteKey(recoveryKey, {
        commitment: plaintext.commitment,
        epochId: getShieldedTransfersRecoveryEpochId({ chainId: getProductRuntimeConfig().chainId })
      }));
      const aad = secretBag.trackBytes(makeRecoveryAssociatedData({
        chainId: getProductRuntimeConfig().chainId,
        pool: getProductRuntimeConfig().poolAddress,
        action,
        commitment: plaintext.commitment,
        encryptionVersion: 1
      }));
      const encryptedEnvelope = secretBag.trackReference(await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad }));
      return serializeEncryptedNoteEnvelopeToHex(encryptedEnvelope);
    } finally {
      secretBag.clear();
    }
  };

  const buildWithdrawalProofBundle = async (record: SandboxSpendMaterialNoteRecord): Promise<BrowserWithdrawalProofBundle> => {
    assertRecoveryScanHealthyForSpend();
    if (!record.commitmentDerivedFromSpendMaterial) {
      throw new Error("Recovered note commitment is not Poseidon-derived from spend material; proof generation is blocked.");
    }
    const destination = withdrawDestination.trim();
    if (!isEvmAddress(destination)) {
      throw new Error("Enter the withdrawal destination EVM address before generating a proof.");
    }

    const grossAmountWei = selectedWithdrawalGrossAmountWei(record);
    if (BigInt(grossAmountWei) > BigInt(record.noteAmountWei)) {
      throw new Error(
        `Withdrawal amount exceeds available note amount (${formatWeiToEthDecimal(record.noteAmountWei)} ETH).`
      );
    }
    if (usesFixedDenominationExitChoices && !isSupportedFixedDenominationWei(record.noteAmountWei)) {
      throw new Error(
        `This private note is ${formatWeiToEthDecimal(record.noteAmountWei)} ETH, which this pool cannot exit. Use a supported private note.`
      );
    }
      if (usesFixedDenominationExitChoices) {
        const choices = spendablePublicExitChoicesForNote(record.noteAmountWei);
        if (!choices.some((choice) => choice.grossAmountWei === grossAmountWei)) {
          throw new Error(
            "Choose one of the available exit amounts for this private note."
          );
        }
      }
    try {
      setStatus("Reconstructing accepted Merkle path in browser");
      const merklePath = restoredMerklePathPayload(record) ?? await reconstructAcceptedBrowserMerklePath(record.commitment);
      if (record.leafIndex !== null && record.leafIndex !== undefined && record.leafIndex !== merklePath.leafIndex) {
        throw new Error("Recovered note leafIndex does not match on-chain RootAccepted history.");
      }

      const note = spendPlaintextFromNoteRecord(record);
      setStatus("Building withdrawal witness in browser");
      const witnessBundle = await buildBrowserWithdrawWitness({
        note,
        merklePath,
        destination,
        grossAmountWei,
        chainId: getProductRuntimeConfig().chainId,
        pool: getProductRuntimeConfig().poolAddress,
        merkleTreeDepth: getProductRuntimeConfig().merkleTreeDepth,
        encryptChangeNote: (changeNote) => encryptSpendMaterialForWalletRecovery(changeNote, "withdraw-change")
      });

      setStatus("Checking trusted prover deployment metadata");
      await assertProductProverTrustedForBrowserProof();

      let proof: WithdrawProofWorkerResult | null = null;
      let verifierAcceptedProof: HexString | null = null;
      let lastProofError: unknown;
      for (let attempt = 1; attempt <= WITHDRAWAL_PROOF_VERIFIER_ATTEMPTS; attempt += 1) {
        try {
          setStatus(
            attempt === 1
              ? "Generating withdrawal proof in browser"
              : `Regenerating withdrawal proof after verifier self-check failed (${attempt}/${WITHDRAWAL_PROOF_VERIFIER_ATTEMPTS})`
          );
          proof = await createDefaultWithdrawProofWorkerClient().generate({
            id: crypto.randomUUID(),
            witness: witnessBundle.witness
          });
          validateWithdrawProofIntent(proof.publicInputs, witnessBundle.intent);
          setStatus("Checking withdrawal proof against deployed verifier");
          verifierAcceptedProof = await selectVerifierAcceptedWithdrawalProof({
            proof: proof.proof,
            proofCandidates: proof.proofCandidates ?? [],
            publicInputs: proof.publicInputs
          });
          break;
        } catch (error) {
          lastProofError = error;
          proof = null;
          verifierAcceptedProof = null;
          if (!isVerifierSelfCheckFailure(error) || attempt === WITHDRAWAL_PROOF_VERIFIER_ATTEMPTS) {
            throw error;
          }
          await delay(WITHDRAWAL_PROOF_VERIFIER_RETRY_DELAY_MS);
        }
      }
      if (!proof || !verifierAcceptedProof) {
        throw lastProofError instanceof Error ? lastProofError : new Error("Withdrawal proof verifier self-check failed.");
      }

      return {
        proof: verifierAcceptedProof,
        publicInputs: proof.publicInputs,
        nullifier: witnessBundle.nullifier,
        destination,
        grossAmountWei: witnessBundle.intent.grossAmountWei,
        feeWei: witnessBundle.intent.feeWei,
        netAmountWei: witnessBundle.netAmountWei,
        changeAmountWei: witnessBundle.changeNote ? witnessBundle.changeNote.noteAmountWei : "0",
        changeNote: witnessBundle.changeNote,
        encryptedChangeNote: witnessBundle.encryptedChangeNote
      };
    } catch (error) {
      const runtimeConfig = getProductRuntimeConfig();
      if (!runtimeConfig.allowLocalDevProofServiceFallback || !isLocalDevHost()) {
        throw error;
      }
      setStatus("Using local dev proof service fallback");
      return generateLocalUntrustedWithdrawalProof(record, destination, grossAmountWei);
    }
  };

  const applyWithdrawalProofBundle = (bundle: BrowserWithdrawalProofBundle) => {
    setWithdrawProof(bundle.proof);
    setWithdrawPublicInputs(bundle.publicInputs.join("\n"));
    setWithdrawNullifier(bundle.nullifier);
    setWithdrawDestination(bundle.destination);
    setWithdrawGrossAmountEth(formatWeiToEthDecimal(bundle.grossAmountWei));
    setWithdrawFeeWei(bundle.feeWei);
    setWithdrawNetAmountWei(bundle.netAmountWei);
    setWithdrawChangeAmountWei(bundle.changeAmountWei);
    setPendingChangeNote(bundle.changeNote);
    setPendingEncryptedChangeNote(bundle.encryptedChangeNote);
    setChangeNoteRecordText("");
    setChangeNoteStatus(
      bundle.changeNote
        ? `${formatWeiToEthDecimal(bundle.changeAmountWei)} ETH remains private.`
        : "Full-note withdrawal proof generated; no private change note."
    );
    setNullifierSpent(null);
    setGuidedAttention("");
  };

  async function restoreProveAndSendWithdrawal(record: SandboxSpendMaterialNoteRecord) {
    setError("");
    setStatus("Preparing withdrawal from recovered note");
    setWithdrawalSuccessToast(null);
    try {
      assertMainnetValueMovingAllowed(runtimeConfig);
      const provider = getProviderOrThrow();

      setCommitment(record.commitment);
      setCommitmentInserted(null);
      setTxHash(record.depositTxHash);
      setCurrentRoot(record.currentRootAfter ?? "");
      setDepositAmountEth(formatWeiToEthDecimal(record.noteAmountWei));
      setWithdrawGrossAmountEth(formatWeiToEthDecimal(selectedWithdrawalGrossAmountWei(record)));
      clearWithdrawalProofBundle();
      setSpendMaterial(spendMaterialFromNoteRecord(record));
      setNoteRecordStatus("Recovered note loaded. Checking on-chain commitment before proving.");
      setNoteRecordAmountWei(record.noteAmountWei);
      setNoteRecordPool(record.pool);
      setNoteRecordCommitmentDerivationStatus(record.commitmentDerivationStatus);
      setNoteRecordMerklePathStatus(record.merklePath.status);
      setNoteRecordProofGenerationStatus(record.proofGenerationStatus);
      setGuidedAttention("");

      const inserted = await waitForCommitmentInserted(provider, record.commitment, 2);
      setCommitmentInserted(inserted);
      if (!inserted) {
        throw new Error("Recovered note commitment was not found on-chain for this shielded pool.");
      }

      setStatus("Generating withdrawal proof");
      const bundle = await buildWithdrawalProofBundle(record);
      applyWithdrawalProofBundle(bundle);

      setStatus("Validating withdrawal public inputs");
      const root = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
      });
      setCurrentRoot(root);
      const proofRoot = bundle.publicInputs[0] ?? "";
      validateWithdrawProofIntent(bundle.publicInputs, {
        root: proofRoot as HexString,
        nullifier: bundle.nullifier,
        changeCommitment: bundle.changeNote?.commitment ?? ZERO_BYTES32,
        destination: bundle.destination,
        grossAmountWei: bundle.grossAmountWei,
        feeWei: bundle.feeWei,
        chainId: getProductRuntimeConfig().chainId,
        pool: getProductRuntimeConfig().poolAddress,
        spentCommitment: bundle.publicInputs[8] ?? ZERO_BYTES32,
        noteAmountWei: bytes32ToDecimal(bundle.publicInputs[9] ?? ZERO_BYTES32),
        proofContextHash: bundle.publicInputs[10] ?? ZERO_BYTES32,
        encryptedNoteHash: bundle.publicInputs[11] ?? ZERO_BYTES32
      });
      assertWithdrawPublicInputBinding({
        publicInputs: bundle.publicInputs,
        nullifier: bundle.nullifier,
        destination: bundle.destination,
        grossAmountWei: bundle.grossAmountWei,
        currentRoot: proofRoot,
        changeCommitment: bundle.changeNote?.commitment,
        expectedPool: runtimeConfig.poolAddress,
        expectedChainId: runtimeConfig.chainId
      });

      const calldata = bundle.changeNote
        ? encodeStageCWithdrawChangeNoteCalldata({
            proof: bundle.proof,
            publicInputs: bundle.publicInputs,
            nullifier: bundle.nullifier,
            destination: bundle.destination,
            grossAmountWei: bundle.grossAmountWei,
            encryptedChangeNote: bundle.encryptedChangeNote,
            minNetAmountWei: bundle.netAmountWei,
            maxFeeWei: bundle.feeWei
          })
        : encodeWithdrawBoundedCalldata({
            proof: bundle.proof,
            publicInputs: bundle.publicInputs,
            nullifier: bundle.nullifier,
            destination: bundle.destination,
            grossAmountWei: bundle.grossAmountWei,
            minNetAmountWei: bundle.netAmountWei,
            maxFeeWei: bundle.feeWei
          });

      setStatus("Preflighting withdrawal against configured MegaETH network");
      await assertWithdrawalPreflightSucceeds(provider, calldata, {
        onRetry: (attempt, maxAttempts) => {
          setStatus(`Waiting for MegaETH root propagation (${attempt}/${maxAttempts})`);
        }
      });

      setStatus("Submitting public exit through withdrawal relayer");
      const relayed = await relayPoolTransaction(calldata);
      const hash = relayed.txHash;
      const receipt = relayed.receipt;
      setWithdrawTxHash(hash);
      setLastRelaySender(receipt?.from ?? relayed.relayer);
      setLastRelayTarget(receipt?.to ?? getProductRuntimeConfig().poolAddress);
      setNullifierSpent(null);
      setStatus("Waiting for withdrawal receipt");

      const finalReceipt = receipt?.logs?.length ? receipt : await waitForReceipt(provider, hash);
      if (finalReceipt.status !== "0x1") {
        throw new Error("Withdrawal transaction receipt did not report success.");
      }

      setStatus("Withdrawal mined; checking nullifier");

      const result = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: encodeNullifierLookupCalldata(bundle.nullifier) }, "latest"]
      });
      const nullifierConfirmedSpent = boolFromEthCallResult(result);
      setNullifierSpent(nullifierConfirmedSpent);
      if (!nullifierConfirmedSpent) {
        throw new Error("Withdrawal mined, but the nullifier lookup did not confirm the spend yet.");
      }
      let nextVaultEntries = markSandboxNoteVaultRecordSpent({
        entries: noteVaultEntries,
        commitment: record.commitment,
        spentNullifier: bundle.nullifier,
        updatedAt: new Date().toISOString()
      });
      persistNoteVaultEntries(nextVaultEntries);

      if (bundle.changeNote) {
        const inserted =
          receiptIncludesCommitment(finalReceipt, bundle.changeNote.commitment) ||
          (await waitForCommitmentInserted(provider, bundle.changeNote.commitment, 12));
        if (!inserted) {
          throw new Error("Withdrawal mined, but the change commitment lookup did not confirm yet.");
        }
        const rootAfterWithdrawal = await provider.request<string>({
          method: "eth_call",
          params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
        });
        setCurrentRoot(rootAfterWithdrawal);
        const changeRecord = createSandboxSpendMaterialNoteRecord({
          assetId: bundle.changeNote.assetId,
          commitment: bundle.changeNote.commitment,
          noteAmountWei: bundle.changeNote.noteAmountWei,
          ownerCommitment: bundle.changeNote.ownerCommitment,
          noteSecret: bundle.changeNote.noteSecret,
          blinding: bundle.changeNote.blinding,
          depositTxHash: hash,
          currentRootAfter: isHexBytes32(rootAfterWithdrawal) ? rootAfterWithdrawal : null,
          createdAt: bundle.changeNote.createdAt,
          chainId: runtimeConfig.chainId,
          rpcUrl: runtimeConfig.rpcUrl,
          pool: runtimeConfig.poolAddress,
          commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
          commitmentDerivedFromSpendMaterial: true
        });
        nextVaultEntries = upsertSandboxNoteVaultRecord({
          entries: nextVaultEntries,
          record: changeRecord,
          updatedAt: changeRecord.createdAt
        });
        persistNoteVaultEntries(nextVaultEntries);
        showNoteRecordInCurrentSession(changeRecord);
        selectNoteRecordForWithdrawal(
          changeRecord,
          "Private change note selected for the next public exit."
        );
        setChangeNoteRecordText(serializeSandboxSpendMaterialNoteRecord(changeRecord));
        setChangeNoteStatus(
          "Withdrawal mined and change commitment confirmed. Change note was saved into the local sandbox note vault."
        );
      } else {
        selectNextUnspentNoteAfterWithdrawal(nextVaultEntries, record.commitment);
      }

      setStatus("Ready");
      setWithdrawalSuccessToast({
        title: "Withdrawal complete",
        detail: `${formatWeiToEthDecimal(bundle.netAmountWei)} ETH sent to ${shortAddress(bundle.destination)}`,
        txHash: hash
      });
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      setStatus("Needs attention");
    }
  }

  const sendWithdrawal = () =>
    runAction("Sending withdrawal transaction", async (provider) => {
      assertMainnetValueMovingAllowed(runtimeConfig);
      assertRecoveryScanHealthyForSpend();
      setWithdrawalSuccessToast(null);
      const publicInputs = parsePublicInputsText(withdrawPublicInputs);
      const root = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
      });
      setCurrentRoot(root);
      const publicChangeCommitment = publicInputs[2] ?? ZERO_BYTES32;
      if (publicChangeCommitment !== ZERO_BYTES32 && !pendingChangeNote) {
        throw new Error("Withdrawal proof includes a private change commitment, but matching private change note material is not loaded.");
      }
      if (publicChangeCommitment !== ZERO_BYTES32 && pendingEncryptedChangeNote === "0x") {
        throw new Error("Withdrawal proof includes a private change commitment, but matching encrypted private change note is not loaded.");
      }
      const withdrawGrossAmountWei = parseEthDecimalToWei(withdrawGrossAmountEth);
      assertWithdrawPublicInputBinding({
        publicInputs,
        nullifier: withdrawNullifier,
        destination: withdrawDestination,
        grossAmountWei: withdrawGrossAmountWei,
        currentRoot: root,
        changeCommitment: pendingChangeNote?.commitment,
        expectedPool: runtimeConfig.poolAddress,
        expectedChainId: runtimeConfig.chainId
      });

      const calldata = pendingChangeNote
        ? encodeStageCWithdrawChangeNoteCalldata({
            proof: withdrawProof,
            publicInputs,
            nullifier: withdrawNullifier,
            destination: withdrawDestination,
            grossAmountWei: withdrawGrossAmountWei,
            encryptedChangeNote: pendingEncryptedChangeNote,
            minNetAmountWei: withdrawNetAmountWei || "0",
            maxFeeWei: withdrawFeeWei || withdrawGrossAmountWei
          })
        : encodeWithdrawBoundedCalldata({
            proof: withdrawProof,
            publicInputs,
            nullifier: withdrawNullifier,
            destination: withdrawDestination,
            grossAmountWei: withdrawGrossAmountWei,
            minNetAmountWei: withdrawNetAmountWei || "0",
            maxFeeWei: withdrawFeeWei || withdrawGrossAmountWei
          });

      setStatus("Preflighting withdrawal against configured MegaETH network");
      await assertWithdrawalPreflightSucceeds(provider, calldata, {
        onRetry: (attempt, maxAttempts) => {
          setStatus(`Waiting for MegaETH root propagation (${attempt}/${maxAttempts})`);
        }
      });

      setStatus("Submitting public exit through withdrawal relayer");
      const relayed = await relayPoolTransaction(calldata);
      const hash = relayed.txHash;
      const receipt = relayed.receipt;
      setWithdrawTxHash(hash);
      setLastRelaySender(receipt?.from ?? relayed.relayer);
      setLastRelayTarget(receipt?.to ?? getProductRuntimeConfig().poolAddress);
      setNullifierSpent(null);
      setStatus("Waiting for withdrawal receipt");

      const finalReceipt = receipt?.logs?.length ? receipt : await waitForReceipt(provider, hash);
      if (finalReceipt.status !== "0x1") {
        throw new Error("Withdrawal transaction receipt did not report success.");
      }

      setStatus("Withdrawal mined; checking nullifier");

      const result = await provider.request<string>({
        method: "eth_call",
        params: [{ to: getProductRuntimeConfig().poolAddress, data: encodeNullifierLookupCalldata(withdrawNullifier) }, "latest"]
      });
      const nullifierConfirmedSpent = boolFromEthCallResult(result);
      setNullifierSpent(nullifierConfirmedSpent);
      if (!nullifierConfirmedSpent) {
        throw new Error("Withdrawal mined, but the nullifier lookup did not confirm the spend yet.");
      }
      let nextVaultEntries = noteVaultEntries;
      try {
        const record = parseSandboxSpendMaterialNoteRecord(noteRecordText, runtimeConfig.poolAddress);
        nextVaultEntries = markSandboxNoteVaultRecordSpent({
          entries: noteVaultEntries,
          commitment: record.commitment,
          spentNullifier: withdrawNullifier,
          updatedAt: new Date().toISOString()
        });
        persistNoteVaultEntries(nextVaultEntries);
      } catch {
        const spentCommitment = publicInputs[8];
        if (typeof spentCommitment === "string" && isHexBytes32(spentCommitment) && spentCommitment !== ZERO_BYTES32) {
          nextVaultEntries = markSandboxNoteVaultRecordSpent({
            entries: noteVaultEntries,
            commitment: spentCommitment,
            spentNullifier: withdrawNullifier,
            updatedAt: new Date().toISOString()
          });
          persistNoteVaultEntries(nextVaultEntries);
        }
      }

      if (pendingChangeNote) {
        const inserted =
          receiptIncludesCommitment(finalReceipt, pendingChangeNote.commitment) ||
          (await waitForCommitmentInserted(provider, pendingChangeNote.commitment, 12));
        if (!inserted) {
          throw new Error("Withdrawal mined, but the change commitment lookup did not confirm yet.");
        }
        const rootAfterWithdrawal = await provider.request<string>({
          method: "eth_call",
          params: [{ to: getProductRuntimeConfig().poolAddress, data: CURRENT_ROOT_CALLDATA }, "latest"]
        });
        setCurrentRoot(rootAfterWithdrawal);
        const changeRecord = createSandboxSpendMaterialNoteRecord({
          assetId: pendingChangeNote.assetId,
          commitment: pendingChangeNote.commitment,
          noteAmountWei: pendingChangeNote.noteAmountWei,
          ownerCommitment: pendingChangeNote.ownerCommitment,
          noteSecret: pendingChangeNote.noteSecret,
          chainId: runtimeConfig.chainId,
          rpcUrl: runtimeConfig.rpcUrl,
          pool: runtimeConfig.poolAddress,
          blinding: pendingChangeNote.blinding,
          depositTxHash: hash,
          currentRootAfter: isHexBytes32(rootAfterWithdrawal) ? rootAfterWithdrawal : null,
          createdAt: new Date().toISOString(),
          commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
          commitmentDerivedFromSpendMaterial: true
        });
        nextVaultEntries = upsertSandboxNoteVaultRecord({
          entries: nextVaultEntries,
          record: changeRecord,
          updatedAt: changeRecord.createdAt
        });
        persistNoteVaultEntries(nextVaultEntries);
        showNoteRecordInCurrentSession(changeRecord);
        selectNoteRecordForWithdrawal(
          changeRecord,
          "Private change note selected for the next public exit."
        );
        setChangeNoteRecordText(serializeSandboxSpendMaterialNoteRecord(changeRecord));
        setChangeNoteStatus(
          "Withdrawal mined and private change commitment confirmed. Encrypted private change note is available for wallet-level recovery."
        );
      } else {
        try {
          const spentRecord = parseSandboxSpendMaterialNoteRecord(noteRecordText, runtimeConfig.poolAddress);
          selectNextUnspentNoteAfterWithdrawal(nextVaultEntries, spentRecord.commitment);
        } catch {
          // Manual proof-bundle mode may not have a selected local note to replace.
        }
      }
      setWithdrawalSuccessToast({
        title: "Withdrawal complete",
        detail: `${formatWeiToEthDecimal(withdrawNetAmountWei || "0")} ETH sent to ${shortAddress(withdrawDestination)}`,
        txHash: hash
      });
    });

  const depositDenominations = fixedDepositDenominationLabels();
  const popularDepositDenominations = ["0.01", "0.05", "0.1", "0.5", "1"];
  const walletBalanceBigInt = walletBalanceWei ? BigInt(walletBalanceWei) : null;
  const walletEligibleDepositDenominations =
    walletBalanceBigInt === null
      ? depositDenominations
      : depositDenominations.filter((amount) => BigInt(parseEthDecimalToWei(amount)) <= walletBalanceBigInt);
  const visibleDepositDenominations = walletEligibleDepositDenominations.filter((amount) =>
    popularDepositDenominations.includes(amount)
  );
  const overflowDepositDenominations = walletEligibleDepositDenominations.filter(
    (amount) => !popularDepositDenominations.includes(amount)
  );
  const overflowDepositSelected = overflowDepositDenominations.includes(depositAmountEth);
  const depositOptionCountLabel =
    walletBalanceBigInt === null
      ? `${depositDenominations.length} supported ${depositDenominations.length === 1 ? "amount" : "amounts"}`
      : `${walletEligibleDepositDenominations.length} fit wallet balance`;
  const connectedWalletBalanceLabel = account ? walletBalanceLabel || "Reading balance..." : "Connect wallet";
  const spendableNoteEntries = visibleNoteVaultEntries.filter((entry) => !entry.spent);
  const selectedNoteCommitment = parsedNoteRecord.record
    ? normalizeSandboxNoteCommitment(parsedNoteRecord.record.commitment)
    : "";
  const noteGroups = spendableNoteEntries
    .reduce<Array<{ amountWei: string; amountEth: string; entries: SandboxNoteVaultEntry[] }>>((groups, entry) => {
      const amountWei = entry.record.noteAmountWei;
      const existing = groups.find((group) => group.amountWei === amountWei);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.push({
          amountWei,
          amountEth: formatWeiToEthDecimal(amountWei),
          entries: [entry]
        });
      }
      return groups;
    }, [])
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt))
    }))
    .sort((left, right) => {
      const byAmount = BigInt(right.amountWei) - BigInt(left.amountWei);
      return byAmount === 0n ? 0 : byAmount > 0n ? 1 : -1;
    });
  const currentRootLabel = currentRoot ? shortAddress(currentRoot) : "not read";
  const poolAddressLabel = shortAddress(getProductRuntimeConfig().poolAddress);
  const withdrawalRelayerEndpoint = relayerEndpointForRuntime(runtimeConfig);
  const withdrawalRelayerLabel = relayerEndpointLabel(withdrawalRelayerEndpoint);
  const poolUsedLeaves = poolStats?.nextLeafIndex ?? "";
  const poolCapacity = poolStats?.capacity ?? "";
  const poolRemainingLeaves =
    poolStats && BigInt(poolStats.capacity) >= BigInt(poolStats.nextLeafIndex)
      ? (BigInt(poolStats.capacity) - BigInt(poolStats.nextLeafIndex)).toString()
      : "";
  const poolUsedPercent =
    poolStats && BigInt(poolStats.capacity) > 0n
      ? `${Number((BigInt(poolStats.nextLeafIndex) * 10_000n) / BigInt(poolStats.capacity)) / 100}%`
      : "";
  const poolAnonymitySetLabel = poolStats ? `${formatWholeNumber(poolUsedLeaves)} notes` : "not read";
  const poolLiquidityLabel = poolStats ? formatEthAmount(poolStats.balanceWei) : "not read";
  const poolDepositedLabel = poolStats ? formatEthAmount(poolStats.totalDepositedWei) : "not read";
  const poolWithdrawnLabel = poolStats ? formatEthAmount(poolStats.totalWithdrawnWei) : "not read";
  const poolFeeLabel = poolStats ? `${poolStats.withdrawalFeeBps} bps` : "not read";
  const selectedWithdrawLabel = withdrawGrossAmountEth.trim() ? `${withdrawGrossAmountEth} ETH` : "0 ETH";
  const withdrawFeePreview = calculateWithdrawFeePreview(withdrawGrossAmountEth);
  const visibleWithdrawFeeWei = withdrawFeeWei || withdrawFeePreview?.feeWei || "";
  const visibleWithdrawNetAmountWei = withdrawNetAmountWei || withdrawFeePreview?.netWei || "";
  const formattedStatus = formatProductStatus(status);
  const showStatusPanel = !["Idle", "Ready"].includes(formattedStatus);
  const statusLower = status.toLowerCase();
  const balanceUnlockInFlight =
    /requesting private balance unlock|requesting wallet account|checking configured megaeth network|open wallet to unlock private balance|scanning encrypted/.test(
      statusLower
    );
  const balanceUnlockLabel = balanceUnlockInFlight
    ? "Scanning notes"
    : recoveryScanFailed
      ? "Scan failed"
      : privateBalanceUnlockSignature
        ? "Private balance unlocked"
        : "Unlock private balance";
  const depositProgressRequested =
    actionInFlight &&
    /sending deposit transaction|creating browser poseidon-derived note material|waiting for deposit receipt|deposit mined; checking commitment|checking commitment/.test(
      statusLower
    );
  const withdrawProgressRequested =
    actionInFlight &&
    /reconstructing accepted merkle path|building withdrawal witness|checking trusted prover|checking withdrawal proof|using local dev proof service|generating withdrawal proof|validating withdrawal public inputs|preflighting withdrawal|waiting for megaeth root propagation|submitting public exit|waiting for withdrawal receipt|withdrawal mined; checking nullifier/.test(
      statusLower
    );
  const liveProgress = depositProgressRequested
    ? createLiveProgressModel("Deposit progress", formattedStatus, [
        {
          title: "Wallet ready",
          detail: account ? shortAddress(account) : "Waiting for wallet",
          done: !!account,
          active: /requesting wallet|checking configured|open wallet/.test(statusLower)
        },
        {
          title: "Private note created",
          detail: commitment ? shortAddress(commitment) : "Creating note material",
          done: !!commitment || !!spendMaterial,
          active: /spend material|note material|poseidon/.test(statusLower)
        },
        {
          title: "Deposit submitted",
          detail: txHash ? shortAddress(txHash) : "Waiting for wallet confirmation",
          done: !!txHash,
          active: /deposit receipt/.test(statusLower)
        },
        {
          title: "Pool indexed",
          detail: commitmentInserted === true ? "Commitment found" : "Checking pool state",
          done: commitmentInserted === true,
          active: /checking commitment|commitment/.test(statusLower)
        }
      ])
    : withdrawProgressRequested
      ? createLiveProgressModel("Withdraw progress", formattedStatus, [
          {
            title: "Proof",
            detail: withdrawProof ? "Verifier self-check passed" : "Generating browser proof",
            done: !!withdrawProof,
            active: /merkle|proof|verifier|public inputs|trusted prover|local dev proof service/.test(statusLower)
          },
          {
            title: "Submit",
            detail: withdrawTxHash ? shortAddress(withdrawTxHash) : "Waiting for transaction hash",
            done: !!withdrawTxHash,
            active: /preflighting|root propagation|relayer|submitting public exit|withdrawal receipt/.test(statusLower)
          },
          {
            title: "Confirm",
            detail: nullifierSpent === true ? "Nullifier marked spent" : "Checking final state",
            done: nullifierSpent === true,
            active: /withdrawal mined|checking nullifier/.test(statusLower)
          }
        ])
      : null;
  const liveProgressToastRows = liveProgress ? createLiveProgressToastRows(liveProgress) : [];

  return (
    <section
      id="nullark-console"
      className="nullark-panel nullark-shell"
      aria-label={`Nullark shielded ${runtimeConfig.networkName} console`}
    >
      <div className="nullark-bg" aria-hidden="true" />
      <header className="nullark-header">
        <div className="nullark-network-cluster">
          <div className="nullark-panel__network nullark-network-dropdown" ref={networkDropdownRef}>
            <MegaEthMark className="nullark-network-icon" />
            <button
              type="button"
              aria-label="Network"
              aria-haspopup="listbox"
              aria-expanded={networkDropdownOpen}
              className="nullark-network-dropdown__trigger"
              onClick={() => setNetworkDropdownOpen((open) => !open)}
              disabled={actionInFlight}
            >
              <span className="nullark-network-label-full">{activeRuntimeNetworkLabel}</span>
              <span className="nullark-network-label-short">{activeRuntimeNetworkShortLabel}</span>
              <ChevronDownIcon className="nullark-network-dropdown__chevron" />
            </button>
            <div
              className={networkDropdownOpen ? "nullark-network-menu is-open" : "nullark-network-menu"}
              role="listbox"
              aria-label="Network options"
            >
              {(["mainnet", "testnet"] as const).map((network) => {
                const selected = activeRuntimeNetwork === network;
                return (
                  <button
                    key={network}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={selected ? "nullark-network-menu__item is-selected" : "nullark-network-menu__item"}
                    onClick={() => {
                      setNetworkDropdownOpen(false);
                      if (!selected) {
                        switchProductRuntimeNetwork(network);
                      }
                    }}
                  >
                    <span>{network === "mainnet" ? "Mainnet" : "Testnet"}</span>
                    <span className="nullark-network-menu__status">{selected ? <CheckIcon /> : null}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <span className="nullark-visually-hidden">{networkSignal}</span>
          <span className="nullark-visually-hidden">{runtimeConfig.chainId}</span>
          {lastRelaySender ? <span className="nullark-visually-hidden">{shortAddress(lastRelaySender)}</span> : null}
        </div>
        <div className="nullark-title-lockup">
          <h2 aria-label="Nullark Transfer Console">
            nullark <span>&gt;_</span>
          </h2>
        </div>
        <div className="nullark-panel__header-actions nullark-wallet-actions">
          <div className="nullark-wallet-picker-anchor">
            <button type="button" onClick={connectWallet} disabled={actionInFlight}>
              <WalletIcon className="nullark-button-icon" />
              {account ? "Change wallet" : "Connect wallet"}
            </button>
            {walletPickerOpen ? (
              <div className="nullark-wallet-picker" role="listbox" aria-label="Wallet providers">
                {walletProviderOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={option.id === selectedWalletProviderId}
                    className={
                      option.id === selectedWalletProviderId
                        ? "nullark-wallet-picker__item is-selected"
                        : "nullark-wallet-picker__item"
                    }
                    onClick={() => {
                      setWalletPickerOpen(false);
                      connectWalletWithProvider(option);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.id === selectedWalletProviderId ? <CheckIcon /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`nullark-balance-unlock ${
              recoveryScanFailed
                ? "nullark-balance-unlock--error"
                : privateBalanceUnlockSignature
                  ? "nullark-balance-unlock--ready"
                  : ""
            }`}
            onClick={() => void unlockPrivateBalance()}
            disabled={actionInFlight || balanceUnlockInFlight || mainnetValueMovingBlocked}
          >
            <ShieldIcon className="nullark-button-icon" />
            {balanceUnlockLabel}
          </button>
          {account ? (
            <button type="button" onClick={disconnectWallet}>
              Disconnect
            </button>
          ) : null}
        </div>
      </header>

      {mainnetValueMovingBlocked ? (
        <div className="nullark-panel__error" role="alert">
          {MAINNET_VALUE_MOVING_BLOCKED_MESSAGE}
        </div>
      ) : null}

      <nav className="nullark-mobile-tabs" aria-label="Console panels" role="tablist">
        {([
          ["deposit", "Deposit", "deposit"],
          ["pool", "Pool", "pool"],
          ["withdraw", "Withdraw", "public-exit"]
        ] as const).map(([tab, label, panelId]) => (
          <button
            key={tab}
            id={`nullark-mobile-tab-${tab}`}
            type="button"
            className={mobileConsoleTab === tab ? "nullark-mobile-tab is-active" : "nullark-mobile-tab"}
            onClick={() => setMobileConsoleTab(tab)}
            aria-controls={panelId}
            aria-selected={mobileConsoleTab === tab}
            role="tab"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="nullark-stage" aria-label="Nullark console status">
        <article
          id="deposit"
          className={`nullark-card nullark-card--deposit nullark-mobile-tab-panel ${
            mobileConsoleTab === "deposit" ? "is-active" : ""
          }`}
          aria-label="Fund private balance"
          aria-labelledby="nullark-mobile-tab-deposit"
          role="tabpanel"
        >
          <div className="nullark-card__ambient nullark-card__ambient--deposit" aria-hidden="true" />
          <div className="nullark-card__title">
            <span className="nullark-card__icon">
              <ArrowDownIcon />
            </span>
            <div>
              <h3 aria-label="Fund private balance">Deposit</h3>
              <p>Choose a supported amount</p>
            </div>
          </div>

          <label className="nullark-hidden-field">
            Amount to deposit
            <input
              value={depositAmountEth}
              onChange={(event) => setDepositAmountEth(event.target.value)}
              inputMode="decimal"
            />
          </label>

          <div className="nullark-section-label">Amount</div>
          <div className="nullark-selector">
            <div className="nullark-selector__main nullark-selector__main--static" aria-label={`Selected deposit amount ${depositAmountEth} ETH`}>
              <span>
                <small>Selected amount</small>
                <strong>{depositAmountEth} ETH</strong>
              </span>
              <span className="nullark-token-pill">
                <EthDiamondIcon />
                ETH
              </span>
            </div>
            <div className="nullark-denom-grid" aria-label="Deposit denominations">
              {visibleDepositDenominations.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={amount === depositAmountEth ? "nullark-denom nullark-denom--selected" : "nullark-denom"}
                  onClick={() => {
                    setDepositAmountEth(amount);
                    clearWithdrawalProofBundle();
                  }}
                >
                  {amount}
                </button>
              ))}
              {overflowDepositDenominations.length > 0 ? (
                <div className="nullark-denom-more">
                  <button
                    type="button"
                    className={overflowDepositSelected ? "nullark-denom nullark-denom--more-active" : "nullark-denom"}
                    onClick={() => setDepositMoreOpen((open) => !open)}
                    aria-expanded={depositMoreOpen}
                    aria-label={`Show ${overflowDepositDenominations.length} more supported deposit amounts`}
                  >
                    More
                  </button>
                </div>
              ) : null}
            </div>
            {overflowDepositDenominations.length > 0 ? (
              <div
                className={`nullark-denom-menu ${depositMoreOpen ? "nullark-denom-menu--open" : ""}`}
                role="menu"
                aria-hidden={!depositMoreOpen}
                aria-label="More deposit denominations"
              >
                {overflowDepositDenominations.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    role="menuitemradio"
                    tabIndex={depositMoreOpen ? 0 : -1}
                    aria-checked={amount === depositAmountEth}
                    className={amount === depositAmountEth ? "nullark-denom-menu__item nullark-denom-menu__item--selected" : "nullark-denom-menu__item"}
                    onClick={() => {
                      setDepositAmountEth(amount);
                      setDepositMoreOpen(false);
                      clearWithdrawalProofBundle();
                    }}
                  >
                    {amount} ETH
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="nullark-selector-helper">
            <span>{depositOptionCountLabel}</span>
            <span>Wallet balance: {connectedWalletBalanceLabel}</span>
          </div>

          <div className="nullark-section-label">From wallet</div>
          <div className="nullark-wallet-card">
            <span className="nullark-avatar" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong title={account}>{account ? shortAddress(account) : "Wallet not connected"}</strong>
              <small>{account ? connectedWalletBalanceLabel : providerStatus}</small>
            </span>
          </div>

          <div className="nullark-hint">
            <InfoIcon />
            <span>Your deposit creates wallet-gated note material after it enters the pool. The deposit transaction remains public.</span>
          </div>

          <button
            type="button"
            className="nullark-primary nullark-primary--deposit"
            onClick={sendDeposit}
            disabled={valueMovingDisabled}
            aria-label="Create private note"
          >
            <span>
              <ArrowDownIcon />
            </span>
            Deposit
          </button>
        </article>

        <article
          id="pool"
          className={`nullark-card nullark-card--pool nullark-mobile-tab-panel ${
            mobileConsoleTab === "pool" ? "is-active" : ""
          }`}
          aria-label="Pool"
          aria-labelledby="nullark-mobile-tab-pool"
          role="tabpanel"
        >
          <span className="nullark-visually-hidden">Pool</span>
          <div className="nullark-card__ambient nullark-card__ambient--pool" aria-hidden="true" />
          <div className="nullark-pool-topline">
            <div>
              <p>Pool status</p>
              <h3>Active</h3>
            </div>
          </div>

          <div className="nullark-pool-address">
            <span>Contract</span>
            <a
              aria-label="Open contract on MegaETH explorer"
              className="nullark-pool-address__link"
              href={megaEthExplorerAddressUrl(runtimeConfig.chainId, getProductRuntimeConfig().poolAddress)}
              rel="noreferrer"
              target="_blank"
              title={getProductRuntimeConfig().poolAddress}
            >
              <span className="nullark-pool-address__value">{poolAddressLabel}</span>
              <ExternalLinkIcon />
            </a>
          </div>

          <div className="nullark-pool-orb" aria-hidden="true">
            <span />
            <NullarkMark />
          </div>

          <div className="nullark-pool-capacity">
            <div className="nullark-pool-capacity__head">
              <span>Pool capacity</span>
              <strong>
                {poolStats ? `${formatWholeNumber(poolUsedLeaves)} / ${formatWholeNumber(poolCapacity)}` : "not read"}
              </strong>
            </div>
            <div className="nullark-pool-capacity__bar" aria-hidden="true">
              <span style={{ width: poolUsedPercent || "0%" }} />
            </div>
            <div className="nullark-pool-capacity__foot">
              <span>{poolRemainingLeaves ? `${formatWholeNumber(poolRemainingLeaves)} remaining` : "not read"}</span>
              <span>{poolUsedPercent || "not read"} used</span>
            </div>
          </div>

          <div className="nullark-pool-metrics">
            <div>
              <small>Anonymity set</small>
              <strong>{poolAnonymitySetLabel}</strong>
            </div>
            <div>
              <small>Pool liquidity</small>
              <strong>{poolLiquidityLabel}</strong>
            </div>
            <div>
              <small>Proof root</small>
              <strong title={currentRoot}>{currentRootLabel}</strong>
            </div>
            <div>
              <small>Exit fee</small>
              <strong>{poolFeeLabel}</strong>
            </div>
            <div>
              <small>Deposited</small>
              <strong>{poolDepositedLabel}</strong>
            </div>
            <div>
              <small>Withdrawn</small>
              <strong>{poolWithdrawnLabel}</strong>
            </div>
          </div>
        </article>

        <article
          id="public-exit"
          className={`nullark-card nullark-card--withdraw nullark-mobile-tab-panel ${
            mobileConsoleTab === "withdraw" ? "is-active" : ""
          }`}
          aria-label="Exit to public wallet"
          aria-labelledby="nullark-mobile-tab-withdraw"
          role="tabpanel"
        >
          <span className="nullark-visually-hidden">Exit to public wallet</span>
          <div className="nullark-card__ambient nullark-card__ambient--withdraw" aria-hidden="true" />
          <div className="nullark-card__title">
            <span className="nullark-card__icon">
              <ArrowUpIcon />
            </span>
            <div>
              <h3 aria-label="Exit to public wallet">Withdraw</h3>
              <p>Send from private balance</p>
            </div>
          </div>

          <label className={`nullark-field ${guidedAttention === "destination" ? "nullark-field--attention" : ""}`}>
            <span>Recipient</span>
            <input
              aria-label="Public wallet address"
              ref={destinationInputRef}
              value={withdrawDestination}
              onChange={(event) => {
                setWithdrawDestination(event.target.value);
                if (guidedAttention === "destination") {
                  setGuidedAttention("");
                }
                clearWithdrawalProofBundle();
              }}
              aria-invalid={guidedAttention === "destination" ? "true" : undefined}
              spellCheck={false}
              placeholder="0x..."
            />
          </label>

          <div className="nullark-note-inventory" aria-label="Private balance">
            <span className="nullark-visually-hidden">{savedAvailableBalanceEth} ETH available</span>
            <span className="nullark-visually-hidden">
              {savedAvailableNoteCount} recoverable {savedAvailableNoteCount === 1 ? "note" : "notes"}
            </span>
            <div className="nullark-note-inventory__header">
              <span>Private balance</span>
              <strong>{savedAvailableBalanceEth} ETH</strong>
            </div>
            <div className="nullark-note-pills">
              {noteGroups.length > 0 ? (
                noteGroups.map((group) => {
                  const selected = group.entries.some(
                    (entry) => normalizeSandboxNoteCommitment(entry.record.commitment) === selectedNoteCommitment
                  );
                  const defaultEntry = group.entries[0];
                  if (!defaultEntry) {
                    return null;
                  }
                  return (
                    <button
                      key={group.amountWei}
                      type="button"
                      className={selected ? "nullark-note-pill nullark-note-pill--selected" : "nullark-note-pill"}
                      onClick={() => {
                        selectNoteRecordForWithdrawal(
                          defaultEntry.record,
                          group.entries.length > 1
                            ? `Selected oldest ${group.amountEth} ETH private note.`
                            : `Selected ${group.amountEth} ETH private note for withdrawal.`,
                          { preserveCurrentWithdrawalAmount: false }
                        );
                        clearWithdrawalProofBundle();
                      }}
                      aria-pressed={selected}
                      aria-label={`Select ${group.amountEth} ETH private note group`}
                    >
                      <strong>{group.amountEth}</strong>
                      <small>{group.entries.length > 1 ? `x${group.entries.length}` : selected ? "selected" : "x1"}</small>
                    </button>
                  );
                })
              ) : (
                <span>
                  <strong>0</strong>
                  <small>notes</small>
                </span>
              )}
            </div>
          </div>

          <label className="nullark-hidden-field">
            Amount to exit
            <input
              value={withdrawGrossAmountEth}
              onChange={(event) => {
                setWithdrawGrossAmountEth(event.target.value);
                clearWithdrawalProofBundle();
              }}
              inputMode="decimal"
            />
          </label>

          <div className="nullark-section-label">Withdraw amount</div>
          <div className="nullark-selector">
            <div className="nullark-selector__main nullark-selector__main--static" aria-label={`Selected exit amount ${selectedWithdrawLabel}`}>
              <span>
                <small>Selected amount</small>
                <strong>{selectedWithdrawLabel}</strong>
              </span>
              <span className="nullark-token-pill">
                <EthDiamondIcon />
                ETH
              </span>
            </div>
            {usesFixedDenominationExitChoices ? (
              <div className="nullark-exit-choice-grid nullark-denom-grid" role="radiogroup" aria-label="Exit amount choices">
                {fixedDenominationExitChoices.length > 0 ? (
                  fixedDenominationExitChoices.map((choice) => (
                    <button
                      key={`${choice.grossAmountWei}:${choice.changeAmountWei}`}
                      type="button"
                      role="radio"
                      aria-checked={withdrawGrossAmountEth === choice.grossAmountEth}
                      className={
                        withdrawGrossAmountEth === choice.grossAmountEth
                          ? "nullark-exit-choice nullark-denom nullark-denom--selected"
                          : "nullark-exit-choice nullark-denom"
                      }
                      onClick={() => {
                        setWithdrawGrossAmountEth(choice.grossAmountEth);
                        clearWithdrawalProofBundle();
                      }}
                    >
                      <strong>{choice.grossAmountEth} ETH</strong>
                      <small>{choice.isFullExit ? "Exit full note" : `Keep ${choice.changeAmountEth} ETH private`}</small>
                    </button>
                  ))
                ) : (
                  <small>{fixedDenominationUnsupportedNoteMessage || "No withdrawable private balance."}</small>
                )}
              </div>
            ) : (
              <div className="nullark-denom-grid">
                <button type="button" className="nullark-denom nullark-denom--selected">
                  {withdrawGrossAmountEth || "Full note"}
                </button>
              </div>
            )}
          </div>
          <div className="nullark-withdraw-breakdown">
            <div>
              <span>
                <InfoIcon />
                What recipient gets
              </span>
            </div>
            <div className="nullark-breakdown-rows" aria-label="withdrawal details">
              <div>
                <span>Withdraw amount</span>
                <strong>{withdrawGrossAmountEth ? `${withdrawGrossAmountEth} ETH` : "0 ETH"}</strong>
              </div>
              <div>
                <span>Protocol fee</span>
                <strong>
                  {visibleWithdrawFeeWei ? `-${formatWeiToEthDecimal(visibleWithdrawFeeWei)} ETH` : "0 ETH"}
                </strong>
              </div>
              <div className="nullark-breakdown-total">
                <span>Recipient gets</span>
                <strong>
                  {visibleWithdrawNetAmountWei
                    ? `${formatWeiToEthDecimal(visibleWithdrawNetAmountWei)} ETH`
                    : "0 ETH"}
                </strong>
              </div>
            </div>
          </div>

          <div className="nullark-withdraw-runtime" aria-label="Withdrawal runtime safety">
            <div>
              <span>Network</span>
              <strong>{activeRuntimeNetworkLabel}</strong>
            </div>
            <div>
              <span>Pool</span>
              <strong title={runtimeConfig.poolAddress}>{poolAddressLabel}</strong>
            </div>
            <div>
              <span>Relayer</span>
              <strong title={withdrawalRelayerEndpoint || undefined}>{withdrawalRelayerLabel}</strong>
            </div>
          </div>

          <div className="nullark-withdraw-actions">
            <button
              type="button"
              className="nullark-primary nullark-primary--withdraw"
              onClick={handleGuidedWithdrawalCta}
              disabled={valueMovingDisabled}
              aria-label="Send public exit"
            >
              <span>
                <ArrowUpIcon />
              </span>
              {actionInFlight ? "Preparing exit" : "Withdraw"}
            </button>
          </div>

          <div className="nullark-route-preview">
            <span>Nullark pool</span>
            <strong>→</strong>
            <span>{destinationReady ? shortAddress(withdrawDestination.trim()) : "Public wallet"}</span>
          </div>

        </article>

        {showDeveloperDiagnostics ? (
        <details
          id="diagnostics"
          className="nullark-advanced nullark-card--wide product-diagnostics"
          open={advancedOpen}
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setAdvancedOpen((open) => !open);
            }}
          >
            Advanced / recovery
          </summary>
          {advancedOpen ? (
          <div className="nullark-advanced__grid">
            <div className="nullark-card nullark-card--nested nullark-card--wide">
              <h3>Developer diagnostics</h3>
              <p className="nullark-card__note">
                Legacy deployed-pool calldata and raw protocol fields live here only for local engineering. This block is
                not a product recovery path and does not provide a local proof-service fallback.
              </p>
            </div>

            <div className="nullark-card nullark-card--nested">
              <h3>Wallet</h3>
              <div className="nullark-actions">
                <button type="button" onClick={checkProvider}>
                  Check provider
                </button>
                <button type="button" onClick={connectWallet}>
                  Connect account
                </button>
                <button type="button" onClick={switchToConfiguredNetwork}>
                  Switch network
                </button>
              </div>
              <dl className="nullark-facts">
                <dt>Provider</dt>
                <dd>{providerStatus}</dd>
                <dt>Account</dt>
                <dd title={account}>{account ? shortAddress(account) : "not connected"}</dd>
                <dt>RPC</dt>
                <dd>{runtimeConfig.rpcUrl}</dd>
              </dl>
            </div>

            <div className="nullark-card nullark-card--nested">
              <h3>Pool reads</h3>
              <div className="nullark-actions">
                <button type="button" onClick={readCurrentRoot}>
                  Read current root
                </button>
                <button type="button" onClick={readPoolBalance}>
                  Read pool balance
                </button>
              </div>
              <dl className="nullark-facts">
                <dt>Pool</dt>
                <dd>{getProductRuntimeConfig().poolAddress}</dd>
                <dt>Current root</dt>
                <dd>{currentRoot || "not read"}</dd>
                <dt>Pool balance</dt>
                <dd>{poolBalance || "not read"}</dd>
              </dl>
            </div>

            <div className="nullark-card nullark-card--nested nullark-card--wide">
              <h3>Deposit diagnostics</h3>
              <p className="nullark-card__note">
                These controls are for debugging note material and commitment status. The normal deposit path handles
                note creation automatically.
              </p>
              <div className="nullark-actions">
                <button type="button" onClick={() => void generateSpendMaterial()}>
                  Generate spend material
                </button>
                <button type="button" onClick={() => void checkCommitment()}>
                  Check commitment
                </button>
              </div>
              <dl className="nullark-facts nullark-facts--wide">
                <dt>On-chain commitment</dt>
                <dd>{commitment || "not generated"}</dd>
                <dt>Owner commitment</dt>
                <dd>{spendMaterial?.ownerCommitment ?? "not generated"}</dd>
                <dt>Note secret</dt>
                <dd>{spendMaterial?.noteSecret ? "loaded in local note material" : "not generated"}</dd>
                <dt>Asset ID</dt>
                <dd>{spendMaterial?.assetId ?? SANDBOX_NATIVE_ETH_ASSET_ID}</dd>
                <dt>Inserted</dt>
                <dd>{commitmentInserted === null ? "not checked" : commitmentInserted ? "true" : "false"}</dd>
                <dt>Value</dt>
                <dd>{depositAmountEth || "not set"} ETH</dd>
              </dl>
            </div>

            <div className="nullark-card nullark-card--nested nullark-card--wide">
          <h3>Restored note state</h3>
          <p className="nullark-card__note">
            Wallet connection is not the custody record. The normal Nullark path restores note material from the local
            note vault. Manual JSON import/export remains for recovery, and the proof service reconstructs the leaf index and
            Merkle path from on-chain RootAccepted history when you send.
          </p>
          <div className="nullark-form-grid">
            <label
              className={`nullark-field nullark-field--wide ${
                guidedAttention === "note" ? "nullark-field--attention" : ""
              }`}
            >
              <span>Spend-material note JSON</span>
              <textarea
                ref={noteRecordInputRef}
                value={noteRecordText}
                onChange={(event) => {
                  setNoteRecordText(event.target.value);
                  if (guidedAttention === "note") {
                    setGuidedAttention("");
                  }
                  clearWithdrawalProofBundle();
                }}
                aria-invalid={guidedAttention === "note" ? "true" : undefined}
                rows={6}
                spellCheck={false}
                placeholder="Advanced recovery: paste exported note or private change note JSON."
              />
            </label>
          </div>
          <div className="nullark-actions">
              <button type="button" onClick={importNoteRecord}>
                Restore note record
              </button>
          </div>
          <dl className="nullark-facts nullark-facts--wide">
            <dt>Record status</dt>
            <dd>{noteRecordStatus}</dd>
            <dt>Imported amount</dt>
            <dd>{noteRecordAmountWei ? `${formatWeiToEthDecimal(noteRecordAmountWei)} ETH` : "not loaded"}</dd>
            <dt>Imported pool</dt>
            <dd>{noteRecordPool || "not loaded"}</dd>
            <dt>Commitment derivation</dt>
            <dd>{noteRecordCommitmentDerivationStatus}</dd>
            <dt>Merkle path</dt>
            <dd>{noteRecordMerklePathStatus}</dd>
            <dt>Proof generation</dt>
            <dd>{noteRecordProofGenerationStatus}</dd>
          </dl>
            </div>

            <div className="nullark-card nullark-card--nested nullark-card--wide">
          <h3>Withdrawal proof bundle</h3>
          <p className="nullark-card__note">
            Send withdrawal only when a matching local-untrusted proof bundle exists. The proof root, nullifier,
            destination, gross amount, fee, chain ID, pool, and optional change commitment are checked before wallet
            submission. Destination receives gross minus the withdrawal fee; any remaining note value stays shielded as
            the private change note.
          </p>
          <div className="nullark-form-grid">
            <label className="nullark-field nullark-field--wide">
              <span>Proof hex</span>
              <textarea
                value={withdrawProof}
                onChange={(event) => setWithdrawProof(event.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="0x..."
              />
            </label>
            <label className="nullark-field nullark-field--wide">
              <span>Public inputs</span>
              <textarea
                value={withdrawPublicInputs}
                onChange={(event) => setWithdrawPublicInputs(event.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="8 bytes32 values, separated by newlines, commas, or spaces"
              />
            </label>
            <label className="nullark-field">
              <span>Nullifier</span>
              <input
                value={withdrawNullifier}
                onChange={(event) => {
                  setWithdrawNullifier(event.target.value);
                  setNullifierSpent(null);
                }}
                spellCheck={false}
                placeholder="0x..."
              />
            </label>
            <div className="nullark-field">
              <span>Selected exit amount</span>
              <strong>{withdrawGrossAmountEth ? `${withdrawGrossAmountEth} ETH` : "choose from available exits"}</strong>
            </div>
          </div>
          <div className="nullark-actions">
            <button type="button" onClick={() => void checkNullifier()}>
              Check nullifier
            </button>
            <button type="button" onClick={sendWithdrawal} disabled={!!withdrawalProofIssue || valueMovingDisabled}>
              Send withdrawal
            </button>
          </div>
          <dl className="nullark-facts nullark-facts--wide">
            <dt>Nullifier spent</dt>
            <dd>{nullifierSpent === null ? "not checked" : nullifierSpent ? "true" : "false"}</dd>
            <dt>Fee</dt>
            <dd>{withdrawFeeWei ? `${formatWeiToEthDecimal(withdrawFeeWei)} ETH` : "not generated"}</dd>
            <dt>Destination receives</dt>
            <dd>{withdrawNetAmountWei ? `${formatWeiToEthDecimal(withdrawNetAmountWei)} ETH` : "not generated"}</dd>
            <dt>Shielded change</dt>
            <dd>{withdrawChangeAmountWei ? `${formatWeiToEthDecimal(withdrawChangeAmountWei)} ETH` : "not generated"}</dd>
            <dt>Withdrawal tx hash</dt>
            <dd>{withdrawTxHash || "not sent"}</dd>
            <dt>Change note</dt>
            <dd>{changeNoteStatus}</dd>
          </dl>
          <div className="nullark-form-grid">
            <label className="nullark-field nullark-field--wide">
              <span>Change note JSON</span>
              <textarea
                value={changeNoteRecordText}
                onChange={(event) => setChangeNoteRecordText(event.target.value)}
                rows={7}
                spellCheck={false}
                placeholder="Generated after a public exit with private change confirms."
              />
            </label>
          </div>
            </div>
          </div>
          ) : null}
        </details>
        ) : null}
      </div>

      {liveProgress ? (
        <footer className="nullark-live-progress" aria-label={liveProgress.title} aria-live="polite">
          <div className="nullark-live-progress__header">
            <div>
              <strong>{liveProgress.title}</strong>
              <span>{liveProgress.detail}</span>
            </div>
            <small>{liveProgress.summary}</small>
          </div>
          <div className="nullark-live-progress__steps">
            {liveProgressToastRows.map((row) => (
              <div
                key={row.step?.title ?? "empty"}
                className={`nullark-live-step ${
                  row.step ? `nullark-live-step--${row.step.state}` : "nullark-live-step--empty"
                }`}
                aria-current={row.step?.state === "active" ? "step" : undefined}
              >
                <span>{row.step?.state === "done" ? <CheckIcon /> : null}</span>
                <div>
                  <strong>{row.step?.title ?? "Queued"}</strong>
                  <small>{row.step?.detail ?? "Waiting"}</small>
                </div>
              </div>
            ))}
          </div>
        </footer>
      ) : null}

      {withdrawalSuccessToast ? (
        <footer
          className="nullark-live-progress nullark-live-progress--success"
          aria-live="polite"
          data-progress-state="confirmed"
          role="status"
        >
          <button
            type="button"
            className="nullark-live-progress__close"
            onClick={() => setWithdrawalSuccessToast(null)}
            aria-label="Close withdrawal success message"
          >
            x
          </button>
          <div className="nullark-live-progress__header">
            <div>
              <strong>{withdrawalSuccessToast.title}</strong>
              <span>{withdrawalSuccessToast.detail}</span>
            </div>
            <small>done</small>
          </div>
          <div className="nullark-live-progress__steps">
            <div className="nullark-live-step nullark-live-step--done">
              <span>
                <CheckIcon />
              </span>
              <div>
                <strong>Confirmed</strong>
                <small>
                  <a
                    className="nullark-live-step__tx-link"
                    href={megaEthExplorerTxUrl(runtimeConfig.chainId, withdrawalSuccessToast.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(withdrawalSuccessToast.txHash)}
                  </a>
                </small>
              </div>
            </div>
          </div>
        </footer>
      ) : null}

      {showStatusPanel ? (
        <div className="nullark-panel__status" aria-live="polite">
          {formattedStatus}
        </div>
      ) : null}
      <span className="nullark-visually-hidden">
        Note vault {account ? shortAddress(account) : "wallet not connected"}
      </span>
      {error ? (
        <div className="nullark-panel__error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
