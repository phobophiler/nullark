import { describe, expect, it } from "vitest";
import {
  ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
  PROOF_CONTEXT_V1_DOMAIN_SEPARATOR,
  PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE,
  PROOF_CONTEXT_V1_WITHDRAW_CHANGE_BOUNDED_SELECTOR,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  RELAYER_POLICY_V1_DOMAIN_SEPARATOR,
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID,
  SHIELDED_POOL_INITIAL_ROOT,
  STAGE_A_PUBLIC_INPUT_INDEX,
  STAGE_A_PUBLIC_INPUT_ORDER,
  STAGE_B_PUBLIC_INPUT_INDEX,
  STAGE_B_PUBLIC_INPUT_ORDER,
  STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR,
  STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_INDEX,
  STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER,
  STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR,
  WITHDRAW_CHANGE_V1_1_BPS_DENOMINATOR,
  WITHDRAW_CHANGE_V1_1_WITHDRAWAL_FEE_BPS,
  ZERO_BYTES32,
  assertEncryptedNoteHashMatches,
  assertProofContextHashMatches,
  assertRelayerPolicyHashMatches,
  assertRootInAcceptedHistory,
  assertProofModeAllowed,
  assertStageAPublicInputs,
  assertStageAPublicInputsMatch,
  assertStageBPublicInputs,
  assertStageBPublicInputsMatch,
  assertStageCWithdrawChangePublicInputs,
  assertWithdrawChangeV1_1PublicInputsMatch,
  assertWithdrawChangeV1_1ValueConservation,
  calculateWithdrawChangeV1_1Fee,
  createEncryptedNoteV1,
  createProofContextV1,
  createRelayerPolicyV1,
  createWithdrawChangeV1_1,
  encodeEncryptedNoteV1,
  encodeProofContextV1,
  encodeRelayerPolicyV1,
  encodeStageBPublicInputs,
  encodeVerifierPublicInputs,
  encodeWithdrawChangeV1_1PublicInputs,
  hashEncryptedNoteV1,
  hashProofContextV1,
  hashRelayerPolicyV1,
  nameStageAPublicInputs,
  nameStageBPublicInputs,
  nameStageCWithdrawChangePublicInputs,
  readStageAPublicInput,
  readStageBPublicInput,
  readStageCWithdrawChangePublicInput,
  reduceKeccakToField,
  type EncryptedNoteV1,
  type HexBytes32,
  type ProofContextV1,
  type ProofMode,
  type RelayerPolicyV1,
  type VerifierPublicInputs,
  type WithdrawChangeV1_1Input
} from "./proofs.js";

const basePublicInputs: VerifierPublicInputs = {
  kind: "withdrawal",
  root: "0x1111111111111111111111111111111111111111111111111111111111111111",
  nullifier: "0x2222222222222222222222222222222222222222222222222222222222222222",
  destination: "0x4444444444444444444444444444444444444444",
  grossAmount: 1_000n,
  fee: 10n,
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  verifyingContract: "0x5555555555555555555555555555555555555555",
  spentCommitment: "0x8888888888888888888888888888888888888888888888888888888888888888",
  noteAmount: 1_000n
};
const OLD_WITHDRAW_CHANGE_V1_1_SHAPE = "0x0ec7c43c7b9191444567ce3f23c214b3a509dd7d50bfbc508cdaab9558ca40ab" as const;

describe("proof mode policy", () => {
  it("allows local proving as the privacy-preserving default", () => {
    const mode: ProofMode = { kind: "local", sensitiveWitnessLeavesDevice: false };
    expect(assertProofModeAllowed(mode)).toBe("privacy-preserving");
  });

  it("labels service-assisted proving as reduced privacy when witness data leaves the device", () => {
    const mode: ProofMode = { kind: "service-assisted", sensitiveWitnessLeavesDevice: true };
    expect(assertProofModeAllowed(mode)).toBe("reduced-privacy");
  });

  it("rejects a service that requests spending keys", () => {
    const mode: ProofMode = { kind: "service-assisted", sensitiveWitnessLeavesDevice: true, serviceRequestsSpendingKey: true };
    expect(() => assertProofModeAllowed(mode)).toThrow("spending keys must never leave the client");
  });
});

