import {
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR,
  ZERO_BYTES32,
  createProofContextV1,
  createRelayerPolicyV1,
  hashProofContextV1,
  hashRelayerPolicyV1,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
} from "@nullark/core";
import { describe, expect, it } from "vitest";
import {
  STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION,
  STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION,
  V12_UNLINKABLE_INDEXER_READINESS_BLOCKER,
  addEncryptedNoteEvent,
  assertEncryptedNoteEnvelopeMatchesRecord,
  computeStageBWithdrawPublicExitEncryptedNoteHash,
  computeStageCWithdrawChangeNoteEncryptedNoteHash,
  computeV12UnlinkableWithdrawEncryptedOutputNoteHash,
  createEncryptedNoteCache,
  INDEXER_SUPPORTED_FIXED_DENOMINATIONS_WEI,
  listEncryptedNoteEvents,
  validateV12UnlinkableWithdrawOutputNoteIndexerBinding,
  validateStageBWithdrawPublicExitIndexerBinding,
  validateStageCWithdrawChangeNoteIndexerBinding,
  validateEncryptedNoteEnvelopeForRecord,
  type EncryptedNoteEnvelopeV1,
  type EncryptedNoteEventRecord,
  type StageBWithdrawPublicExitIndexerBindingInput,
  type StageCWithdrawChangeNoteIndexerBindingInput,
  type V12UnlinkableWithdrawOutputNoteIndexerBindingInput
} from "./encryptedNotes.js";
import { readFileSync } from "node:fs";

const pool = "0xEc61D863700DeF260E7BABA634FAa24AEC81f29e";
const v12MainnetPool = "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8" as const;
const v12MainnetPublicRuntimeEvidenceSha256 =
  "0x66def458e16ea6ed9d1df9c15a79ec83c23d4d4ccdec631d868f614cc0e94ff4" as const;
const v12TestnetReadinessEvidenceSha256 =
  "0x7cf2ba6c7d482179a5a246ad4fa0ab7c4bbebb6a48108d0fe0963b8a364c825e" as const;
const commitment = `0x${"11".repeat(32)}` as const;
const transactionHash = `0x${"22".repeat(32)}` as const;
const supportedAmount = 5_000_000_000_000_000n;

describe("fixed denomination parity", () => {
  it("keeps indexer relayer and Solidity test expectations aligned with core", () => {
    expect([...INDEXER_SUPPORTED_FIXED_DENOMINATIONS_WEI]).toEqual([...MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI]);
    expectRelayerUsesSharedCoreDenominations();
    expect(extractNullarkPoolExpectedDenominationsWei()).toEqual([...MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI]);
  });
});

