import currentRuntime from "../../runtime/current.json" with { type: "json" };
import testnetRuntime from "../../runtime/testnet.json" with { type: "json" };
import { isEvmAddress, isHexBytes32, type HexString } from "../types.js";

export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export type SupportedMegaEthChainId = typeof MEGAETH_MAINNET_CHAIN_ID | typeof MEGAETH_TESTNET_CHAIN_ID;

export const NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER = [
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

export type NullarkWithdrawPublicInputName = (typeof NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER)[number];

export type ArtifactResolution =
  | { mode: "package-embedded"; packageArtifactVersion: string }
  | { mode: "https-base-url"; baseUrl: string }
  | { mode: "local-artifact-dir"; artifactDir: string };

export type NullarkCurrentRuntime = {
  schema: "nullark-sdk-runtime-current-v1";
  productVersion: string;
  environment: "megaeth-mainnet" | "megaeth-testnet-nullark";
  chainId: SupportedMegaEthChainId;
  rpcUrl: "https://mainnet.megaeth.com/rpc" | "https://carrot.megaeth.com/rpc";
  poolContractName: "NullarkPool";
  pool: HexString;
  poolDeploymentBlock: HexString;
  merkleTreeDepth: number;
  withdrawalFeeBps: number;
  relayerEndpoint: string;
  relayerEndpointLabel: "Machine/API endpoint" | "Testnet relayer endpoint";
  privateTransferVerifier: HexString;
  withdrawVerifier: HexString;
  verifierAdapter: HexString;
  withdrawVerifierBytecodeHash: HexString;
  withdrawSelector: HexString;
  artifactTrustMode?: "mainnet-trusted-setup" | "testnet-local-dev-untrusted";
  proverManifest: { path: string; sha256: string };
  trustedSetupRecord: { path: string; sha256: string };
  artifacts: {
    withdrawWasm: { path: string; sha256: string };
    withdrawFinalZkey: { path: string; sha256: string };
  };
  artifactResolution: ArtifactResolution;
  groth16PublicInputOrder: readonly NullarkWithdrawPublicInputName[];
};

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

export function assertCurrentRuntime(value: unknown): NullarkCurrentRuntime {
  const runtime = assertRuntime(value);
  if (runtime.environment !== "megaeth-mainnet" || runtime.chainId !== MEGAETH_MAINNET_CHAIN_ID) {
    throw new Error("Nullark SDK current runtime must target MegaETH mainnet 4326.");
  }
  if (runtime.rpcUrl !== "https://mainnet.megaeth.com/rpc") {
    throw new Error("Nullark SDK current runtime must use the approved MegaETH mainnet RPC.");
  }
  return runtime;
}

export function assertRuntime(value: unknown): NullarkCurrentRuntime {
  const runtime = value as Partial<NullarkCurrentRuntime>;
  if (runtime.schema !== "nullark-sdk-runtime-current-v1") {
    throw new Error("Unsupported Nullark SDK runtime schema.");
  }
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
  if (
    !Array.isArray(runtime.groth16PublicInputOrder) ||
    runtime.groth16PublicInputOrder.length !== NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER.length ||
    runtime.groth16PublicInputOrder.some((name, index) => name !== NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER[index])
  ) {
    throw new Error("Nullark SDK current runtime must define the approved Groth16 public input order.");
  }
  assertSafeSha256(runtime.proverManifest?.sha256, "prover manifest");
  assertSafeSha256(runtime.trustedSetupRecord?.sha256, "trusted setup record");
  assertSafeSha256(runtime.artifacts?.withdrawWasm?.sha256, "withdraw wasm");
  assertSafeSha256(runtime.artifacts?.withdrawFinalZkey?.sha256, "withdraw final zkey");
  if (String(JSON.stringify(runtime)).includes("docs/evidence/")) {
    throw new Error("Nullark SDK current runtime must not expose private operation paths.");
  }
  return runtime as NullarkCurrentRuntime;
}

function assertSafeSha256(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Nullark SDK current runtime ${label} sha256 must be lowercase hex.`);
  }
}
