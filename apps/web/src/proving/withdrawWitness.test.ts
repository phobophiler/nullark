import { describe, expect, it, vi } from "vitest";
import { computeStageBWithdrawPublicExitHashes, type SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import {
  MEGAETH_TESTNET_CHAIN_ID,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SHIELDED_POOL_ADDRESS,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_BOUNDED_SELECTOR
} from "../product/shieldedTransfersHelpers.js";
import { deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";
import { buildBrowserWithdrawWitness, type BuildBrowserWithdrawWitnessInput, type RecoveryMerklePathPayload } from "./withdrawWitness.js";

const note: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  pool: SHIELDED_POOL_ADDRESS,
  assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
  noteAmountWei: "123456789000000000",
  ownerCommitment: `0x02${"22".repeat(31)}`,
  noteSecret: `0x02${"22".repeat(31)}`,
  blinding: `0x02${"22".repeat(31)}`,
  commitment: "0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb",
  createdAt: "2026-05-02T00:00:00.000Z"
};

const pathElements = [
  `0x01${"11".repeat(31)}`,
  `0x02${"22".repeat(31)}`,
  `0x03${"33".repeat(31)}`,
  `0x04${"44".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`,
  `0x00${"00".repeat(31)}`
] as const;

const merklePath: RecoveryMerklePathPayload = {
  commitment: note.commitment,
  leafIndex: 2,
  root: `0x05${"55".repeat(31)}`,
  pathElements: [...pathElements],
  pathIndices: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  pool: SHIELDED_POOL_ADDRESS,
  latestCheckedBlock: "123456"
};

const destination = "0x846646aF497d1Df2367F28666257C1a111afF1DA" as const;

describe("browser withdraw witness", () => {
  it("builds a full-withdraw witness with circuit decimal fields and intent bindings", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bundle.witness).toMatchObject({
      root: BigInt(merklePath.root).toString(),
      nullifier: BigInt(bundle.nullifier).toString(),
      newCommitment: "0",
      destination: BigInt(destination).toString(),
      grossAmount: note.noteAmountWei,
      fee: "407407403700000",
      chainId: "6343",
      verifyingContract: BigInt(SHIELDED_POOL_ADDRESS).toString(),
      pathElements: merklePath.pathElements.map((pathElement) => BigInt(pathElement).toString()),
      assetId: "1",
      noteAmount: note.noteAmountWei,
      ownerCommitment: BigInt(note.ownerCommitment).toString(),
      noteSecret: BigInt(note.noteSecret).toString(),
      leafIndex: "2",
      withdrawalDestination: BigInt(destination).toString(),
      changeAmount: "0",
      changeOwnerCommitment: "0",
      changeNoteSecret: "0"
    });
    expect(bundle.intent).toMatchObject({
      root: merklePath.root,
      nullifier: bundle.nullifier,
      changeCommitment: `0x${"0".repeat(64)}`,
      destination,
      grossAmountWei: note.noteAmountWei,
      feeWei: "407407403700000",
      chainId: 6343,
      pool: SHIELDED_POOL_ADDRESS
    });
    expect(bundle.netAmountWei).toBe("123049381596300000");
    expect(bundle.changeNote).toBeNull();
    const expectedHashes = computeStageBWithdrawPublicExitHashes({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      root: merklePath.root,
      nullifier: bundle.nullifier,
      destination,
      grossAmount: BigInt(note.noteAmountWei),
      fee: 407407403700000n,
      noteAmount: BigInt(note.noteAmountWei),
      relayerPolicy: {
        relayer: "0x0000000000000000000000000000000000000000",
        minNetAmount: 123049381596300000n,
        maxFeeAmount: 407407403700000n,
        deadlineOrZero: 0n
      }
    });
    expect(bundle.intent.proofContextHash).toBe(expectedHashes.proofContextHash);
    expect(bundle.intent.encryptedNoteHash).toBe(expectedHashes.encryptedNoteHash);

    const staleSelectorHashes = computeStageBWithdrawPublicExitHashes({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      selector: WITHDRAW_BOUNDED_SELECTOR,
      root: merklePath.root,
      nullifier: bundle.nullifier,
      destination,
      grossAmount: BigInt(note.noteAmountWei),
      fee: 407407403700000n,
      noteAmount: BigInt(note.noteAmountWei),
      relayerPolicy: {
        relayer: "0x0000000000000000000000000000000000000000",
        minNetAmount: 123049381596300000n,
        maxFeeAmount: 407407403700000n,
        deadlineOrZero: 0n
      }
    });
    expect(bundle.intent.encryptedNoteHash).not.toBe(staleSelectorHashes.encryptedNoteHash);
  });

  it("rejects mismatched chain, pool, commitment, path depth, and path bits", async () => {
    const base: BuildBrowserWithdrawWitnessInput = {
      note,
      merklePath,
      destination,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    };

    await expect(buildBrowserWithdrawWitness({ ...base, note: { ...note, chainId: 1 } })).rejects.toThrow(
      "Recovered note is not for the configured MegaETH network."
    );
    await expect(
      buildBrowserWithdrawWitness({ ...base, merklePath: { ...merklePath, pool: "0x1111111111111111111111111111111111111111" } })
    ).rejects.toThrow("Merkle path is not for this shielded pool.");
    await expect(
      buildBrowserWithdrawWitness({ ...base, merklePath: { ...merklePath, commitment: `0x${"66".repeat(32)}` } })
    ).rejects.toThrow("Merkle path commitment does not match the recovered note.");
    await expect(
      buildBrowserWithdrawWitness({ ...base, merklePath: { ...merklePath, pathElements: merklePath.pathElements.slice(0, 3) } })
    ).rejects.toThrow("Merkle path must match the withdrawal circuit depth.");
    await expect(
      buildBrowserWithdrawWitness({
        ...base,
        merklePath: {
          ...merklePath,
          pathElements: [
            `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`,
            ...merklePath.pathElements.slice(1)
          ]
        }
      })
    ).rejects.toThrow("Merkle path element must be a BN254 field element.");
    await expect(
      buildBrowserWithdrawWitness({
        ...base,
        merklePath: {
          ...merklePath,
          leafIndex: 4096,
          pathIndices: Array.from({ length: 12 }, () => 0)
        }
      })
    ).rejects.toThrow("Merkle path leaf index must fit the withdrawal circuit depth.");
    await expect(
      buildBrowserWithdrawWitness({
        ...base,
        merklePath: { ...merklePath, pathIndices: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
      })
    ).rejects.toThrow("Merkle path indices do not match the leaf index.");
  });

  it("accepts a depth-20 Merkle path when the runtime pool is configured for depth 20", async () => {
    const depth20Path = {
      ...merklePath,
      pathElements: [...merklePath.pathElements, ...Array.from({ length: 8 }, () => `0x00${"00".repeat(31)}` as const)],
      pathIndices: [...merklePath.pathIndices, ...Array.from({ length: 8 }, () => 0)]
    };

    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath: depth20Path,
      destination,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      merkleTreeDepth: 20
    });

    expect(bundle.witness.pathElements).toHaveLength(20);
    expect(bundle.intent.pool).toBe(SHIELDED_POOL_ADDRESS);
  });

  it("builds split-withdraw witnesses with recoverable change notes", async () => {
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      grossAmountWei: "10000000000000",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      encryptChangeNote: async () => "0xabcd"
    });

    expect(bundle.changeNote).toMatchObject({
      version: "spend-material-v1",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
      noteAmountWei: "123446789000000000"
    });
    expect(bundle.changeNote?.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(bundle.intent.changeCommitment).toBe(bundle.changeNote?.commitment);
    expect(bundle.encryptedChangeNote).toBe("0xabcd");
    expect(bundle.witness.newCommitment).toBe(BigInt(bundle.changeNote?.commitment ?? "0x0").toString());
    expect(bundle.witness.proofContextHash).toBe(BigInt(bundle.intent.proofContextHash).toString());
    expect(bundle.witness.encryptedNoteHash).toBe(BigInt(bundle.intent.encryptedNoteHash).toString());
    expect(bundle.witness.expectedProofContextHash).toBe(BigInt(bundle.intent.proofContextHash).toString());
    expect(bundle.witness.expectedEncryptedNoteHash).toBe(BigInt(bundle.intent.encryptedNoteHash).toString());
    expect(bundle.witness.changeAmount).toBe("123446789000000000");
    expect(bundle.witness.changeOwnerCommitment).not.toBe("0");
    expect(bundle.witness.changeNoteSecret).not.toBe("0");
    expect(bundle.netAmountWei).toBe("9967000000000");
  });

  it("rejects over-withdrawal but allows tiny zero-fee withdrawal amounts", async () => {
    const base: BuildBrowserWithdrawWitnessInput = {
      note,
      merklePath,
      destination,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    };

    await expect(buildBrowserWithdrawWitness({ ...base, grossAmountWei: "123456789000000001" })).rejects.toThrow(
      "Withdrawal amount cannot exceed the recovered note amount."
    );
    await expect(
      buildBrowserWithdrawWitness({
        ...base,
        note: { ...note, noteAmountWei: (1n << 128n).toString() },
        grossAmountWei: (1n << 128n).toString()
      })
    ).rejects.toThrow("noteAmountWei must fit the withdrawal circuit 128-bit amount bound.");
    const tinyNote = {
      ...note,
      noteAmountWei: "1",
      commitment: await deriveBrowserNoteCommitment({
        assetId: note.assetId,
        noteAmountWei: "1",
        ownerCommitment: note.ownerCommitment,
        noteSecret: note.noteSecret
      })
    };
    const tiny = await buildBrowserWithdrawWitness({
      ...base,
      note: tinyNote,
      merklePath: { ...merklePath, commitment: tinyNote.commitment },
      grossAmountWei: "1"
    });
    expect(tiny.witness.fee).toBe("0");
    expect(tiny.netAmountWei).toBe("1");
  });
});
