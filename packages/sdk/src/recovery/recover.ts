import { isEvmAddress, type HexString } from "../types.js";
import type { DecodedNoteEventLog } from "./logs.js";
import {
  LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  makeRecoveryAssociatedData,
  parseEncryptedNoteEnvelopeFromHex,
  type EncryptedNoteV1Action,
  type SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";

export const NULLARK_LEGACY_RECOVERY_EPOCH_ID_V1 = "megaeth-testnet-v1";

export type RecoveredSpendMaterial = {
  event: DecodedNoteEventLog;
  plaintext: SpendMaterialPlaintext;
};

export function getNullarkRecoveryEpochId(chainId: number): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Expected recovery epoch chain ID.");
  }
  return `megaeth-${chainId}-nullark-v1`;
}

export async function recoverSpendMaterialFromDecodedNoteEvents(input: {
  walletSignature: HexString;
  chainId: number;
  pool: HexString;
  events: readonly DecodedNoteEventLog[];
  deriveCommitment: (plaintext: SpendMaterialPlaintext) => Promise<HexString>;
}): Promise<RecoveredSpendMaterial[]> {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new Error("Expected note recovery chain ID.");
  }
  if (!isEvmAddress(input.pool)) {
    throw new Error("Expected note recovery pool address.");
  }

  const recoveryKeys = await Promise.all(
    [NULLARK_RECOVERY_APP_ID, LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID]
      .filter((appId, index, appIds) => appIds.indexOf(appId) === index)
      .map((appId) =>
        deriveWalletRecoveryKey({
          walletSignature: input.walletSignature,
          chainId: input.chainId,
          pool: input.pool,
          appId,
          recoveryVersion: 1
        })
      )
  );
  const epochIds = [getNullarkRecoveryEpochId(input.chainId), NULLARK_LEGACY_RECOVERY_EPOCH_ID_V1].filter(
    (epochId, index, values) => values.indexOf(epochId) === index
  );
  const recovered: RecoveredSpendMaterial[] = [];

  for (const event of input.events) {
    const plaintext = await tryDecryptEvent({ event, recoveryKeys, epochIds, chainId: input.chainId, pool: input.pool });
    if (!plaintext) {
      continue;
    }
    if (plaintext.chainId !== input.chainId || plaintext.pool.toLowerCase() !== input.pool.toLowerCase()) {
      continue;
    }
    const derivedCommitment = await input.deriveCommitment(plaintext);
    if (derivedCommitment.toLowerCase() !== event.commitment.toLowerCase()) {
      continue;
    }
    recovered.push({ event, plaintext });
  }

  return recovered;
}

async function tryDecryptEvent(input: {
  event: DecodedNoteEventLog;
  recoveryKeys: CryptoKey[];
  epochIds: string[];
  chainId: number;
  pool: HexString;
}): Promise<SpendMaterialPlaintext | null> {
  if (input.event.encryptedNote === "0x") {
    return null;
  }

  let encrypted: ReturnType<typeof parseEncryptedNoteEnvelopeFromHex>;
  try {
    encrypted = parseEncryptedNoteEnvelopeFromHex(input.event.encryptedNote);
  } catch {
    return null;
  }

  const actions: EncryptedNoteV1Action[] =
    input.event.action === "withdraw-change" ? ["withdraw-change", "withdraw"] : [input.event.action];

  for (const recoveryKey of input.recoveryKeys) {
    for (const epochId of input.epochIds) {
      for (const action of actions) {
        try {
          const noteKey = await deriveNoteKey(recoveryKey, {
            commitment: input.event.commitment,
            epochId
          });
          const aad = makeRecoveryAssociatedData({
            chainId: input.chainId,
            pool: input.pool,
            action,
            commitment: input.event.commitment,
            encryptionVersion: 1
          });
          return await decryptEncryptedNoteEnvelope({ noteKey, encrypted, aad });
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}
