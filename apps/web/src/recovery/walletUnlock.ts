import type { HexString } from "./encryptedNoteEnvelope.js";

export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export type SupportedWalletUnlockChainId = typeof MEGAETH_TESTNET_CHAIN_ID | typeof MEGAETH_MAINNET_CHAIN_ID;
export const UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE = "UnlockShieldedSpendRecovery";
export const WALLET_RECOVERY_SCOPE_ISSUED_AT = "2026-05-02T00:00:00.000Z";
export const WALLET_UNLOCK_WARNING =
  "Unlock private balance. This signature can unlock spendable private notes for this wallet on MegaETH. It should only be approved on the official app domain.";

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type UnlockPrivateBalanceTypedData = {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    UnlockShieldedSpendRecovery: Array<{ name: string; type: string }>;
  };
  primaryType: typeof UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE;
  domain: {
    name: "Shielded Balance Transfers";
    version: "1";
    chainId: SupportedWalletUnlockChainId;
    verifyingContract: HexString;
  };
  message: {
    wallet: HexString;
    pool: HexString;
    purpose: typeof UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE;
    recoveryVersion: 1;
    encryptionVersion: 1;
    issuedAt: string;
    warning: typeof WALLET_UNLOCK_WARNING;
  };
};

export type WalletUnlockInput = {
  wallet: string;
  chainId: number;
  pool: string;
  recoveryVersion: 1;
  encryptionVersion: 1;
  issuedAt?: string;
};

export function buildUnlockPrivateBalanceTypedData(input: WalletUnlockInput): UnlockPrivateBalanceTypedData {
  const chainId = assertSupportedMegaEthChain(input.chainId);
  const wallet = assertEvmAddress(input.wallet, "Invalid wallet address.");
  const pool = assertEvmAddress(input.pool, "Invalid shielded pool address.");
  const issuedAt = input.issuedAt ?? WALLET_RECOVERY_SCOPE_ISSUED_AT;
  assertIssuedAt(issuedAt);

  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      UnlockShieldedSpendRecovery: [
        { name: "wallet", type: "address" },
        { name: "pool", type: "address" },
        { name: "purpose", type: "string" },
        { name: "recoveryVersion", type: "uint256" },
        { name: "encryptionVersion", type: "uint256" },
        { name: "issuedAt", type: "string" },
        { name: "warning", type: "string" }
      ]
    },
    primaryType: UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE,
    domain: {
      name: "Shielded Balance Transfers",
      version: "1",
      chainId,
      verifyingContract: pool
    },
    message: {
      wallet,
      pool,
      purpose: UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE,
      recoveryVersion: input.recoveryVersion,
      encryptionVersion: input.encryptionVersion,
      issuedAt,
      warning: WALLET_UNLOCK_WARNING
    }
  };
}

export async function requestWalletRecoverySignature(
  input: WalletUnlockInput & { provider: Eip1193Provider }
): Promise<HexString> {
  const typedData = buildUnlockPrivateBalanceTypedData(input);
  const signature = await input.provider.request({
    method: "eth_signTypedData_v4",
    params: [typedData.message.wallet, JSON.stringify(typedData)]
  });

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Wallet returned an invalid private-balance unlock signature.");
  }

  return signature as HexString;
}

function assertSupportedMegaEthChain(chainId: number): SupportedWalletUnlockChainId {
  if (chainId !== MEGAETH_TESTNET_CHAIN_ID && chainId !== MEGAETH_MAINNET_CHAIN_ID) {
    throw new Error("Wallet unlock signatures are only supported for MegaETH testnet 6343 or mainnet 4326.");
  }
  return chainId;
}

function assertEvmAddress(value: string, message: string): HexString {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(message);
  }

  return value as HexString;
}

function assertIssuedAt(issuedAt: string): void {
  const issuedAtMs = Date.parse(issuedAt);
  if (!issuedAt || Number.isNaN(issuedAtMs)) {
    throw new Error("Invalid wallet unlock issuedAt timestamp.");
  }
}
