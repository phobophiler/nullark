import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID,
  UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE,
  WALLET_RECOVERY_SCOPE_ISSUED_AT,
  buildUnlockPrivateBalanceTypedData,
  requestWalletRecoverySignature
} from "./walletUnlock.js";

const wallet = "0x1111111111111111111111111111111111111111";
const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544";
const issuedAt = "2026-05-02T00:00:00.000Z";

function baseUnlockInput(overrides: Partial<Parameters<typeof buildUnlockPrivateBalanceTypedData>[0]> = {}) {
  return {
    wallet,
    chainId: MEGAETH_TESTNET_CHAIN_ID,
    pool,
    recoveryVersion: 1 as const,
    encryptionVersion: 1 as const,
    issuedAt,
    ...overrides
  };
}

describe("wallet unlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(issuedAt));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds domain-separated EIP-712 unlock data", () => {
    const typedData = buildUnlockPrivateBalanceTypedData(baseUnlockInput());

    expect(typedData.domain).toEqual({
      name: "Shielded Balance Transfers",
      version: "1",
      chainId: 6343,
      verifyingContract: pool
    });
    expect(typedData.primaryType).toBe(UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE);
    expect(typedData.types.UnlockShieldedSpendRecovery).toEqual([
      { name: "wallet", type: "address" },
      { name: "pool", type: "address" },
      { name: "purpose", type: "string" },
      { name: "recoveryVersion", type: "uint256" },
      { name: "encryptionVersion", type: "uint256" },
      { name: "issuedAt", type: "string" },
      { name: "warning", type: "string" }
    ]);
    expect(typedData.message).toEqual({
      wallet,
      pool,
      purpose: "UnlockShieldedSpendRecovery",
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt,
      warning:
        "Unlock private balance. This signature can unlock spendable private notes for this wallet on MegaETH. It should only be approved on the official app domain."
    });
  });

  it("binds the domain and message to MegaETH testnet and the shielded pool", () => {
    const typedData = buildUnlockPrivateBalanceTypedData(baseUnlockInput({ chainId: 6343 }));

    expect(typedData.domain.chainId).toBe(6343);
    expect(typedData.domain.verifyingContract).toBe(pool);
    expect(typedData.message.pool).toBe(pool);
  });

  it("supports MegaETH mainnet unlock signatures with mainnet domain separation", () => {
    const typedData = buildUnlockPrivateBalanceTypedData(baseUnlockInput({ chainId: MEGAETH_MAINNET_CHAIN_ID }));

    expect(typedData.domain.chainId).toBe(4326);
    expect(typedData.domain.verifyingContract).toBe(pool);
    expect(typedData.message.pool).toBe(pool);
  });

  it("rejects non-MegaETH chain IDs", () => {
    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        ...baseUnlockInput(),
        chainId: 1,
      })
    ).toThrow("Wallet unlock signatures are only supported for MegaETH testnet 6343 or mainnet 4326.");
  });

  it("rejects invalid wallet and pool addresses before constructing typed data", () => {
    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        ...baseUnlockInput(),
        wallet: "0xnot-an-address",
      })
    ).toThrow("Invalid wallet address.");

    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        ...baseUnlockInput(),
        pool: "0x1234",
      })
    ).toThrow("Invalid shielded pool address.");
  });

  it("uses the stable v1 recovery scope by default so wallet recovery survives reloads", () => {
    const first = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1
    });
    const second = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1
    });

    expect(first.message.issuedAt).toBe(WALLET_RECOVERY_SCOPE_ISSUED_AT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(first)).not.toMatch(/sessionNonce|expiresAt|appOrigin/);
  });

  it("rejects invalid unlock timestamps", () => {
    expect(() =>
      buildUnlockPrivateBalanceTypedData(
        baseUnlockInput({
          issuedAt: "not-a-date"
        })
      )
    ).toThrow("Invalid wallet unlock issuedAt timestamp.");
  });

  it("requests eth_signTypedData_v4 from the connected wallet with exact params", async () => {
    const request = vi.fn(async () => `0x${"99".repeat(65)}`);
    const expectedInput = baseUnlockInput({ chainId: 6343 });
    const expectedTypedData = buildUnlockPrivateBalanceTypedData(expectedInput);

    const signature = await requestWalletRecoverySignature({
      provider: { request },
      ...expectedInput
    });

    expect(signature).toBe(`0x${"99".repeat(65)}`);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: "eth_signTypedData_v4",
      params: [wallet, JSON.stringify(expectedTypedData)]
    });
  });

  it("rejects invalid wallet signatures", async () => {
    const request = vi.fn(async () => "0x1234");

    await expect(
      requestWalletRecoverySignature({
        provider: { request },
        ...baseUnlockInput({ chainId: 6343 })
      })
    ).rejects.toThrow("Wallet returned an invalid private-balance unlock signature.");
  });
});
