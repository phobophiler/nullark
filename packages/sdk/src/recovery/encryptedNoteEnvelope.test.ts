import { describe, expect, it } from "vitest";
import {
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  createEncryptedOutputNoteV2Envelope,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  parseEncryptedOutputNoteV2EnvelopeFromHex,
  parseEncryptedNoteEnvelopeFromHex,
  serializeEncryptedOutputNoteV2EnvelopeToHex,
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

  it("serializes a fixed-shape padded V2 withdraw-output envelope", () => {
    const envelope = createEncryptedOutputNoteV2Envelope({
      chainId: 4326,
      verifyingContract: pool,
      outputCommitment: commitment,
      ciphertext: "0xabcd"
    });
    const serialized = serializeEncryptedOutputNoteV2EnvelopeToHex(envelope);
    const parsed = parseEncryptedOutputNoteV2EnvelopeFromHex(serialized, {
      chainId: 4326,
      verifyingContract: pool,
      outputCommitment: commitment
    });

    expect(parsed).toEqual(envelope);
    expect(parsed.version).toBe(2);
    expect(parsed.action).toBe("withdraw-output");
    expect(parsed.ciphertextByteLength).toBe(2);
    expect(parsed.paddingByteLength).toBe(254);
    expect(parsed.paddedCiphertextByteLength).toBe(256);
    expect(parsed.paddingBytes).toMatch(/^0x(?:00)+$/);
    expect(JSON.stringify(parsed)).not.toMatch(/wallet|tag/i);
  });

  it("rejects malformed missing or empty V2 withdraw-output envelopes", () => {
    expect(() => parseEncryptedOutputNoteV2EnvelopeFromHex("0x")).toThrow("Invalid encrypted output note V2 envelope.");
    expect(() => parseEncryptedOutputNoteV2EnvelopeFromHex("0xabcd")).toThrow(
      "Invalid encrypted output note V2 envelope."
    );
    expect(() =>
      parseEncryptedOutputNoteV2EnvelopeFromHex(
        `0x${Array.from(new TextEncoder().encode(JSON.stringify({ version: 2 })), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("")}`
      )
    ).toThrow("Invalid encrypted output note V2 envelope.");
    expect(() =>
      createEncryptedOutputNoteV2Envelope({
        chainId: 4326,
        verifyingContract: pool,
        outputCommitment: commitment,
        ciphertext: "0x"
      })
    ).toThrow("Encrypted output note V2 ciphertext must be nonempty even-length hex bytes.");
  });

  it("rejects stale V1 amount, spent-commitment, and change-labeled fields on V2 output envelopes", () => {
    const envelope = createEncryptedOutputNoteV2Envelope({
      chainId: 4326,
      verifyingContract: pool,
      outputCommitment: commitment,
      ciphertext: "0xabcd"
    });
    const staleEnvelope = {
      ...envelope,
      noteAmount: "10001",
      oldNoteAmount: "10001",
      outputAmount: "0",
      spentCommitment: `0x${"22".repeat(32)}`,
      changeAmount: "0"
    };

    expect(() => parseEncryptedOutputNoteV2EnvelopeFromHex(utf8ToHex(JSON.stringify(staleEnvelope)))).toThrow(
      "Invalid encrypted output note V2 envelope."
    );
  });
});

function utf8ToHex(value: string): `0x${string}` {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )}`;
}