describe("verifier public input encoding", () => {
  it("encodes valid private-transfer inputs in Solidity-mirrorable order", () => {
    expect(
      encodeVerifierPublicInputs({
        kind: "private-transfer",
        root: basePublicInputs.root,
        nullifier: basePublicInputs.nullifier,
        newCommitment: "0x3333333333333333333333333333333333333333333333333333333333333333",
        chainId: basePublicInputs.chainId,
        verifyingContract: basePublicInputs.verifyingContract,
        spentCommitment: basePublicInputs.spentCommitment,
        noteAmount: basePublicInputs.noteAmount
      })
    ).toEqual([
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      ZERO_BYTES32,
      ZERO_BYTES32,
      ZERO_BYTES32,
      "0x00000000000000000000000000000000000000000000000000000000000018c7",
      "0x0000000000000000000000005555555555555555555555555555555555555555",
      "0x8888888888888888888888888888888888888888888888888888888888888888",
      "0x00000000000000000000000000000000000000000000000000000000000003e8"
    ]);
  });

  it("encodes withdraw inputs with a zero new commitment", () => {
    const encoded = encodeVerifierPublicInputs(basePublicInputs);

    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.newCommitment]).toBe(ZERO_BYTES32);
    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.destination]).toBe(
      "0x0000000000000000000000004444444444444444444444444444444444444444"
    );
    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.grossAmount]).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000003e8"
    );
    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.fee]).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000000a"
    );
    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.spentCommitment]).toBe(basePublicInputs.spentCommitment);
    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.noteAmount]).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000003e8"
    );
  });

  it("binds public inputs to chainId and verifyingContract", () => {
    const encoded = encodeVerifierPublicInputs(basePublicInputs);
    const differentContract = encodeVerifierPublicInputs({
      ...basePublicInputs,
      verifyingContract: "0x6666666666666666666666666666666666666666"
    });

    expect(encoded[STAGE_A_PUBLIC_INPUT_INDEX.chainId]).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000018c7"
    );
    expect(differentContract[STAGE_A_PUBLIC_INPUT_INDEX.verifyingContract]).toBe(
      "0x0000000000000000000000006666666666666666666666666666666666666666"
    );
    expect(differentContract).not.toEqual(encoded);
    expect(
      encodeVerifierPublicInputs({ ...basePublicInputs, chainId: MEGAETH_MAINNET_CHAIN_ID })[
        STAGE_A_PUBLIC_INPUT_INDEX.chainId
      ]
    ).toBe("0x00000000000000000000000000000000000000000000000000000000000010e6");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, chainId: 1 })).toThrow(
      "chainId must be MegaETH testnet 6343 or mainnet 4326"
    );
    expect(() =>
      encodeVerifierPublicInputs({ ...basePublicInputs, verifyingContract: "0x0000000000000000000000000000000000000000" })
    ).toThrow("verifyingContract must be nonzero");
  });

  it("requires roots to come from observed accepted contract history", () => {
    expect(assertRootInAcceptedHistory(SHIELDED_POOL_INITIAL_ROOT, [SHIELDED_POOL_INITIAL_ROOT])).toBe(SHIELDED_POOL_INITIAL_ROOT);
    expect(() => assertRootInAcceptedHistory(basePublicInputs.root, [SHIELDED_POOL_INITIAL_ROOT])).toThrow(
      "root must be observed in accepted contract history"
    );
    expect(() => assertRootInAcceptedHistory(ZERO_BYTES32, [SHIELDED_POOL_INITIAL_ROOT])).toThrow("root must be nonzero");
  });

  it("rejects zero destination and nullifier values", () => {
    expect(() =>
      encodeVerifierPublicInputs({ ...basePublicInputs, destination: "0x0000000000000000000000000000000000000000" })
    ).toThrow("destination must be nonzero");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, nullifier: ZERO_BYTES32 })).toThrow("nullifier must be nonzero");
    expect(() =>
      encodeVerifierPublicInputs({
        kind: "private-transfer",
        root: basePublicInputs.root,
        nullifier: basePublicInputs.nullifier,
        newCommitment: ZERO_BYTES32,
        chainId: basePublicInputs.chainId,
        verifyingContract: basePublicInputs.verifyingContract,
        spentCommitment: basePublicInputs.spentCommitment,
        noteAmount: basePublicInputs.noteAmount
      })
    ).toThrow("newCommitment must be nonzero");
    expect(() =>
      encodeVerifierPublicInputs({ ...basePublicInputs, nullifier: null as unknown as VerifierPublicInputs["nullifier"] })
    ).toThrow("nullifier must be a bytes32 hex string");
  });

  it("rejects zero or negative amount and invalid fees", () => {
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, grossAmount: 0n })).toThrow("grossAmount must be positive");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, grossAmount: -1n })).toThrow("grossAmount must be positive");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, spentCommitment: ZERO_BYTES32 })).toThrow(
      "spentCommitment must be nonzero"
    );
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, noteAmount: 0n })).toThrow("noteAmount must be positive");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, fee: -1n })).toThrow("fee must be nonnegative");
    expect(() => encodeVerifierPublicInputs({ ...basePublicInputs, fee: basePublicInputs.grossAmount })).toThrow(
      "fee must be less than grossAmount"
    );
  });

  it("produces stable deterministic output", () => {
    const first = encodeVerifierPublicInputs(basePublicInputs);
    const second = encodeVerifierPublicInputs({
      ...basePublicInputs,
      root: "0x1111111111111111111111111111111111111111111111111111111111111111"
    });

    expect(second).toEqual(first);
    expect(first.join("|")).toMatchInlineSnapshot(
      `"0x1111111111111111111111111111111111111111111111111111111111111111|0x2222222222222222222222222222222222222222222222222222222222222222|0x0000000000000000000000000000000000000000000000000000000000000000|0x0000000000000000000000004444444444444444444444444444444444444444|0x00000000000000000000000000000000000000000000000000000000000003e8|0x000000000000000000000000000000000000000000000000000000000000000a|0x00000000000000000000000000000000000000000000000000000000000018c7|0x0000000000000000000000005555555555555555555555555555555555555555|0x8888888888888888888888888888888888888888888888888888888888888888|0x00000000000000000000000000000000000000000000000000000000000003e8"`
    );
  });

  it("names the exact Stage A public input order used by the verifier boundary", () => {
    const encoded = encodeVerifierPublicInputs(basePublicInputs);
    const named = nameStageAPublicInputs(encoded);

    expect(STAGE_A_PUBLIC_INPUT_ORDER).toEqual([
      "root",
      "nullifier",
      "newCommitment",
      "destination",
      "grossAmount",
      "fee",
      "chainId",
      "verifyingContract",
      "spentCommitment",
      "noteAmount"
    ]);
    expect(named.root).toBe(encoded[0]);
    expect(named.nullifier).toBe(encoded[1]);
    expect(named.newCommitment).toBe(encoded[2]);
    expect(named.destination).toBe(encoded[3]);
    expect(named.grossAmount).toBe(encoded[4]);
    expect(named.fee).toBe(encoded[5]);
    expect(named.chainId).toBe(encoded[6]);
    expect(named.verifyingContract).toBe(encoded[7]);
    expect(named.spentCommitment).toBe(encoded[8]);
    expect(named.noteAmount).toBe(encoded[9]);
    expect(readStageAPublicInput(encoded, "verifyingContract")).toBe(named.verifyingContract);
  });

  it("rejects malformed Stage A public input vectors before naming fields", () => {
    const encoded = encodeVerifierPublicInputs(basePublicInputs);

    expect(() => assertStageAPublicInputs(encoded.slice(0, 9))).toThrow("expected exactly 10 Stage A public inputs");
    expect(() => assertStageAPublicInputs([...encoded.slice(0, 9), "0x123"])).toThrow(
      "publicInputs[9:noteAmount] must be a bytes32 hex string"
    );
  });

  it("detects one-at-a-time mutation of every Stage A public input", () => {
    const encoded = encodeVerifierPublicInputs(basePublicInputs);
    assertStageAPublicInputsMatch(basePublicInputs, encoded);

    STAGE_A_PUBLIC_INPUT_ORDER.forEach((fieldName, index) => {
      const mutated = [...encoded];
      mutated[index] =
        encoded[index] === `0x${"12".repeat(32)}`
          ? (`0x${"13".repeat(32)}` as const)
          : (`0x${"12".repeat(32)}` as const);

      expect(() => assertStageAPublicInputsMatch(basePublicInputs, mutated)).toThrow(
        `Stage A public input ${fieldName} mismatch at index ${index}`
      );
    });
  });
});