describe("encrypted note cache", () => {
  it("stores and lists encrypted note events without decrypting payloads", () => {
    const cache = createEncryptedNoteCache();
    addEncryptedNoteEvent(cache, {
      chainId: 6343,
      pool,
      eventType: "deposit",
      commitment,
      nullifier: null,
      leafIndex: 4,
      encryptedNote: "0x010203",
      encryptionVersion: 1,
      blockNumber: 20n,
      transactionHash,
      logIndex: 3,
      observedAtMs: 1_777_700_000_000,
      sourceRpc: "https://carrot.megaeth.com/rpc"
    });

    expect(
      listEncryptedNoteEvents(cache, {
        chainId: 6343,
        pool,
        fromBlock: 1n,
        toBlock: 25n
      })
    ).toHaveLength(1);
  });

  it("rejects malformed encrypted note payloads", () => {
    const cache = createEncryptedNoteCache();

    expect(() =>
      addEncryptedNoteEvent(cache, {
        chainId: 6343,
        pool,
        eventType: "deposit",
        commitment,
        nullifier: null,
        leafIndex: 4,
        encryptedNote: "0xabc",
        encryptionVersion: 1,
        blockNumber: 20n,
        transactionHash,
        logIndex: 3,
        observedAtMs: 1_777_700_000_000,
        sourceRpc: "https://carrot.megaeth.com/rpc"
      })
    ).toThrow("encrypted note payload must be even-length hex");
  });

  it("accepts an EncryptedNoteV1 envelope only when it matches chain-log event metadata", () => {
    const record = indexedDepositRecord();
    const envelope = matchingEnvelope();

    expect(validateEncryptedNoteEnvelopeForRecord(record, envelope)).toEqual([]);
    expect(() => assertEncryptedNoteEnvelopeMatchesRecord(record, envelope)).not.toThrow();
  });

  it("accepts the explicit withdraw-change action label and legacy withdraw label for change-note events", () => {
    const record = indexedChangeRecord({
      chainId: 6343,
      pool: pool as `0x${string}`,
      nullifier: `0x${"55".repeat(32)}`,
      changeCommitment: commitment,
      encryptedChangeNote: "0x010203"
    });
    const envelope: EncryptedNoteEnvelopeV1 = {
      ...matchingEnvelope(),
      action: "withdraw-change",
      commitment,
      leafIndex: record.leafIndex
    };

    expect(validateEncryptedNoteEnvelopeForRecord(record, envelope)).toEqual([]);
    expect(validateEncryptedNoteEnvelopeForRecord(record, { ...envelope, action: "withdraw" })).toEqual([]);
  });

  it("accepts the v1.2 withdraw-output action label and legacy withdrawal labels for output-note events", () => {
    const record = indexedOutputNoteRecord({
      chainId: 6343,
      pool: pool as `0x${string}`,
      nullifier: `0x${"55".repeat(32)}`,
      outputCommitment: commitment,
      encryptedOutputNote: "0x010203"
    });
    const envelope: EncryptedNoteEnvelopeV1 = {
      ...matchingEnvelope(),
      action: "withdraw-output",
      commitment,
      leafIndex: record.leafIndex
    };

    expect(validateEncryptedNoteEnvelopeForRecord(record, envelope)).toEqual([]);
    expect(validateEncryptedNoteEnvelopeForRecord(record, { ...envelope, action: "withdraw-change" })).toEqual([]);
    expect(validateEncryptedNoteEnvelopeForRecord(record, { ...envelope, action: "withdraw" })).toEqual([]);
  });

  it("rejects EncryptedNoteV1 envelope mismatches without decrypting ciphertexts", () => {
    const record = indexedDepositRecord();
    const wrongEnvelope: EncryptedNoteEnvelopeV1 = {
      ...matchingEnvelope(),
      chainId: 4326,
      pool: "0x0000000000000000000000000000000000000001",
      action: "private-transfer",
      commitment: `0x${"33".repeat(32)}`,
      leafIndex: 5,
      amount: 123n,
      recipientCiphertext: "0x",
      associatedDataHash: "0x1234"
    };

    expect(validateEncryptedNoteEnvelopeForRecord(record, wrongEnvelope)).toEqual([
      "encrypted note envelope chain does not match indexed event",
      "encrypted note envelope pool does not match indexed event",
      "encrypted note envelope action does not match indexed event",
      "encrypted note envelope commitment does not match indexed event",
      "encrypted note envelope leaf index does not match indexed event",
      "encrypted note envelope amount is not a supported fixed denomination",
      "encrypted note envelope recipient ciphertext must be nonempty even-length hex",
      "encrypted note envelope associated data hash must be bytes32"
    ]);
  });
});

