import type {
  EncryptedNoteEnvelope,
  EncryptedNoteV1Action,
  HexString,
  SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";

export type EncryptedNoteEventForRecovery = {
  action: EncryptedNoteV1Action;
  chainId: number;
  pool: HexString;
  commitment: HexString;
  leafIndex: number;
  encryptedNote: EncryptedNoteEnvelope;
  encryptionVersion: 1;
  nullifier: HexString | null;
};

export type RecoveredSpendMaterial = {
  event: EncryptedNoteEventForRecovery;
  plaintext: SpendMaterialPlaintext;
};

export async function recoverSpendMaterialFromEvents(input: {
  events: EncryptedNoteEventForRecovery[];
  decrypt: (event: EncryptedNoteEventForRecovery) => Promise<SpendMaterialPlaintext>;
  deriveCommitment: (note: SpendMaterialPlaintext) => Promise<HexString>;
}): Promise<RecoveredSpendMaterial[]> {
  const recovered: RecoveredSpendMaterial[] = [];
  for (const event of input.events) {
    const plaintext = await input.decrypt(event);
    const derivedCommitment = await input.deriveCommitment(plaintext);

    if (derivedCommitment.toLowerCase() !== event.commitment.toLowerCase()) {
      throw new Error("Decrypted note does not match emitted commitment.");
    }

    recovered.push({ event, plaintext });
  }
  return recovered;
}