describe("Stage B proof-context and encrypted-note binding", () => {
  const relayerPolicy = createRelayerPolicyV1({
    relayer: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicy.relayer,
    minNetAmount: BigInt(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicy.minNetAmount),
    maxFeeAmount: BigInt(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicy.maxFeeAmount),
    deadlineOrZero: BigInt(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicy.deadlineOrZero)
  });
  const encryptedNote = createEncryptedNoteV1({
    chainId: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.chainId,
    pool: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
    selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
    nullifier: basePublicInputs.nullifier,
    commitment: ZERO_BYTES32,
    noteAmount: basePublicInputs.noteAmount,
    encryptedNote: "0x"
  });
  const encryptedNoteHash = hashEncryptedNoteV1(encryptedNote);
  const relayerPolicyHash = hashRelayerPolicyV1(relayerPolicy);
  const proofContext = createProofContextV1({
    chainId: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.chainId,
    pool: STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW,
    selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
    root: basePublicInputs.root,
    nullifier: basePublicInputs.nullifier,
    destination: basePublicInputs.destination,
    grossAmount: basePublicInputs.grossAmount,
    fee: basePublicInputs.fee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: relayerPolicy.deadlineOrZero
  });

  it("locks the Stage B public input order and keeps encryptedNoteHash at index 11", () => {
    expect(STAGE_B_PUBLIC_INPUT_ORDER).toEqual(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.publicInputOrder);
    expect(STAGE_B_PUBLIC_INPUT_INDEX).toMatchObject({
      root: 0,
      nullifier: 1,
      newCommitment: 2,
      destination: 3,
      grossAmount: 4,
      fee: 5,
      chainId: 6,
      verifyingContract: 7,
      spentCommitment: 8,
      noteAmount: 9,
      proofContextHash: 10,
      encryptedNoteHash: 11
    });

    const encoded = encodeStageBPublicInputs({
      base: basePublicInputs,
      proofContextHash: hashProofContextV1(proofContext),
      encryptedNoteHash
    });
    const named = nameStageBPublicInputs(encoded);

    expect(encoded).toEqual(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.stageBPublicInputs);
    expect(named.proofContextHash).toBe(encoded[10]);
    expect(named.encryptedNoteHash).toBe(encoded[11]);
    expect(readStageBPublicInput(encoded, "encryptedNoteHash")).toBe(encoded[11]);
    expect(() => assertStageBPublicInputs(encoded.slice(0, 11))).toThrow("expected exactly 12 Stage B public inputs");
  });

  it("matches NullarkPool Stage B domain, shape, and schema constants exactly", () => {
    expect(PROOF_CONTEXT_V1_DOMAIN_SEPARATOR).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.domainSeparators.proofContext);
    expect(ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.domainSeparators.encryptedNote);
    expect(RELAYER_POLICY_V1_DOMAIN_SEPARATOR).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.domainSeparators.relayerPolicy);
    expect(PROOF_CONTEXT_V1_SHAPE_WITHDRAW).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.shape);
    expect(PROOF_CONTEXT_V1_SHAPE_WITHDRAW).not.toBe("0xf789682dc4c1c6955db6ea79a54f1ee4870d667a56a8ba74ba2f5c19b06e811b");
    expect(PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER).toBe(
      "0x1f48857e6c10eced643b61e69879e03ec94912c6fe102581f060a0ff569fa324"
    );
    expect(PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.selector);
  });

  it("matches independent ABI encoding and field-reduction vectors", () => {
    expect(encodeRelayerPolicyV1(relayerPolicy)).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.abiEncoded.relayerPolicy);
    expect(encodeEncryptedNoteV1(encryptedNote)).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.abiEncoded.encryptedNote);
    expect(encodeProofContextV1(proofContext)).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.abiEncoded.proofContext);
    expect(reduceKeccakToField(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.reductionVector.keccak)).toBe(
      STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.reductionVector.field
    );
  });

  it("matches independent cross-artifact hash vectors", () => {
    expect(relayerPolicyHash).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.relayerPolicyHash);
    expect(encryptedNoteHash).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.encryptedNoteHash);
    expect(hashProofContextV1(proofContext)).toBe(STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.proofContextHash);
    expect(assertRelayerPolicyHashMatches(relayerPolicy, relayerPolicyHash)).toBe(relayerPolicyHash);
    expect(assertEncryptedNoteHashMatches(encryptedNote, encryptedNoteHash)).toBe(encryptedNoteHash);
    expect(assertProofContextHashMatches(proofContext, hashProofContextV1(proofContext))).toBe(
      STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR.proofContextHash
    );
  });

  it("rejects one-at-a-time Stage B public input mutations, including index 11", () => {
    const encoded = encodeStageBPublicInputs({
      base: basePublicInputs,
      proofContextHash: hashProofContextV1(proofContext),
      encryptedNoteHash
    });

    assertStageBPublicInputsMatch({
      expectedBase: basePublicInputs,
      expectedProofContextHash: hashProofContextV1(proofContext),
      expectedEncryptedNoteHash: encryptedNoteHash,
      actualPublicInputs: encoded
    });

    STAGE_B_PUBLIC_INPUT_ORDER.forEach((fieldName, index) => {
      const mutated = [...encoded];
      mutated[index] = mutateBytes32(encoded[index]!);

      expect(() =>
        assertStageBPublicInputsMatch({
          expectedBase: basePublicInputs,
          expectedProofContextHash: hashProofContextV1(proofContext),
          expectedEncryptedNoteHash: encryptedNoteHash,
          actualPublicInputs: mutated
        })
      ).toThrow(`Stage B public input ${fieldName} mismatch at index ${index}`);
    });
  });

  it("rejects every ProofContextV1 field mutation", () => {
    const expected = hashProofContextV1(proofContext);
    const mutations: Array<[string, ProofContextV1]> = [
      ["domainSeparator", { ...proofContext, domainSeparator: mutateBytes32(proofContext.domainSeparator) }],
      ["version", { ...proofContext, version: proofContext.version + 1n }],
      ["chainId", { ...proofContext, chainId: 4326 }],
      ["pool", { ...proofContext, pool: "0x6666666666666666666666666666666666666666" }],
      ["shape", { ...proofContext, shape: PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER }],
      ["selector", { ...proofContext, selector: "0xc7787d0f" }],
      ["root", { ...proofContext, root: mutateBytes32(proofContext.root) }],
      ["nullifier", { ...proofContext, nullifier: mutateBytes32(proofContext.nullifier) }],
      ["destination", { ...proofContext, destination: "0x7777777777777777777777777777777777777777" }],
      ["grossAmount", { ...proofContext, grossAmount: proofContext.grossAmount + 1n }],
      ["fee", { ...proofContext, fee: proofContext.fee + 1n }],
      ["encryptedNoteHash", { ...proofContext, encryptedNoteHash: mutateBytes32(proofContext.encryptedNoteHash) }],
      ["relayerPolicyHash", { ...proofContext, relayerPolicyHash: mutateBytes32(proofContext.relayerPolicyHash) }],
      ["deadlineOrZero", { ...proofContext, deadlineOrZero: proofContext.deadlineOrZero + 1n }]
    ];

    mutations.forEach(([fieldName, mutated]) => {
      expect(hashProofContextV1(mutated), fieldName).not.toBe(expected);
      expect(() => assertProofContextHashMatches(mutated, expected), fieldName).toThrow("ProofContextV1 hash mismatch");
    });
  });

  it("rejects every contract-bound encrypted-note field mutation", () => {
    const expected = hashEncryptedNoteV1(encryptedNote);
    const mutations: Array<[string, EncryptedNoteV1]> = [
      ["domainSeparator", { ...encryptedNote, domainSeparator: mutateBytes32(encryptedNote.domainSeparator) }],
      ["version", { ...encryptedNote, version: encryptedNote.version + 1n }],
      ["chainId", { ...encryptedNote, chainId: 4326 }],
      ["pool", { ...encryptedNote, pool: "0x6666666666666666666666666666666666666666" }],
      ["shape", { ...encryptedNote, shape: PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER }],
      ["selector", { ...encryptedNote, selector: "0xc7787d0f" }],
      ["nullifier", { ...encryptedNote, nullifier: mutateBytes32(encryptedNote.nullifier) }],
      ["commitment", { ...encryptedNote, commitment: "0x3333333333333333333333333333333333333333333333333333333333333333" }],
      ["noteAmount", { ...encryptedNote, noteAmount: encryptedNote.noteAmount + 1n }],
      ["encryptedNote", { ...encryptedNote, encryptedNote: "0x1234" }]
    ];

    mutations.forEach(([fieldName, mutated]) => {
      expect(hashEncryptedNoteV1(mutated), fieldName).not.toBe(expected);
      expect(() => assertEncryptedNoteHashMatches(mutated, expected), fieldName).toThrow("EncryptedNoteV1 hash mismatch");
    });
  });

  it("rejects unsupported proof-context and encrypted-note chains", () => {
    expect(() => createProofContextV1({ ...proofContext, chainId: 1 })).toThrow(
      "chainId must be MegaETH testnet 6343 or mainnet 4326"
    );
    expect(() => createEncryptedNoteV1({ ...encryptedNote, chainId: 1 })).toThrow(
      "chainId must be MegaETH testnet 6343 or mainnet 4326"
    );
  });

  it("rejects every relayer-policy field mutation", () => {
    const expected = hashRelayerPolicyV1(relayerPolicy);
    const mutations: Array<[string, RelayerPolicyV1]> = [
      ["domainSeparator", { ...relayerPolicy, domainSeparator: mutateBytes32(relayerPolicy.domainSeparator) }],
      ["version", { ...relayerPolicy, version: relayerPolicy.version + 1n }],
      ["relayer", { ...relayerPolicy, relayer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
      ["minNetAmount", { ...relayerPolicy, minNetAmount: relayerPolicy.minNetAmount + 1n }],
      ["maxFeeAmount", { ...relayerPolicy, maxFeeAmount: relayerPolicy.maxFeeAmount + 1n }],
      ["deadlineOrZero", { ...relayerPolicy, deadlineOrZero: relayerPolicy.deadlineOrZero + 1n }]
    ];

    mutations.forEach(([fieldName, mutated]) => {
      expect(hashRelayerPolicyV1(mutated), fieldName).not.toBe(expected);
      expect(() => assertRelayerPolicyHashMatches(mutated, expected), fieldName).toThrow("RelayerPolicyV1 hash mismatch");
    });
  });
});