describe("proof-bound public-exit binding", () => {
  it("binds the contract encryptedNoteHash from chain-known public-exit fields without trusting cache ciphertexts", () => {
    const input = stageBIndexerInput({ includeProofContext: false });
    const validation = validateStageBWithdrawPublicExitIndexerBinding(input);

    expect(computeStageBWithdrawPublicExitEncryptedNoteHash(input)).toBe(
      STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.encryptedNoteHash
    );
    expect(validation).toEqual({
      encryptedNoteHash: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.encryptedNoteHash,
      errors: [],
      limitations: [STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION]
    });
  });

  it("validates proofContextHash when calldata public inputs are supplied to the indexer helper", () => {
    const input = stageBIndexerInput({ includeProofContext: true });
    const validation = validateStageBWithdrawPublicExitIndexerBinding(input);

    expect(validation.errors).toEqual([]);
    expect(validation.limitations).toEqual([]);
    expect(validation.proofContextHash).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.proofContextHash);
  });

  it("validates v1.2 fee-governance proofContextHash when the caller supplies the v1.2 shape", () => {
    const input = stageBIndexerInput({ includeProofContext: true });
    input.proofContextShape = PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE;
    input.encryptedNoteHash = computeStageBWithdrawPublicExitEncryptedNoteHash(input);
    input.proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
        selector: input.selector as `0x${string}`,
        root: input.root as `0x${string}`,
        nullifier: input.nullifier,
        destination: input.destination as `0x${string}`,
        grossAmount: input.grossAmount as bigint,
        fee: input.fee as bigint,
        encryptedNoteHash: input.encryptedNoteHash,
        relayerPolicyHash: input.relayerPolicyHash as `0x${string}`,
        deadlineOrZero: input.deadlineOrZero as bigint
      })
    ) as `0x${string}`;

    const validation = validateStageBWithdrawPublicExitIndexerBinding(input);

    expect(input.proofContextHash).not.toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.proofContextHash);
    expect(validation.errors).toEqual([]);
    expect(validation.limitations).toEqual([]);
    expect(validation.proofContextHash).toBe(input.proofContextHash);
  });

  it("rejects v1.2 fee-governance proofContextHash when the v1.2 shape is omitted", () => {
    const input = stageBIndexerInput({ includeProofContext: true });
    input.proofContextShape = PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE;
    input.encryptedNoteHash = computeStageBWithdrawPublicExitEncryptedNoteHash(input);
    input.proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
        selector: input.selector as `0x${string}`,
        root: input.root as `0x${string}`,
        nullifier: input.nullifier,
        destination: input.destination as `0x${string}`,
        grossAmount: input.grossAmount as bigint,
        fee: input.fee as bigint,
        encryptedNoteHash: input.encryptedNoteHash,
        relayerPolicyHash: input.relayerPolicyHash as `0x${string}`,
        deadlineOrZero: input.deadlineOrZero as bigint
      })
    ) as `0x${string}`;

    const { proofContextShape: _proofContextShape, ...inputWithoutShape } = input;
    const validation = validateStageBWithdrawPublicExitIndexerBinding(inputWithoutShape);

    expect(validation.errors).toEqual(expect.arrayContaining([
      "proof-bound public exit encryptedNoteHash does not match chain-bound fields",
      "proof-bound public exit proofContextHash does not match calldata-bound fields"
    ]));
  });


  it("rejects wrong chain pool selector encryptedNoteHash proofContextHash and private-change-like fields", () => {
    const input = stageBIndexerInput({ includeProofContext: true });

    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        chainId: 4326
      }).errors
    ).toEqual(expect.arrayContaining([
      "proof-bound public exit encryptedNoteHash does not match chain-bound fields",
      "proof-bound public exit proofContextHash does not match calldata-bound fields"
    ]));
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        pool: "0x0000000000000000000000000000000000000001"
      }).errors
    ).toEqual(expect.arrayContaining([
      "proof-bound public exit encryptedNoteHash does not match chain-bound fields",
      "proof-bound public exit proofContextHash does not match calldata-bound fields"
    ]));
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        selector: "0xc7787d0f"
      }).errors
    ).toEqual(expect.arrayContaining([
      "proof-bound public exit selector must be the withdraw relayer-policy selector",
      "proof-bound public exit encryptedNoteHash does not match chain-bound fields",
      "proof-bound public exit proofContextHash does not match calldata-bound fields"
    ]));
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        encryptedNoteHash: `0x${"88".repeat(32)}`
      }).errors
    ).toContain("proof-bound public exit encryptedNoteHash does not match chain-bound fields");
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        proofContextHash: `0x${"99".repeat(32)}`
      }).errors
    ).toContain("proof-bound public exit proofContextHash does not match calldata-bound fields");
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        relayerPolicyHash: `0x${"77".repeat(32)}`
      }).errors
    ).toContain("proof-bound public exit proofContextHash does not match calldata-bound fields");
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        deadlineOrZero: (input.deadlineOrZero ?? 0n) + 1n
      }).errors
    ).toContain("proof-bound public exit proofContextHash does not match calldata-bound fields");
    expect(
      validateStageBWithdrawPublicExitIndexerBinding({
        ...input,
        changeCommitment: `0x${"44".repeat(32)}`,
        encryptedChangeNote: "0xab"
      }).errors
    ).toEqual(expect.arrayContaining([
      "proof-bound public exit does not support change-note commitments",
      "proof-bound public exit does not support encrypted change notes"
    ]));
  });
});

