import { describe, expect, it, vi } from "vitest";
import {
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID,
  UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE,
  buildUnlockPrivateBalanceTypedData,
  requestWalletRecoverySignature
} from "./walletUnlock.js";

const wallet = "0x1111111111111111111111111111111111111111";
const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544";
const issuedAt = "2026-05-02T00:00:00.000Z";

describe("wallet unlock", () => {
  it("builds domain-separated EIP-712 unlock data", () => {
    const typedData = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
    });

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
    const typedData = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: 6343,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
    });

    expect(typedData.domain.chainId).toBe(6343);
    expect(typedData.domain.verifyingContract).toBe(pool);
    expect(typedData.message.pool).toBe(pool);
  });

  it("supports MegaETH mainnet unlock signatures with mainnet domain separation", () => {
    const typedData = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
    });

    expect(typedData.domain.chainId).toBe(4326);
    expect(typedData.domain.verifyingContract).toBe(pool);
    expect(typedData.message.pool).toBe(pool);
  });

  it("rejects non-MegaETH chain IDs", () => {
    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        wallet,
        chainId: 1,
        pool,
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt
      })
    ).toThrow("Wallet unlock signatures are only supported for MegaETH testnet 6343 or mainnet 4326.");
  });

  it("rejects invalid wallet and pool addresses before constructing typed data", () => {
    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        wallet: "0xnot-an-address",
        chainId: 6343,
        pool,
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt
      })
    ).toThrow("Invalid wallet address.");

    expect(() =>
      buildUnlockPrivateBalanceTypedData({
        wallet,
        chainId: 6343,
        pool: "0x1234",
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt
      })
    ).toThrow("Invalid shielded pool address.");
  });

  it("requests eth_signTypedData_v4 from the connected wallet with exact params", async () => {
    const request = vi.fn(async () => `0x${"99".repeat(65)}`);
    const expectedTypedData = buildUnlockPrivateBalanceTypedData({
      wallet,
      chainId: 6343,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
    });

    const signature = await requestWalletRecoverySignature({
      provider: { request },
      wallet,
      chainId: 6343,
      pool,
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt
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
        wallet,
        chainId: 6343,
        pool,
        recoveryVersion: 1,
        encryptionVersion: 1,
        issuedAt
      })
    ).rejects.toThrow("Wallet returned an invalid private-balance unlock signature.");
  });
});
