import { isEvmAddress, type HexString } from "../types.js";
import type { DecodedNoteEventLog } from "./logs.js";
import {
  LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  makeRecoveryAssociatedData,
  parseEncryptedOutputNoteV2EnvelopeFromHex,
  parseEncryptedNoteEnvelopeFromHex,
  type EncryptedNoteV1Action,
  type EncryptedOutputNoteV2Envelope,
  type SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";

export const NULLARK_LEGACY_RECOVERY_EPOCH_ID_V1 = "megaeth-testnet-v1";

export type RecoveredSpendMaterial = {
  event: DecodedNoteEventLog;
  plaintext: SpendMaterialPlaintext;
};

export type ValidatedEncryptedOutputNoteV2Event = {
  event: DecodedNoteEventLog & {
    action: "withdraw-output";
    encryptionVersion: 2;
  };
  envelope: EncryptedOutputNoteV2Envelope;
};

export function getNullarkRecoveryEpochId(chainId: number): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Expected recovery epoch chain ID.");
  }
  return `megaeth-${chainId}-nullark-v1`;
}

export function validateEncryptedOutputNoteV2Events(input: {
  chainId: number;
  pool: HexString;
  events: readonly DecodedNoteEventLog[];
}): ValidatedEncryptedOutputNoteV2Event[] {
  const chainId = assertMegaEthRecoveryChainId(input.chainId);
  if (!isEvmAddress(input.pool)) {
    throw new Error("Expected note recovery pool address.");
  }

  const validated: ValidatedEncryptedOutputNoteV2Event[] = [];
  for (const event of input.events) {
    if (event.action !== "withdraw-output" || event.encryptionVersion !== 2 || event.encryptedNote === "0x") {
      continue;
    }
    try {
      const envelope = parseEncryptedOutputNoteV2EnvelopeFromHex(event.encryptedNote, {
        chainId,
        verifyingContract: input.pool,
        outputCommitment: event.commitment
      });
      validated.push({
        event: event as ValidatedEncryptedOutputNoteV2Event["event"],
        envelope
      });
    } catch {
      continue;
    }
  }

  return validated;
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
  if (input.event.action === "withdraw-output" && input.event.encryptionVersion === 2) {
    try {
      parseEncryptedOutputNoteV2EnvelopeFromHex(input.event.encryptedNote, {
        chainId: assertMegaEthRecoveryChainId(input.chainId),
        verifyingContract: input.pool,
        outputCommitment: input.event.commitment
      });
    } catch {
      return null;
    }
    return null;
  }

  let encrypted: ReturnType<typeof parseEncryptedNoteEnvelopeFromHex>;
  try {
    encrypted = parseEncryptedNoteEnvelopeFromHex(input.event.encryptedNote);
  } catch {
    return null;
  }

  const actions: EncryptedNoteV1Action[] =
    input.event.action === "withdraw-output"
      ? ["withdraw-output", "withdraw-change", "withdraw"]
      : input.event.action === "withdraw-change"
        ? ["withdraw-change", "withdraw"]
        : [input.event.action];

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

function assertMegaEthRecoveryChainId(chainId: number): 4326 | 6343 {
  if (chainId !== 4326 && chainId !== 6343) {
    throw new Error("Expected MegaETH recovery chain ID.");
  }
  return chainId;
}
