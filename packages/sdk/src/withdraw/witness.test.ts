import { describe, expect, it } from "vitest";
import type { SpendMaterialPlaintext } from "../recovery/encryptedNoteEnvelope.js";
import { deriveNoteCommitment } from "../notes/poseidon.js";
import {
  buildWithdrawalWitness,
  buildWithdrawalWitnessFromRootAcceptedLogs,
  computeStageBWithdrawPublicExitHashes,
  computeStageCWithdrawChangeNoteHashes
} from "./witness.js";

const NATIVE_ASSET_ID = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const POOL = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const;
const DESTINATION = "0x000000000000000000000000000000000000dEaD" as const;
const FIELD = `0x02${"22".repeat(31)}` as const;

const note: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: 6343,
  pool: POOL,
  assetId: NATIVE_ASSET_ID,
  noteAmountWei: "123456789000000000",
  ownerCommitment: FIELD,
  noteSecret: FIELD,
  blinding: FIELD,
  commitment: "0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb",
  createdAt: "2026-05-02T00:00:00.000Z"
};

const merklePath = {
  commitment: note.commitment,
  leafIndex: 2,
  root: `0x05${"55".repeat(31)}` as const,
  pathElements: [
    `0x01${"11".repeat(31)}`,
    `0x02${"22".repeat(31)}`,
    `0x03${"33".repeat(31)}`,
    `0x04${"44".repeat(31)}`,
    ...Array.from({ length: 8 }, () => `0x${"00".repeat(32)}` as const)
  ],
  pathIndices: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  chainId: 6343,
  pool: POOL,
  latestCheckedBlock: "123456"
} as const;

