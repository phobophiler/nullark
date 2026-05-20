import { describe, expect, it } from "vitest";
import {
  NULLARK_RECOVERY_APP_ID,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";
import {
  getNullarkRecoveryEpochId,
  recoverSpendMaterialFromDecodedNoteEvents
} from "./recover.js";

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

describe("recover spend material from decoded note events", () => {
  it("decrypts a v1 note event and verifies the derived commitment", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: 4326,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: getNullarkRecoveryEpochId(4326)
    });
    const encrypted = await encryptSpendMaterialEnvelope({
      noteKey,
      plaintext,
      aad: makeRecoveryAssociatedData({
        chainId: 4326,
        pool,
        action: "deposit",
        commitment,
        encryptionVersion: 1
      })
    });

    const recovered = await recoverSpendMaterialFromDecodedNoteEvents({
      walletSignature,
      chainId: 4326,
      pool,
      events: [
        {
          action: "deposit",
          commitment,
          leafIndex: 7,
          encryptedNote: serializeEncryptedNoteEnvelopeToHex(encrypted),
          encryptionVersion: 1,
          nullifier: null,
          transactionHash: `0x${"22".repeat(32)}`
        }
      ],
      deriveCommitment: async () => commitment
    });

    expect(recovered).toEqual([
      {
        event: expect.objectContaining({ commitment, leafIndex: 7 }),
        plaintext
      }
    ]);
  });

  it("skips decrypted events whose spend material does not match the emitted commitment", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: 4326,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: getNullarkRecoveryEpochId(4326)
    });
    const encrypted = await encryptSpendMaterialEnvelope({
      noteKey,
      plaintext,
      aad: makeRecoveryAssociatedData({
        chainId: 4326,
        pool,
        action: "deposit",
        commitment,
        encryptionVersion: 1
      })
    });

    await expect(
      recoverSpendMaterialFromDecodedNoteEvents({
        walletSignature,
        chainId: 4326,
        pool,
        events: [
          {
            action: "deposit",
            commitment,
            leafIndex: 7,
            encryptedNote: serializeEncryptedNoteEnvelopeToHex(encrypted),
            encryptionVersion: 1,
            nullifier: null,
            transactionHash: `0x${"22".repeat(32)}`
          }
        ],
        deriveCommitment: async () => `0x${"33".repeat(32)}`
      })
    ).resolves.toEqual([]);
  });

  it("skips decrypted events whose spend material is for a different chain or pool", async () => {
    const wrongPlaintext = { ...plaintext, chainId: 6343 };
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature,
      chainId: 4326,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: getNullarkRecoveryEpochId(4326)
    });
    const encrypted = await encryptSpendMaterialEnvelope({
      noteKey,
      plaintext: wrongPlaintext,
      aad: makeRecoveryAssociatedData({
        chainId: 4326,
        pool,
        action: "deposit",
        commitment,
        encryptionVersion: 1
      })
    });

    await expect(
      recoverSpendMaterialFromDecodedNoteEvents({
        walletSignature,
        chainId: 4326,
        pool,
        events: [
          {
            action: "deposit",
            commitment,
            leafIndex: 7,
            encryptedNote: serializeEncryptedNoteEnvelopeToHex(encrypted),
            encryptionVersion: 1,
            nullifier: null,
            transactionHash: `0x${"22".repeat(32)}`
          }
        ],
        deriveCommitment: async () => commitment
      })
    ).resolves.toEqual([]);
  });
});
