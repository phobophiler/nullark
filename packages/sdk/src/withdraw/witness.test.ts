import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, stringToBytes } from "viem";
import {
  parseEncryptedOutputNoteV2EnvelopeFromHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import { createPoseidonFieldHash, deriveNoteCommitment } from "../notes/poseidon.js";
import {
  buildV12UnlinkableWithdrawalWitness,
  buildV12UnlinkableWithdrawalWitnessFromRootAcceptedLogs,
  buildWithdrawalWitness,
  buildWithdrawalWitnessFromRootAcceptedLogs,
  computeStageBWithdrawPublicExitHashes,
  computeStageCWithdrawChangeNoteHashes
} from "./witness.js";
import { STAGE_C_WITHDRAW_BOUNDED_SELECTOR } from "./calldata.js";

const NATIVE_ASSET_ID = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const POOL = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const;
const DESTINATION = "0x000000000000000000000000000000000000dEaD" as const;
const FIELD = `0x02${"22".repeat(31)}` as const;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const uint256Bytes32 = (value: string | bigint | number) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const addressBytes32 = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

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

  it("uses active fee bps for witness fees and ignores pending fee bps until activation", async () => {
    const bundle = await buildWithdrawalWitness({
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: note.noteAmountWei,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12,
      withdrawalFeeBps: 50,
      proofContextShape: "v1.2-fee-governance",
      pendingWithdrawalFeeBps: 75
    });

    expect(bundle.witness.fee).toBe("617283945000000");
    expect(bundle.intent.feeWei).toBe("617283945000000");
    expect(bundle.netAmountWei).toBe("122839505055000000");
  });

  it("builds v1.2 unlinkable witness and public inputs without public spent commitment or note amount", async () => {
    const bundle = await buildV12UnlinkableWithdrawalWitness({
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: note.noteAmountWei,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12,
      withdrawalFeeBps: 50
    });

    expect(bundle.publicInputs).toHaveLength(10);
    expect(bundle.publicInputs[2]).not.toBe(ZERO_BYTES32);
    expect(bundle.publicInputs).toEqual([
      merklePath.root,
      bundle.nullifier,
      bundle.intent.outputCommitment,
      addressBytes32(DESTINATION),
      uint256Bytes32(note.noteAmountWei),
      uint256Bytes32("617283945000000"),
      uint256Bytes32(6343),
      addressBytes32(POOL),
      bundle.intent.proofContextHash,
      bundle.intent.encryptedOutputNoteHash
    ]);
    expect(Object.keys(bundle.intent)).not.toContain("spentCommitment");
    expect(Object.keys(bundle.intent)).not.toContain("noteAmountWei");
    expect(bundle.witness.outputCommitment).not.toBe("0");
    expect(bundle.witness.oldAmount).toBe(note.noteAmountWei);
    expect(bundle.witness).not.toHaveProperty("newCommitment");
    expect(bundle.witness).not.toHaveProperty("noteAmount");
    expect(bundle.witness).not.toHaveProperty("encryptedNoteHash");
    expect(bundle.witness.expectedEncryptedOutputNoteHash).toBe(BigInt(bundle.intent.encryptedOutputNoteHash).toString());
    expect(bundle.outputNote).toBeNull();
    expect(bundle.encryptedOutputNote).not.toBe("0x");
    expect(bundle.encryptedOutputNote).toMatch(/^0x(?:[0-9a-fA-F]{2})+$/);
    expect(parseEncryptedOutputNoteV2EnvelopeFromHex(bundle.encryptedOutputNote, {
      chainId: 6343,
      verifyingContract: POOL,
      outputCommitment: bundle.intent.outputCommitment
    })).toMatchObject({
      version: 2,
      action: "withdraw-output",
      ciphertextByteLength: 1,
      paddingByteLength: 255,
      paddedCiphertextByteLength: 256
    });
  });

  it("wraps split v1.2 output note ciphertext in a fixed-shape V2 envelope before hashing", async () => {
    const bundle = await buildV12UnlinkableWithdrawalWitness({
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: "10000000000000",
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12,
      randomBytes: (length) => new Uint8Array(length).fill(7),
      encryptOutputNote: async () => "0xabcd"
    });
    const parsed = parseEncryptedOutputNoteV2EnvelopeFromHex(bundle.encryptedOutputNote, {
      chainId: 6343,
      verifyingContract: POOL,
      outputCommitment: bundle.intent.outputCommitment
    });

    expect(bundle.outputNote).not.toBeNull();
    expect(parsed.action).toBe("withdraw-output");
    expect(parsed.ciphertext).toBe("0xabcd");
    expect(parsed.ciphertextByteLength).toBe(2);
    expect(parsed.paddingByteLength).toBe(254);
    expect(bundle.publicInputs[9]).toBe(bundle.intent.encryptedOutputNoteHash);
    expect(bundle.intent.encryptedOutputNoteHash).toBe(
      expectedEncryptedOutputNoteV2Hash({
        chainId: 6343,
        pool: POOL,
        selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
        nullifier: bundle.nullifier,
        outputCommitment: bundle.intent.outputCommitment,
        encryptedOutputNote: bundle.encryptedOutputNote
      })
    );
  });

  it("rejects active or pending fee bps above the v1.2 max fee cap", async () => {
    const base = {
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: note.noteAmountWei,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12
    } as const;

    await expect(buildWithdrawalWitness({ ...base, withdrawalFeeBps: 101 })).rejects.toThrow("at or below 100 bps");
    await expect(buildWithdrawalWitness({ ...base, pendingWithdrawalFeeBps: 101 })).rejects.toThrow("at or below 100 bps");
  });

  it("rejects malformed v1.2 fee bps inputs below the lower bound or outside integer policy", async () => {
    const base = {
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: note.noteAmountWei,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12
    } as const;

    await expect(buildWithdrawalWitness({ ...base, withdrawalFeeBps: -1 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildWithdrawalWitness({ ...base, withdrawalFeeBps: 0.5 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildWithdrawalWitness({ ...base, pendingWithdrawalFeeBps: -1 })).rejects.toThrow("nonnegative safe integer");
    await expect(buildWithdrawalWitness({ ...base, pendingWithdrawalFeeBps: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow(
      "nonnegative safe integer"
    );
  });

  it("builds a withdrawal witness from accepted-root history without caller-supplied Merkle siblings", async () => {
    const rootAcceptedLogs = await rootAcceptedLogsForLeaves([note.commitment], 2);
    const bundle = await buildWithdrawalWitnessFromRootAcceptedLogs({
      note,
      rootAcceptedLogs,
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

  it("builds a v1.2 unlinkable withdrawal witness from accepted-root history without legacy public fields", async () => {
    const rootAcceptedLogs = await rootAcceptedLogsForLeaves([note.commitment], 2);
    const bundle = await buildV12UnlinkableWithdrawalWitnessFromRootAcceptedLogs({
      note,
      rootAcceptedLogs,
      destination: DESTINATION,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 2,
      withdrawalFeeBps: 50
    });

    expect(bundle.publicInputs).toHaveLength(10);
    expect(bundle.witness.leafIndex).toBe("0");
    expect(bundle.witness.pathElements).toHaveLength(2);
    expect(bundle.intent.root).not.toBe(`0x${"00".repeat(32)}`);
    expect(bundle.intent.outputCommitment).toBe(bundle.publicInputs[2]);
    expect(Object.keys(bundle.intent)).not.toContain("spentCommitment");
    expect(Object.keys(bundle.intent)).not.toContain("noteAmountWei");
    expect(bundle.witness).not.toHaveProperty("newCommitment");
    expect(bundle.witness).not.toHaveProperty("noteAmount");
    expect(bundle.witness).not.toHaveProperty("encryptedNoteHash");
  });

  it("rejects mismatched note/path metadata, destination, and over-withdrawal", async () => {
    const base = {
      note,
      merklePath,
      destination: DESTINATION,
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12
    } as const;

    await expect(
      buildWithdrawalWitness({
        ...base,
        note: { ...note, chainId: 4326 }
      })
    ).rejects.toThrow("Recovered note is not for the configured MegaETH network.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, chainId: 4326 }
      })
    ).rejects.toThrow("Merkle path is not for the configured MegaETH network.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, pool: "0x1111111111111111111111111111111111111111" },
      })
    ).rejects.toThrow("Merkle path is not for this shielded pool.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, commitment: `0x${"66".repeat(32)}` }
      })
    ).rejects.toThrow("Merkle path commitment does not match the recovered note.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        destination: "0x0000000000000000000000000000000000000000"
      })
    ).rejects.toThrow("Withdrawal destination must be a nonzero EVM address.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        grossAmountWei: "123456789000000001"
      })
    ).rejects.toThrow("Withdrawal amount cannot exceed the recovered note amount.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, root: `0x${"00".repeat(32)}` },
      })
    ).rejects.toThrow("Merkle path root must be a nonzero BN254 field element.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, pathElements: merklePath.pathElements.slice(0, 3) }
      })
    ).rejects.toThrow("Merkle path must match the withdrawal circuit depth.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, pathIndices: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
      })
    ).rejects.toThrow("Merkle path indices must be bits.");

    await expect(
      buildWithdrawalWitness({
        ...base,
        merklePath: { ...merklePath, pathIndices: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
      })
    ).rejects.toThrow("Merkle path indices do not match the leaf index.");
  });

  it("rejects unsafe split-withdraw change-note material before proving", async () => {
    const base = {
      note,
      merklePath,
      destination: DESTINATION,
      grossAmountWei: "10000000000000",
      chainId: 6343,
      pool: POOL,
      merkleTreeDepth: 12,
      randomBytes: (length: number) => new Uint8Array(length).fill(7)
    } as const;

    await expect(buildWithdrawalWitness(base)).rejects.toThrow(
      "Encrypted change note bytes are required before generating a split withdrawal proof."
    );
    await expect(buildWithdrawalWitness({ ...base, encryptChangeNote: async () => "0x" })).rejects.toThrow(
      "Encrypted change note must be nonempty even-length hex bytes."
    );
    await expect(buildWithdrawalWitness({ ...base, encryptChangeNote: async () => "0xabc" })).rejects.toThrow(
      "Encrypted change note must be nonempty even-length hex bytes."
    );
    await expect(
      buildWithdrawalWitness({
        ...base,
        randomBytes: () => new Uint8Array(31),
        encryptChangeNote: async () => "0xabcd"
      })
    ).rejects.toThrow("Random byte provider must return exactly 32 bytes.");
  });
});

