export const WITHDRAWAL_FEE_BPS = 33n;
export const BPS_DENOMINATOR = 10_000n;
export const MIN_WITHDRAWAL_AMOUNT = 1n;
export const ROOT_HISTORY_SIZE = 256;

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