describe("private-change withdrawal partial-exit binding", () => {
  it("binds change ciphertext to chain event metadata without treating indexer cache as authority", () => {
    const input = stageCIndexerInput({ includeProofContext: false, includeEvent: true });
    const validation = validateStageCWithdrawChangeNoteIndexerBinding(input);

    expect(computeStageCWithdrawChangeNoteEncryptedNoteHash(input)).toBe(input.encryptedNoteHash);
    expect(validation).toEqual({
      encryptedNoteHash: input.encryptedNoteHash,
      errors: [],
      limitations: [STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION]
    });
  });

  it("validates private-change withdrawal proofContextHash when calldata context is supplied", () => {
    const input = stageCIndexerInput({ includeProofContext: true, includeEvent: true });
    const validation = validateStageCWithdrawChangeNoteIndexerBinding(input);

    expect(validation.errors).toEqual([]);
    expect(validation.limitations).toEqual([]);
    expect(validation.proofContextHash).toBe(input.proofContextHash);
  });

  it("validates v1.2 fee-governance private-change proofContextHash when the caller supplies the v1.2 shape", () => {
    const input = stageCIndexerInput({ includeProofContext: true, includeEvent: true });
    input.proofContextShape = PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE;
    input.encryptedNoteHash = computeStageCWithdrawChangeNoteEncryptedNoteHash(input);
    if (input.eventRecord !== undefined) {
      input.eventRecord.encryptedNote = input.encryptedChangeNote;
    }
    input.proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: input.chainId,
        pool: input.pool,
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
        selector: input.selector as `0x${string}`,
        root: input.root as `0x${string}`,
        nullifier: input.nullifier,
        destination: input.destination as `0x${string}`,
        grossAmount: input.grossAmount,
        fee: input.fee,
        encryptedNoteHash: input.encryptedNoteHash,
        relayerPolicyHash: input.relayerPolicyHash as `0x${string}`,
        deadlineOrZero: input.deadlineOrZero as bigint
      })
    ) as `0x${string}`;

    const validation = validateStageCWithdrawChangeNoteIndexerBinding(input);

    expect(validation.errors).toEqual([]);
    expect(validation.limitations).toEqual([]);
    expect(validation.proofContextHash).toBe(input.proofContextHash);
  });

  it("rejects private-change withdrawal wrong ciphertext commitment amount order and event mismatches", () => {
    const input = stageCIndexerInput({ includeProofContext: true, includeEvent: true });

    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        encryptedChangeNote: "0xabce"
      }).errors
    ).toEqual(expect.arrayContaining([
      "private-change withdrawal event ciphertext does not match change binding",
      "private-change withdrawal encryptedNoteHash does not match chain-bound change fields",
      "private-change withdrawal proofContextHash does not match calldata-bound change fields"
    ]));
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        changeCommitment: `0x${"66".repeat(32)}`
      }).errors
    ).toEqual(expect.arrayContaining([
      "private-change withdrawal event commitment does not match change binding",
      "private-change withdrawal encryptedNoteHash does not match chain-bound change fields",
      "private-change withdrawal proofContextHash does not match calldata-bound change fields"
    ]));
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        changeAmount: input.changeAmount + 1n
      }).errors
    ).toEqual(expect.arrayContaining([
      "private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount",
      "private-change withdrawal encryptedNoteHash does not match chain-bound change fields",
      "private-change withdrawal proofContextHash does not match calldata-bound change fields"
    ]));
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        outputCommitments: [input.changeCommitment, `0x${"77".repeat(32)}`],
        encryptedChangeNotes: [input.encryptedChangeNote],
        changeAmounts: [input.changeAmount]
      }).errors
    ).toContain("private-change withdrawal fixed arity supports exactly one private change output");
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        outputCommitments: [`0x${"77".repeat(32)}`],
        encryptedChangeNotes: [input.encryptedChangeNote],
        changeAmounts: [input.changeAmount]
      }).errors
    ).toContain("private-change withdrawal output commitment order does not match change commitment");
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        outputCommitments: [input.changeCommitment],
        encryptedChangeNotes: ["0xabce"],
        changeAmounts: [input.changeAmount]
      }).errors
    ).toContain("private-change withdrawal ciphertext order does not match change output");
  });

  it("rejects unsupported fixed denominations for note gross and private change amounts", () => {
    const input = stageCIndexerInput({ includeProofContext: true, includeEvent: true });

    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        noteAmount: 900_000_000_000_000n
      }).errors
    ).toContain("private-change withdrawal note amount must be a supported fixed denomination");
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        grossAmount: 900_000_000_000_000n,
        changeAmount: 100_000_000_000_000n
      }).errors
    ).toContain("private-change withdrawal gross amount must be a supported fixed denomination");
    expect(
      validateStageCWithdrawChangeNoteIndexerBinding({
        ...input,
        grossAmount: 5_000_000_000_000_000n,
        changeAmount: 900_000_000_000_000n
      }).errors
    ).toContain("private-change withdrawal change amount must be a supported fixed denomination");
  });
});

