import {
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR,
  createProofContextV1,
  createRelayerPolicyV1,
  hashProofContextV1,
  hashRelayerPolicyV1,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW
} from "@nullark/core";
import { describe, expect, it } from "vitest";
import {
  STAGE_B_INDEXER_PROOF_CONTEXT_LIMITATION,
  STAGE_C_INDEXER_PROOF_CONTEXT_LIMITATION,
  addEncryptedNoteEvent,
  assertEncryptedNoteEnvelopeMatchesRecord,
  computeStageBWithdrawPublicExitEncryptedNoteHash,
  computeStageCWithdrawChangeNoteEncryptedNoteHash,
  createEncryptedNoteCache,
  INDEXER_SUPPORTED_FIXED_DENOMINATIONS_WEI,
  listEncryptedNoteEvents,
  validateStageBWithdrawPublicExitIndexerBinding,
  validateStageCWithdrawChangeNoteIndexerBinding,
  validateEncryptedNoteEnvelopeForRecord,
  type EncryptedNoteEnvelopeV1,
  type EncryptedNoteEventRecord,
  type StageBWithdrawPublicExitIndexerBindingInput,
  type StageCWithdrawChangeNoteIndexerBindingInput
} from "./encryptedNotes.js";
import { readFileSync } from "node:fs";

const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544";
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