describe("withdrawal witness builder", () => {
  it("matches the protocol hash vectors used by the verifier input model", () => {
    const stageB = computeStageBWithdrawPublicExitHashes({
      chainId: 6343,
      pool: "0x5555555555555555555555555555555555555555",
      selector: "0x6666d824",
      root: "0x1111111111111111111111111111111111111111111111111111111111111111",
      nullifier: "0x2222222222222222222222222222222222222222222222222222222222222222",
      destination: "0x4444444444444444444444444444444444444444",
      grossAmount: 1000n,
      fee: 10n,
      noteAmount: 1000n,
      relayerPolicy: {
        relayer: "0x9999999999999999999999999999999999999999",
        minNetAmount: 990n,
        maxFeeAmount: 10n,
        deadlineOrZero: 1710000000n
      }
    });
    expect(stageB).toEqual({
      encryptedNoteHash: "0x0f8cdfe937a98f6651e70eb252476fa1a5a55ec57beb7139309b752fbf9bb64e",
      relayerPolicyHash: "0x00269ff6ccfe08370f98649e75f59bbd7cbe021aedab2186882cb6cfcf91294c",
      proofContextHash: "0x155d5a897132660f8f7df598d55ef9be25285ebf302ddb7e21dddd42863b411b"
    });

    const stageC = computeStageCWithdrawChangeNoteHashes({
      chainId: 6343,
      pool: "0x5555555555555555555555555555555555555555",
      selector: "0x678d8506",
      root: "0x1111111111111111111111111111111111111111111111111111111111111111",
      nullifier: "0x2222222222222222222222222222222222222222222222222222222222222222",
      destination: "0x4444444444444444444444444444444444444444",
      grossAmount: 4000000000000000n,
      fee: 13200000000000n,
      noteAmount: 10000000000000000n,
      changeCommitment: "0x3333333333333333333333333333333333333333333333333333333333333333",
      changeAmount: 6000000000000000n,
      encryptedChangeNote: "0x1234567890abcdef",
      relayerPolicy: {
        relayer: "0x9999999999999999999999999999999999999999",
        minNetAmount: 3986800000000000n,
        maxFeeAmount: 13200000000000n,
        deadlineOrZero: 1710000000n
      }
    });
    expect(stageC).toEqual({
      encryptedNoteHash: "0x1826b7c6e4bc834f501d6f485e4de232c71b80a3ca77495746111ce6425184cd",
      relayerPolicyHash: "0x1b60ee3227f987f672d3400edba31564eddba926b613a11a0b4d21252e661fbc",
      proofContextHash: "0x23511c4820fa20ab38ce304e8f079301954fd5a9fa30dfd5575164fd1b5f0594"
    });
  });

  it("builds a full-withdraw witness with app-compatible decimal fields and intent bindings", async () => {
    const bundle = await buildWithdrawalWitness({
      note,
      merklePath,
      destination: DESTINATION,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12
    });

    expect(bundle.witness).toMatchObject({
      root: BigInt(merklePath.root).toString(),
      nullifier: BigInt(bundle.nullifier).toString(),
      newCommitment: "0",
      destination: BigInt(DESTINATION).toString(),
      grossAmount: note.noteAmountWei,
      fee: "407407403700000",
      chainId: "6343",
      verifyingContract: BigInt(POOL).toString(),
      pathElements: merklePath.pathElements.map((element) => BigInt(element).toString()),
      assetId: "1",
      noteAmount: note.noteAmountWei,
      ownerCommitment: BigInt(note.ownerCommitment).toString(),
      noteSecret: BigInt(note.noteSecret).toString(),
      leafIndex: "2",
      withdrawalDestination: BigInt(DESTINATION).toString(),
      changeAmount: "0",
      changeOwnerCommitment: "0",
      changeNoteSecret: "0"
    });
    expect(bundle.intent).toMatchObject({
      root: merklePath.root,
      nullifier: bundle.nullifier,
      changeCommitment: `0x${"0".repeat(64)}`,
      destination: DESTINATION,
      grossAmountWei: note.noteAmountWei,
      feeWei: "407407403700000",
      chainId: 6343,
      pool: POOL,
      spentCommitment: note.commitment,
      noteAmountWei: note.noteAmountWei
    });
    expect(bundle.netAmountWei).toBe("123049381596300000");
    expect(bundle.changeNote).toBeNull();

    const expectedHashes = computeStageBWithdrawPublicExitHashes({
      chainId: 6343,
      pool: POOL,
      selector: "0x678d8506",
      root: merklePath.root,
      nullifier: bundle.nullifier,
      destination: DESTINATION,
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
  });

  it("builds split-withdraw witnesses through injected randomness and change-note encryption", async () => {
    const bundle = await buildWithdrawalWitness({
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: "10000000000000",
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      encryptChangeNote: async () => "0xabcd"
    });

    expect(bundle.changeNote).toMatchObject({
      version: "spend-material-v1",
      chainId: 6343,
      pool: POOL,
      assetId: NATIVE_ASSET_ID,
      noteAmountWei: "123446789000000000",
      ownerCommitment: `0x${"07".repeat(32)}`,
      noteSecret: `0x${"07".repeat(32)}`,
      blinding: `0x${"07".repeat(32)}`
    });
    expect(bundle.changeNote?.commitment).toBe(
      await deriveNoteCommitment({
        assetId: NATIVE_ASSET_ID,
        noteAmountWei: "123446789000000000",
        ownerCommitment: `0x${"07".repeat(32)}`,
        noteSecret: `0x${"07".repeat(32)}`
      })
    );
    expect(bundle.encryptedChangeNote).toBe("0xabcd");
    expect(bundle.witness.changeAmount).toBe("123446789000000000");
    expect(bundle.witness.changeOwnerCommitment).toBe(BigInt(`0x${"07".repeat(32)}`).toString());
    expect(bundle.witness.changeNoteSecret).toBe(BigInt(`0x${"07".repeat(32)}`).toString());
    expect(bundle.netAmountWei).toBe("9967000000000");
  });

  it("builds a withdrawal witness from accepted-root history without caller-supplied Merkle siblings", async () => {
    const bundle = await buildWithdrawalWitnessFromRootAcceptedLogs({
      note,
      rootAcceptedLogs: [
        {
          root: `0x${"00".repeat(32)}`,
          previousRoot: `0x${"00".repeat(32)}`,
          insertedCommitment: `0x${"00".repeat(32)}`
        },
        {
          root: `0x${"00".repeat(32)}`,
          previousRoot: `0x${"00".repeat(32)}`,
          insertedCommitment: note.commitment
        }
      ],
      destination: DESTINATION,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 2
    });

    expect(bundle.witness.leafIndex).toBe("0");
    expect(bundle.witness.pathElements).toHaveLength(2);
    expect(bundle.intent.root).not.toBe(`0x${"00".repeat(32)}`);
    expect(bundle.intent.spentCommitment).toBe(note.commitment);
  });

  it("rejects mismatched path metadata and over-withdrawal", async () => {
    await expect(
      buildWithdrawalWitness({
        note,
        merklePath: { ...merklePath, pool: "0x1111111111111111111111111111111111111111" },
        destination: DESTINATION,
        chainId: 6343,
        pool: POOL,
        merkleTreeDepth: 12
      })
    ).rejects.toThrow("Merkle path is not for this shielded pool.");

    await expect(
      buildWithdrawalWitness({
        note,
        merklePath,
        destination: DESTINATION,
        chainId: 6343,
        pool: POOL,
        merkleTreeDepth: 12,
        grossAmountWei: "123456789000000001"
      })
    ).rejects.toThrow("Withdrawal amount cannot exceed the recovered note amount.");

    await expect(
      buildWithdrawalWitness({
        note,
        merklePath: { ...merklePath, root: `0x${"00".repeat(32)}` },
        destination: DESTINATION,
        chainId: 6343,
        pool: POOL,
        merkleTreeDepth: 12
      })
    ).rejects.toThrow("Merkle path root must be a nonzero BN254 field element.");
  });
});
