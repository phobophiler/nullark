import { describe, expect, it } from "vitest";
import { recoverSpendMaterialFromEvents } from "./recoveredNotes.js";
import type { EncryptedNoteEnvelope, SpendMaterialPlaintext } from "./encryptedNoteEnvelope.js";

const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const;
const commitment = `0x${"22".repeat(32)}` as const;

const plaintext: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: 6343,
  pool,
  noteAmountWei: "1000",
  assetId: `0x${"00".repeat(31)}01`,
  ownerCommitment: `0x${"33".repeat(32)}`,
  noteSecret: `0x${"44".repeat(32)}`,
  blinding: `0x${"55".repeat(32)}`,
  commitment,
  createdAt: "2026-05-02T00:00:00.000Z"
};

const encryptedTemplate: Omit<EncryptedNoteEnvelope, "ciphertext" | "nonce"> = {
  version: 1,
  algorithm: "AES-GCM-256",
  kdf: "HKDF-SHA-256"
};

describe("recovered notes", () => {
  it("rejects decrypted notes that do not derive the emitted commitment", async () => {
    const decryptedByCommitment = new Map<string, SpendMaterialPlaintext>([
      [
        commitment,
        {
          ...plaintext,
          commitment: `0x${"66".repeat(32)}`
        }
      ]
    ]);

    await expect(
      recoverSpendMaterialFromEvents({
        events: [
          {
            action: "deposit",
            chainId: 6343,
            pool,
            commitment,
            leafIndex: 0,
            encryptedNote: {
              ...encryptedTemplate,
              nonce: "0x000000000000000000000000",
              ciphertext: "0x00"
            } as EncryptedNoteEnvelope,
            encryptionVersion: 1,
            nullifier: null
          }
        ],
        decrypt: async (event) => decryptedByCommitment.get(event.commitment)!,
        deriveCommitment: async (note) => note.commitment
      })
    ).rejects.toThrow("Decrypted note does not match emitted commitment.");
  });
});
