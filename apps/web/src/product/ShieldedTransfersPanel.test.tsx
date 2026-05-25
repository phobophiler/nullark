import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import { ShieldedTransfersPanel, isDepositProgressStatus } from "./ShieldedTransfersPanel.js";
import {
  createTestnetProductRuntimeConfig,
  setProductRuntimeConfigForTests,
  type ProductRuntimeConfig
} from "./productRuntimeConfig.js";
import {
  CURRENT_ROOT_CALLDATA,
  EXPECTED_WITHDRAW_VERIFIER_ADDRESS,
  EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH,
  MEGAETH_TESTNET_CHAIN_ID,
  MEGAETH_TESTNET_RPC_URL,
  ROOT_ACCEPTED_TOPIC,
  SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS,
  SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SANDBOX_NOTE_WITH_PROOF_STATUS,
  SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
  SHIELDED_POOL_ADDRESS,
  createRecoveryKitV1FromNoteRecord,
  createSandboxNoteVaultEntry,
  createSandboxSpendMaterialNoteRecord,
  loadSandboxNoteVault,
  saveSandboxNoteVault,
  serializeRecoveryKitV1,
  serializeSandboxSpendMaterialNoteRecord,
  type HexString
} from "./shieldedTransfersHelpers.js";
import { deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";

const UNLOCK_SIGNATURE = `0x${"99".repeat(65)}`;
const DETERMINISTIC_SPEND_MATERIAL_FIELD = `0x02${"22".repeat(31)}`;
const DEFAULT_AMOUNT_POSEIDON_COMMITMENT =
  "0x2b30dfcb5465312e32d859131ce37f237aace446666afea2ef2519fc4fb41ab8";
const ZERO_ROOT = `0x${"00".repeat(32)}`;
const DEPLOYED_RELAYER_SERVICE_URL = "https://testnet-relayer.nullark.com/transaction";
const DEFAULT_BROWSER_WITHDRAW_PROOF = `0x${"ab".repeat(256)}` as const;
const TEST_PROOF_CONTEXT_HASH = `0x${"06".repeat(32)}` as const;
const TEST_ENCRYPTED_NOTE_HASH = `0x${"07".repeat(32)}` as const;
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const TRUSTED_SETUP_RECORD_SHA256 = "666d825fb2f125db195c78c14892f883cad8477224992ca98e0f02e3f13e5e04";
const TRUSTED_SETUP_RECORD_PATH = "/proving/trusted-setup-record.json";
const WITHDRAWAL_FEE_BPS = 33n;
const BPS_DENOMINATOR = 10_000n;

function createExplicitMainnetProductRuntimeConfig(): ProductRuntimeConfig {
  return {
    chainId: 4326,
    chainIdHex: "0x10e6",
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    networkName: "MegaETH mainnet",
    networkBadge: "MAINNET",
    walletChainName: "MegaETH Mainnet",
    poolAddress: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8",
    poolDeploymentBlockHex: "0x10152dd",
    merkleTreeDepth: 20,
    proverManifestUrl: "/proving/withdraw-artifacts.manifest.json",
    relayerEndpoint: "https://relayer.nullark.com/transaction",
    withdrawVerifierAddress: "0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92",
    withdrawVerifierBytecodeHash: "0x613190065f23e69c6dcd8d75796b8aa20c060a5f51b312cf82c11424443bfdca",
    withdrawalFeeState: {
      activeFeeBps: 33,
      maxFeeBps: 100,
      pendingFeeActive: false,
      source: "on-chain-feeBps"
    },
    allowUntrustedLocalDevProver: false,
    allowLocalDevProofServiceFallback: false,
    mainnetValueMovingApproved: false,
    guardedUsersApproved: false,
    productionPrivacyClaimsApproved: false
  };
}

const withdrawProofWorkerRequests: Array<{
  id: string;
  publicInputSchema?: "v1.1" | "v1.2-unlinkable";
  witness: Record<string, string>;
  expectedFeeBps?: number;
}> = [];
const POOL_FEE_STATE_TEST_ABI = [
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }]
  },
  {
    type: "function",
    name: "MAX_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }]
  },
  {
    type: "function",
    name: "pendingFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }]
  },
  {
    type: "function",
    name: "pendingFeeActivationTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }]
  }
] as const;

function setTestHostname(hostname: string) {
  (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname = hostname;
}

function setLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url)
  });
}

function setDiagnosticsLocation() {
  setLocation("http://localhost:5173/?debug=1");
}