async function rootAcceptedLogsForLeaves(leaves: readonly `0x${string}`[], depth: number) {
  const hash = await createPoseidonFieldHash();
  const zeroHashes = buildZeroHashes(depth, hash);
  const filledSubtrees = zeroHashes.slice(0, depth);
  const logs = [
    {
      root: toBytes32(zeroHashes[depth] ?? 0n),
      previousRoot: ZERO_BYTES32,
      insertedCommitment: ZERO_BYTES32
    }
  ];
  let previousRoot = logs[0]!.root;

  leaves.forEach((leaf, leafIndex) => {
    const root = insertLeaf(leaf, leafIndex, depth, zeroHashes, filledSubtrees, hash);
    logs.push({ root, previousRoot, insertedCommitment: leaf });
    previousRoot = root;
  });

  return logs;
}

function insertLeaf(
  leaf: `0x${string}`,
  leafIndex: number,
  depth: number,
  zeroHashes: readonly bigint[],
  filledSubtrees: bigint[],
  hash: (inputs: readonly bigint[]) => bigint
): `0x${string}` {
  let current = BigInt(leaf);
  for (let level = 0; level < depth; level += 1) {
    if (Math.floor(leafIndex / 2 ** level) % 2 === 0) {
      filledSubtrees[level] = current;
      current = hash([current, zeroHashes[level] ?? 0n]);
    } else {
      current = hash([filledSubtrees[level] ?? zeroHashes[level] ?? 0n, current]);
    }
  }
  return toBytes32(current);
}

function buildZeroHashes(depth: number, hash: (inputs: readonly bigint[]) => bigint): bigint[] {
  const zeroHashes = [0n];
  for (let level = 0; level < depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    zeroHashes.push(hash([zeroHash, zeroHash]));
  }
  return zeroHashes;
}

function toBytes32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

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
