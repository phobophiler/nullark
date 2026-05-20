import { STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR } from "@nullark/core";
import { describe, expect, it } from "vitest";
import {
  LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  computeEncryptedNoteV1ClientHash,
  computeStageCWithdrawChangeNoteHashes,
  computeStageBWithdrawPublicExitHashes,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  parseEncryptedNoteV1FromHex,
  parseEncryptedNoteEnvelopeFromHex,
  serializeEncryptedNoteV1ToHex,
  serializeEncryptedNoteEnvelopeToHex,
  validateStageBWithdrawPublicExitPreflight,
  validateStageCWithdrawChangeNotePreflight,
  validateEncryptedNoteV1Envelope,
  ENCRYPTED_NOTE_V1_HASH_SCOPE,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  type EncryptedNoteV1,
  type StageCWithdrawChangeNotePreflightInput,
  type StageBWithdrawPublicExitPreflightInput,
  type SpendMaterialPlaintext
} from "./encryptedNoteEnvelope.js";

const signature = `0x${"11".repeat(65)}` as const;
const commitment = `0x${"22".repeat(32)}` as const;
const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const;

const plaintext: SpendMaterialPlaintext = {
  version: "spend-material-v1",
  chainId: 6343,
  pool,
  assetId: `0x${"00".repeat(31)}01`,
  noteAmountWei: "5000000000000000",
  ownerCommitment: `0x${"33".repeat(32)}`,
  noteSecret: `0x${"44".repeat(32)}`,
  blinding: `0x${"55".repeat(32)}`,
  commitment,
  createdAt: "2026-05-02T00:00:00.000Z"
};

const envelope = {
  version: 1,
  algorithm: "AES-GCM-256",
  kdf: "HKDF-SHA-256",
  nonce: "0x000102030405060708090a0b",
  ciphertext: "0x0c0d0e0f"
} as const;

const encryptedNoteV1: EncryptedNoteV1 = {
  version: 1,
  chainId: 6343,
  pool,
  action: "deposit",
  commitment,
  leafIndex: "7",
  amount: "5000000000000000",
  assetConvention: "native-eth-v1",
  recipientCiphertext: "0xaabbccdd",
  senderRecoveryCiphertext: "0x11223344",
  nonceOrCounter: `0x${"66".repeat(32)}`,
  associatedDataHash: `0x${"77".repeat(32)}`
};