function bytes32FromDecimal(value: string | number | bigint): `0x${string}` {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function withdrawalFeeFor(grossAmountWei: bigint): bigint {
  return (grossAmountWei * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
}

function governedWithdrawalFeeFor(grossAmountWei: bigint, feeBps: bigint): bigint {
  return (grossAmountWei * feeBps) / BPS_DENOMINATOR;
}

function poolFeeStateCallData(functionName: (typeof POOL_FEE_STATE_TEST_ABI)[number]["name"]): HexString {
  return encodeFunctionData({ abi: POOL_FEE_STATE_TEST_ABI, functionName });
}

function installWithdrawProofWorkerMock() {
  class MockWorker {
    onmessage: ((event: { data: unknown }) => void) | undefined;
    onerror: ((event: unknown) => void) | undefined;

    postMessage(message: unknown) {
      const request = message as {
        id: string;
        publicInputSchema?: "v1.1" | "v1.2-unlinkable";
        witness: Record<string, string>;
      };
      withdrawProofWorkerRequests.push(request);
      const witnessValue = (key: string) => {
        const value = request.witness[key];
        if (value === undefined) throw new Error(`missing witness ${key}`);
        return value;
      };
      queueMicrotask(() => {
        const publicInputs =
          request.publicInputSchema === "v1.2-unlinkable"
            ? [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("outputCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedOutputNoteHash"))
              ]
            : [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("newCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("spentCommitment")),
                bytes32FromDecimal(witnessValue("noteAmount")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedNoteHash"))
              ];
        this.onmessage?.({
          data: {
            id: request.id,
            ok: true,
            proof: DEFAULT_BROWSER_WITHDRAW_PROOF,
            proofCandidates: [DEFAULT_BROWSER_WITHDRAW_PROOF],
            publicInputs,
            nullifier: bytes32FromDecimal(witnessValue("nullifier"))
          }
        });
      });
    }

    terminate() {}
  }

  vi.stubGlobal("Worker", MockWorker);
}

function rootAcceptedLogsFor(commitments: string[]) {
  return commitments.map((commitment) => ({
    address: SHIELDED_POOL_ADDRESS,
    topics: [ROOT_ACCEPTED_TOPIC, ZERO_ROOT, ZERO_ROOT, commitment],
    data: "0x",
    transactionHash: `0x${"aa".repeat(32)}`
  }));
}

function mockFetch(routes: Partial<Record<string, Response>> = {}) {
  return vi.fn(async (url) => {
    const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
    return routes[key]?.clone() ?? new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
}

function trustedProverArtifactResponse(key: string): Response | null {
  if (key === "/proving/withdraw-artifacts.manifest.json") {
    return Response.json({
      trustLevel: "trusted-setup-recorded",
      trustedSetupRecord: {
        path: TRUSTED_SETUP_RECORD_PATH,
        sha256: TRUSTED_SETUP_RECORD_SHA256,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: SHIELDED_POOL_ADDRESS,
        verifier: EXPECTED_WITHDRAW_VERIFIER_ADDRESS,
        verifierBytecodeHash: EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH,
        approvedBy: "0x1111111111111111111111111111111111111111",
        approvedAt: "2026-05-07T00:00:00.000Z"
      },
      artifacts: {
        withdrawWasm: { path: "/proving/withdraw.wasm", sha256: EMPTY_SHA256 },
        withdrawFinalZkey: { path: "/proving/withdraw.zkey", sha256: EMPTY_SHA256 }
      }
    });
  }
  if (key === TRUSTED_SETUP_RECORD_PATH) {
    return Response.json({
      schema: "trusted-setup-verifier-promotion-v1",
      trustLevel: "trusted-setup-recorded",
      status: "approved-for-mainnet",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      verifier: EXPECTED_WITHDRAW_VERIFIER_ADDRESS,
      verifierBytecodeHash: EXPECTED_WITHDRAW_VERIFIER_BYTECODE_HASH,
      approvedBy: "0x1111111111111111111111111111111111111111",
      approvedAt: "2026-05-07T00:00:00.000Z",
      publicInputOrder: [
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
      ],
      wasmSha256: EMPTY_SHA256,
      zkeySha256: EMPTY_SHA256
    });
  }
  if (key === "/proving/withdraw.wasm" || key === "/proving/withdraw.zkey") {
    return new Response(new Uint8Array());
  }
  return null;
}

function saveAvailablePrivateTransferNote() {
  const record = createSandboxSpendMaterialNoteRecord({
    commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
    noteAmountWei: "10000000000000",
    ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    depositTxHash: `0x${"ab".repeat(32)}`,
    currentRootAfter: `0x${"12".repeat(32)}`,
    createdAt: "2026-05-02T00:00:00.000Z",
    leafIndex: 0,
    merklePath: {
      root: `0x${"12".repeat(32)}`,
      siblings: Array.from({ length: 12 }, (_, index) => `0x${(0x13 + index).toString(16).repeat(32)}` as HexString),
      pathIndices: Array.from({ length: 12 }, () => 0),
      status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
    },
    commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
    commitmentDerivedFromSpendMaterial: true,
    status: SANDBOX_NOTE_WITH_PROOF_STATUS,
    proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
  });
  saveSandboxNoteVault(window.localStorage, [
    createSandboxNoteVaultEntry({ record, updatedAt: "2026-05-02T00:00:00.000Z" })
  ]);
  return record;
}

function createMainnetRecoveryNote() {
  return createSandboxSpendMaterialNoteRecord({
    commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
    noteAmountWei: "10000000000000",
    ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
    depositTxHash: `0x${"cd".repeat(32)}`,
    currentRootAfter: `0x${"56".repeat(32)}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    leafIndex: 0,
    commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
    commitmentDerivedFromSpendMaterial: true,
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    pool: "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8"
  });
}

async function restoreRecoveryKitThroughVisiblePanel(record: ReturnType<typeof createSandboxSpendMaterialNoteRecord>) {
  const runtimeId = record.chainId === 4326 ? "nullark-v1.2-mainnet" : "nullark-v1.2-testnet-candidate";
  const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId });
  fireEvent.click(screen.getByRole("button", { name: /^Recovery kit/i }));
  fireEvent.change(screen.getByLabelText("Recovery kit JSON"), {
    target: { value: serializeRecoveryKitV1(kit) }
  });
  fireEvent.click(screen.getByRole("button", { name: "Import kit" }));
  expect(await screen.findByText(/Recovery kit imported/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Recovery kit/i }));
}

async function restoreNoteRecordThroughDiagnostics(record: ReturnType<typeof createSandboxSpendMaterialNoteRecord>) {
  if (!screen.queryByLabelText("Spend-material note JSON")) {
    fireEvent.click(screen.getByText("Advanced / recovery"));
  }
  fireEvent.change(screen.getByLabelText("Spend-material note JSON"), {
    target: { value: serializeSandboxSpendMaterialNoteRecord(record) }
  });
  fireEvent.click(screen.getByRole("button", { name: "Restore note record" }));
  await waitFor(() => expect(screen.getByLabelText("Amount to deposit")).toHaveValue(formatTestEth(record.noteAmountWei)));
}

function formatTestEth(wei: string | bigint): string {
  const value = BigInt(wei);
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = (value % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

beforeEach(() => {
  withdrawProofWorkerRequests.length = 0;
  setLocation("http://localhost:5173/");
  setTestHostname("localhost");
  setProductRuntimeConfigForTests(createTestnetProductRuntimeConfig());
  vi.stubGlobal("fetch", mockFetch());
  installWithdrawProofWorkerMock();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete (window as Window & { ethereum?: unknown }).ethereum;
  delete (globalThis as { __shieldedTransfersTestHostname?: string }).__shieldedTransfersTestHostname;
  setProductRuntimeConfigForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShieldedTransfersPanel", () => {
  it("renders only the Nullark deposit and public exit actions by default", () => {
    render(<ShieldedTransfersPanel />);

    expect(screen.getByRole("heading", { name: "Nullark Transfer Console" })).toBeInTheDocument();
    expect(screen.queryByText("NULLARK.COM")).not.toBeInTheDocument();
    expect(screen.getAllByText("MegaETH Testnet").length).toBeGreaterThan(0);
    expect(screen.queryByText("Network: MegaETH Testnet")).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp("MegaETH TEST" + "NET"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Local sandbox notes stay in this browser/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Advanced export and import are for recovery/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deposit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to deposit")).toHaveValue("0.005");
    expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Private balance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock private balance" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Private receive" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Receive amount wei")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create receive code" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Private receive code")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Private transfer" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Private destination address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Recipient receive code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Submit through local relayer as transaction sender")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send private transfer" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Withdraw from private balance" })).toBeInTheDocument();
    expect(screen.getByText("0 ETH available")).toBeInTheDocument();
    expect(screen.getByLabelText("Public wallet address")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to exit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(screen.getAllByText("Pool").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Withdraw").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("withdrawal details")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check provider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch testnet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read current root" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read pool balance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate spend material" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore note record" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate withdrawal proof" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send withdrawal" })).not.toBeInTheDocument();
  });

  it("keeps withdrawal runtime details hidden and wires mobile tabs to panels", () => {
    render(<ShieldedTransfersPanel />);

    const tablist = screen.getByRole("tablist", { name: "Console panels" });
    const withdrawTab = screen.getByRole("tab", { name: "Withdraw" });
    const withdrawPanel = screen.getByRole("tabpanel", { name: "Withdraw" });

    expect(tablist).toContainElement(withdrawTab);
    expect(withdrawTab).toHaveAttribute("aria-controls", "public-exit");
    expect(withdrawPanel).toHaveAttribute("id", "public-exit");
    expect(withdrawPanel).toHaveAttribute("aria-labelledby", "nullark-mobile-tab-withdraw");
    expect(screen.queryByLabelText("Withdrawal runtime safety")).not.toBeInTheDocument();
    expect(screen.queryByText("testnet-relayer.nullark.com")).not.toBeInTheDocument();
    expect(screen.queryByText("127.0.0.1:63430")).not.toBeInTheDocument();
    expect(screen.queryByText(DEFAULT_BROWSER_WITHDRAW_PROOF)).not.toBeInTheDocument();
  });

  it("does not count persisted browser vault notes until the wallet session recovers them", () => {
    saveAvailablePrivateTransferNote();

    render(<ShieldedTransfersPanel />);

    expect(screen.getAllByText("0 ETH available").length).toBeGreaterThan(0);
    expect(screen.getByText("0 recoverable notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to exit")).toHaveValue("");
  });

  it("renders an explicit mainnet network label when mainnet config is active", () => {
    setProductRuntimeConfigForTests(createExplicitMainnetProductRuntimeConfig());

    render(<ShieldedTransfersPanel />);

    expect(screen.queryByText("Network: MegaETH Mainnet")).not.toBeInTheDocument();
    expect(screen.getAllByText("MegaETH Mainnet").length).toBeGreaterThan(0);
    expect(screen.getByText("4326")).toBeInTheDocument();
    expect(screen.queryByText("Nullark v1.2 current")).not.toBeInTheDocument();
    expect(screen.queryByText("v1.2 is the current public runtime.")).not.toBeInTheDocument();
  });

  it("marks injected v1.2 public runtime surfaces as blocked draft", () => {
    setProductRuntimeConfigForTests({
      ...createExplicitMainnetProductRuntimeConfig(),
      mainnetValueMovingApproved: true,
      poolAddress: "0x962Fa384450D46c2F5B26475F6f15982cFD5E669",
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });

    render(<ShieldedTransfersPanel />);

    expect(screen.getByText("Blocked draft")).toBeInTheDocument();
    expect(screen.getByText("Nullark v1.2 blocked draft")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This frontend build is not bound to the final v1.2 public runtime. Public artifact promotion is blocked until validator-ready evidence is pinned in this frontend build."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });

  it("fails closed for mainnet value-moving controls until value-moving is approved", () => {
    setProductRuntimeConfigForTests(createExplicitMainnetProductRuntimeConfig());

    render(<ShieldedTransfersPanel />);

    expect(
      screen.getByText("MegaETH mainnet value-moving actions are blocked until mainnet value-moving approval is explicitly enabled.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });

  it("keeps mainnet value-moving controls enabled only when value-moving is explicitly approved", () => {
    setProductRuntimeConfigForTests({
      ...createExplicitMainnetProductRuntimeConfig(),
      mainnetValueMovingApproved: true
    });

    render(<ShieldedTransfersPanel />);

    expect(
      screen.queryByText("MegaETH mainnet value-moving actions are blocked until mainnet value-moving approval is explicitly enabled.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deposit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
  });

  it("shows only mainnet public exit choices that leave spendable private change", async () => {
    const mainnetConfig = {
      ...createExplicitMainnetProductRuntimeConfig(),
      mainnetValueMovingApproved: true
    };
    setProductRuntimeConfigForTests(mainnetConfig);
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const record = createSandboxSpendMaterialNoteRecord({
      commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      noteAmountWei: "10000000000000000",
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-14T00:00:00.000Z",
      leafIndex: 0,
      chainId: 4326,
      rpcUrl: mainnetConfig.rpcUrl,
      pool: mainnetConfig.poolAddress,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true,
      status: SANDBOX_NOTE_WITH_PROOF_STATUS,
      proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: vi.fn(async ({ method }) => {
          if (method === "eth_call") return `0x${"0".repeat(63)}1`;
          if (method === "eth_requestAccounts") return [destination];
          throw new Error(`unexpected wallet method ${method}`);
        })
      }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    expect(screen.getByRole("radio", { name: /0.01 ETH Supported amount/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /0.005 ETH Remainder stays private/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /0.0001 ETH/i })).not.toBeInTheDocument();
    expect(withdrawProofWorkerRequests).toHaveLength(0);
  });

  it("uses output-note neutral copy for v1.2 public exit choices", async () => {
    const mainnetConfig = {
      ...createExplicitMainnetProductRuntimeConfig(),
      mainnetValueMovingApproved: true,
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false as const,
        source: "on-chain-feeBps" as const
      }
    };
    setProductRuntimeConfigForTests(mainnetConfig);
    setDiagnosticsLocation();
    const record = createSandboxSpendMaterialNoteRecord({
      commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      noteAmountWei: "10000000000000000",
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-14T00:00:00.000Z",
      leafIndex: 0,
      chainId: 4326,
      rpcUrl: mainnetConfig.rpcUrl,
      pool: mainnetConfig.poolAddress,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true,
      status: SANDBOX_NOTE_WITH_PROOF_STATUS,
      proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    expect(screen.getByRole("radio", { name: /0.01 ETH Supported amount/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /0.005 ETH Remainder stays private/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Exit full note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Keep .* ETH private/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /change/i })).not.toBeInTheDocument();
    expect(withdrawProofWorkerRequests).toHaveLength(0);
  });

  it("blocks mainnet public exits from already unsupported private change notes", async () => {
    const mainnetConfig = {
      ...createExplicitMainnetProductRuntimeConfig(),
      mainnetValueMovingApproved: true
    };
    setProductRuntimeConfigForTests(mainnetConfig);
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const record = createSandboxSpendMaterialNoteRecord({
      commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      noteAmountWei: "900000000000000",
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-14T00:00:00.000Z",
      leafIndex: 0,
      chainId: 4326,
      rpcUrl: mainnetConfig.rpcUrl,
      pool: mainnetConfig.poolAddress,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true,
      status: SANDBOX_NOTE_WITH_PROOF_STATUS,
      proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: vi.fn(async ({ method }) => {
          if (method === "eth_call") return `0x${"0".repeat(63)}1`;
          if (method === "eth_requestAccounts") return [destination];
          throw new Error(`unexpected wallet method ${method}`);
        })
      }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() =>
      expect(
        screen.getAllByText("This private note is 0.0009 ETH, which this pool cannot exit. Use a supported private note.")
          .length
      ).toBeGreaterThan(0)
    );
    expect(withdrawProofWorkerRequests).toHaveLength(0);
  });

  it("renders an explicit testnet network label from the query override", () => {
    setProductRuntimeConfigForTests(null);
    setLocation("http://localhost:5173/?network=megaeth-testnet");

    render(<ShieldedTransfersPanel />);

    expect(screen.queryByText("Network: MegaETH Testnet")).not.toBeInTheDocument();
    expect(screen.getAllByText("MegaETH Testnet").length).toBeGreaterThan(0);
    expect(screen.getByText("6343")).toBeInTheDocument();
  });

  it("lets users connect, change, and disconnect the visible wallet account", async () => {
    const firstAccount = "0x1111111111111111111111111111111111111111";
    const secondAccount = "0x4429B0E7eEa175B3B4726fEaAaeaF69271Fd46ce";
    let selectedAccount = firstAccount;
    const request = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [selectedAccount];
      }
      if (method === "wallet_requestPermissions") {
        selectedAccount = secondAccount;
        return [{ parentCapability: "eth_accounts" }];
      }
      throw new Error(`unexpected method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change wallet" })).toBeInTheDocument());
    expect(document.body).toHaveTextContent("0x1111...1111");
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change wallet" }));
    await waitFor(() => expect(document.body).toHaveTextContent("0x4429...46ce"));
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_requestAccounts",
      "wallet_requestPermissions",
      "eth_requestAccounts"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("Note vault wallet not connected");
  });

  it("does not reuse private-balance progress for generic wallet or deposit account requests", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    let resolveDepositAccounts: ((accounts: string[]) => void) | undefined;
    let accountRequestCount = 0;
    const request = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        accountRequestCount += 1;
        if (accountRequestCount > 1) {
          return new Promise<string[]>((resolve) => {
            resolveDepositAccounts = resolve;
          });
        }
        return [account];
      }
      throw new Error(`unexpected method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change wallet" })).toBeInTheDocument());
    expect(screen.queryByLabelText("Private balance progress")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(await screen.findByLabelText("Deposit progress")).toBeInTheDocument();
    expect(screen.queryByLabelText("Private balance progress")).not.toBeInTheDocument();
    resolveDepositAccounts?.([account]);
  });

  it("keeps deposit progress visible through proof generation and preflight", () => {
    expect(isDepositProgressStatus("Generating deposit proof in browser")).toBe(true);
    expect(isDepositProgressStatus("Preflighting deposit proof against the configured pool")).toBe(true);
    expect(isDepositProgressStatus("Waiting for deposit receipt")).toBe(true);
    expect(isDepositProgressStatus("Requesting private balance unlock")).toBe(false);
  });

  it("does not show inline status strips for completed statuses", () => {
    setDiagnosticsLocation();
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request: vi.fn() }
    });

    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByText("Advanced / recovery"));
    fireEvent.click(screen.getByRole("button", { name: "Check provider" }));
    expect(screen.queryByText("Provider available")).not.toBeInTheDocument();
    expect(document.querySelector(".nullark-status-activity")).toBeNull();
    expect(document.querySelector(".nullark-panel__status--busy")).toBeNull();
    expect(document.querySelector(".nullark-panel__status")).toBeNull();
    expect(document.querySelector(".nullark-panel__error")).toBeNull();
  });

  it("shows mainnet value-moving blocks as a dismissible popup instead of an inline alert strip", async () => {
    setProductRuntimeConfigForTests(createExplicitMainnetProductRuntimeConfig());

    render(<ShieldedTransfersPanel />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("nullark-live-progress--error");
    expect(alert).toHaveTextContent("Mainnet blocked");
    expect(alert).toHaveTextContent("MegaETH mainnet value-moving actions are blocked");
    expect(document.querySelector(".nullark-panel__error")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close attention message" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("lets users choose between multiple injected wallet providers after disconnect", async () => {
    const metaMaskAccount = "0x1111111111111111111111111111111111111111";
    const rabbyAccount = "0x2222222222222222222222222222222222222222";
    const metaMaskRequest = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [metaMaskAccount];
      }
      throw new Error(`unexpected MetaMask method ${method}`);
    });
    const rabbyRequest = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [rabbyAccount];
      }
      throw new Error(`unexpected Rabby method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: metaMaskRequest,
        providers: [
          { isMetaMask: true, request: metaMaskRequest },
          { isRabby: true, request: rabbyRequest }
        ]
      }
    });
    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(metaMaskRequest).not.toHaveBeenCalled();
    expect(rabbyRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("option", { name: "Rabby" }));
    await waitFor(() => expect(document.body).toHaveTextContent("0x2222...2222"));
    expect(metaMaskRequest).not.toHaveBeenCalled();
    expect(rabbyRequest).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(screen.getByRole("option", { name: "MetaMask" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Rabby" })).toBeInTheDocument();
    expect(metaMaskRequest).not.toHaveBeenCalled();
    expect(rabbyRequest).toHaveBeenCalledTimes(1);
  });

  it("discovers EIP-6963 wallets so Rabby can be selected when MetaMask owns window.ethereum", async () => {
    const metaMaskAccount = "0x1111111111111111111111111111111111111111";
    const rabbyAccount = "0x2222222222222222222222222222222222222222";
    const metaMaskRequest = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [metaMaskAccount];
      }
      throw new Error(`unexpected MetaMask method ${method}`);
    });
    const rabbyRequest = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [rabbyAccount];
      }
      throw new Error(`unexpected Rabby method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { isMetaMask: true, request: metaMaskRequest }
    });
    const dispatchEvent = window.dispatchEvent.bind(window);
    vi.spyOn(window, "dispatchEvent").mockImplementation((event: Event) => {
      const result = dispatchEvent(event);
      if (event.type === "eip6963:requestProvider") {
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "rabby-provider",
                name: "Rabby Wallet",
                rdns: "io.rabby"
              },
              provider: { isRabby: true, request: rabbyRequest }
            }
          })
        );
      }
      return result;
    });
    dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: {
            uuid: "rabby-provider",
            name: "Rabby Wallet",
            rdns: "io.rabby"
          },
          provider: { isRabby: true, request: rabbyRequest }
        }
      })
    );

    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Rabby Wallet" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: "Rabby Wallet" }));

    await waitFor(() => expect(document.body).toHaveTextContent("0x2222...2222"));
    expect(metaMaskRequest).not.toHaveBeenCalled();
    expect(rabbyRequest).toHaveBeenCalledTimes(1);
  });

  it("shows popular deposit amounts first, exposes the rest through More, and reads wallet balance", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const walletBalanceWei = 250_000_000_000_000_000n;
    const request = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [account];
      }
      throw new Error(`unexpected method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_getBalance" && body.params?.[0] === account) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${walletBalanceWei.toString(16)}` });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);

    expect(screen.getByText("10 supported amounts")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "0.0001 ETH" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "0.005 ETH" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show 5 more supported deposit amounts/i }));
    expect(screen.getByRole("menuitemradio", { name: "0.005 ETH" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(screen.getByText("Wallet balance: 0.25 ETH")).toBeInTheDocument());
    expect(screen.queryByText("Wallet balance: Connected")).not.toBeInTheDocument();
    expect(screen.getByText("7 fit wallet balance")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "0.5" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1" })).not.toBeInTheDocument();
  });

  it("allows deposit and relayed withdrawal without trusted prover metadata", async () => {
    render(<ShieldedTransfersPanel />);

    expect(await screen.findByRole("button", { name: "Deposit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Send private transfer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
    expect(screen.queryByText(/Trusted prover gate blocked/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Spend-material note JSON")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate withdrawal proof" })).not.toBeInTheDocument();
  });

  it("restores a recovery kit as a locally spendable note without wallet unlock", async () => {
    setDiagnosticsLocation();
    const record = createSandboxSpendMaterialNoteRecord({
      commitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      noteAmountWei: "10000000000000",
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 0,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));
    fireEvent.change(screen.getByLabelText("Spend-material note JSON"), {
      target: { value: serializeRecoveryKitV1(kit) }
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore note record" }));

    await waitFor(() => expect(screen.getByLabelText("Amount to deposit")).toHaveValue(formatTestEth(record.noteAmountWei)));
    expect(screen.getByText(`${formatTestEth(record.noteAmountWei)} ETH available`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock private balance" })).toBeInTheDocument();
    expect(JSON.stringify(loadSandboxNoteVault(window.localStorage))).not.toMatch(/wallet|discovery|tag/i);
  });

  it("limits a v1.2 recovery-kit note to full exit without wallet unlock", async () => {
    setDiagnosticsLocation();
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });
    const noteAmountWei = "10000000000000000";
    const grossAmountWei = "5000000000000000";
    const commitment = (await deriveBrowserNoteCommitment({
      assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
      noteAmountWei,
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD as HexString,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD as HexString
    })) as HexString;
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei,
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 0,
      merklePath: {
        root: `0x${"12".repeat(32)}`,
        siblings: Array.from({ length: 12 }, (_, index) => `0x${(0x13 + index).toString(16).repeat(32)}` as HexString),
        pathIndices: Array.from({ length: 12 }, () => 0),
        status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
      },
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true,
      status: SANDBOX_NOTE_WITH_PROOF_STATUS,
      proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"46".repeat(32)}`;
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return record.currentRootAfter;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const data = body.params?.[0]?.data;
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([commitment]) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("feeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(33n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("MAX_FEE_BPS")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(100n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeActivationTime")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: destination,
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [`0x${"47".repeat(32)}`] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));
    fireEvent.change(screen.getByLabelText("Spend-material note JSON"), {
      target: { value: serializeRecoveryKitV1(kit) }
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore note record" }));
    await waitFor(() => expect(screen.getByLabelText("Amount to deposit")).toHaveValue(formatTestEth(noteAmountWei)));
    expect(screen.getByLabelText("Amount to exit")).toHaveValue(formatTestEth(noteAmountWei));

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: formatTestEth(grossAmountWei) } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(withdrawProofWorkerRequests[0]?.publicInputSchema).toBe("v1.2-unlinkable");
    expect(withdrawProofWorkerRequests[0]?.witness.grossAmount).toBe(noteAmountWei);
    expect(withdrawProofWorkerRequests[0]?.witness.outputAmount).toBe("0");
    expect(screen.getByRole("button", { name: "Unlock private balance" })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_requestAccounts" }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "personal_sign" }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_signTypedData_v4" }));
    expect(JSON.stringify(loadSandboxNoteVault(window.localStorage))).not.toMatch(/wallet|discovery|tag/i);
  });

  it("does not expose local proof service or manual note JSON on the default product URL", () => {
    render(<ShieldedTransfersPanel />);

    expect(document.body).not.toHaveTextContent("127.0.0.1:63430");
    expect(screen.queryByText("Advanced / recovery")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Backup .* ETH note/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recovery kit Restore balance/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recovery kit Restore balance/i }));
    expect(screen.getByLabelText("Recovery kit JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import kit" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Spend-material note JSON")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Proof hex")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Public inputs")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Change note JSON")).not.toBeInTheDocument();
  });

  it("does not preload selected note material into the recovery kit restore textarea", async () => {
    const record = saveAvailablePrivateTransferNote();
    render(<ShieldedTransfersPanel />);
    await restoreRecoveryKitThroughVisiblePanel(record);

    fireEvent.click(screen.getByRole("button", { name: /^Recovery kit/i }));

    expect(screen.getByLabelText("Recovery kit JSON")).toHaveValue("");
    expect(document.body).not.toHaveTextContent(record.noteSecret);
    expect(document.body).not.toHaveTextContent(record.ownerCommitment);
    expect(document.body).not.toHaveTextContent(record.blinding);
  });

  it("clears the recovery kit restore textarea after successful import", async () => {
    const record = saveAvailablePrivateTransferNote();
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });
    const serialized = serializeRecoveryKitV1(kit);

    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Recovery kit Restore balance/i }));
    fireEvent.change(screen.getByLabelText("Recovery kit JSON"), {
      target: { value: serialized }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import kit" }));

    expect(await screen.findByText(/Recovery kit imported/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Recovery kit JSON")).toHaveValue("");
    expect(document.body).not.toHaveTextContent(record.noteSecret);
  });

  it("hides recovery kit backup when no spendable note is loaded", () => {
    render(<ShieldedTransfersPanel />);

    expect(screen.queryByRole("button", { name: /Backup .* ETH note/i })).not.toBeInTheDocument();
  });

  it("shows recovery kit backup after a spendable note is restored", async () => {
    const record = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    expect(screen.getByRole("button", { name: /Backup .* ETH note/i })).toBeInTheDocument();
  });

  it("keeps recovery kit backup optional, acknowledgement-gated, and hidden from raw display", async () => {
    const record = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const createObjectURL = vi.fn((_: unknown) => "blob:nullark-recovery-kit");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    class TestBlob {
      readonly parts: unknown[];
      readonly type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
      }
    }
    vi.stubGlobal("Blob", TestBlob as unknown as typeof Blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    expect(screen.getByRole("button", { name: /Backup .* ETH note/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Backup .* ETH note/i }));
    const backupDialog = screen.getByRole("dialog", { name: "Backup note recovery kit" });
    expect(screen.getByText(/Wallet recovery is the default/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download recovery kit" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Copy JSON" })).not.toBeInTheDocument();
    expect(backupDialog).not.toHaveTextContent(record.noteSecret);

    fireEvent.click(screen.getByLabelText(/I understand this kit can spend the note/i));
    fireEvent.click(screen.getByRole("button", { name: "Download recovery kit" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:nullark-recovery-kit");
    expect(await screen.findByText(/Recovery kit download prepared/i)).toBeInTheDocument();

    const blob = createObjectURL.mock.calls[0]?.[0] as unknown as { parts: unknown[]; type: string };
    expect(blob.type).toBe("application/json");
    const copied = JSON.parse(String(blob.parts[0]));
    expect(copied.domain).toBe("RECOVERY_KIT_V1");
    expect(copied.chainId).toBe(MEGAETH_TESTNET_CHAIN_ID);
    expect(copied.poolAddress).toBe(SHIELDED_POOL_ADDRESS);
    expect(copied.noteSecret).toBe(record.noteSecret);
    expect(JSON.stringify(copied)).not.toMatch(/wallet|discovery|tag/i);
    expect(backupDialog).not.toHaveTextContent(record.noteSecret);
  });

  it("backs up an exact note when multiple notes share the same amount", async () => {
    const firstRecord = saveAvailablePrivateTransferNote();
    const secondRecord = createSandboxSpendMaterialNoteRecord({
      ...firstRecord,
      commitment: `0x${"0b".repeat(32)}`,
      noteSecret: `0x${"03".repeat(32)}`,
      ownerCommitment: `0x${"04".repeat(32)}`,
      blinding: `0x${"05".repeat(32)}`,
      depositTxHash: `0x${"ad".repeat(32)}`,
      createdAt: "2026-05-02T00:01:00.000Z",
      leafIndex: 1
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: firstRecord, updatedAt: "2026-05-02T00:00:00.000Z" }),
      createSandboxNoteVaultEntry({ record: secondRecord, updatedAt: "2026-05-02T00:01:00.000Z" })
    ]);
    setDiagnosticsLocation();
    const createObjectURL = vi.fn((_: unknown) => "blob:nullark-recovery-kit-2");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    class TestBlob {
      readonly parts: unknown[];
      readonly type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
      }
    }
    vi.stubGlobal("Blob", TestBlob as unknown as typeof Blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(firstRecord);
    await restoreNoteRecordThroughDiagnostics(secondRecord);

    expect(screen.getByText("x2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Backup .* ETH note/i }));
    fireEvent.click(screen.getByRole("button", { name: /Note 2/i }));
    fireEvent.click(screen.getByLabelText(/I understand this kit can spend the note/i));
    fireEvent.click(screen.getByRole("button", { name: "Download recovery kit" }));

    const blob = createObjectURL.mock.calls[0]?.[0] as unknown as { parts: unknown[]; type: string };
    const copied = JSON.parse(String(blob.parts[0]));
    expect(copied.commitment).toBe(secondRecord.commitment);
    expect(copied.noteSecret).toBe(secondRecord.noteSecret);
    expect(copied.noteSecret).not.toBe(firstRecord.noteSecret);
  });

  it("does not default same-amount backup groups to recovery-kit imported notes", async () => {
    const baseRecord = saveAvailablePrivateTransferNote();
    const cleanRecord = createSandboxSpendMaterialNoteRecord({
      ...baseRecord,
      createdAt: "2026-05-02T00:01:00.000Z"
    });
    const recoveryKitRecord = createSandboxSpendMaterialNoteRecord({
      ...baseRecord,
      commitment: `0x${"0b".repeat(32)}`,
      noteSecret: `0x${"03".repeat(32)}`,
      ownerCommitment: `0x${"04".repeat(32)}`,
      blinding: `0x${"05".repeat(32)}`,
      depositTxHash: `0x${"ad".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z",
      leafIndex: 1,
      recoveryRoute: "recovery-kit"
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: recoveryKitRecord, updatedAt: "2026-05-02T00:00:00.000Z" }),
      createSandboxNoteVaultEntry({ record: cleanRecord, updatedAt: "2026-05-02T00:01:00.000Z" })
    ]);
    setDiagnosticsLocation();
    const createObjectURL = vi.fn((_: unknown) => "blob:nullark-recovery-kit-clean");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    class TestBlob {
      readonly parts: unknown[];
      readonly type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
      }
    }
    vi.stubGlobal("Blob", TestBlob as unknown as typeof Blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(recoveryKitRecord);
    await restoreNoteRecordThroughDiagnostics(cleanRecord);

    fireEvent.click(screen.getByRole("button", { name: /Backup .* ETH note/i }));
    expect(screen.queryByRole("button", { name: /Note 1/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I understand this kit can spend the note/i));
    fireEvent.click(screen.getByRole("button", { name: "Download recovery kit" }));

    const blob = createObjectURL.mock.calls[0]?.[0] as unknown as { parts: unknown[]; type: string };
    const copied = JSON.parse(String(blob.parts[0]));
    expect(copied.commitment).toBe(cleanRecord.commitment);
    expect(copied.noteSecret).toBe(cleanRecord.noteSecret);
    expect(copied.noteSecret).not.toBe(recoveryKitRecord.noteSecret);
  });

  it("exports mainnet recovery kits with mainnet chain and pool binding", async () => {
    const record = createMainnetRecoveryNote();
    setDiagnosticsLocation();
    setProductRuntimeConfigForTests(createExplicitMainnetProductRuntimeConfig());
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record, updatedAt: "2026-05-25T00:00:00.000Z" })
    ]);
    const createObjectURL = vi.fn((_: unknown) => "blob:nullark-mainnet-recovery-kit");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    class TestBlob {
      readonly parts: unknown[];
      readonly type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.type = options?.type ?? "";
      }
    }
    vi.stubGlobal("Blob", TestBlob as unknown as typeof Blob);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(record);

    fireEvent.click(screen.getByRole("button", { name: /Backup .* ETH note/i }));
    fireEvent.click(screen.getByLabelText(/I understand this kit can spend the note/i));
    fireEvent.click(screen.getByRole("button", { name: "Download recovery kit" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:nullark-mainnet-recovery-kit");
    const blob = createObjectURL.mock.calls[0]?.[0] as unknown as { parts: unknown[]; type: string };
    expect(blob.type).toBe("application/json");
    const copied = JSON.parse(String(blob.parts[0]));
    expect(copied.chainId).toBe(4326);
    expect(copied.poolAddress).toBe("0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8");
    expect(copied.runtimeId).toBe("nullark-v1.2-mainnet");
  });

  it("rejects recovery kit restore when the kit is for a different network", async () => {
    const testnetRecord = saveAvailablePrivateTransferNote();
    const kit = createRecoveryKitV1FromNoteRecord(testnetRecord, { runtimeId: "nullark-v1.2-testnet-candidate" });
    setProductRuntimeConfigForTests(createExplicitMainnetProductRuntimeConfig());

    render(<ShieldedTransfersPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Recovery kit Restore balance/i }));
    fireEvent.change(screen.getByLabelText("Recovery kit JSON"), {
      target: { value: serializeRecoveryKitV1(kit) }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import kit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Recovery kit is not for expected MegaETH chain|Recovery kit is not for this shielded pool/
    );
  });

  it("uses v1.2 output-note naming in manual withdrawal proof copy", () => {
    setDiagnosticsLocation();
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));

    const advancedCopy = screen.getByRole("heading", { name: "Withdrawal proof bundle" }).closest(".nullark-card");
    expect(advancedCopy).toHaveTextContent("output commitment");
    expect(advancedCopy).toHaveTextContent("encryptedOutputNoteHash");
    expect(advancedCopy).not.toHaveTextContent(/change note/i);
    expect(advancedCopy).not.toHaveTextContent(/change commitment/i);
    expect(screen.getByLabelText("Spend-material note JSON")).toHaveAttribute(
      "placeholder",
      "Advanced recovery: paste exported note or recovery kit JSON."
    );
    expect(screen.getByLabelText("Spend-material note JSON")).not.toHaveAttribute(
      "placeholder",
      expect.stringContaining("encrypted output note JSON")
    );
    expect(screen.getByLabelText("Public inputs")).not.toHaveAttribute(
      "placeholder",
      expect.stringContaining("8 bytes32")
    );
  });

  it("describes generated zero-output v1.2 withdrawal proofs as encrypted output notes", async () => {
    const record = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"48".repeat(32)}`;
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return record.currentRootAfter;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const data = body.params?.[0]?.data;
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([record.commitment]) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("feeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(33n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("MAX_FEE_BPS")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(100n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeActivationTime")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: destination,
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [`0x${"49".repeat(32)}`] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));
    await restoreNoteRecordThroughDiagnostics(record);
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: formatTestEth(record.noteAmountWei) } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    const withdrawalBundleCard = screen.getByRole("heading", { name: "Withdrawal proof bundle" }).closest(".nullark-card");
    expect(withdrawProofWorkerRequests[0]?.publicInputSchema).toBe("v1.2-unlinkable");
    expect(withdrawProofWorkerRequests[0]?.witness.outputAmount).toBe("0");
    expect(withdrawalBundleCard).toHaveTextContent("Withdrawal mined and output commitment confirmed.");
    expect(withdrawalBundleCard).not.toHaveTextContent(/No encrypted output note generated/i);
    expect(withdrawalBundleCard).not.toHaveTextContent(/Full-note withdrawal proof/i);
    expect(withdrawalBundleCard).not.toHaveTextContent(/private change note/i);
  });

  it("does not downgrade failed v1.2 browser proving to the legacy local v1.1 proof fallback", async () => {
    const record = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      allowLocalDevProofServiceFallback: true,
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });
    class FailingWorker {
      onmessage: ((event: { data: unknown }) => void) | undefined;
      onerror: ((event: unknown) => void) | undefined;
      postMessage(message: unknown) {
        const request = message as { id: string };
        queueMicrotask(() => {
          this.onmessage?.({ data: { id: request.id, ok: false, error: "forced v1.2 proof failure" } });
        });
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FailingWorker);
    let localProofServiceCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const data = body.params?.[0]?.data;
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([record.commitment]) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("feeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(33n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("MAX_FEE_BPS")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(100n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeActivationTime")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(0n) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          localProofServiceCalls += 1;
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: DEFAULT_BROWSER_WITHDRAW_PROOF,
            publicInputs: Array.from({ length: 12 }, (_, index) => `0x${index.toString(16).padStart(64, "0")}`),
            nullifier: `0x${"44".repeat(32)}`,
            destination: "0x1111111111111111111111111111111111111111",
            grossAmountWei: record.noteAmountWei,
            feeWei: "0",
            netAmountWei: record.noteAmountWei,
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: vi.fn(async ({ method, params }) => {
          if (method === "eth_call") {
            if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
              return record.currentRootAfter;
            }
            return `0x${"0".repeat(63)}1`;
          }
          throw new Error(`unexpected wallet method ${method}`);
        })
      }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));
    await restoreNoteRecordThroughDiagnostics(record);
    fireEvent.change(screen.getByLabelText("Public wallet address"), {
      target: { value: "0x1111111111111111111111111111111111111111" }
    });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: formatTestEth(record.noteAmountWei) } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Browser proving failed\. Local proof-service fallback is disabled for this runtime\./
        )
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/forced v1\.2 proof failure/)).toBeInTheDocument();
    expect(localProofServiceCalls).toBe(0);
  });

  it("keeps manual v1.2 unlinkable withdrawal disabled until encrypted output note bytes are loaded", async () => {
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawNullifier = `0x${"43".repeat(32)}`;
    const proofRoot = `0x${"12".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = withdrawalFeeFor(BigInt(grossAmountWei)).toString();
    const proofContextHash = TEST_PROOF_CONTEXT_HASH;
    const outputCommitment = `0x${"08".repeat(32)}`;
    const collisionRecord = createSandboxSpendMaterialNoteRecord({
      ...saveAvailablePrivateTransferNote(),
      commitment: proofContextHash,
      depositTxHash: `0x${"42".repeat(32)}`,
      currentRootAfter: proofRoot,
      createdAt: "2026-05-15T00:00:00.000Z",
      leafIndex: 2
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: collisionRecord, updatedAt: "2026-05-15T00:00:00.000Z" })
    ]);
    const publicInputs = [
      proofRoot,
      withdrawNullifier,
      outputCommitment,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(feeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      proofContextHash,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return Response.json({ jsonrpc: "2.0", id: 1, result: body.method === "eth_getLogs" ? [] : `0x${"0".repeat(63)}1` });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByText("Advanced / recovery"));
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: formatTestEth(grossAmountWei) } });
    fireEvent.change(screen.getByLabelText("Proof hex"), { target: { value: DEFAULT_BROWSER_WITHDRAW_PROOF } });
    fireEvent.change(screen.getByLabelText("Public inputs"), { target: { value: publicInputs.join("\n") } });
    fireEvent.change(screen.getByLabelText("Nullifier"), { target: { value: withdrawNullifier } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send withdrawal" })).toBeDisabled();
      expect(screen.getByText("Withdrawal proof requires the encrypted output note payload.")).toBeInTheDocument();
    });
    const [storedEntry] = loadSandboxNoteVault(window.localStorage);
    expect(storedEntry?.record.commitment).toBe(proofContextHash);
    expect(storedEntry?.spent).toBe(false);
  });

  it("always submits guided public exits through the local relayer instead of the user wallet", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"06".repeat(32)}`;
    const withdrawNullifier = `0x${"07".repeat(32)}`;
    const proofRoot = `0x${"12".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = withdrawalFeeFor(BigInt(grossAmountWei)).toString();
    const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
    const publicInputs = [
      proofRoot,
      withdrawNullifier,
      `0x${"00".repeat(32)}`,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(feeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: "0xabcd",
            publicInputs,
            nullifier: withdrawNullifier,
            destination,
            grossAmountWei,
            feeWei,
            netAmountWei,
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: "0x1111111111111111111111111111111111111111",
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: "0x1111111111111111111111111111111111111111",
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [withdrawNullifier] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    setTestHostname("localhost");

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    expect(screen.getByLabelText("Amount to exit")).toHaveValue("0.00001");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    await waitFor(() => expect(screen.getAllByText("0x1111...1111").length).toBeGreaterThanOrEqual(2));
    const successToast = screen.getByRole("status");
    expect(successToast).toHaveClass("nullark-live-progress--success");
    expect(successToast).toHaveAttribute("data-progress-state", "confirmed");
    expect(successToast.querySelector(".nullark-live-step--active")).toBeNull();
    expect(screen.getByDisplayValue(destination)).toBeInTheDocument();
    expect(screen.getAllByText(`${formatTestEth(feeWei)} ETH`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${formatTestEth(netAmountWei)} ETH`).length).toBeGreaterThan(0);
    expect(screen.getAllByText("0xce4D...C8E1").length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });

  it("surfaces local testnet relayer failure without direct wallet submit", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"08".repeat(32)}`;
    const withdrawNullifier = `0x${"09".repeat(32)}`;
    const proofRoot = `0x${"12".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = withdrawalFeeFor(BigInt(grossAmountWei)).toString();
    const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
    const publicInputs = [
      proofRoot,
      withdrawNullifier,
      `0x${"00".repeat(32)}`,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(feeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      if (method === "eth_requestAccounts") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      if (method === "eth_sendTransaction") {
        return withdrawTxHash;
      }
      if (method === "eth_getTransactionReceipt") {
        return {
          status: "0x1",
          transactionHash: withdrawTxHash,
          from: "0x1111111111111111111111111111111111111111",
          to: SHIELDED_POOL_ADDRESS,
          logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [withdrawNullifier] }]
        };
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: "0xabcd",
            publicInputs,
            nullifier: withdrawNullifier,
            destination,
            grossAmountWei,
            feeWei,
            netAmountWei,
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          throw new TypeError("Failed to fetch");
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    setTestHostname("localhost");

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.queryByText(withdrawTxHash)).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });

  it("uses live governed pool fee state for browser withdrawal proofs", async () => {
    const governedFeeBps = 50n;
    const pendingFeeBps = 75n;
    const pendingActivation = 1_780_272_000n;
    setProductRuntimeConfigForTests({
      ...createTestnetProductRuntimeConfig(),
      withdrawalFeeState: {
        activeFeeBps: 33,
        maxFeeBps: 100,
        pendingFeeActive: false,
        source: "on-chain-feeBps"
      }
    });
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"16".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = governedWithdrawalFeeFor(BigInt(grossAmountWei), governedFeeBps).toString();
    const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return noteRecord.currentRootAfter;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const data = body.params?.[0]?.data;
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("feeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(governedFeeBps) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("MAX_FEE_BPS")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(100n) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeBps")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(pendingFeeBps) });
          }
          if (body.method === "eth_call" && data === poolFeeStateCallData("pendingFeeActivationTime")) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: bytes32FromDecimal(pendingActivation) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: "0x1111111111111111111111111111111111111111",
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: "0x1111111111111111111111111111111111111111",
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [`0x${"17".repeat(32)}`] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    setTestHostname("localhost");

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(withdrawProofWorkerRequests).toHaveLength(1);
    expect(withdrawProofWorkerRequests[0]?.expectedFeeBps).toBe(Number(governedFeeBps));
    expect(withdrawProofWorkerRequests[0]?.witness.fee).toBe(feeWei);
    expect(screen.getAllByText(`${formatTestEth(feeWei)} ETH`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${formatTestEth(netAmountWei)} ETH`).length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });

  it("keeps the withdrawal nullifier unspent while a relayed withdrawal is only submitted", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"36".repeat(32)}` as HexString;
    const withdrawNullifier = `0x${"37".repeat(32)}` as HexString;
    const proofRoot = `0x${"12".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = withdrawalFeeFor(BigInt(grossAmountWei)).toString();
    const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
    const publicInputs = [
      proofRoot,
      withdrawNullifier,
      `0x${"00".repeat(32)}`,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(feeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    let resolveReceipt:
      | ((receipt: {
          status: HexString;
          transactionHash: HexString;
          from: HexString;
          to: HexString;
          logs: Array<{ address: HexString; topics: HexString[] }>;
        }) => void)
      | undefined;
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      if (method === "eth_getTransactionReceipt") {
        return new Promise<{
          status: HexString;
          transactionHash: HexString;
          from: HexString;
          to: HexString;
          logs: Array<{ address: HexString; topics: HexString[] }>;
        }>((resolve) => {
          resolveReceipt = resolve;
        });
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: "0xabcd",
            publicInputs,
            nullifier: withdrawNullifier,
            destination,
            grossAmountWei,
            feeWei,
            netAmountWei,
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: destination
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    const nullifierSpentLabel = screen.getByText("Nullifier spent");
    expect(nullifierSpentLabel.nextElementSibling?.textContent).toBe("not checked");

    resolveReceipt?.({
      status: "0x1",
      transactionHash: withdrawTxHash,
      from: destination,
      to: SHIELDED_POOL_ADDRESS,
      logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [withdrawNullifier] }]
    });
    await waitFor(() => expect(nullifierSpentLabel.nextElementSibling?.textContent).toBe("true"));
  });

  it("regenerates a browser withdrawal proof when the first live verifier self-check fails", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"26".repeat(32)}`;
    const proofRoot = `0x${"12".repeat(32)}`;
    const verifierAddress = "0x5fd897390f32f9b7f035ff5a73696bffb7f20752";
    const workerProofs = [`0x${"11".repeat(256)}`, `0x${"22".repeat(256)}`] as const;
    const verifierCalls: string[] = [];
    const workerCalls: string[] = [];

    class RetryWorkerMock {
      onmessage: ((event: { data: unknown }) => void) | undefined;
      onerror: ((event: unknown) => void) | undefined;

      postMessage(message: unknown) {
        const request = message as { id: string; witness: Record<string, string> };
        const proof = workerProofs[workerCalls.length] ?? workerProofs[1];
        workerCalls.push(proof);
        const witnessValue = (key: string) => {
          const value = request.witness[key];
          if (value === undefined) throw new Error(`missing witness ${key}`);
          return value;
        };
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              proof,
              proofCandidates: [proof],
              publicInputs: [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("newCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("spentCommitment")),
                bytes32FromDecimal(witnessValue("noteAmount")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedNoteHash"))
              ],
              nullifier: bytes32FromDecimal(witnessValue("nullifier"))
            }
          });
        });
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", RetryWorkerMock);

    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const call = body.params?.[0] ?? {};
          const calldata = String(call.data ?? "");
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          if (body.method === "eth_call" && calldata === "0x2b7ac3f3") {
            return Response.json({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${verifierAddress.slice(2).toLowerCase().padStart(64, "0")}`
            });
          }
          if (body.method === "eth_call" && String(call.to).toLowerCase() === verifierAddress.toLowerCase()) {
            verifierCalls.push(calldata);
            const accepted = calldata.includes(workerProofs[1].slice(2, 66));
            return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${(accepted ? "1" : "0").padStart(64, "0")}` });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === DEPLOYED_RELAYER_SERVICE_URL) {
          return Response.json({
            ok: true,
            scope: "deployed-withdrawal-relayer",
            txHash: withdrawTxHash,
            relayer: destination,
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [`0x${"07".repeat(32)}`] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    setTestHostname("shielded-balance-transfers.pages.dev");

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 5000 });
    expect(workerCalls[0]).toBe(workerProofs[0]);
    expect(workerCalls).toContain(workerProofs[1]);
    expect(verifierCalls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Browser withdrawal proof failed live verifier self-check/i)).not.toBeInTheDocument();
  }, 10_000);

  it("fails closed without relaying when every regenerated browser withdrawal proof is rejected", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    setTestHostname("shielded-balance-transfers.pages.dev");
    const destination = "0x1111111111111111111111111111111111111111";
    const proofRoot = `0x${"12".repeat(32)}`;
    const verifierAddress = "0x5fd897390f32f9b7f035ff5a73696bffb7f20752";
    const workerProofs = [`0x${"31".repeat(256)}`, `0x${"32".repeat(256)}`, `0x${"33".repeat(256)}`] as const;
    const workerCalls: string[] = [];
    const verifierCalls: string[] = [];
    let relayerCalls = 0;

    class RejectedProofWorkerMock {
      onmessage: ((event: { data: unknown }) => void) | undefined;
      onerror: ((event: unknown) => void) | undefined;

      postMessage(message: unknown) {
        const request = message as { id: string; witness: Record<string, string> };
        const proof = workerProofs[workerCalls.length] ?? workerProofs[workerProofs.length - 1]!;
        workerCalls.push(proof);
        const witnessValue = (key: string) => {
          const value = request.witness[key];
          if (value === undefined) throw new Error(`missing witness ${key}`);
          return value;
        };
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              proof,
              proofCandidates: [proof],
              publicInputs: [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("newCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("spentCommitment")),
                bytes32FromDecimal(witnessValue("noteAmount")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedNoteHash"))
              ],
              nullifier: bytes32FromDecimal(witnessValue("nullifier"))
            }
          });
        });
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", RejectedProofWorkerMock);

    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const call = body.params?.[0] ?? {};
          const calldata = String(call.data ?? "");
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          if (body.method === "eth_call" && calldata === "0x2b7ac3f3") {
            return Response.json({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${verifierAddress.slice(2).toLowerCase().padStart(64, "0")}`
            });
          }
          if (body.method === "eth_call" && String(call.to).toLowerCase() === verifierAddress.toLowerCase()) {
            verifierCalls.push(calldata);
            return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === DEPLOYED_RELAYER_SERVICE_URL) {
          relayerCalls += 1;
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getByText(/deployed verifier rejected every browser proof encoding/i)).toBeInTheDocument(), {
      timeout: 9000
    });
    expect(workerCalls).toEqual([...workerProofs]);
    expect(verifierCalls).toHaveLength(3);
    expect(relayerCalls).toBe(0);
  }, 10_000);

  it("does not regenerate browser withdrawal proofs when verifier self-check RPC fails", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    setTestHostname("shielded-balance-transfers.pages.dev");
    const destination = "0x1111111111111111111111111111111111111111";
    const proofRoot = `0x${"12".repeat(32)}`;
    const verifierAddress = "0x5fd897390f32f9b7f035ff5a73696bffb7f20752";
    const proof = `0x${"41".repeat(256)}` as const;
    const workerCalls: string[] = [];
    let relayerCalls = 0;

    class RpcErrorWorkerMock {
      onmessage: ((event: { data: unknown }) => void) | undefined;
      onerror: ((event: unknown) => void) | undefined;

      postMessage(message: unknown) {
        const request = message as { id: string; witness: Record<string, string> };
        workerCalls.push(proof);
        const witnessValue = (key: string) => {
          const value = request.witness[key];
          if (value === undefined) throw new Error(`missing witness ${key}`);
          return value;
        };
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              proof,
              proofCandidates: [proof],
              publicInputs: [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("newCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("spentCommitment")),
                bytes32FromDecimal(witnessValue("noteAmount")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedNoteHash"))
              ],
              nullifier: bytes32FromDecimal(witnessValue("nullifier"))
            }
          });
        });
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", RpcErrorWorkerMock);

    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const call = body.params?.[0] ?? {};
          const calldata = String(call.data ?? "");
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          if (body.method === "eth_call" && calldata === "0x2b7ac3f3") {
            return Response.json({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${verifierAddress.slice(2).toLowerCase().padStart(64, "0")}`
            });
          }
          if (body.method === "eth_call" && String(call.to).toLowerCase() === verifierAddress.toLowerCase()) {
            return Response.json({
              jsonrpc: "2.0",
              id: 1,
              error: { code: -32603, message: "verifier rpc down" }
            });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === DEPLOYED_RELAYER_SERVICE_URL) {
          relayerCalls += 1;
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getByText(/verifier rpc down/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(workerCalls).toEqual([proof]);
    expect(relayerCalls).toBe(0);
  }, 10_000);

  it("falls back to MegaETH RPC when wallet provider reads lag for commitment and preflight", async () => {
    const noteRecord = saveAvailablePrivateTransferNote();
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const withdrawTxHash = `0x${"16".repeat(32)}`;
    const withdrawNullifier = `0x${"17".repeat(32)}`;
    const proofRoot = `0x${"12".repeat(32)}`;
    const grossAmountWei = "10000000000000";
    const feeWei = withdrawalFeeFor(BigInt(grossAmountWei)).toString();
    const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
    const publicInputs = [
      proofRoot,
      withdrawNullifier,
      `0x${"00".repeat(32)}`,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(feeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        if (String(params?.[0]?.data).startsWith("0x839df945")) {
          return `0x${"0".repeat(64)}`;
        }
        throw Object.assign(new Error("Internal JSON-RPC error."), {
          code: -32603,
          data: { code: 3, message: "execution reverted: unaccepted root" }
        });
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    let megaEthPreflightAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          const calldata = String(body.params?.[0]?.data ?? "");
          const callTo = String(body.params?.[0]?.to ?? "").toLowerCase();
          const isVerifierSelfCheck = calldata === "0x2b7ac3f3" || callTo === "0x0000000000000000000000000000000000000001";
          const isPoolStatsRead = [
            "0xfdab463d",
            "0x0be4f422",
            "0xf420f6f9",
            "0x3a4ae669",
            "0x0fe032db",
            "0x3253eb17"
          ].some((selector) => calldata.startsWith(selector));
          if (
            body.method === "eth_call" &&
            !isVerifierSelfCheck &&
            !isPoolStatsRead &&
            !calldata.startsWith("0x839df945") &&
            !calldata.startsWith("0xbbccdbc4")
          ) {
            megaEthPreflightAttempts += 1;
            if (megaEthPreflightAttempts === 1) {
              return Response.json({
                jsonrpc: "2.0",
                id: 1,
                error: { code: 3, message: "execution reverted: unaccepted root" }
              });
            }
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: "0xabcd",
            publicInputs,
            nullifier: withdrawNullifier,
            destination,
            grossAmountWei,
            feeWei,
            netAmountWei,
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: withdrawTxHash,
            relayer: destination,
            receipt: {
              status: "0x1",
              transactionHash: withdrawTxHash,
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [withdrawNullifier] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(screen.getAllByText(withdrawTxHash).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(megaEthPreflightAttempts).toBe(2);
    expect(screen.queryByText("Recovered note commitment was not found on-chain for this shielded pool.")).not.toBeInTheDocument();
    expect(screen.queryByText(/unaccepted root/i)).not.toBeInTheDocument();
  });

  it("selects withdrawal change as the next note after a split public exit", async () => {
    setDiagnosticsLocation();
    const destination = "0x1111111111111111111111111111111111111111";
    const proofRoot = `0x${"12".repeat(32)}`;
    const firstNullifier = `0x${"07".repeat(32)}`;
    const secondNullifier = `0x${"08".repeat(32)}`;
    const changeCommitment = `0x${"09".repeat(32)}`;
    const firstNoteAmountWei = "10000000000000000";
    const firstGrossAmountWei = "5000000000000000";
    const firstFeeWei = "16500000000000";
    const firstChangeAmountWei = "5000000000000000";
    const noteRecord = createSandboxSpendMaterialNoteRecord({
      ...saveAvailablePrivateTransferNote(),
      noteAmountWei: firstNoteAmountWei,
      merklePath: {
        root: proofRoot as HexString,
        siblings: Array.from({ length: 12 }, (_, index) => `0x${(0x13 + index).toString(16).repeat(32)}` as const),
        pathIndices: Array.from({ length: 12 }, () => 0),
        status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
      }
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: noteRecord, updatedAt: "2026-05-02T00:00:00.000Z" })
    ]);
    const proofRequests: Array<{ grossAmountWei: string; noteRecord: { commitment: string; noteAmountWei: string } }> = [];
    const publicInputsFor = ({
      nullifier,
      newCommitment,
      spentCommitment,
      noteAmountWei,
      grossAmountWei = firstGrossAmountWei
    }: {
      nullifier: string;
      newCommitment: string;
      spentCommitment: string;
      noteAmountWei: string;
      grossAmountWei?: string;
    }) => [
      proofRoot,
      nullifier,
      newCommitment,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${BigInt(grossAmountWei).toString(16).padStart(64, "0")}`,
      `0x${BigInt(firstFeeWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      spentCommitment,
      `0x${BigInt(noteAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_requestAccounts") {
        return [destination];
      }
      if (method === "eth_signTypedData_v4") {
        return UNLOCK_SIGNATURE;
      }
      if (method === "eth_chainId") {
        return "0x18c7";
      }
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          if (body.method === "eth_blockNumber") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1136f96" });
          }
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor([DEFAULT_AMOUNT_POSEIDON_COMMITMENT]) });
          }
          if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
            return Response.json({ jsonrpc: "2.0", id: 1, result: proofRoot });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          const body = JSON.parse(String(init?.body));
          if (BigInt(body.grossAmountWei) > BigInt(body.noteRecord.noteAmountWei)) {
            return Response.json(
              { ok: false, error: "grossAmountWei cannot exceed the imported note amount." },
              { status: 422 }
            );
          }
          proofRequests.push(body);
          if (proofRequests.length === 1) {
            return Response.json({
              ok: true,
              scope: "local-untrusted-dev-only",
              proof: "0xabcd",
              publicInputs: publicInputsFor({
                nullifier: firstNullifier,
                newCommitment: changeCommitment,
                spentCommitment: DEFAULT_AMOUNT_POSEIDON_COMMITMENT,
                noteAmountWei: firstNoteAmountWei
              }),
              nullifier: firstNullifier,
              destination,
              grossAmountWei: firstGrossAmountWei,
              feeWei: firstFeeWei,
              netAmountWei: "499995000000000",
              changeAmountWei: firstChangeAmountWei,
              encryptedChangeNote: "0xabcd",
              changeNote: {
                assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
                noteAmountWei: firstChangeAmountWei,
                ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
                noteSecret: `0x03${"33".repeat(31)}`,
                blinding: `0x04${"44".repeat(31)}`,
                commitment: changeCommitment
              }
            });
          }
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: "0xbcde",
            publicInputs: publicInputsFor({
              nullifier: secondNullifier,
              newCommitment: `0x${"00".repeat(32)}`,
              spentCommitment: changeCommitment,
              noteAmountWei: firstChangeAmountWei,
              grossAmountWei: firstChangeAmountWei
            }),
            nullifier: secondNullifier,
            destination,
            grossAmountWei: firstChangeAmountWei,
            feeWei: "3000000000",
            netAmountWei: "2997000000000",
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          const nullifier = proofRequests.length === 1 ? firstNullifier : secondNullifier;
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: `0x${String(proofRequests.length).padStart(2, "0").repeat(32)}`,
            relayer: destination,
            receipt: {
              status: "0x1",
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [nullifier, changeCommitment] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });
    class SplitChangeFallbackProofWorker {
      onmessage: ((event: { data: unknown }) => void) | undefined;

      postMessage(message: unknown) {
        const request = message as { id: string };
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: false,
              error: "forced local proof fallback"
            }
          });
        });
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", SplitChangeFallbackProofWorker);

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(noteRecord);

    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: "0.005" } });
    await waitFor(() => expect(screen.getByLabelText("Public wallet address")).toHaveValue(destination));
    await waitFor(() => expect(screen.getByLabelText("Amount to exit")).toHaveValue("0.005"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(proofRequests).toHaveLength(1), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText("0.005 ETH available")).toBeInTheDocument());
    expect(screen.getByLabelText("Amount to exit")).toHaveValue("0.005");
    expect(proofRequests[0]?.noteRecord.commitment).toBe(DEFAULT_AMOUNT_POSEIDON_COMMITMENT);
  });

  it("selects the remaining visible note after a full public exit spends the selected note", async () => {
    const selectedRecord = saveAvailablePrivateTransferNote();
    const remainingRecord = createSandboxSpendMaterialNoteRecord({
      ...selectedRecord,
      commitment: `0x${"0a".repeat(32)}`,
      noteAmountWei: "2000000000000",
      depositTxHash: `0x${"ac".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:01:00.000Z",
      leafIndex: 1
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: selectedRecord, updatedAt: "2026-05-02T00:00:00.000Z" }),
      createSandboxNoteVaultEntry({ record: remainingRecord, updatedAt: "2026-05-02T00:01:00.000Z" })
    ]);
    setDiagnosticsLocation();

    const destination = "0x1111111111111111111111111111111111111111";
    const proofRoot = `0x${"12".repeat(32)}`;
    const nullifierFor = (index: number) => `0x${(0x70n + BigInt(index)).toString(16).padStart(64, "0")}`;
    const proofRequests: Array<{ grossAmountWei: string; noteRecord: { commitment: string; noteAmountWei: string } }> = [];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_requestAccounts") {
        return [destination];
      }
      if (method === "eth_call") {
        if (params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        return `0x${"0".repeat(63)}1`;
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
        const trustedResponse = trustedProverArtifactResponse(key);
        if (trustedResponse) return trustedResponse;
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          const body = JSON.parse(String(init?.body));
          const index = proofRequests.length;
          proofRequests.push(body);
          const nullifier = nullifierFor(index);
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: index === 0 ? "0xabcd" : "0xbcde",
            publicInputs: [
              proofRoot,
              nullifier,
              `0x${"00".repeat(32)}`,
              `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
              `0x${BigInt(body.grossAmountWei).toString(16).padStart(64, "0")}`,
              `0x${withdrawalFeeFor(BigInt(body.grossAmountWei)).toString(16).padStart(64, "0")}`,
              `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
              `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
              body.noteRecord.commitment,
              `0x${BigInt(body.noteRecord.noteAmountWei).toString(16).padStart(64, "0")}`,
              TEST_PROOF_CONTEXT_HASH,
              TEST_ENCRYPTED_NOTE_HASH
            ],
            nullifier,
            destination,
            grossAmountWei: body.grossAmountWei,
            feeWei: withdrawalFeeFor(BigInt(body.grossAmountWei)).toString(),
            netAmountWei: (BigInt(body.grossAmountWei) - withdrawalFeeFor(BigInt(body.grossAmountWei))).toString(),
            changeAmountWei: "0",
            encryptedChangeNote: "0x",
            changeNote: null
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          const nullifier = nullifierFor(proofRequests.length - 1);
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: `0x${String(proofRequests.length).padStart(2, "0").repeat(32)}`,
            relayer: destination,
            receipt: {
              status: "0x1",
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [nullifier] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(remainingRecord);
    await restoreNoteRecordThroughDiagnostics(selectedRecord);
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(proofRequests).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("0.000002 ETH available")).toBeInTheDocument());
    expect(screen.getByLabelText("Amount to exit")).toHaveValue("0.000002");

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(proofRequests).toHaveLength(2));
    expect(proofRequests[0]?.noteRecord.commitment).toBe(selectedRecord.commitment);
    expect(proofRequests[1]?.noteRecord.commitment).toBe(remainingRecord.commitment);
    expect(proofRequests[1]?.noteRecord.noteAmountWei).toBe(remainingRecord.noteAmountWei);
  });

  it("supports ten consecutive 1x withdrawals from one 12x deposit note", async () => {
    const destination = "0x1111111111111111111111111111111111111111";
    const proofRoot = `0x${"12".repeat(32)}` as `0x${string}`;
    const proofSiblings = [
      `0x${"13".repeat(32)}`,
      `0x${"14".repeat(32)}`,
      `0x${"15".repeat(32)}`,
      `0x${"16".repeat(32)}`
    ] as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
    const perWithdrawalWei = 1_000_000_000_000n;
    const initialNoteAmountWei = perWithdrawalWei * 12n;
    const formatTestEth = (wei: bigint) => {
      const whole = wei / 1_000_000_000_000_000_000n;
      const fraction = (wei % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
      return fraction ? `${whole}.${fraction}` : `${whole}`;
    };
    const initialCommitment = DEFAULT_AMOUNT_POSEIDON_COMMITMENT;
    const initialRecord = createSandboxSpendMaterialNoteRecord({
      commitment: initialCommitment,
      noteAmountWei: initialNoteAmountWei.toString(),
      ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      noteSecret: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      blinding: DETERMINISTIC_SPEND_MATERIAL_FIELD,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: proofRoot,
      createdAt: "2026-05-02T00:00:00.000Z",
      leafIndex: 0,
      merklePath: {
        root: proofRoot,
        siblings: proofSiblings,
        pathIndices: [0, 0, 0, 0],
        status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
      },
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true,
      status: SANDBOX_NOTE_WITH_PROOF_STATUS,
      proofGenerationStatus: SANDBOX_LOCAL_UNTRUSTED_PROOF_GENERATED_STATUS
    });
    saveSandboxNoteVault(window.localStorage, [
      createSandboxNoteVaultEntry({ record: initialRecord, updatedAt: "2026-05-02T00:00:00.000Z" })
    ]);
    setDiagnosticsLocation();
    const proofRequests: Array<{ grossAmountWei: string; noteRecord: { commitment: string; noteAmountWei: string } }> = [];
    const changeCommitmentFor = (index: number) => `0x${(0x1000n + BigInt(index)).toString(16).padStart(64, "0")}`;
    const nullifierFor = (index: number) => `0x${(0x2000n + BigInt(index)).toString(16).padStart(64, "0")}`;
    const publicInputsFor = ({
      nullifier,
      newCommitment,
      spentCommitment,
      noteAmountWei
    }: {
      nullifier: string;
      newCommitment: string;
      spentCommitment: string;
      noteAmountWei: string;
    }) => [
      proofRoot,
      nullifier,
      newCommitment,
      `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`,
      `0x${perWithdrawalWei.toString(16).padStart(64, "0")}`,
      `0x${withdrawalFeeFor(perWithdrawalWei).toString(16).padStart(64, "0")}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      spentCommitment,
      `0x${BigInt(noteAmountWei).toString(16).padStart(64, "0")}`,
      TEST_PROOF_CONTEXT_HASH,
      TEST_ENCRYPTED_NOTE_HASH
    ];
    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_requestAccounts") {
        return [destination];
      }
      if (method === "eth_signTypedData_v4") {
        return UNLOCK_SIGNATURE;
      }
      if (method === "eth_call") {
        const data = String(params?.[0]?.data ?? "");
        if (data === CURRENT_ROOT_CALLDATA) {
          return proofRoot;
        }
        if (data.startsWith("0x839df945") || data.startsWith("0x2997e86b")) {
          return `0x${"0".repeat(63)}1`;
        }
        if (proofRequests.length % 2 === 1) {
          throw Object.assign(new Error("Internal JSON-RPC error."), {
            code: -32603,
            data: { code: 3, message: "execution reverted: unaccepted root" }
          });
        }
        return "0x";
      }
      throw new Error(`unexpected wallet method ${method}`);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === "http://127.0.0.1:63430/generate-withdrawal-proof") {
          const body = JSON.parse(String(init?.body));
          if (body.grossAmountWei !== perWithdrawalWei.toString()) {
            return Response.json({ ok: false, error: "unexpected gross amount" }, { status: 422 });
          }
          if (BigInt(body.grossAmountWei) > BigInt(body.noteRecord.noteAmountWei)) {
            return Response.json(
              { ok: false, error: "grossAmountWei cannot exceed the imported note amount." },
              { status: 422 }
            );
          }
          proofRequests.push(body);
          const index = proofRequests.length;
          const noteAmountWei = BigInt(body.noteRecord.noteAmountWei);
          const changeAmountWei = noteAmountWei - perWithdrawalWei;
          const changeCommitment = changeCommitmentFor(index);
          const nullifier = nullifierFor(index);
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            proof: `0x${(0x3000n + BigInt(index)).toString(16)}`,
            publicInputs: publicInputsFor({
              nullifier,
              newCommitment: changeCommitment,
              spentCommitment: body.noteRecord.commitment,
              noteAmountWei: body.noteRecord.noteAmountWei
            }),
            nullifier,
            destination,
            grossAmountWei: perWithdrawalWei.toString(),
            feeWei: withdrawalFeeFor(perWithdrawalWei).toString(),
            netAmountWei: (perWithdrawalWei - withdrawalFeeFor(perWithdrawalWei)).toString(),
            changeAmountWei: changeAmountWei.toString(),
            encryptedChangeNote: "0xabcd",
            changeNote: {
              assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
              noteAmountWei: changeAmountWei.toString(),
              ownerCommitment: DETERMINISTIC_SPEND_MATERIAL_FIELD,
              noteSecret: `0x${(0x4000n + BigInt(index)).toString(16).padStart(64, "0")}`,
              blinding: `0x${(0x5000n + BigInt(index)).toString(16).padStart(64, "0")}`,
              commitment: changeCommitment
            }
          });
        }
        if (key === "http://127.0.0.1:63430/transaction") {
          const index = proofRequests.length;
          return Response.json({
            ok: true,
            scope: "local-untrusted-dev-only",
            txHash: `0x${(0x6000n + BigInt(index)).toString(16).padStart(64, "0")}`,
            relayer: destination,
            receipt: {
              status: "0x1",
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [nullifierFor(index), changeCommitmentFor(index)] }]
            }
          });
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    await restoreNoteRecordThroughDiagnostics(initialRecord);

    fireEvent.click(screen.getByRole("button", { name: "Unlock private balance" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Private balance unlocked" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });
    fireEvent.change(screen.getByLabelText("Amount to exit"), { target: { value: "0.000001" } });

    for (let index = 1; index <= 10; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
      await waitFor(() => expect(proofRequests).toHaveLength(index));
      await waitFor(() =>
        expect(screen.getByText(`${formatTestEth(perWithdrawalWei * BigInt(12 - index))} ETH available`)).toBeInTheDocument()
      );
    }

    expect(proofRequests[0]?.noteRecord.commitment).toBe(initialCommitment);
    for (let index = 2; index <= 10; index += 1) {
      expect(proofRequests[index - 1]?.noteRecord.commitment).toBe(changeCommitmentFor(index - 1));
      expect(proofRequests[index - 1]?.grossAmountWei).toBe(perWithdrawalWei.toString());
    }
    expect(proofRequests[9]?.noteRecord.noteAmountWei).toBe((perWithdrawalWei * 3n).toString());
    expect(screen.queryByText(/unaccepted root/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nullifier already spent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/grossAmountWei cannot exceed/i)).not.toBeInTheDocument();
  });

  it("uses browser proof verifier self-check for varied chunk withdrawals across multiple note sizes", async () => {
    const destination = "0x1111111111111111111111111111111111111111";
    const unitWei = 1_000_000_000_000n;
    const chunksWei = [3n, 4n, 7n, 15n, 2n, 1n].map((value) => value * unitWei);
    const initialNoteSizesWei = [5n, 12n, 20n].map((value) => value * unitWei);
    const verifierAddress = "0x5fd897390f32f9b7f035ff5a73696bffb7f20752";
    const invalidProof = `0x${"11".repeat(256)}` as const;
    const verifierAcceptedProof = `0x${"22".repeat(256)}` as const;
    const insertedCommitments: string[] = [];
    const browserProofRequests: Array<{ witness: Record<string, string> }> = [];
    const verifierCalls: string[] = [];
    const relayedWithdrawals: string[] = [];
    const localProofServiceCalls: string[] = [];

    const records = await Promise.all(
      initialNoteSizesWei.map(async (noteAmountWei, index) => {
        const ownerCommitment = `0x${(0x7000n + BigInt(index)).toString(16).padStart(64, "0")}` as `0x${string}`;
        const noteSecret = `0x${(0x7100n + BigInt(index)).toString(16).padStart(64, "0")}` as `0x${string}`;
        const commitment = await deriveBrowserNoteCommitment({
          assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
          noteAmountWei: noteAmountWei.toString(),
          ownerCommitment,
          noteSecret
        });
        insertedCommitments.push(commitment);
        return createSandboxSpendMaterialNoteRecord({
          commitment,
          noteAmountWei: noteAmountWei.toString(),
          ownerCommitment,
          noteSecret,
          blinding: `0x${(0x7200n + BigInt(index)).toString(16).padStart(64, "0")}`,
          depositTxHash: `0x${(0x7300n + BigInt(index)).toString(16).padStart(64, "0")}`,
          currentRootAfter: null,
          createdAt: `2026-05-07T00:00:0${index}.000Z`,
          commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
          commitmentDerivedFromSpendMaterial: true
        });
      })
    );
    saveSandboxNoteVault(
      window.localStorage,
      records.map((record, index) =>
        createSandboxNoteVaultEntry({ record, updatedAt: `2026-05-07T00:00:0${index}.000Z` })
      )
    );
    setDiagnosticsLocation();

    class DeployedStyleWorkerMock {
      onmessage: ((event: { data: unknown }) => void) | undefined;
      onerror: ((event: unknown) => void) | undefined;

      postMessage(message: unknown) {
        const request = message as { id: string; witness: Record<string, string> };
        browserProofRequests.push({ witness: request.witness });
        const witnessValue = (key: string) => {
          const value = request.witness[key];
          if (value === undefined) throw new Error(`missing witness ${key}`);
          return value;
        };
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: true,
              proof: invalidProof,
              proofCandidates: [invalidProof, verifierAcceptedProof],
              publicInputs: [
                bytes32FromDecimal(witnessValue("root")),
                bytes32FromDecimal(witnessValue("nullifier")),
                bytes32FromDecimal(witnessValue("newCommitment")),
                bytes32FromDecimal(witnessValue("destination")),
                bytes32FromDecimal(witnessValue("grossAmount")),
                bytes32FromDecimal(witnessValue("fee")),
                bytes32FromDecimal(witnessValue("chainId")),
                bytes32FromDecimal(witnessValue("verifyingContract")),
                bytes32FromDecimal(witnessValue("spentCommitment")),
                bytes32FromDecimal(witnessValue("noteAmount")),
                bytes32FromDecimal(witnessValue("proofContextHash")),
                bytes32FromDecimal(witnessValue("encryptedNoteHash"))
              ],
              nullifier: bytes32FromDecimal(witnessValue("nullifier"))
            }
          });
        });
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", DeployedStyleWorkerMock);

    const request = vi.fn(async ({ method, params }) => {
      if (method === "eth_requestAccounts") {
        return [destination];
      }
      if (method === "eth_signTypedData_v4") {
        return UNLOCK_SIGNATURE;
      }
      if (method === "eth_call") {
        const data = String(params?.[0]?.data ?? "");
        if (data === CURRENT_ROOT_CALLDATA) {
          return ZERO_ROOT;
        }
        if (data.startsWith("0x839df945") || data.startsWith("0x2997e86b")) {
          return `0x${"0".repeat(63)}1`;
        }
        return "0x";
      }
      throw new Error(`unexpected wallet method ${method}`);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const key = String(url);
    const trustedResponse = trustedProverArtifactResponse(key);
    if (trustedResponse) return trustedResponse;
        if (key === MEGAETH_TESTNET_RPC_URL) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const call = body.params?.[0] ?? {};
          const calldata = String(call.data ?? "");
          if (body.method === "eth_getLogs") {
            return Response.json({ jsonrpc: "2.0", id: 1, result: rootAcceptedLogsFor(insertedCommitments) });
          }
          if (body.method === "eth_call" && calldata === "0x2b7ac3f3") {
            return Response.json({
              jsonrpc: "2.0",
              id: 1,
              result: `0x${verifierAddress.slice(2).toLowerCase().padStart(64, "0")}`
            });
          }
          if (body.method === "eth_call" && String(call.to).toLowerCase() === verifierAddress.toLowerCase()) {
            verifierCalls.push(calldata);
            const accepted = calldata.includes(verifierAcceptedProof.slice(2, 66));
            return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${(accepted ? "1" : "0").padStart(64, "0")}` });
          }
          return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(63)}1` });
        }
        if (key === DEPLOYED_RELAYER_SERVICE_URL) {
          const index = relayedWithdrawals.length + 1;
          const lastRequest = browserProofRequests[browserProofRequests.length - 1]?.witness;
          const changeCommitment = lastRequest?.newCommitment
            ? bytes32FromDecimal(lastRequest.newCommitment)
            : `0x${"00".repeat(32)}`;
          if (changeCommitment !== `0x${"00".repeat(32)}`) {
            insertedCommitments.push(changeCommitment);
          }
          const txHash = `0x${(0x8000n + BigInt(index)).toString(16).padStart(64, "0")}`;
          relayedWithdrawals.push(txHash);
          return Response.json({
            ok: true,
            scope: "deployed-withdrawal-relayer",
            txHash,
            relayer: destination,
            receipt: {
              status: "0x1",
              from: destination,
              to: SHIELDED_POOL_ADDRESS,
              logs: [{ address: SHIELDED_POOL_ADDRESS, topics: [changeCommitment] }]
            }
          });
        }
        if (key.includes("127.0.0.1:63430/generate-withdrawal-proof")) {
          localProofServiceCalls.push(key);
        }
        return new Response("missing", { status: 404 });
      }) as unknown as typeof fetch
    );
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    for (const record of records) {
      await restoreNoteRecordThroughDiagnostics(record);
    }

    fireEvent.click(screen.getByRole("button", { name: "Unlock private balance" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Private balance unlocked" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Public wallet address"), { target: { value: destination } });

    for (const [index, chunkWei] of chunksWei.entries()) {
      fireEvent.change(screen.getByLabelText("Amount to exit"), {
        target: { value: `0.${(chunkWei / unitWei).toString().padStart(6, "0")}` }
      });
      fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
      await waitFor(() => expect(relayedWithdrawals).toHaveLength(index + 1), { timeout: 5000 });
    }

    expect(browserProofRequests.map((request) => request.witness.grossAmount)).toEqual(
      chunksWei.map((chunkWei) => chunkWei.toString())
    );
    expect(browserProofRequests.map((request) => request.witness.noteAmount)).toEqual(
      [5n, 12n, 8n, 20n, 2n, 1n].map((value) => (value * unitWei).toString())
    );
    expect(verifierCalls).toHaveLength(chunksWei.length * 2);
    expect(localProofServiceCalls).toHaveLength(0);
    expect(screen.queryByText(/invalid proof/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unaccepted root/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/commitment was not found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/exceeds available note amount|grossAmountWei cannot exceed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nullifier already spent/i)).not.toBeInTheDocument();
  });

  it("requests an account and typed-data signature before unlocking private balance", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const request = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [account];
      }
      if (method === "eth_signTypedData_v4") {
        return UNLOCK_SIGNATURE;
      }
      throw new Error(`unexpected method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock private balance" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Scan failed" })).toBeInTheDocument());

    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "eth_signTypedData_v4"
    ]);
    const typedDataCall = request.mock.calls.find(([args]) => args.method === "eth_signTypedData_v4");
    expect(typedDataCall).toBeDefined();
    const typedDataParams = typedDataCall?.[0].params as [string, string];
    expect(typedDataParams[0]).toBe(account);
    const typedData = JSON.parse(typedDataParams[1]) as {
      primaryType: string;
      domain: { chainId: number; verifyingContract: string };
      message: { pool: string; warning: string };
    };
    expect(typedData.primaryType).toBe("UnlockShieldedSpendRecovery");
    expect(typedData.domain.chainId).toBe(6343);
    expect(typedData.domain.verifyingContract).toBe(SHIELDED_POOL_ADDRESS);
    expect(typedData.message.pool).toBe(SHIELDED_POOL_ADDRESS);
    expect(typedData.message.warning).toContain("official app domain");
    expect(screen.getByRole("button", { name: "Scan failed" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent(account.slice(0, 6) + "..." + account.slice(-4));
  });

  it("does not render the raw private balance unlock signature", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const request = vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [account];
      }
      if (method === "eth_signTypedData_v4") {
        return UNLOCK_SIGNATURE;
      }
      throw new Error(`unexpected method ${method}`);
    });
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request }
    });

    render(<ShieldedTransfersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Unlock private balance" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Scan failed" })).toBeInTheDocument());
    expect(screen.queryByText(UNLOCK_SIGNATURE)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(UNLOCK_SIGNATURE);
  });
});
