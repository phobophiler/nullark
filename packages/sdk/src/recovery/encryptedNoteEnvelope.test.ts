import { describe, expect, it } from "vitest";
import {
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  parseEncryptedNoteEnvelopeFromHex,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";

const walletSignature = `0x${"42".repeat(65)}` as const;
const pool = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15" as const;
const commitment = `0x${"11".repeat(32)}` as const;
const plaintext: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: 4326,
  pool,
  assetId: `0x${"01".repeat(32)}`,
  noteAmountWei: "10001",
  ownerCommitment: `0x${"02".repeat(32)}`,
  noteSecret: `0x${"03".repeat(32)}`,
  blinding: `0x${"04".repeat(32)}`,
  commitment,
  createdAt: "2026-05-20T00:00:00.000Z"
};

describe("encrypted note envelope recovery", () => {
  it("derives a v1 wallet recovery key, encrypts spend material, and decrypts it with matching associated data", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: 4326,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: "megaeth-4326-nullark-v1"
    });
    const aad = makeRecoveryAssociatedData({
      chainId: 4326,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });
    const encrypted = await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad });
    const serialized = serializeEncryptedNoteEnvelopeToHex(encrypted);
    const parsed = parseEncryptedNoteEnvelopeFromHex(serialized);

    await expect(decryptEncryptedNoteEnvelope({ noteKey, encrypted: parsed, aad })).resolves.toEqual(plaintext);
  });

  it("fails closed when associated data does not match chain, pool, action, or commitment", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: 4326,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: "megaeth-4326-nullark-v1"
    });
    const aad = makeRecoveryAssociatedData({
      chainId: 4326,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });
    const encrypted = await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad });
    const wrongAad = makeRecoveryAssociatedData({
      chainId: 6343,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });

    await expect(decryptEncryptedNoteEnvelope({ noteKey, encrypted, aad: wrongAad })).rejects.toThrow(
      "Failed to decrypt encrypted note envelope."
    );
  });
});