describe("encrypted note envelope", () => {
  it("round-trips spend material with chain/pool/commitment associated data", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature: signature,
      chainId: 6343,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });

    await expect(crypto.subtle.exportKey("raw", recoveryKey)).rejects.toThrow();

    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: "megaeth-testnet-v1"
    });

    const aad = makeRecoveryAssociatedData({
      chainId: 6343,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });

    const encrypted = await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad });
    const decrypted = await decryptEncryptedNoteEnvelope({ noteKey, encrypted, aad });

    expect(decrypted).toEqual(plaintext);
    expect(encrypted.version).toBe(1);
    expect(encrypted.ciphertext).toMatch(/^0x[0-9a-f]+$/);
    expect(encrypted.nonce).toMatch(/^0x[0-9a-f]{24}$/);
  });

  it("keeps current and legacy recovery app ids cryptographically separated", async () => {
    const currentRecoveryKey = await deriveWalletRecoveryKey({
      walletSignature: signature,
      chainId: 6343,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const legacyRecoveryKey = await deriveWalletRecoveryKey({
      walletSignature: signature,
      chainId: 6343,
      pool,
      appId: LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const currentNoteKey = await deriveNoteKey(currentRecoveryKey, {
      commitment,
      epochId: "megaeth-6343-nullark-v1"
    });
    const legacyNoteKey = await deriveNoteKey(legacyRecoveryKey, {
      commitment,
      epochId: "megaeth-6343-nullark-v1"
    });
    const aad = makeRecoveryAssociatedData({
      chainId: 6343,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });

    const encrypted = await encryptSpendMaterialEnvelope({ noteKey: currentNoteKey, plaintext, aad });

    await expect(decryptEncryptedNoteEnvelope({ noteKey: currentNoteKey, encrypted, aad })).resolves.toEqual(plaintext);
    await expect(decryptEncryptedNoteEnvelope({ noteKey: legacyNoteKey, encrypted, aad })).rejects.toThrow(
      "Encrypted note authentication failed."
    );
  });

  it("rejects mismatched associated data", async () => {
    const recoveryKey = await deriveWalletRecoveryKey({
      walletSignature: signature,
      chainId: 6343,
      pool,
      appId: NULLARK_RECOVERY_APP_ID,
      recoveryVersion: 1
    });
    const noteKey = await deriveNoteKey(recoveryKey, {
      commitment,
      epochId: "megaeth-testnet-v1"
    });
    const aad = makeRecoveryAssociatedData({
      chainId: 6343,
      pool,
      action: "deposit",
      commitment,
      encryptionVersion: 1
    });
    const encrypted = await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad });
    const wrongAad = makeRecoveryAssociatedData({
      chainId: 6343,
      pool,
      action: "withdraw",
      commitment,
      encryptionVersion: 1
    });

    await expect(decryptEncryptedNoteEnvelope({ noteKey, encrypted, aad: wrongAad })).rejects.toThrow(
      "Encrypted note authentication failed."
    );
  });

  it("round-trips envelope objects through contract bytes hex", () => {
    const serialized = serializeEncryptedNoteEnvelopeToHex(envelope);

    expect(parseEncryptedNoteEnvelopeFromHex(serialized)).toEqual(envelope);
    expect(serialized).toMatch(/^0x(?:[0-9a-f]{2})+$/);
  });

  it("serializes envelope JSON in deterministic key order", () => {
    const reorderedEnvelope = {
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce,
      kdf: envelope.kdf,
      algorithm: envelope.algorithm,
      version: envelope.version
    };

    const serialized = serializeEncryptedNoteEnvelopeToHex(reorderedEnvelope);

    expect(hexToUtf8(serialized)).toBe(
      '{"version":1,"algorithm":"AES-GCM-256","kdf":"HKDF-SHA-256","nonce":"0x000102030405060708090a0b","ciphertext":"0x0c0d0e0f"}'
    );
  });

  it("rejects malformed serialized envelope hex", () => {
    expect(() => parseEncryptedNoteEnvelopeFromHex("0x0")).toThrow("Expected even-length hex string.");
    expect(() => parseEncryptedNoteEnvelopeFromHex("0xzz")).toThrow("Expected even-length hex string.");
  });

  it("rejects invalid serialized envelope JSON", () => {
    expect(() => parseEncryptedNoteEnvelopeFromHex(utf8ToHex("not json"))).toThrow(
      "Encrypted note envelope is not valid JSON."
    );
  });

  it("rejects unsupported envelope constants", () => {
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, version: 2 })))
    ).toThrow("Unsupported encrypted note envelope version.");
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, algorithm: "AES-CBC-256" })))
    ).toThrow("Unsupported encrypted note envelope algorithm.");
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, kdf: "PBKDF2-SHA-256" })))
    ).toThrow("Unsupported encrypted note envelope KDF.");
  });

  it("rejects invalid envelope nonce and ciphertext fields", () => {
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, nonce: "0x00" })))
    ).toThrow("Encrypted note envelope nonce must be 12 bytes.");
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, ciphertext: "0x123" })))
    ).toThrow("Encrypted note envelope ciphertext must be even-length hex.");
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, ciphertext: "0x" })))
    ).toThrow("Encrypted note envelope ciphertext must be even-length hex.");
    expect(() =>
      parseEncryptedNoteEnvelopeFromHex(utf8ToHex(JSON.stringify({ ...envelope, ciphertext: "0xgg" })))
    ).toThrow("Encrypted note envelope ciphertext must be even-length hex.");
  });
});

