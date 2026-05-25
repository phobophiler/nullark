export function realtimeUxStates(): string[] {
  return [
    "transaction submitted",
    "receipt confirmed",
    "pool event observed",
    "private balance updated",
    "withdrawal public and complete"
  ];
}

export const MEGAETH_TESTNET = {
  chainId: 6343,
  rpcUrl: "https://carrot.megaeth.com/rpc",
  environment: "testnet"
} as const;

export const MEGAETH_MAINNET = {
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  environment: "mainnet"
} as const;

export function realtimeSubmissionMethod(): "eth_sendRawTransactionSync" {
  return "eth_sendRawTransactionSync";
}

export const megaEthPrivacyBoundary =
  "MegaETH provides realtime transaction UX; privacy comes from the shielded app protocol.";