describe("Stage C unified withdraw partial-exit vector schema and value conservation", () => {
  const stageCInput: WithdrawChangeV1_1Input = {
    root: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.root,
    nullifier: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.nullifier,
    newCommitment: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.newCommitment,
    destination: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.destination,
    grossAmount: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.grossAmount),
    fee: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.fee),
    chainId: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.chainId,
    pool: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.pool,
    spentCommitment: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.spentCommitment,
    noteAmount: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.noteAmount),
    changeAmount: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.changeAmount),
    encryptedChangeNote: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.fields.encryptedChangeNote,
    relayerPolicy: {
      relayer: STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.relayerPolicy.relayer,
      minNetAmount: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.relayerPolicy.minNetAmount),
      maxFeeAmount: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.relayerPolicy.maxFeeAmount),
      deadlineOrZero: BigInt(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.relayerPolicy.deadlineOrZero)
    }
  };
  const stageCVector = createWithdrawChangeV1_1(stageCInput);

  it("pins the Stage C unified withdraw change-note vector to the deployed withdraw context shape", () => {
    expect(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.chainId).toBe(MEGAETH_TESTNET_CHAIN_ID);
    expect(PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.shape);
    expect(PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE).toBe(PROOF_CONTEXT_V1_SHAPE_WITHDRAW);
    expect(PROOF_CONTEXT_V1_WITHDRAW_CHANGE_BOUNDED_SELECTOR).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.selector);
    expect(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.shape).not.toBe(OLD_WITHDRAW_CHANGE_V1_1_SHAPE);
    expect(STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER).toEqual(STAGE_B_PUBLIC_INPUT_ORDER);
    expect(STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER).toEqual(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.publicInputOrder);
    expect(STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_INDEX).toMatchObject({
      newCommitment: 2,
      grossAmount: 4,
      fee: 5,
      noteAmount: 9,
      proofContextHash: 10,
      encryptedNoteHash: 11
    });

    const named = nameStageCWithdrawChangePublicInputs(stageCVector.publicInputs);
    expect(named.newCommitment).toBe(stageCVector.publicInputs[2]);
    expect(named.proofContextHash).toBe(stageCVector.publicInputs[10]);
    expect(named.encryptedNoteHash).toBe(stageCVector.publicInputs[11]);
    expect(readStageCWithdrawChangePublicInput(stageCVector.publicInputs, "newCommitment")).toBe(named.newCommitment);
    expect(() => assertStageCWithdrawChangePublicInputs(stageCVector.publicInputs.slice(0, 11))).toThrow(
      "expected exactly 12 Stage B public inputs"
    );
  });

  it("documents the v1.2 fee-governance artifact boundary without broadening v1.1 approval", () => {
    expect(WITHDRAW_CHANGE_V1_1_WITHDRAWAL_FEE_BPS).toBe(33n);
    expect(WITHDRAW_CHANGE_V1_1_BPS_DENOMINATOR).toBe(10_000n);
    expect(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.feeFormula).toBe("floor(grossAmount * 33 / 10000)");
    expect(STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER).toEqual([
      "root",
      "nullifier",
      "newCommitment",
      "destination",
      "grossAmount",
      "fee",
      "chainId",
      "verifyingContract",
      "spentCommitment",
      "noteAmount",
      "proofContextHash",
      "encryptedNoteHash"
    ]);
    expect(STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER).not.toContain("feeBps");

    const contractEnforcedFeeFormulaV12Order = [...STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER];
    const conservativeFeeBpsPublicInputV12Order = [...STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER, "feeBps"];
    expect(contractEnforcedFeeFormulaV12Order).toHaveLength(12);
    expect(conservativeFeeBpsPublicInputV12Order).toHaveLength(13);

    const maxV12FeeBps = 100n;
    const maxV12Fee = (stageCVector.grossAmount * maxV12FeeBps) / WITHDRAW_CHANGE_V1_1_BPS_DENOMINATOR;
    expect(maxV12Fee).not.toBe(stageCVector.fee);
    expect(() => createWithdrawChangeV1_1({ ...stageCInput, fee: maxV12Fee })).toThrow(
      "withdraw_change_v1_1 fee must equal floor(grossAmount * 33 / 10000)"
    );
  });

  it("matches the deterministic Stage C unified withdraw partial-exit vector values", () => {
    expect(stageCVector.publicInputs).toEqual(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.stageCPublicInputs);
    expect(encodeWithdrawChangeV1_1PublicInputs(stageCInput)).toEqual(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.stageCPublicInputs);
    expect(encodeRelayerPolicyV1(stageCVector.relayerPolicy)).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.abiEncoded.relayerPolicy);
    expect(encodeEncryptedNoteV1(stageCVector.encryptedChangeNoteEnvelope)).toBe(
      STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.abiEncoded.encryptedChangeNote
    );
    expect(encodeProofContextV1(stageCVector.proofContext)).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.abiEncoded.proofContext);
    expect(stageCVector.relayerPolicyHash).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.relayerPolicyHash);
    expect(stageCVector.encryptedNoteHash).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.encryptedNoteHash);
    expect(stageCVector.proofContextHash).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.proofContextHash);
    expect(stageCVector.netAmount.toString()).toBe(STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR.valueConservation.netAmount);
  });

  it("would produce the wrong contract-bound hashes if the obsolete withdraw_change_v1_1 shape is used", () => {
    const wrongEncryptedNote = createEncryptedNoteV1({
      ...stageCVector.encryptedChangeNoteEnvelope,
      shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE
    });
    const wrongEncryptedNoteHash = hashEncryptedNoteV1(wrongEncryptedNote);
    const wrongProofContext = createProofContextV1({
      ...stageCVector.proofContext,
      shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE,
      encryptedNoteHash: wrongEncryptedNoteHash
    });

    expect(wrongEncryptedNoteHash).not.toBe(stageCVector.encryptedNoteHash);
    expect(hashProofContextV1(wrongProofContext)).not.toBe(stageCVector.proofContextHash);
    expect(() => assertEncryptedNoteHashMatches(wrongEncryptedNote, stageCVector.encryptedNoteHash)).toThrow(
      "EncryptedNoteV1 hash mismatch"
    );
    expect(() => assertProofContextHashMatches(wrongProofContext, stageCVector.proofContextHash)).toThrow(
      "ProofContextV1 hash mismatch"
    );
  });

  it("enforces fixed-arity value conservation and fee formula before hashing", () => {
    expect(calculateWithdrawChangeV1_1Fee(stageCVector.grossAmount)).toBe(stageCVector.fee);
    expect(
      assertWithdrawChangeV1_1ValueConservation({
        noteAmount: stageCVector.noteAmount,
        grossAmount: stageCVector.grossAmount,
        changeAmount: stageCVector.changeAmount,
        fee: stageCVector.fee
      })
    ).toMatchObject({
      noteAmount: stageCVector.noteAmount,
      grossAmount: stageCVector.grossAmount,
      changeAmount: stageCVector.changeAmount,
      fee: stageCVector.fee,
      netAmount: stageCVector.netAmount
    });

    expect(() => createWithdrawChangeV1_1({ ...stageCInput, fee: stageCInput.fee + 1n })).toThrow(
      "withdraw_change_v1_1 fee must equal floor(grossAmount * 33 / 10000)"
    );
    expect(() => createWithdrawChangeV1_1({ ...stageCInput, noteAmount: stageCInput.noteAmount + 1n })).toThrow(
      "withdraw_change_v1_1 value conservation failed"
    );
    expect(() => createWithdrawChangeV1_1({ ...stageCInput, changeAmount: 0n })).toThrow(
      "withdraw_change_v1_1 changeAmount must be positive"
    );
    expect(() => createWithdrawChangeV1_1({ ...stageCInput, encryptedChangeNote: "0x" })).toThrow(
      "withdraw_change_v1_1 encryptedChangeNote must be nonempty"
    );
    const mainnetVector = createWithdrawChangeV1_1({ ...stageCInput, chainId: MEGAETH_MAINNET_CHAIN_ID });
    expect(mainnetVector.publicInputs[STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_INDEX.chainId]).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000010e6"
    );
    expect(() => createWithdrawChangeV1_1({ ...stageCInput, chainId: 1 })).toThrow(
      "chainId must be MegaETH testnet 6343 or mainnet 4326"
    );
  });

  it("rejects one-at-a-time mutation of every Stage C public input", () => {
    const encoded = stageCVector.publicInputs;
    assertWithdrawChangeV1_1PublicInputsMatch(stageCInput, encoded);

    STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER.forEach((fieldName, index) => {
      const mutated = [...encoded];
      const original = encoded[index];
      if (original === undefined) {
        throw new Error(`missing Stage C withdraw_change_v1_1 public input ${fieldName} at index ${index}`);
      }
      mutated[index] = mutateBytes32(original);

      expect(() => assertWithdrawChangeV1_1PublicInputsMatch(stageCInput, mutated)).toThrow(
        `Stage C withdraw_change_v1_1 public input ${fieldName} mismatch at index ${index}`
      );
    });
  });

  it("rejects selector, shape, commitment, amount, and ciphertext mutations through hashes", () => {
    const expectedEncryptedNoteHash = stageCVector.encryptedNoteHash;
    const expectedProofContextHash = stageCVector.proofContextHash;
    const encryptedMutations: Array<[string, EncryptedNoteV1]> = [
      ["shape", { ...stageCVector.encryptedChangeNoteEnvelope, shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE }],
      ["selector", { ...stageCVector.encryptedChangeNoteEnvelope, selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR }],
      ["newCommitment", { ...stageCVector.encryptedChangeNoteEnvelope, commitment: mutateBytes32(stageCVector.newCommitment) }],
      ["changeAmount", { ...stageCVector.encryptedChangeNoteEnvelope, noteAmount: stageCVector.changeAmount + 1n }],
      ["encryptedChangeNote", { ...stageCVector.encryptedChangeNoteEnvelope, encryptedNote: "0x1234" }]
    ];

    encryptedMutations.forEach(([fieldName, mutated]) => {
      expect(hashEncryptedNoteV1(mutated), fieldName).not.toBe(expectedEncryptedNoteHash);
      expect(() => assertEncryptedNoteHashMatches(mutated, expectedEncryptedNoteHash), fieldName).toThrow(
        "EncryptedNoteV1 hash mismatch"
      );
    });

    const contextMutations: Array<[string, ProofContextV1]> = [
      ["shape", { ...stageCVector.proofContext, shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE }],
      ["selector", { ...stageCVector.proofContext, selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR }],
      ["grossAmount", { ...stageCVector.proofContext, grossAmount: stageCVector.grossAmount + 1n }],
      ["fee", { ...stageCVector.proofContext, fee: stageCVector.fee + 1n }],
      ["encryptedNoteHash", { ...stageCVector.proofContext, encryptedNoteHash: mutateBytes32(stageCVector.encryptedNoteHash) }]
    ];

    contextMutations.forEach(([fieldName, mutated]) => {
      expect(hashProofContextV1(mutated), fieldName).not.toBe(expectedProofContextHash);
      expect(() => assertProofContextHashMatches(mutated, expectedProofContextHash), fieldName).toThrow(
        "ProofContextV1 hash mismatch"
      );
    });
  });
});

function mutateBytes32(value: HexBytes32): HexBytes32 {
  return value === `0x${"12".repeat(32)}` ? (`0x${"13".repeat(32)}` as const) : (`0x${"12".repeat(32)}` as const);
}