describe("EncryptedNoteV1 envelope", () => {
  it("serializes a canonical client/indexer/relayer vector without contract binding fields", async () => {
    const serialized = serializeEncryptedNoteV1ToHex(encryptedNoteV1);
    const parsed = parseEncryptedNoteV1FromHex(serialized, {
      chainId: 6343,
      pool,
      action: "deposit",
      commitment,
      leafIndex: "7"
    });
    const canonicalJson = hexToUtf8(serialized);

    expect(parsed).toEqual({
      ...encryptedNoteV1,
      pool: pool.toLowerCase(),
      commitment: commitment.toLowerCase(),
      recipientCiphertext: "0xaabbccdd",
      senderRecoveryCiphertext: "0x11223344",
      associatedDataHash: `0x${"77".repeat(32)}`
    });
    expect(canonicalJson).toBe(
      `{"version":1,"chainId":6343,"pool":"${pool.toLowerCase()}","action":"deposit","commitment":"${commitment}","leafIndex":"7","amount":"5000000000000000","assetConvention":"native-eth-v1","recipientCiphertext":"0xaabbccdd","senderRecoveryCiphertext":"0x11223344","nonceOrCounter":"0x${"66".repeat(
        32
      )}","associatedDataHash":"0x${"77".repeat(32)}"}`
    );
    expect(canonicalJson).not.toContain("proofContextHash");
    expect(canonicalJson).not.toContain("contractBoundEncryptedNoteHash");
    expect(ENCRYPTED_NOTE_V1_HASH_SCOPE).toBe("client-indexer-relayer-only");
    await expect(computeEncryptedNoteV1ClientHash(encryptedNoteV1)).resolves.toBe(
      "0x28aa441416aa64a40fc9b1f5b619a021f11bb9cbe189d36672acad298e9b6c3e"
    );
  });

  it("rejects wrong event or runtime context for client/indexer/relayer checks", () => {
    const serialized = serializeEncryptedNoteV1ToHex(encryptedNoteV1);

    expect(() => parseEncryptedNoteV1FromHex(serialized, { chainId: 4326 })).toThrow(
      "EncryptedNoteV1 chainId does not match the active chain."
    );
    expect(() => parseEncryptedNoteV1FromHex(serialized, { pool: "0x0000000000000000000000000000000000000001" })).toThrow(
      "EncryptedNoteV1 pool does not match the configured pool."
    );
    expect(() => parseEncryptedNoteV1FromHex(serialized, { action: "private-transfer" })).toThrow(
      "EncryptedNoteV1 action does not match the event type."
    );
    expect(() => parseEncryptedNoteV1FromHex(serialized, { commitment: `0x${"99".repeat(32)}` })).toThrow(
      "EncryptedNoteV1 commitment does not match the event commitment."
    );
    expect(() => parseEncryptedNoteV1FromHex(serialized, { leafIndex: "8" })).toThrow(
      "EncryptedNoteV1 leafIndex does not match the event leaf index."
    );
  });

  it("rejects malformed EncryptedNoteV1 payload fields and ambiguous encodings", () => {
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, version: 2 })).toThrow(
      "Unsupported EncryptedNoteV1 envelope version."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, chainId: 1 })).toThrow(
      "EncryptedNoteV1 chainId must be MegaETH testnet 6343 or mainnet 4326."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, action: "send" })).toThrow(
      "EncryptedNoteV1 action must be deposit, private-transfer, withdraw, or withdraw-change."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, leafIndex: "07" })).toThrow(
      "EncryptedNoteV1 leafIndex must be an unambiguous decimal uint256 string."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, amount: "1" })).toThrow(
      "EncryptedNoteV1 amount must be a supported fixed native ETH denomination."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, assetConvention: "erc20-v1" })).toThrow(
      "EncryptedNoteV1 assetConvention must be native-eth-v1."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, recipientCiphertext: "0x" })).toThrow(
      "EncryptedNoteV1 recipientCiphertext must be nonempty even-length hex bytes."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, associatedDataHash: "0x12" })).toThrow(
      "EncryptedNoteV1 associatedDataHash must be bytes32 hex."
    );
    expect(() => validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, proofContextHash: `0x${"88".repeat(32)}` })).toThrow(
      "EncryptedNoteV1 envelope has unexpected field proofContextHash."
    );
  });

  it("makes valid-hex ciphertext corruption visible through the client note hash", async () => {
    await expect(
      computeEncryptedNoteV1ClientHash({ ...encryptedNoteV1, recipientCiphertext: "0xaabbccde" })
    ).resolves.not.toBe("0x81e19bfd5e7a62facc3a371872cef208aea32d1f2c37387dbacdc8df7750a4c1");
  });
});

