import { describe, expect, it } from "vitest";
import {
  UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE,
  WALLET_UNLOCK_WARNING,
  buildUnlockPrivateBalanceTypedData,
  requestWalletRecoverySignature
} from "./unlock.js";

describe("wallet unlock", () => {
  it("keeps the v1 app-compatible typed-data surface", () => {
    const typedData = buildUnlockPrivateBalanceTypedData({
      wallet: "0x1111111111111111111111111111111111111111",
      chainId: 4326,
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt: "2026-05-20T00:00:00.000Z"
    });

    expect(typedData.primaryType).toBe(UNLOCK_SHIELDED_SPEND_RECOVERY_PURPOSE);
    expect(typedData.domain).toEqual({
      name: "Shielded Balance Transfers",
      version: "1",
      chainId: 4326,
      verifyingContract: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15"
    });
    expect(typedData.message.warning).toBe(WALLET_UNLOCK_WARNING);
    expect(typedData.types.UnlockShieldedSpendRecovery.map((field) => `${field.name}:${field.type}`)).toEqual([
      "wallet:address",
      "pool:address",
      "purpose:string",
      "recoveryVersion:uint256",
      "encryptionVersion:uint256",
      "issuedAt:string",
      "warning:string"
    ]);
  });

  it("requests eth_signTypedData_v4 with wallet first and typed data JSON second", async () => {
    const signature = `0x${"11".repeat(65)}` as const;
    const calls: unknown[] = [];
    const returned = await requestWalletRecoverySignature({
      wallet: "0x1111111111111111111111111111111111111111",
      chainId: 4326,
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      recoveryVersion: 1,
      encryptionVersion: 1,
      issuedAt: "2026-05-20T00:00:00.000Z",
      provider: {
        async request(args) {
          calls.push(args);
          return signature;
        }
      }
    });

    expect(returned).toBe(signature);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "eth_signTypedData_v4",
      params: ["0x1111111111111111111111111111111111111111", expect.any(String)]
    });
  });
});