describe("v1.2 unlinkable output-note withdrawal binding", () => {
  it("blocks otherwise valid v1.2 output-note bindings when readiness evidence is absent", () => {
    const input = v12OutputNoteIndexerInput();
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(input);

    expect(validation.errors).toEqual([V12_UNLINKABLE_INDEXER_READINESS_BLOCKER]);
    expect(validation.limitations).toEqual([]);
    expect(validation.encryptedOutputNoteHash).toBe(input.publicInputs[9]);
    expect(validation.proofContextHash).toBe(input.publicInputs[8]);
    expect(input.publicInputs).toHaveLength(10);
  });

  it("validates encryptedOutputNoteHash and proofContextHash when matching readiness evidence is supplied", () => {
    const input = withV12IndexerReadinessEvidence(v12OutputNoteIndexerInput());
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(input);

    expect(validation.errors).toEqual([]);
    expect(validation.limitations).toEqual([]);
    expect(validation.encryptedOutputNoteHash).toBe(input.publicInputs[9]);
    expect(validation.proofContextHash).toBe(input.publicInputs[8]);
    expect(input.publicInputs).toHaveLength(10);
  });

  it("accepts mainnet fee-governance readiness evidence for output-note bindings", () => {
    const input = v12OutputNoteIndexerInput({ chainId: 4326, pool: v12MainnetPool });
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding({
      ...input,
      readinessEvidence: {
        runtimeId: "nullark-v1.2-fee-governance",
        chainId: input.chainId,
        pool: input.pool,
        status: "ready",
        mainnet4326Blocked: false,
        finalReadiness: true,
        evidenceSha256: v12MainnetPublicRuntimeEvidenceSha256
      }
    });

    expect(validation.errors).toEqual([]);
  });

  it("keeps v1.2 output-note bindings blocked when readiness evidence is not final", () => {
    const input = v12OutputNoteIndexerInput();
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding({
      ...input,
      readinessEvidence: {
        runtimeId: "nullark-v1.2-testnet-rehearsal",
        chainId: input.chainId,
        pool: input.pool,
        status: "ready",
        mainnet4326Blocked: false,
        evidenceSha256: `0x${"aa".repeat(32)}`
      }
    });

    expect(validation.errors).toEqual([V12_UNLINKABLE_INDEXER_READINESS_BLOCKER]);
  });

  it("keeps v1.2 output-note bindings blocked for forged shape-valid readiness evidence", () => {
    const input = v12OutputNoteIndexerInput();
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding({
      ...input,
      readinessEvidence: {
        runtimeId: "nullark-v1.2-testnet-rehearsal",
        chainId: input.chainId,
        pool: input.pool,
        status: "ready",
        mainnet4326Blocked: false,
        finalReadiness: true,
        evidenceSha256: `0x${"aa".repeat(32)}`
      }
    });

    expect(validation.errors).toEqual([V12_UNLINKABLE_INDEXER_READINESS_BLOCKER]);
  });

  it("does not treat v1.2 output-note hashes as authoritative without indexed note evidence", () => {
    const { eventRecord: _eventRecord, ...inputWithoutEvent } = withV12IndexerReadinessEvidence(
      v12OutputNoteIndexerInput()
    );
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(inputWithoutEvent);

    expect(validation.errors).toEqual(["v1.2 unlinkable output-note event evidence is required"]);
    expect(validation.encryptedOutputNoteHash).toBe(inputWithoutEvent.publicInputs[9]);
    expect(validation.proofContextHash).toBe(inputWithoutEvent.publicInputs[8]);
  });

  it("requires v1.2 zero-output withdrawals to use a withdraw-output V2 envelope", () => {
    const emptyOutput = v12OutputNoteIndexerInput({
      outputCommitment: ZERO_BYTES32,
      encryptedOutputNote: "0x"
    });
    const emptyValidation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(emptyOutput);

    expect(emptyValidation.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note must be always-present nonempty even-length hex"
    );

    const rawDummyOutput = v12OutputNoteIndexerInput({
      outputCommitment: ZERO_BYTES32,
      encryptedOutputNote: "0x00"
    });
    const rawDummyValidation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(rawDummyOutput);

    expect(rawDummyValidation.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope"
    );

    const dummyOutput = v12OutputNoteIndexerInput({ outputCommitment: ZERO_BYTES32 });
    const dummyValidation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(dummyOutput);

    expect(dummyValidation.errors).toContain("v1.2 unlinkable output commitment must be nonzero bytes32");
    expect(dummyOutput.eventRecord?.eventType).toBe("withdraw-output");
    expect(dummyOutput.eventRecord?.commitment).toBe(ZERO_BYTES32);
  });

  it("rejects malformed v1.2 output-note envelopes even when their hash is internally consistent", () => {
    const malformed = v12OutputNoteIndexerInput({ encryptedOutputNote: "0xabcd" });
    const malformedValidation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(malformed);

    expect(malformedValidation.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope"
    );
  });

  it("requires output-note envelope proofContextHash to stay zero until envelope binding v3", () => {
    const nonzeroBoundEnvelope = encryptedOutputNoteV2Hex({
      chainId: 6343,
      verifyingContract: pool as `0x${string}`,
      outputCommitment: `0x${"33".repeat(32)}`,
      ciphertext: "0xabcd",
      proofContextHash: `0x${"77".repeat(32)}`
    });
    const input = v12OutputNoteIndexerInput({ encryptedOutputNote: nonzeroBoundEnvelope });
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding(input);

    expect(validation.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note proofContextHash must be zero until envelope binding v3"
    );
  });

  it("rejects stale v1.2 assumptions that expose spentCommitment noteAmount and encryptedNoteHash", () => {
    const legacy = stageCIndexerInput({ includeProofContext: true, includeEvent: true });
    const legacyPublicInputs = [
      legacy.root,
      legacy.nullifier,
      legacy.changeCommitment,
      addressToBytes32(legacy.destination as `0x${string}`),
      toBytes32(legacy.grossAmount),
      toBytes32(legacy.fee),
      toBytes32(BigInt(legacy.chainId)),
      addressToBytes32(legacy.pool),
      `0x${"88".repeat(32)}`,
      toBytes32(legacy.noteAmount),
      legacy.proofContextHash,
      legacy.encryptedNoteHash
    ] as const;

    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding({
      ...v12OutputNoteIndexerInput(),
      publicInputs: legacyPublicInputs,
      spentCommitment: legacyPublicInputs[8],
      noteAmount: legacy.noteAmount,
      encryptedNoteHash: legacy.encryptedNoteHash
    } as unknown as V12UnlinkableWithdrawOutputNoteIndexerBindingInput);

    expect(validation.errors).toEqual(expect.arrayContaining([
      "v1.2 unlinkable withdrawal public inputs must include exactly 10 fields",
      "v1.2 unlinkable withdrawal public inputs must not expose spentCommitment or noteAmount",
      "v1.2 unlinkable output-note validation does not accept encryptedNoteHash"
    ]));
  });

  it("rejects stale v1.2 private-change field names on output-note validation", () => {
    const valid = v12OutputNoteIndexerInput();
    const validation = validateV12UnlinkableWithdrawOutputNoteIndexerBinding({
      ...valid,
      changeCommitment: valid.publicInputs[2],
      changeAmount: 1n,
      encryptedChangeNote: valid.encryptedOutputNote,
      outputCommitments: [valid.publicInputs[2]],
      encryptedChangeNotes: [valid.encryptedOutputNote],
      changeAmounts: [1n]
    } as unknown as V12UnlinkableWithdrawOutputNoteIndexerBindingInput);

    expect(validation.errors).toEqual(expect.arrayContaining([
      "v1.2 unlinkable output-note validation does not accept changeCommitment or changeAmount",
      "v1.2 unlinkable output-note validation does not accept encryptedChangeNote or encryptedChangeNotes",
      "v1.2 unlinkable output-note validation does not accept outputCommitments or changeAmounts"
    ]));
  });
});