describe("Public-exit wallet preflight", () => {
  it("computes the contract-bound encrypted-note hash and proofContextHash without changing the recovery envelope hash", () => {
    const input = stageBVectorPreflightInput();
    const hashes = computeStageBWithdrawPublicExitHashes(input);

    expect(hashes).toEqual({
      encryptedNoteHash: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.encryptedNoteHash,
      relayerPolicyHash: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicyHash,
      proofContextHash: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.proofContextHash
    });
    expect(ENCRYPTED_NOTE_V1_HASH_SCOPE).toBe("client-indexer-relayer-only");
    expect(() =>
      validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, proofContextHash: hashes.proofContextHash })
    ).toThrow("EncryptedNoteV1 envelope has unexpected field proofContextHash.");
  });

  it("rejects caller-supplied public-exit hashes when chain pool selector deadline or policy changes", () => {
    const input = stageBVectorPreflightInput();
    const hashes = computeStageBWithdrawPublicExitHashes(input);

    expect(validateStageBWithdrawPublicExitPreflight({ ...input, ...hashes })).toEqual([]);
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        chainId: 4326
      })
    ).toEqual(expect.arrayContaining([
      "Public-exit encryptedNoteHash does not match wallet preflight.",
      "Public-exit proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        pool: "0x0000000000000000000000000000000000000001"
      })
    ).toEqual(expect.arrayContaining([
      "Public-exit encryptedNoteHash does not match wallet preflight.",
      "Public-exit proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        selector: "0xc7787d0f"
      })
    ).toEqual(expect.arrayContaining([
      "Public-exit selector must be the withdraw relayer-policy selector.",
      "Public-exit encryptedNoteHash does not match wallet preflight.",
      "Public-exit proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        relayerPolicy: { ...input.relayerPolicy, deadlineOrZero: input.relayerPolicy.deadlineOrZero + 1n }
      })
    ).toEqual(expect.arrayContaining([
      "Public-exit relayerPolicyHash does not match wallet preflight.",
      "Public-exit proofContextHash does not match wallet preflight."
    ]));
  });

  it("rejects wrong encrypted-note proof-context hashes and private-change fields", () => {
    const input = stageBVectorPreflightInput();
    const hashes = computeStageBWithdrawPublicExitHashes(input);

    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        encryptedNoteHash: `0x${"88".repeat(32)}`
      })
    ).toContain("Public-exit encryptedNoteHash does not match wallet preflight.");
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        proofContextHash: `0x${"99".repeat(32)}`
      })
    ).toContain("Public-exit proofContextHash does not match wallet preflight.");
    expect(
      validateStageBWithdrawPublicExitPreflight({
        ...input,
        ...hashes,
        changeCommitment: `0x${"44".repeat(32)}`,
        encryptedChangeNote: "0xab"
      })
    ).toEqual(expect.arrayContaining([
      "Public-exit preflight does not support change-note commitments.",
      "Public-exit preflight does not support encrypted change notes."
    ]));
  });
});

