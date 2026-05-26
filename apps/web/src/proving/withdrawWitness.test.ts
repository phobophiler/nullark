import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, keccak256, stringToBytes } from "viem";
import {
  computeStageBWithdrawPublicExitHashes,
  parseEncryptedOutputNoteV2EnvelopeFromHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import {
  MEGAETH_TESTNET_CHAIN_ID,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SHIELDED_POOL_ADDRESS,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_BOUNDED_SELECTOR
} from "../product/shieldedTransfersHelpers.js";
import { deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";
import type { WithdrawProofIntent } from "./browserWithdrawProver.js";
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

const destination = "0x1111111111111111111111111111111111111111" as const;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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

    const intent = bundle.intent as WithdrawProofIntent;

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
    expect(intent.proofContextHash).toBe(expectedHashes.proofContextHash);
    expect(intent.encryptedNoteHash).toBe(expectedHashes.encryptedNoteHash);

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
    expect(intent.encryptedNoteHash).not.toBe(staleSelectorHashes.encryptedNoteHash);
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
    expect((bundle.intent as WithdrawProofIntent).pool).toBe(SHIELDED_POOL_ADDRESS);
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
    const intent = bundle.intent as WithdrawProofIntent;

    expect(bundle.changeNote?.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(intent.changeCommitment).toBe(bundle.changeNote?.commitment);
    expect(bundle.encryptedChangeNote).toBe("0xabcd");
    expect(bundle.witness.newCommitment).toBe(BigInt(bundle.changeNote?.commitment ?? "0x0").toString());
    expect(bundle.witness.proofContextHash).toBe(BigInt(intent.proofContextHash).toString());
    expect(bundle.witness.encryptedNoteHash).toBe(BigInt(intent.encryptedNoteHash).toString());
    expect(bundle.witness.expectedProofContextHash).toBe(BigInt(intent.proofContextHash).toString());
    expect(bundle.witness.expectedEncryptedNoteHash).toBe(BigInt(intent.encryptedNoteHash).toString());
    expect(bundle.witness.changeAmount).toBe("123446789000000000");
    expect(bundle.witness.changeOwnerCommitment).not.toBe("0");
    expect(bundle.witness.changeNoteSecret).not.toBe("0");
    expect(bundle.netAmountWei).toBe("9967000000000");
  });

  it("uses active fee bps for witness fees and ignores pending fee bps until activation", async () => {
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      grossAmountWei: note.noteAmountWei,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      withdrawalFeeBps: 50,
      proofContextShape: "v1.2-fee-governance",
      publicInputSchema: "v1.2-unlinkable",
      pendingWithdrawalFeeBps: 75
    });

    expect(bundle.publicInputSchema).toBe("v1.2-unlinkable");
    expect(bundle.witness.fee).toBe("617283945000000");
    expect(bundle.intent.feeWei).toBe("617283945000000");
    expect(bundle.netAmountWei).toBe("122839505055000000");
  });

  it("builds v1.2 unlinkable witness and public inputs without public spent commitment or note amount", async () => {
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      grossAmountWei: note.noteAmountWei,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      withdrawalFeeBps: 50,
      proofContextShape: "v1.2-fee-governance",
      publicInputSchema: "v1.2-unlinkable"
    });

    expect(bundle.publicInputSchema).toBe("v1.2-unlinkable");
    expect(bundle.publicInputs).toHaveLength(10);
    expect(bundle.publicInputs?.[2]).not.toBe(ZERO_BYTES32);
    expect(bundle.publicInputs).toEqual([
      merklePath.root,
      bundle.nullifier,
      "outputCommitment" in bundle.intent ? bundle.intent.outputCommitment : ZERO_BYTES32,
      `0x${destination.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`,
      `0x${BigInt(note.noteAmountWei).toString(16).padStart(64, "0")}`,
      `0x${617283945000000n.toString(16).padStart(64, "0")}`,
      `0x${BigInt(MEGAETH_TESTNET_CHAIN_ID).toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`,
      bundle.intent.proofContextHash,
      "encryptedOutputNoteHash" in bundle.intent ? bundle.intent.encryptedOutputNoteHash : `0x${"0".repeat(64)}`
    ]);
    expect(Object.keys(bundle.intent)).not.toContain("spentCommitment");
    expect(Object.keys(bundle.intent)).not.toContain("noteAmountWei");
    expect(bundle.witness.outputCommitment).not.toBe("0");
    expect(bundle.witness.oldAmount).toBe(note.noteAmountWei);
    expect(bundle.witness).not.toHaveProperty("newCommitment");
    expect(bundle.witness).not.toHaveProperty("noteAmount");
    expect(bundle.witness).not.toHaveProperty("encryptedNoteHash");
    expect(bundle.witness.expectedEncryptedOutputNoteHash).toBe(
      "encryptedOutputNoteHash" in bundle.intent ? BigInt(bundle.intent.encryptedOutputNoteHash).toString() : "0"
    );
    expect((bundle as { outputNote?: unknown }).outputNote).toBeNull();
    expect((bundle as { encryptedOutputNote?: string }).encryptedOutputNote).not.toBe("0x");
    expect((bundle as { encryptedOutputNote?: string }).encryptedOutputNote).toMatch(/^0x(?:[0-9a-fA-F]{2})+$/);
    expect(bundle).not.toHaveProperty("changeNote");
    expect(bundle).not.toHaveProperty("encryptedChangeNote");
    expect(parseEncryptedOutputNoteV2EnvelopeFromHex((bundle as { encryptedOutputNote: `0x${string}` }).encryptedOutputNote, {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: SHIELDED_POOL_ADDRESS,
      outputCommitment: "outputCommitment" in bundle.intent ? bundle.intent.outputCommitment : ZERO_BYTES32
    })).toMatchObject({
      version: 2,
      action: "withdraw-output",
      ciphertextByteLength: 1,
      paddingByteLength: 255,
      paddedCiphertextByteLength: 256
    });
    expect("encryptedOutputNoteHash" in bundle.intent ? bundle.intent.encryptedOutputNoteHash : ZERO_BYTES32).toBe(
      expectedEncryptedOutputNoteV2Hash({
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: SHIELDED_POOL_ADDRESS,
        selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
        nullifier: bundle.nullifier,
        outputCommitment: "outputCommitment" in bundle.intent ? bundle.intent.outputCommitment : ZERO_BYTES32,
        encryptedOutputNote: (bundle as { encryptedOutputNote: `0x${string}` }).encryptedOutputNote
      })
    );
  });

  it("wraps split v1.2 output note ciphertext in a fixed-shape V2 envelope before hashing", async () => {
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      grossAmountWei: "10000000000000",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      proofContextShape: "v1.2-fee-governance",
      publicInputSchema: "v1.2-unlinkable",
      encryptOutputNote: async () => "0xabcd"
    });
    const intent = bundle.intent as { outputCommitment: `0x${string}`; encryptedOutputNoteHash: `0x${string}` };
    const parsed = parseEncryptedOutputNoteV2EnvelopeFromHex((bundle as { encryptedOutputNote: `0x${string}` }).encryptedOutputNote, {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: SHIELDED_POOL_ADDRESS,
      outputCommitment: intent.outputCommitment
    });

    expect((bundle as { outputNote?: unknown }).outputNote).not.toBeNull();
    expect(bundle).not.toHaveProperty("changeNote");
    expect(bundle).not.toHaveProperty("encryptedChangeNote");
    expect(parsed.action).toBe("withdraw-output");
    expect(parsed.ciphertext).toBe("0xabcd");
    expect(parsed.ciphertextByteLength).toBe(2);
    expect(parsed.paddingByteLength).toBe(254);
    expect(bundle.publicInputs?.[9]).toBe(intent.encryptedOutputNoteHash);
  });

  it("carries compact v1.2 output-note ciphertext nonce into the fixed-shape V2 envelope", async () => {
    const nonce = `0x${"12".repeat(24)}` as const;
    const bundle = await buildBrowserWithdrawWitness({
      note,
      merklePath,
      destination,
      grossAmountWei: "10000000000000",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      proofContextShape: "v1.2-fee-governance",
      publicInputSchema: "v1.2-unlinkable",
      encryptOutputNote: async () => ({
        nonce,
        ciphertext: "0xabcd"
      })
    });
    const intent = bundle.intent as { outputCommitment: `0x${string}` };
    const parsed = parseEncryptedOutputNoteV2EnvelopeFromHex((bundle as { encryptedOutputNote: `0x${string}` }).encryptedOutputNote, {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: SHIELDED_POOL_ADDRESS,
      outputCommitment: intent.outputCommitment
    });

    expect(parsed.nonce).toBe(nonce);
    expect(parsed.ciphertext).toBe("0xabcd");
    expect(parsed.paddingByteLength).toBe(254);
  });

  it("rejects old linkable v1.2 witness routing that would keep 12 public inputs", async () => {
    await expect(
      buildBrowserWithdrawWitness({
        note,
        merklePath,
        destination,
        grossAmountWei: note.noteAmountWei,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: SHIELDED_POOL_ADDRESS,
        withdrawalFeeBps: 50,
        proofContextShape: "v1.2-fee-governance"
      })
    ).rejects.toThrow("v1.2 fee-governed withdrawals must use publicInputSchema v1.2-unlinkable.");
  });

  it("rejects active or pending fee bps above the v1.2 max fee cap", async () => {
    const base: BuildBrowserWithdrawWitnessInput = {
      note,
      merklePath,
      destination,
      grossAmountWei: note.noteAmountWei,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    };

    await expect(buildBrowserWithdrawWitness({ ...base, withdrawalFeeBps: 101 })).rejects.toThrow("at or below 100 bps");
    await expect(buildBrowserWithdrawWitness({ ...base, pendingWithdrawalFeeBps: 101 })).rejects.toThrow("at or below 100 bps");
  });

  it("rejects malformed v1.2 fee bps inputs below the lower bound or outside integer policy", async () => {
    const base: BuildBrowserWithdrawWitnessInput = {
      note,
      merklePath,
      destination,
      grossAmountWei: note.noteAmountWei,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    };

    await expect(buildBrowserWithdrawWitness({ ...base, withdrawalFeeBps: -1 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildBrowserWithdrawWitness({ ...base, withdrawalFeeBps: 0.5 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildBrowserWithdrawWitness({ ...base, pendingWithdrawalFeeBps: -1 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildBrowserWithdrawWitness({ ...base, pendingWithdrawalFeeBps: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow(
      "nonnegative safe integer"
    );
  });

  it("rejects unsafe split-withdraw change-note material before proving", async () => {
    const base: BuildBrowserWithdrawWitnessInput = {
      note,
      merklePath,
      destination,
      grossAmountWei: "10000000000000",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS
    };

    await expect(buildBrowserWithdrawWitness(base)).rejects.toThrow(
      "Encrypted change note bytes are required before generating a split withdrawal proof."
    );
    await expect(buildBrowserWithdrawWitness({ ...base, encryptChangeNote: async () => "0x" })).rejects.toThrow(
      "Encrypted change note must be nonempty even-length hex bytes."
    );
    await expect(buildBrowserWithdrawWitness({ ...base, encryptChangeNote: async () => "0xabc" })).rejects.toThrow(
      "Encrypted change note must be nonempty even-length hex bytes."
    );
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

function expectedEncryptedOutputNoteV2Hash(input: {
  chainId: number;
  pool: string;
  selector: `0x${string}`;
  nullifier: `0x${string}`;
  outputCommitment: `0x${string}`;
  encryptedOutputNote: `0x${string}`;
}): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint16" },
      { type: "uint256" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes4" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" }
    ],
    [
      keccak256(stringToBytes("nullark.encrypted-output-note.v2")),
      2,
      BigInt(input.chainId),
      input.pool as `0x${string}`,
      keccak256(stringToBytes("withdraw_context_v1_2_fee_governance")),
      input.selector,
      input.nullifier,
      input.outputCommitment,
      keccak256(input.encryptedOutputNote)
    ]
  );
  return `0x${(BigInt(keccak256(encoded)) % BN254_SCALAR_FIELD).toString(16).padStart(64, "0")}`;
}
