import { describe, expect, it } from "vitest";
import {
  NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2,
  getRuntimeForNetwork,
  type NullarkCurrentRuntime
} from "../runtime/current.js";
import type { SpendMaterialPlaintext } from "./encryptedNoteEnvelope.js";
import {
  createRecoveryKitV1,
  importRecoveryKitV1ToSpendableNote,
  importRecoveryKitV1ToRecoveredWalletNote,
  serializeRecoveryKitV1
} from "./recoveryKit.js";

const recoveryKitSchemaHash = "sha256:b7935a0848b972e16be5790040136f50712e84e44c272079170192b9a56d18d8";

const runtime = {
  ...getRuntimeForNetwork("megaeth-testnet"),
  schema: "nullark-sdk-runtime-v1-2-candidate-v1",
  productVersion: "nullark-v1.2-testnet-candidate",
  groth16PublicInputOrder: NULLARK_WITHDRAW_PUBLIC_INPUT_ORDER_V1_2,
  maxWithdrawalFeeBps: 100,
  feePolicy: {
    activeFeeBps: 33,
    maxFeeBps: 100
  }
} satisfies NullarkCurrentRuntime;

const commitment = `0x${"11".repeat(32)}` as const;
const nullifier = `0x${"22".repeat(32)}` as const;
const spendMaterial: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: runtime.chainId,
  pool: runtime.pool,
  assetId: `0x${"00".repeat(31)}01`,
  noteAmountWei: "10000000000000000",
  ownerCommitment: `0x${"03".repeat(32)}`,
  noteSecret: `0x${"04".repeat(32)}`,
  blinding: `0x${"05".repeat(32)}`,
  commitment,
  createdAt: "2026-05-24T00:00:00.000Z"
};

describe("RECOVERY_KIT_V1 import", () => {
  it("imports a v1.2 kit through a non-wallet recovery route with spend status", async () => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8,
      blockNumber: "0x12930a1"
    });

    const note = await importRecoveryKitV1ToSpendableNote({
      serializedKit: serializeRecoveryKitV1(kit),
      runtime,
      deriveCommitment: async () => commitment,
      deriveNullifier: async () => nullifier,
      isNullifierSpent: async () => false
    });

    expect(note.recoveryRoute).toBe("recovery-kit");
    expect(note.spendStatus).toEqual({
      commitment,
      leafIndex: 8,
      nullifier,
      spent: false
    });
    expect(note.summary.spent).toBe(false);
    expect(note.spendMaterial).toEqual(spendMaterial);
  });

  it("imports a v1.2 kit into a locally spendable note without wallet-linked discovery", async () => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8,
      blockNumber: "0x12930a1"
    });

    const note = await importRecoveryKitV1ToRecoveredWalletNote({
      serializedKit: serializeRecoveryKitV1(kit),
      runtime,
      deriveCommitment: async () => commitment,
      deriveNullifier: async () => nullifier,
      isNullifierSpent: async () => false
    });

    expect(note.summary).toEqual({
      id: `note_${commitment.slice(2, 10)}_8`,
      commitment,
      amountWei: spendMaterial.noteAmountWei,
      spent: false,
      leafIndex: 8,
      transactionHash: `0x${"66".repeat(32)}`
    });
    expect(note.spendMaterial).toEqual(spendMaterial);
    expect(note.nullifier).toBe(nullifier);
    expect(JSON.parse(serializeRecoveryKitV1(kit))).toMatchObject({
      recoveryKitSchemaHash
    });
    expect(JSON.stringify(kit)).not.toMatch(/wallet|discovery|tag/i);
  });

  it("keeps the recovery kit schema closed for unrelated fields", async () => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8
    });

    await expect(
      importRecoveryKitV1ToRecoveredWalletNote({
        serializedKit: JSON.stringify({ ...kit, localMemo: "offline import" }),
        runtime,
        deriveCommitment: async () => commitment,
        deriveNullifier: async () => nullifier,
        isNullifierSpent: async () => false
      })
    ).rejects.toThrow("Recovery kit has unsupported or missing fields.");
  });

  it("rejects checksum-only recovery kits without the frozen schema hash", async () => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8
    });
    const { recoveryKitSchemaHash: _schemaHash, ...checksumOnlyKit } = JSON.parse(serializeRecoveryKitV1(kit)) as Record<
      string,
      unknown
    >;

    await expect(
      importRecoveryKitV1ToRecoveredWalletNote({
        serializedKit: JSON.stringify(checksumOnlyKit),
        runtime,
        deriveCommitment: async () => commitment,
        deriveNullifier: async () => nullifier,
        isNullifierSpent: async () => false
      })
    ).rejects.toThrow("Recovery kit schema hash is required.");
  });

  it("rejects recovery kits with a mismatched schema hash before accepting witness material", async () => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8
    });

    await expect(
      importRecoveryKitV1ToRecoveredWalletNote({
        serializedKit: JSON.stringify({
          ...kit,
          recoveryKitSchemaHash: `sha256:${"00".repeat(32)}`
        }),
        runtime,
        deriveCommitment: async () => commitment,
        deriveNullifier: async () => nullifier,
        isNullifierSpent: async () => false
      })
    ).rejects.toThrow("Recovery kit schema hash mismatch.");
  });

  it.each([
    "walletAddress",
    "ownerAddress",
    "discoveryTag",
    "walletTag",
    "publicDiscoveryTag",
    "stableDiscoveryTag",
    "walletLinkedDiscoveryTag"
  ])("rejects public stable wallet-linked discovery field %s in recovery kits", async (fieldName) => {
    const kit = createRecoveryKitV1({
      runtime,
      spendMaterial,
      transactionHash: `0x${"66".repeat(32)}`,
      leafIndex: 8
    });

    await expect(
      importRecoveryKitV1ToRecoveredWalletNote({
        serializedKit: JSON.stringify({ ...kit, [fieldName]: `0x${"77".repeat(32)}` }),
        runtime,
        deriveCommitment: async () => commitment,
        deriveNullifier: async () => nullifier,
        isNullifierSpent: async () => false
      })
    ).rejects.toThrow("Recovery kit must not contain public wallet-linked discovery tags.");
  });
});