describe("Private-change withdrawal wallet preflight", () => {
  it("binds change commitment ciphertext relayer policy and proof context while keeping recovery envelope separate", () => {
    const input = stageCVectorPreflightInput();
    const hashes = computeStageCWithdrawChangeNoteHashes(input);

    expect(validateStageCWithdrawChangeNotePreflight({ ...input, ...hashes })).toEqual([]);
    expect(hashes.encryptedNoteHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashes.proofContextHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ENCRYPTED_NOTE_V1_HASH_SCOPE).toBe("client-indexer-relayer-only");
    expect(() =>
      validateEncryptedNoteV1Envelope({ ...encryptedNoteV1, contractBoundEncryptedNoteHash: hashes.encryptedNoteHash })
    ).toThrow("EncryptedNoteV1 envelope has unexpected field contractBoundEncryptedNoteHash.");
  });

  it("rejects wrong change ciphertext commitment amount deadline and output order", () => {
    const input = stageCVectorPreflightInput();
    const hashes = computeStageCWithdrawChangeNoteHashes(input);

    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        encryptedChangeNote: "0xabce"
      })
    ).toEqual(expect.arrayContaining([
      "Private change encryptedNoteHash does not match wallet preflight.",
      "Private-change withdrawal proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        changeCommitment: `0x${"66".repeat(32)}`
      })
    ).toEqual(expect.arrayContaining([
      "Private change encryptedNoteHash does not match wallet preflight.",
      "Private-change withdrawal proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        changeAmount: input.changeAmount + 1n
      })
    ).toEqual(expect.arrayContaining([
      "Private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount.",
      "Private change encryptedNoteHash does not match wallet preflight.",
      "Private-change withdrawal proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        relayerPolicy: { ...input.relayerPolicy, deadlineOrZero: input.relayerPolicy.deadlineOrZero + 1n }
      })
    ).toEqual(expect.arrayContaining([
      "Private-change withdrawal relayerPolicyHash does not match wallet preflight.",
      "Private-change withdrawal proofContextHash does not match wallet preflight."
    ]));
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        outputCommitments: [input.changeCommitment, `0x${"77".repeat(32)}`],
        encryptedChangeNotes: [input.encryptedChangeNote],
        changeAmounts: [input.changeAmount]
      })
    ).toContain("Private-change withdrawal supports exactly one private change output.");
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        outputCommitments: [`0x${"77".repeat(32)}`],
        encryptedChangeNotes: [input.encryptedChangeNote],
        changeAmounts: [input.changeAmount]
      })
    ).toContain("Private change commitment order does not match.");
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...input,
        ...hashes,
        outputCommitments: [input.changeCommitment],
        encryptedChangeNotes: ["0xabce"],
        changeAmounts: [input.changeAmount]
      })
    ).toContain("Private change ciphertext order does not match.");
  });
});

function stageBVectorPreflightInput(): StageBWithdrawPublicExitPreflightInput {
  const vector = STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR;
  const publicInputs = vector.publicInputsWithoutStageB;

  return {
    chainId: vector.chainId,
    pool: vector.pool,
    selector: vector.selector,
    root: publicInputs[0],
    nullifier: publicInputs[1],
    destination: "0x4444444444444444444444444444444444444444",
    grossAmount: BigInt(publicInputs[4]),
    fee: BigInt(publicInputs[5]),
    noteAmount: BigInt(publicInputs[9]),
    relayerPolicy: {
      relayer: vector.relayerPolicy.relayer,
      minNetAmount: BigInt(vector.relayerPolicy.minNetAmount),
      maxFeeAmount: BigInt(vector.relayerPolicy.maxFeeAmount),
      deadlineOrZero: BigInt(vector.relayerPolicy.deadlineOrZero)
    }
  };
}

function stageCVectorPreflightInput(): StageCWithdrawChangeNotePreflightInput {
  return {
    chainId: 6343,
    pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root: `0x${"11".repeat(32)}`,
    nullifier: `0x${"22".repeat(32)}`,
    destination: "0x4444444444444444444444444444444444444444",
    grossAmount: 10_000_000_000_000n,
    fee: 21_000_000_000n,
    noteAmount: 100_000_000_000_000n,
    changeCommitment: `0x${"33".repeat(32)}`,
    changeAmount: 90_000_000_000_000n,
    encryptedChangeNote: "0xabcd",
    relayerPolicy: {
      relayer: "0x9999999999999999999999999999999999999999",
      minNetAmount: 9_979_000_000_000n,
      maxFeeAmount: 21_000_000_000n,
      deadlineOrZero: 1_710_000_000n
    }
  };
}

function hexToUtf8(hex: `0x${string}`): string {
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function utf8ToHex(value: string): `0x${string}` {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )}`;
}