function indexedDepositRecord(): EncryptedNoteEventRecord {
  return {
    chainId: 6343,
    pool,
    eventType: "deposit",
    commitment,
    nullifier: null,
    leafIndex: 4,
    encryptedNote: "0x010203",
    encryptionVersion: 1,
    blockNumber: 20n,
    transactionHash,
    logIndex: 3,
    observedAtMs: 1_777_700_000_000,
    sourceRpc: "https://carrot.megaeth.com/rpc"
  };
}

function indexedChangeRecord(input: Pick<StageCWithdrawChangeNoteIndexerBindingInput, "chainId" | "pool" | "nullifier" | "changeCommitment" | "encryptedChangeNote">): EncryptedNoteEventRecord {
  return {
    chainId: input.chainId,
    pool: input.pool,
    eventType: "withdraw-change",
    commitment: input.changeCommitment,
    nullifier: input.nullifier,
    leafIndex: 9,
    encryptedNote: input.encryptedChangeNote,
    encryptionVersion: 1,
    blockNumber: 30n,
    transactionHash,
    logIndex: 5,
    observedAtMs: 1_777_700_000_100,
    sourceRpc: "https://carrot.megaeth.com/rpc"
  };
}

function matchingEnvelope(): EncryptedNoteEnvelopeV1 {
  return {
    version: 1,
    chainId: 6343,
    pool,
    action: "deposit",
    commitment,
    leafIndex: 4,
    amount: supportedAmount,
    assetConvention: "native-eth-v1",
    recipientCiphertext: "0x010203",
    senderRecoveryCiphertext: "0x040506",
    nonceOrCounter: `0x${"77".repeat(32)}`,
    associatedDataHash: `0x${"88".repeat(32)}`
  };
}

function v12OutputNoteIndexerInput(
  overrides: Partial<Pick<V12UnlinkableWithdrawOutputNoteIndexerBindingInput, "encryptedOutputNote">> &
    Partial<{ chainId: number; outputCommitment: `0x${string}`; pool: `0x${string}` }> = {}
): V12UnlinkableWithdrawOutputNoteIndexerBindingInput {
  const relayerPolicyHash = hashRelayerPolicyV1(
    createRelayerPolicyV1({
      relayer: "0x9999999999999999999999999999999999999999",
      minNetAmount: 4_983_500_000_000_000n,
      maxFeeAmount: 16_500_000_000_000n,
      deadlineOrZero: 1_710_000_000n
    })
  ) as `0x${string}`;
  const base = {
    chainId: overrides.chainId ?? 6343,
    pool: overrides.pool ?? (pool as `0x${string}`),
    selector: "0x678d8506" as const,
    root: `0x${"11".repeat(32)}` as const,
    nullifier: `0x${"22".repeat(32)}` as const,
    outputCommitment: overrides.outputCommitment ?? (`0x${"33".repeat(32)}` as const),
    destination: "0x4444444444444444444444444444444444444444" as const,
    grossAmount: 5_000_000_000_000_000n,
    fee: 16_500_000_000_000n,
    encryptedOutputNote: overrides.encryptedOutputNote ?? ("0x" as const),
    relayerPolicyHash,
    deadlineOrZero: 1_710_000_000n
  };
  const encryptedOutputNote =
    overrides.encryptedOutputNote ??
    encryptedOutputNoteV2Hex({
      chainId: base.chainId,
      verifyingContract: base.pool,
      outputCommitment: base.outputCommitment,
      ciphertext: base.outputCommitment === ZERO_BYTES32 ? "0x00" : "0xabcd"
    });
  const encryptedOutputNoteHash = computeV12UnlinkableWithdrawEncryptedOutputNoteHash({
    ...base,
    encryptedOutputNote
  });
  const proofContextHash = hashProofContextV1(
    createProofContextV1({
      chainId: base.chainId,
      pool: base.pool,
      shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
      selector: base.selector,
      root: base.root,
      nullifier: base.nullifier,
      destination: base.destination,
      grossAmount: base.grossAmount,
      fee: base.fee,
      encryptedNoteHash: encryptedOutputNoteHash,
      relayerPolicyHash,
      deadlineOrZero: base.deadlineOrZero
    })
  ) as `0x${string}`;

  return {
    chainId: base.chainId,
    pool: base.pool,
    selector: base.selector,
    publicInputs: [
      base.root,
      base.nullifier,
      base.outputCommitment,
      addressToBytes32(base.destination),
      toBytes32(base.grossAmount),
      toBytes32(base.fee),
      toBytes32(BigInt(base.chainId)),
      addressToBytes32(base.pool),
      proofContextHash,
      encryptedOutputNoteHash
    ],
    encryptedOutputNote,
    relayerPolicyHash,
    deadlineOrZero: base.deadlineOrZero,
    eventRecord: indexedOutputNoteRecord({
      chainId: base.chainId,
      pool: base.pool,
      nullifier: base.nullifier,
      outputCommitment: base.outputCommitment,
      encryptedOutputNote
    })
  };
}

function withV12IndexerReadinessEvidence(
  input: V12UnlinkableWithdrawOutputNoteIndexerBindingInput
): V12UnlinkableWithdrawOutputNoteIndexerBindingInput {
  return {
    ...input,
    readinessEvidence: {
      runtimeId: "nullark-v1.2-testnet-rehearsal",
      chainId: input.chainId,
      pool: input.pool,
      status: "ready",
      mainnet4326Blocked: false,
      finalReadiness: true,
      evidenceSha256: v12TestnetReadinessEvidenceSha256
    }
  };
}

function encryptedOutputNoteV2Hex(input: {
  chainId: number;
  verifyingContract: `0x${string}`;
  outputCommitment: `0x${string}`;
  ciphertext: `0x${string}`;
  proofContextHash?: `0x${string}`;
}): `0x${string}` {
  const ciphertextByteLength = hexByteLength(input.ciphertext);
  const paddedCiphertextByteLength = 256;
  const paddingByteLength = paddedCiphertextByteLength - ciphertextByteLength;
  return utf8ToHex(
    JSON.stringify({
      version: 2,
      domain: "nullark.encrypted-output-note.v2",
      chainId: input.chainId,
      verifyingContract: input.verifyingContract.toLowerCase(),
      action: "withdraw-output",
      outputCommitment: input.outputCommitment.toLowerCase(),
      proofContextHash: input.proofContextHash ?? ZERO_BYTES32,
      ephemeralPublicKey: `0x${"00".repeat(32)}`,
      nonce: `0x${"00".repeat(24)}`,
      ciphertext: input.ciphertext.toLowerCase(),
      ciphertextByteLength,
      paddingBytes: `0x${"00".repeat(paddingByteLength)}`,
      paddingByteLength,
      paddedCiphertextByteLength
    })
  );
}

function indexedOutputNoteRecord(input: {
  chainId: number;
  pool: `0x${string}`;
  nullifier: `0x${string}`;
  outputCommitment: `0x${string}`;
  encryptedOutputNote: `0x${string}`;
}): EncryptedNoteEventRecord {
  return {
    chainId: input.chainId,
    pool: input.pool,
    eventType: "withdraw-output",
    commitment: input.outputCommitment,
    nullifier: input.nullifier,
    leafIndex: 9,
    encryptedNote: input.encryptedOutputNote,
    encryptionVersion: 1,
    blockNumber: 30n,
    transactionHash,
    logIndex: 5,
    observedAtMs: 1_777_700_000_100,
    sourceRpc: "https://carrot.megaeth.com/rpc"
  };
}

function toBytes32(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function addressToBytes32(value: `0x${string}`): `0x${string}` {
  return `${ZERO_BYTES32.slice(0, 26)}${value.slice(2).toLowerCase()}` as `0x${string}`;
}

function hexByteLength(value: `0x${string}`): number {
  return (value.length - 2) / 2;
}

function utf8ToHex(value: string): `0x${string}` {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )}`;
}

function stageBIndexerInput(input: { includeProofContext: boolean }): StageBWithdrawPublicExitIndexerBindingInput {
  const vector = STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR;
  const publicInputs = vector.publicInputsWithoutStageB;
  const binding: StageBWithdrawPublicExitIndexerBindingInput = {
    chainId: vector.chainId,
    pool: vector.pool,
    selector: vector.selector,
    nullifier: publicInputs[1],
    noteAmount: BigInt(publicInputs[9]),
    encryptedNoteHash: vector.encryptedNoteHash
  };

  if (input.includeProofContext) {
    binding.root = publicInputs[0];
    binding.destination = "0x4444444444444444444444444444444444444444";
    binding.grossAmount = BigInt(publicInputs[4]);
    binding.fee = BigInt(publicInputs[5]);
    binding.relayerPolicyHash = vector.relayerPolicyHash;
    binding.deadlineOrZero = BigInt(vector.relayerPolicy.deadlineOrZero);
    binding.proofContextHash = vector.proofContextHash;
  }

  return binding;
}

function stageCIndexerInput(input: {
  includeProofContext: boolean;
  includeEvent: boolean;
}): StageCWithdrawChangeNoteIndexerBindingInput {
  const base: StageCWithdrawChangeNoteIndexerBindingInput = {
    chainId: 6343,
    pool: pool as `0x${string}`,
    selector: "0x678d8506",
    nullifier: `0x${"22".repeat(32)}`,
    noteAmount: 10_000_000_000_000_000n,
    grossAmount: 5_000_000_000_000_000n,
    fee: 16_500_000_000_000n,
    changeCommitment: `0x${"33".repeat(32)}`,
    changeAmount: 5_000_000_000_000_000n,
    encryptedChangeNote: "0xabcd",
    encryptedNoteHash: `0x${"00".repeat(32)}`
  };
  base.encryptedNoteHash = computeStageCWithdrawChangeNoteEncryptedNoteHash(base);

  if (input.includeProofContext) {
    base.root = `0x${"11".repeat(32)}`;
    base.destination = "0x4444444444444444444444444444444444444444";
    base.relayerPolicyHash = hashRelayerPolicyV1(
      createRelayerPolicyV1({
        relayer: "0x9999999999999999999999999999999999999999",
        minNetAmount: 4_983_500_000_000_000n,
        maxFeeAmount: 16_500_000_000_000n,
        deadlineOrZero: 1_710_000_000n
      })
    ) as `0x${string}`;
    base.deadlineOrZero = 1_710_000_000n;
    base.proofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: base.chainId,
        pool: base.pool,
        shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
        selector: base.selector as `0x${string}`,
        root: base.root,
        nullifier: base.nullifier,
        destination: base.destination,
        grossAmount: base.grossAmount,
        fee: base.fee,
        encryptedNoteHash: base.encryptedNoteHash,
        relayerPolicyHash: base.relayerPolicyHash,
        deadlineOrZero: base.deadlineOrZero
      })
    ) as `0x${string}`;
  }

  if (input.includeEvent) {
    base.eventRecord = indexedChangeRecord(base);
  }

  return base;
}

function expectRelayerUsesSharedCoreDenominations(): void {
  const source = readFileSync(new URL("../../../services/relay/src/withdrawalCalldata.ts", import.meta.url), "utf8");
  expect(source).toContain("MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI");
  expect(source).toContain(
    "export const RELAY_SUPPORTED_FIXED_DENOMINATIONS_WEI = MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI;"
  );
}

function extractNullarkPoolExpectedDenominationsWei(): bigint[] {
  const source = readFileSync(new URL("../../../contracts/test/NullarkPool.t.sol", import.meta.url), "utf8");
  const match = source.match(/function _expectedSupportedDenominationsWei\(\)[\s\S]*?returns \(uint256\[\] memory values\) \{([\s\S]*?)\n    \}/);
  const body = match?.[1];
  if (body === undefined) {
    throw new Error("NullarkPool expected denomination fixture was not found");
  }
  return extractBigIntLiterals(body);
}

function extractBigIntLiterals(source: string): bigint[] {
  const values = source.match(/[0-9][0-9_]*(?=n?\s*[,\n;])/g) ?? [];
  return values.map((value) => BigInt(value.replaceAll("_", "")));
}
