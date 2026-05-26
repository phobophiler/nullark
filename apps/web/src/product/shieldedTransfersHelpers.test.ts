import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import {
  CURRENT_ROOT_CALLDATA,
  CURRENT_ROOT_SELECTOR,
  DEPOSIT_SELECTOR,
  MIN_WITHDRAWABLE_AMOUNT_WEI,
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_MAINNET_RPC_URL,
  MEGAETH_TESTNET_CHAIN_ID,
  MEGAETH_TESTNET_RPC_URL,
  SANDBOX_COMMITMENT_DERIVATION_STATUS,
  SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS,
  SANDBOX_MERKLE_PATH_STATUS,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SANDBOX_NOTE_STATUS,
  SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
  SANDBOX_NOTE_RECORD_WARNING,
  SANDBOX_NOTE_RECORD_VERSION,
  LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS,
  SANDBOX_PROOF_GENERATION_STATUS,
  MAINNET_SHIELDED_POOL_ADDRESS,
  SHIELDED_POOL_ADDRESS,
  BN254_SCALAR_FIELD,
  NULLIFIERS_SELECTOR,
  TEST_DEPOSIT_VALUE_HEX,
  WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  assertPrivateTransferPublicInputBinding,
  assertWithdrawPublicInputBinding,
  boolFromEthCallResult,
  bytesToHex,
  createSandboxNoteVaultEntry,
  createRecoveryKitV1FromNoteRecord,
  createRandomBytes32,
  createSandboxSpendMaterial,
  createSandboxSpendMaterialNoteRecord,
  encodeCommitmentLookupCalldata,
  encodeDepositCalldata,
  encodeDepositWithEncryptedNoteCalldata,
  encodeDepositWithProofCalldata,
  encodeNullifierLookupCalldata,
  encodePrivateTransferWithEncryptedNoteCalldata,
  encodeV12UnlinkableWithdrawOutputNoteCalldata,
  encodeWithdrawBoundedCalldata,
  encodeWithdrawCalldata,
  encodeStageCWithdrawChangeNoteCalldata,
  formatWeiBalance,
  formatWeiToEthDecimal,
  isBn254FieldElement,
  isSupportedFixedDenominationWei,
  parseEthDecimalToWei,
  parseSingleFixedDepositEthDecimalToWei,
  parsePrivateReceiveCode,
  parsePositiveWeiToHex,
  parseRecoveryKitV1ToNoteRecord,
  parseSandboxSpendMaterialNoteRecord,
  reconstructMerklePathFromRootAcceptedLogs,
  selectLargestAvailableSandboxNote,
  selectSandboxNoteForWithdrawal,
  serializeRecoveryKitV1,
  serializeSandboxSpendMaterialNoteRecord,
  spendablePublicExitChoicesForNote,
  supportedPrivateChangeDenominationLabels
} from "./shieldedTransfersHelpers.js";
import { deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";

const commitment = "0x0d1492c034698ab1acb66c38bfee13aa7487d77b3a388e4b91c46aad85325043";
const nullarkV1_1HashPublicInputs = [`0x${"0a".repeat(32)}`, `0x${"0b".repeat(32)}`] as const;
const freshMainnetNullarkPool = "0x1111111111111111111111111111111111111111";
const WITHDRAW_WITH_ENCRYPTED_NOTE_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "nullifier", type: "bytes32" },
      { name: "destination", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "encryptedChangeNote", type: "bytes" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

function noteRecord(amountWei: string, suffix: string) {
  const field = `0x02${suffix.repeat(31)}`;
  return createSandboxSpendMaterialNoteRecord({
    commitment: field,
    noteAmountWei: amountWei,
    ownerCommitment: field,
    noteSecret: field,
    blinding: field,
    depositTxHash: `0x${suffix.repeat(32)}`,
    currentRootAfter: `0x${suffix.repeat(32)}`,
    createdAt: "2026-05-07T00:00:00.000Z",
    commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
    commitmentDerivedFromSpendMaterial: true
  });
}

describe("sandbox testnet helpers", () => {
  it("uses verified selectors and test deposit value", () => {
    expect(CURRENT_ROOT_SELECTOR).toBe("0xfdab463d");
    expect(CURRENT_ROOT_CALLDATA).toBe("0xfdab463d");
    expect(DEPOSIT_SELECTOR).toBe("0xb214faa5");
    expect(WITHDRAW_SELECTOR).toBe("0x9b0c797c");
    expect(NULLIFIERS_SELECTOR).toBe("0x2997e86b");
    expect(TEST_DEPOSIT_VALUE_HEX).toBe("0x11c37937e08000");
    expect(MIN_WITHDRAWABLE_AMOUNT_WEI).toBe(1n);
    expect(SANDBOX_NOTE_RECORD_VERSION).toBe("sandbox-spend-material-note-v1");
    expect(SANDBOX_NOTE_RECORD_WARNING).toBe("contains-private-spend-material-no-zk-witness");
    expect(SANDBOX_NATIVE_ETH_ASSET_ID).toBe("0x0000000000000000000000000000000000000000000000000000000000000001");
    expect(SANDBOX_COMMITMENT_DERIVATION_STATUS).toBe("manual-bn254-field-commitment-not-poseidon-derived");
    expect(SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS).toBe("poseidon-derived-from-spend-material");
    expect(SANDBOX_NOTE_STATUS).toBe("deposited-missing-merkle-path-and-proof");
    expect(SANDBOX_MERKLE_PATH_STATUS).toBe("not-fetched");
    expect(SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS).toBe("reconstructed-from-root-accepted-logs");
    expect(SANDBOX_PROOF_GENERATION_STATUS).toBe("not-wired");
  });

  it("derives the same Poseidon note commitment as the local proof service formula", async () => {
    await expect(
      deriveBrowserNoteCommitment({
        assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
        noteAmountWei: "123456789000000000",
        ownerCommitment: `0x02${"22".repeat(31)}`,
        noteSecret: `0x02${"22".repeat(31)}`
      })
    ).resolves.toBe("0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb");
  });

  it("formats custom positive wei deposit values as transaction hex", () => {
    expect(parsePositiveWeiToHex("100000000000000000")).toBe("0x16345785d8a0000");
    expect(parsePositiveWeiToHex("1000")).toBe("0x3e8");
    expect(parsePositiveWeiToHex("1")).toBe("0x1");
    expect(() => parsePositiveWeiToHex("1.5")).toThrow(
      "Expected deposit amount wei to be a positive integer."
    );
  });

  it("converts ETH decimals to wei for transaction boundaries", () => {
    expect(parseEthDecimalToWei("0.01")).toBe("10000000000000000");
    expect(parseEthDecimalToWei("1")).toBe("1000000000000000000");
    expect(parseEthDecimalToWei(".000000000000000001")).toBe("1");
    expect(formatWeiToEthDecimal("10000000000000000")).toBe("0.01");
    expect(formatWeiToEthDecimal("10000000000000")).toBe("0.00001");
    expect(() => parseEthDecimalToWei("0.0000000000000000001")).toThrow(
      "ETH amount cannot have more than 18 decimal places."
    );
  });

  it("accepts only one configured fixed denomination at the deposit boundary", () => {
    expect(parseSingleFixedDepositEthDecimalToWei("0.005")).toBe("5000000000000000");
    expect(parseSingleFixedDepositEthDecimalToWei("0.01")).toBe("10000000000000000");
    expect(() => parseSingleFixedDepositEthDecimalToWei("0.0001")).toThrow(
      "Choose one fixed deposit denomination:"
    );
    expect(() => parseSingleFixedDepositEthDecimalToWei("0.00001")).toThrow(
      "Choose one fixed deposit denomination:"
    );
    expect(() => parseSingleFixedDepositEthDecimalToWei("0.037")).toThrow(
      "Choose one fixed deposit denomination:"
    );
    expect(() => parseSingleFixedDepositEthDecimalToWei("0.000000000000000001")).toThrow(
      "Choose one fixed deposit denomination:"
    );
  });

  it("recognizes spendable private change denominations", () => {
    expect(isSupportedFixedDenominationWei("5000000000000000")).toBe(true);
    expect(isSupportedFixedDenominationWei("100000000000000")).toBe(false);
    expect(isSupportedFixedDenominationWei("900000000000000")).toBe(false);
    expect(supportedPrivateChangeDenominationLabels("10000000000000000")).toEqual(["0.005"]);
    expect(spendablePublicExitChoicesForNote("10000000000000000", { allowFullExit: false })).toEqual([
      {
        grossAmountWei: "5000000000000000",
        grossAmountEth: "0.005",
        changeAmountWei: "5000000000000000",
        changeAmountEth: "0.005",
        isFullExit: false
      }
    ]);
  });

  it("selects the smallest unspent note that can cover a withdrawal amount", () => {
    const small = noteRecord("5000000000000000", "11");
    const medium = noteRecord("10000000000000000", "12");
    const large = noteRecord("50000000000000000", "13");
    const entries = [
      createSandboxNoteVaultEntry({ record: large, updatedAt: "2026-05-07T00:00:03.000Z" }),
      createSandboxNoteVaultEntry({ record: small, updatedAt: "2026-05-07T00:00:01.000Z" }),
      createSandboxNoteVaultEntry({ record: medium, updatedAt: "2026-05-07T00:00:02.000Z" })
    ];

    expect(selectSandboxNoteForWithdrawal({ entries, grossAmountWei: "7000000000000000" })).toBe(medium);
  });

  it("skips spent notes when selecting an eligible withdrawal note", () => {
    const spentMedium = noteRecord("10000000000000000", "14");
    const large = noteRecord("50000000000000000", "15");
    const entries = [
      createSandboxNoteVaultEntry({
        record: spentMedium,
        spent: true,
        spentNullifier: `0x${"16".repeat(32)}`,
        updatedAt: "2026-05-07T00:00:01.000Z"
      }),
      createSandboxNoteVaultEntry({ record: large, updatedAt: "2026-05-07T00:00:02.000Z" })
    ];

    expect(selectSandboxNoteForWithdrawal({ entries, grossAmountWei: "7000000000000000" })).toBe(large);
  });

  it("returns null for withdrawal amounts that no single unspent note can cover", () => {
    const small = noteRecord("5000000000000000", "17");
    const medium = noteRecord("10000000000000000", "18");
    const entries = [
      createSandboxNoteVaultEntry({ record: small, updatedAt: "2026-05-07T00:00:01.000Z" }),
      createSandboxNoteVaultEntry({ record: medium, updatedAt: "2026-05-07T00:00:02.000Z" })
    ];

    expect(selectSandboxNoteForWithdrawal({ entries, grossAmountWei: "20000000000000000" })).toBeNull();
    expect(selectLargestAvailableSandboxNote(entries)).toBe(medium);
  });

  it("encodes bytes32 lookup and deposit calldata", () => {
    expect(encodeCommitmentLookupCalldata(commitment)).toBe(
      `0x839df945${commitment.slice(2)}`
    );
    expect(encodeDepositCalldata(commitment)).toBe(`0xb214faa5${commitment.slice(2)}`);
    expect(encodeNullifierLookupCalldata(commitment)).toBe(`0x2997e86b${commitment.slice(2)}`);
  });

  it("encodes withdraw calldata with dynamic proof and public inputs", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"02".repeat(32)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`,
      ...nullarkV1_1HashPublicInputs
    ];
    const calldata = encodeWithdrawCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: commitment,
      destination: "0x1111111111111111111111111111111111111111",
      grossAmountWei: "10001"
    });

    expect(calldata.startsWith("0x9b0c797c")).toBe(true);
    expect(calldata).toContain(commitment.slice(2).toLowerCase());
    expect(calldata).toContain("0000000000000000000000001111111111111111111111111111111111111111");
    expect(calldata).toContain("1234" + "0".repeat(60));
    expect(calldata).toContain("000000000000000000000000000000000000000000000000000000000000000c");
  });

  it("encodes deposit calldata with encrypted note payload", () => {
    const encryptedNote = "0x010203";
    const calldata = encodeDepositWithEncryptedNoteCalldata(commitment, encryptedNote);

    expect(calldata.startsWith("0xe29973fc")).toBe(true);
    expect(calldata).toContain(commitment.slice(2).toLowerCase());
    expect(calldata).toContain("0000000000000000000000000000000000000000000000000000000000000003");
    expect(calldata).toContain(`${encryptedNote.slice(2)}${"0".repeat(58)}`);
    expect(() => encodeDepositWithEncryptedNoteCalldata("0x1234", encryptedNote)).toThrow(
      "Expected deposit commitment to be bytes32."
    );
    expect(() => encodeDepositWithEncryptedNoteCalldata(commitment, "0x123")).toThrow(
      "Expected encrypted note to be even-length hex bytes."
    );
    expect(() => encodeDepositWithEncryptedNoteCalldata(commitment, "010203")).toThrow(
      "Expected encrypted note to be even-length hex bytes."
    );
  });

  it("encodes v1.2 deposit calldata with proof, public inputs, and encrypted note payload", () => {
    const encryptedNote = "0x010203";
    const proof = `0x${"01".repeat(256)}`;
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"02".repeat(32)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`
    ];
    const calldata = encodeDepositWithProofCalldata({ proof, publicInputs, encryptedNote });

    expect(calldata.startsWith("0xca8f0370")).toBe(true);
    expect(calldata).toContain(proof.slice(2));
    expect(calldata).toContain(commitment.slice(2).toLowerCase());
    expect(calldata).toContain(`${encryptedNote.slice(2)}${"0".repeat(58)}`);
    expect(() =>
      encodeDepositWithProofCalldata({ proof, publicInputs: publicInputs.slice(0, 5), encryptedNote })
    ).toThrow("Expected exactly 6 public input bytes32 values for v1.2 deposit.");
    expect(() =>
      encodeDepositWithProofCalldata({ proof: "0x123", publicInputs, encryptedNote })
    ).toThrow("Expected proof and encrypted note to be even-length hex bytes.");
  });

  it("encodes withdraw calldata with encrypted change note and fee bounds", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"02".repeat(32)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`,
      ...nullarkV1_1HashPublicInputs
    ];
    const calldata = encodeStageCWithdrawChangeNoteCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: publicInputs[1] ?? "",
      destination: "0x1111111111111111111111111111111111111111",
      grossAmountWei: "10001",
      encryptedChangeNote: "0x01020304",
      minNetAmountWei: "9990",
      maxFeeWei: "11"
    });

    expect(calldata.startsWith("0x678d8506")).toBe(true);
    expect(calldata).toContain(commitment.slice(2).toLowerCase());
    expect(calldata).toContain("0000000000000000000000000000000000000000000000000000000000002706");
    expect(calldata).toContain("000000000000000000000000000000000000000000000000000000000000000b");
    expect(calldata).toContain("01020304" + "0".repeat(56));

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x123",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected proof and encrypted change note to be even-length hex bytes.");

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x1234",
        publicInputSchema: "v1.2-unlinkable" as "v1.1",
        publicInputs: publicInputs.slice(0, 10),
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("v1.2 unlinkable withdrawals must use output-note calldata encoding.");

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x1234",
        publicInputs: publicInputs.slice(0, 7),
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected exactly 12 public input bytes32 values.");

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: "0x1234",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected a 32-byte nullifier.");

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x846646aF497d1Df2367F28666257C1a111afF1D",
        grossAmountWei: "10001",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected a valid EVM destination address.");

    expect(() =>
      encodeStageCWithdrawChangeNoteCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "not-a-number",
        encryptedChangeNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected gross amount, minimum net amount, and maximum fee as decimal integers.");
  });

  it("uses the unified bounded withdrawal selector when no encrypted change note is present", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"00".repeat(32)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`,
      ...nullarkV1_1HashPublicInputs
    ];
    const calldata = encodeWithdrawBoundedCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: publicInputs[1] ?? "",
      destination: "0x1111111111111111111111111111111111111111",
      grossAmountWei: "10001",
      minNetAmountWei: "9990",
      maxFeeWei: "11"
    });

    expect(calldata.startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)).toBe(true);
    expect(calldata.startsWith(WITHDRAW_BOUNDED_SELECTOR)).toBe(false);
  });

  it("rejects stale v1.2 bounded withdrawals that would encode dummy output bytes", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x02${"22".repeat(31)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`
    ];

    expect(() =>
      encodeWithdrawBoundedCalldata({
        proof: "0x1234",
        publicInputSchema: "v1.2-unlinkable",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("v1.2 unlinkable withdrawals require encrypted output note calldata");
  });

  it("encodes v1.2 unlinkable withdrawals through output-note calldata naming", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x02${"22".repeat(31)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`
    ];
    const calldata = encodeV12UnlinkableWithdrawOutputNoteCalldata({
      proof: "0x1234",
      publicInputs,
      nullifier: publicInputs[1] ?? "",
      destination: "0x1111111111111111111111111111111111111111",
      grossAmountWei: "10001",
      encryptedOutputNote: "0x01020304",
      minNetAmountWei: "9990",
      maxFeeWei: "11"
    });

    expect(calldata.startsWith(STAGE_C_WITHDRAW_BOUNDED_SELECTOR)).toBe(true);
    expect(calldata).toContain("01020304" + "0".repeat(56));
    expect(() =>
      encodeV12UnlinkableWithdrawOutputNoteCalldata({
        proof: "0x1234",
        publicInputs: [...publicInputs, `0x${"10".repeat(32)}`],
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedOutputNote: "0x01020304",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected exactly 10 public input bytes32 values for v1.2 unlinkable withdrawal.");
    expect(() =>
      encodeV12UnlinkableWithdrawOutputNoteCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        encryptedOutputNote: "0x",
        minNetAmountWei: "9990",
        maxFeeWei: "11"
      })
    ).toThrow("Expected v1.2 encrypted output note to be always-present nonempty hex bytes.");
  });

  it("encodes private transfer calldata with encrypted note payload", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"02".repeat(32)}`,
      `0x${"03".repeat(32)}`,
      `0x${"04".repeat(32)}`,
      `0x${"05".repeat(32)}`,
      `0x${"06".repeat(32)}`,
      `0x${"07".repeat(32)}`,
      `0x${"08".repeat(32)}`,
      `0x${"09".repeat(32)}`,
      ...nullarkV1_1HashPublicInputs
    ];
    const newCommitment = `0x${"08".repeat(32)}`;
    const calldata = encodePrivateTransferWithEncryptedNoteCalldata({
      proof: "0xabcd",
      publicInputs,
      nullifier: publicInputs[1] ?? "",
      newCommitment,
      encryptedNote: "0x010203"
    });

    expect(calldata.startsWith("0x6da3fd67")).toBe(true);
    expect(calldata).toContain(newCommitment.slice(2));
    expect(calldata).toContain("010203" + "0".repeat(58));
    expect(() =>
      encodePrivateTransferWithEncryptedNoteCalldata({
        proof: "0xabcd",
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        newCommitment: "0x1234",
        encryptedNote: "0x010203"
      })
    ).toThrow("Expected private transfer new commitment to be bytes32.");
  });

  it("validates private transfer public input bindings and receive codes", () => {
    const nullifier = `0x${"01".repeat(32)}`;
    const newCommitment = `0x02${"22".repeat(31)}`;
    const publicInputs = [
      commitment,
      nullifier,
      newCommitment,
      `0x${"00".repeat(32)}`,
      `0x${"00".repeat(32)}`,
      `0x${"00".repeat(32)}`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x${SHIELDED_POOL_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`,
      commitment,
      `0x${BigInt("10000000000000").toString(16).padStart(64, "0")}`,
      ...nullarkV1_1HashPublicInputs
    ];

    expect(() =>
      assertPrivateTransferPublicInputBinding({
        publicInputs,
        nullifier,
        newCommitment,
        currentRoot: commitment
      })
    ).not.toThrow();
    expect(() =>
      assertPrivateTransferPublicInputBinding({
        publicInputs: [...publicInputs.slice(0, 3), `0x${"01".padStart(64, "0")}`, ...publicInputs.slice(4)],
        nullifier,
        newCommitment,
        currentRoot: commitment
      })
    ).toThrow("Private transfer public amount fields must be zero.");

    const receiveCode = {
      version: "shielded-receive-code-v1",
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: SHIELDED_POOL_ADDRESS,
      assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x03${"33".repeat(31)}`,
      noteSecret: `0x04${"44".repeat(31)}`,
      commitment: newCommitment,
      encryptedNote: "0x010203",
      createdAt: "2026-05-02T00:00:00.000Z"
    };

    expect(parsePrivateReceiveCode(JSON.stringify(receiveCode))).toEqual(receiveCode);
    expect(() => parsePrivateReceiveCode(JSON.stringify({ ...receiveCode, commitment: `0x${"00".repeat(32)}` }))).toThrow(
      "Private receive code commitment must be a nonzero BN254 field element."
    );
  });

  it("serializes and parses durable spend-material note records", () => {
    const ownerCommitment = `0x01${"11".repeat(31)}`;
    const noteSecret = `0x02${"22".repeat(31)}`;
    const blinding = `0x03${"33".repeat(31)}`;
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment,
      noteSecret,
      blinding,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z"
    });

    expect(record).toEqual({
      version: SANDBOX_NOTE_RECORD_VERSION,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
      noteAmountWei: "10000000000000",
      ownerCommitment,
      noteSecret,
      blinding,
      commitment,
      recoveryRoute: "local-note",
      spendStatus: {
        route: "local-note",
        commitment,
        leafIndex: null,
        spent: null
      },
      commitmentDerivationStatus: SANDBOX_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: false,
      leafIndex: null,
      merklePath: {
        root: null,
        siblings: [],
        pathIndices: [],
        status: SANDBOX_MERKLE_PATH_STATUS
      },
      depositTxHash: `0x${"ab".repeat(32)}`,
      depositBlockNumber: null,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z",
      status: SANDBOX_NOTE_STATUS,
      proofGenerationStatus: SANDBOX_PROOF_GENERATION_STATUS,
      warning: SANDBOX_NOTE_RECORD_WARNING
    });
    expect(parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record))).toEqual(record);
    expect(() => parseSandboxSpendMaterialNoteRecord("{}")).toThrow("Unsupported note record version.");
  });

  it("serializes and parses mainnet spend-material note records with explicit deployment metadata", () => {
    const ownerCommitment = `0x01${"11".repeat(31)}`;
    const noteSecret = `0x02${"22".repeat(31)}`;
    const blinding = `0x03${"33".repeat(31)}`;
    const record = createSandboxSpendMaterialNoteRecord({
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      rpcUrl: MEGAETH_MAINNET_RPC_URL,
      pool: freshMainnetNullarkPool,
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment,
      noteSecret,
      blinding,
      depositTxHash: `0x${"ac".repeat(32)}`,
      currentRootAfter: `0x${"13".repeat(32)}`,
      createdAt: "2026-05-09T00:00:00.000Z"
    });

    expect(record.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(record.rpcUrl).toBe(MEGAETH_MAINNET_RPC_URL);
    expect(record.pool).toBe(freshMainnetNullarkPool);
    expect(
      parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record), {
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        rpcUrl: MEGAETH_MAINNET_RPC_URL,
        pool: freshMainnetNullarkPool
      })
    ).toEqual(record);

    expect(() =>
      parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record), {
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        rpcUrl: MEGAETH_MAINNET_RPC_URL,
        pool: freshMainnetNullarkPool
      })
    ).toThrow("Note record is not for expected MegaETH chain.");
    expect(() =>
      parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record), {
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        rpcUrl: MEGAETH_TESTNET_RPC_URL,
        pool: freshMainnetNullarkPool
      })
    ).toThrow("Note record is not for expected MegaETH RPC.");
    expect(() =>
      parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record), {
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        rpcUrl: MEGAETH_MAINNET_RPC_URL,
        pool: SHIELDED_POOL_ADDRESS
      })
    ).toThrow("Note record is not for this shielded pool.");
  });

  it("requires explicit mainnet metadata for a fresh NullarkPool", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      rpcUrl: MEGAETH_MAINNET_RPC_URL,
      pool: freshMainnetNullarkPool,
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ad".repeat(32)}`,
      currentRootAfter: `0x${"14".repeat(32)}`,
      createdAt: "2026-05-09T00:00:00.000Z"
    });

    expect(record.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(record.rpcUrl).toBe(MEGAETH_MAINNET_RPC_URL);
    expect(
      parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record), {
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        rpcUrl: MEGAETH_MAINNET_RPC_URL,
        pool: freshMainnetNullarkPool
      })
    ).toEqual(record);
  });

  it("rejects legacy Depth20 as a mainnet NullarkPool note binding", () => {
    expect(MAINNET_SHIELDED_POOL_ADDRESS).not.toBe(LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS);
    expect(() =>
      createSandboxSpendMaterialNoteRecord({
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        rpcUrl: MEGAETH_MAINNET_RPC_URL,
        pool: LEGACY_MAINNET_SHIELDED_POOL_DEPTH20_ADDRESS,
        commitment,
        noteAmountWei: "10000000000000",
        ownerCommitment: `0x01${"11".repeat(31)}`,
        noteSecret: `0x02${"22".repeat(31)}`,
        blinding: `0x03${"33".repeat(31)}`,
        depositTxHash: `0x${"ad".repeat(32)}`,
        currentRootAfter: `0x${"14".repeat(32)}`,
        createdAt: "2026-05-09T00:00:00.000Z"
      })
    ).toThrow("Legacy MegaETH mainnet ShieldedPoolDepth20 address is not a supported NullarkPool binding.");
  });

  it("normalizes imported note records that use a lowercased pool address", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z"
    });
    const imported = parseSandboxSpendMaterialNoteRecord(JSON.stringify({ ...record, pool: SHIELDED_POOL_ADDRESS.toLowerCase() }));

    expect(imported.pool).toBe(SHIELDED_POOL_ADDRESS);
  });

  it("imports RECOVERY_KIT_V1 into a spendable local note record without wallet-linked discovery tags", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      depositBlockNumber: "0x7b",
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 7,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });
    const imported = parseRecoveryKitV1ToNoteRecord(serializeRecoveryKitV1(kit), {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS
    });

    expect(imported.commitment).toBe(record.commitment);
    expect(imported.noteSecret).toBe(record.noteSecret);
    expect(kit.blockNumberHint).toBe("0x7b");
    expect(imported.depositBlockNumber).toBe("0x7b");
    expect(imported.commitmentDerivedFromSpendMaterial).toBe(true);
    expect(imported.proofGenerationStatus).toBe(SANDBOX_PROOF_GENERATION_STATUS);
    expect(imported.recoveryRoute).toBe("recovery-kit");
    expect(imported.spendStatus).toEqual({
      commitment: record.commitment,
      leafIndex: 7,
      route: "recovery-kit",
      spent: null
    });
    expect(JSON.parse(serializeRecoveryKitV1(kit))).toMatchObject({
      recoveryKitSchemaHash: "sha256:b7935a0848b972e16be5790040136f50712e84e44c272079170192b9a56d18d8"
    });
    expect(Object.keys(kit).filter((key) => /wallet|discovery|tag/i.test(key))).toEqual([]);
  });

  it("keeps recovery kit block hints advisory and omits them when no receipt metadata exists", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 7,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });

    expect(kit.blockNumberHint).toBeNull();
    expect(parseRecoveryKitV1ToNoteRecord(serializeRecoveryKitV1(kit), {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS
    }).depositBlockNumber).toBeNull();
  });

  it("rejects checksum-only RECOVERY_KIT_V1 imports without the frozen schema hash", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 7,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });
    const { recoveryKitSchemaHash: _schemaHash, ...checksumOnlyKit } = JSON.parse(serializeRecoveryKitV1(kit)) as Record<
      string,
      unknown
    >;

    expect(() => parseRecoveryKitV1ToNoteRecord(JSON.stringify(checksumOnlyKit))).toThrow(
      "Recovery kit schema hash is required."
    );
  });

  it("rejects RECOVERY_KIT_V1 imports with a mismatched schema hash", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 7,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });

    expect(() =>
      parseRecoveryKitV1ToNoteRecord(
        JSON.stringify({
          ...kit,
          recoveryKitSchemaHash: `sha256:${"00".repeat(32)}`
        })
      )
    ).toThrow("Recovery kit schema hash mismatch.");
  });

  it("rejects RECOVERY_KIT_V1 imports that carry public wallet-linked discovery tags", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-24T00:00:00.000Z",
      leafIndex: 7,
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });
    const kit = createRecoveryKitV1FromNoteRecord(record, { runtimeId: "nullark-v1.2-testnet-candidate" });

    expect(() =>
      parseRecoveryKitV1ToNoteRecord(
        JSON.stringify({ ...kit, publicStableWalletLinkedDiscoveryTag: `0x${"99".repeat(32)}` })
      )
    ).toThrow("Recovery kit must not contain public wallet-linked discovery tags.");
  });

  it("rejects spend notes for the wrong asset or an out-of-field amount", () => {
    const baseRecord = {
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z"
    };

    expect(() =>
      createSandboxSpendMaterialNoteRecord({
        ...baseRecord,
        assetId: `0x${"02".repeat(32)}`
      })
    ).toThrow("Expected note record asset ID to match the native ETH sandbox pool.");

    expect(() =>
      createSandboxSpendMaterialNoteRecord({
        ...baseRecord,
        noteAmountWei: BigInt(BN254_SCALAR_FIELD).toString()
      })
    ).toThrow("Expected note record amount wei as a positive decimal integer.");
  });

  it("rejects spend notes that pretend the sandbox commitment is derived from private material", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z"
    });
    const spoofed = {
      ...record,
      commitmentDerivedFromSpendMaterial: true,
      commitmentDerivationStatus: "poseidon-derived"
    };

    expect(() => parseSandboxSpendMaterialNoteRecord(JSON.stringify(spoofed))).toThrow(
      "Unsupported note record commitment derivation status."
    );
  });

  it("serializes and parses Poseidon-derived note records with reconstructed Merkle paths", () => {
    const record = createSandboxSpendMaterialNoteRecord({
      commitment,
      noteAmountWei: "10000000000000",
      ownerCommitment: `0x01${"11".repeat(31)}`,
      noteSecret: `0x02${"22".repeat(31)}`,
      blinding: `0x03${"33".repeat(31)}`,
      depositTxHash: `0x${"ab".repeat(32)}`,
      currentRootAfter: `0x${"12".repeat(32)}`,
      createdAt: "2026-05-02T00:00:00.000Z",
      leafIndex: 1,
      merklePath: {
        root: `0x${"12".repeat(32)}`,
        siblings: [`0x${"13".repeat(32)}`, `0x${"14".repeat(32)}`, `0x${"15".repeat(32)}`, `0x${"16".repeat(32)}`],
        pathIndices: [1, 0, 0, 0],
        status: SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS
      },
      commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
      commitmentDerivedFromSpendMaterial: true
    });

    expect(parseSandboxSpendMaterialNoteRecord(serializeSandboxSpendMaterialNoteRecord(record))).toEqual(record);
  });

  it("reconstructs a note leaf index and Merkle path from RootAccepted history order", () => {
    const leaves = [
      `0x01${"11".repeat(31)}`,
      `0x02${"22".repeat(31)}`,
      `0x03${"33".repeat(31)}`
    ] as const;
    const hash = (inputs: readonly bigint[]) => inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    const path = reconstructMerklePathFromRootAcceptedLogs({
      logs: [
        { root: `0x${"00".repeat(32)}`, previousRoot: `0x${"00".repeat(32)}`, insertedCommitment: `0x${"00".repeat(32)}` },
        { root: `0x${"aa".repeat(32)}`, previousRoot: `0x${"00".repeat(32)}`, insertedCommitment: leaves[0] },
        { root: `0x${"bb".repeat(32)}`, previousRoot: `0x${"aa".repeat(32)}`, insertedCommitment: leaves[1] },
        { root: `0x${"cc".repeat(32)}`, previousRoot: `0x${"bb".repeat(32)}`, insertedCommitment: leaves[2] }
      ],
      commitment: leaves[1],
      hash
    });

    expect(path.leafIndex).toBe(1);
    expect(path.pathIndices).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(path.siblings[0]).toBe(leaves[0]);
    expect(path.status).toBe(SANDBOX_MERKLE_PATH_RECONSTRUCTED_STATUS);
  });

  it("reconstructs depth-20 paths without materializing the full tree", () => {
    const leaves = [
      `0x01${"11".repeat(31)}`,
      `0x02${"22".repeat(31)}`,
      `0x03${"33".repeat(31)}`
    ] as const;
    let hashCalls = 0;
    const hash = (inputs: readonly bigint[]) => {
      hashCalls += 1;
      return inputs.reduce((sum, value) => sum + value, 0n) + 1n;
    };
    const path = reconstructMerklePathFromRootAcceptedLogs({
      logs: [
        { root: `0x${"00".repeat(32)}`, previousRoot: `0x${"00".repeat(32)}`, insertedCommitment: `0x${"00".repeat(32)}` },
        { root: `0x${"aa".repeat(32)}`, previousRoot: `0x${"00".repeat(32)}`, insertedCommitment: leaves[0] },
        { root: `0x${"bb".repeat(32)}`, previousRoot: `0x${"aa".repeat(32)}`, insertedCommitment: leaves[1] },
        { root: `0x${"cc".repeat(32)}`, previousRoot: `0x${"bb".repeat(32)}`, insertedCommitment: leaves[2] }
      ],
      commitment: leaves[1],
      hash,
      depth: 20
    });

    expect(path.leafIndex).toBe(1);
    expect(path.pathIndices).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(path.siblings).toHaveLength(20);
    expect(path.siblings[0]).toBe(leaves[0]);
    expect(hashCalls).toBeLessThan(200);
  });

  it("validates withdrawal public input bindings before wallet submission", () => {
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      `0x${"02".repeat(32)}`,
      "0x0000000000000000000000001111111111111111111111111111111111111111",
      `0x${"0".repeat(60)}2711`,
      `0x${"0".repeat(63)}a`,
      `0x${"0".repeat(60)}18c7`,
      `0x000000000000000000000000${SHIELDED_POOL_ADDRESS.toLowerCase().replace(/^0x/, "")}`,
      commitment,
      `0x${BigInt("10001").toString(16).padStart(64, "0")}`,
      ...nullarkV1_1HashPublicInputs
    ];

    expect(() =>
      assertWithdrawPublicInputBinding({
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        currentRoot: publicInputs[0] ?? ""
      })
    ).not.toThrow();

    expect(() =>
      assertWithdrawPublicInputBinding({
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001",
        currentRoot: "0x26adacd5dd379444bb85cb329e7aa1f8e684e21820fadcb37824ba6a712e2b01"
      })
    ).toThrow("Withdrawal proof root does not match the current pool root.");

    expect(() =>
      assertWithdrawPublicInputBinding({
        publicInputs,
        nullifier: publicInputs[1] ?? "",
        destination: "0x0000000000000000000000000000000000000001",
        grossAmountWei: "10001",
        currentRoot: publicInputs[0] ?? ""
      })
    ).toThrow("Withdrawal destination does not match public inputs.");
  });

  it("validates v1.2 withdrawal outputCommitment at public input index 2", () => {
    const outputCommitment = `0x02${"22".repeat(31)}`;
    const publicInputs = [
      commitment,
      `0x${"01".repeat(32)}`,
      outputCommitment,
      "0x0000000000000000000000001111111111111111111111111111111111111111",
      `0x${BigInt("10001").toString(16).padStart(64, "0")}`,
      `0x${"0".repeat(63)}a`,
      `0x${MEGAETH_TESTNET_CHAIN_ID.toString(16).padStart(64, "0")}`,
      `0x000000000000000000000000${SHIELDED_POOL_ADDRESS.toLowerCase().replace(/^0x/, "")}`,
      `0x${"0a".repeat(32)}`,
      `0x${"0b".repeat(32)}`
    ];

    const binding = {
      publicInputSchema: "v1.2-unlinkable" as const,
      publicInputs,
      nullifier: publicInputs[1] ?? "",
      destination: "0x1111111111111111111111111111111111111111",
      grossAmountWei: "10001",
      currentRoot: publicInputs[0] ?? "",
      outputCommitment
    };

    expect(() => assertWithdrawPublicInputBinding(binding)).not.toThrow();
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...binding,
        publicInputs: publicInputs.map((value, index) => (index === 2 ? `0x${"00".repeat(32)}` : value))
      })
    ).toThrow("Withdrawal output commitment is not a nonzero BN254 field element.");
    expect(() =>
      assertWithdrawPublicInputBinding({
        ...binding,
        outputCommitment: `0x02${"33".repeat(31)}`
      })
    ).toThrow("Withdrawal outputCommitment public input at index 2 does not match expected outputCommitment.");
  });

  it("rejects malformed withdraw calldata inputs", () => {
    const publicInputs = Array.from({ length: 12 }, () => commitment);

    expect(() =>
      encodeWithdrawCalldata({
        proof: "0x123",
        publicInputs,
        nullifier: commitment,
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001"
      })
    ).toThrow("Expected proof to be even-length hex bytes.");

    expect(() =>
      encodeWithdrawCalldata({
        proof: "0x1234",
        publicInputs: publicInputs.slice(0, 7),
        nullifier: commitment,
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001"
      })
    ).toThrow("Expected exactly 12 public input bytes32 values.");

    expect(() =>
      encodeWithdrawCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: "0x1234",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10001"
      })
    ).toThrow("Expected a 32-byte nullifier.");

    expect(() =>
      encodeWithdrawCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: commitment,
        destination: "0x846646aF497d1Df2367F28666257C1a111afF1D",
        grossAmountWei: "10001"
      })
    ).toThrow("Expected a valid EVM destination address.");

    expect(() =>
      encodeWithdrawCalldata({
        proof: "0x1234",
        publicInputs,
        nullifier: commitment,
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "0"
      })
    ).toThrow("Expected gross amount wei to be positive.");
  });

  it("rejects malformed commitment calldata", () => {
    expect(() => encodeDepositCalldata("0x1234")).toThrow("Expected a 32-byte hex value.");
  });

  it("parses bool eth_call results", () => {
    expect(boolFromEthCallResult(`0x${"0".repeat(63)}1`)).toBe(true);
    expect(boolFromEthCallResult(`0x${"0".repeat(64)}`)).toBe(false);
  });

  it("formats wei balances as ETH", () => {
    expect(formatWeiBalance("0x0")).toBe("0 ETH");
    expect(formatWeiBalance("0x2386f26fc10000")).toBe("0.01 ETH");
  });

  it("creates deterministic BN254 field commitments from injected randomness", () => {
    const result = createRandomBytes32((array) => {
      const bytes = array as unknown as Uint8Array;
      bytes.fill(17);
      return array;
    });

    expect(result).toBe(bytesToHex(new Uint8Array(32).fill(17)));
    expect(isBn254FieldElement(result)).toBe(true);
    expect(isBn254FieldElement(BN254_SCALAR_FIELD)).toBe(false);
  });

  it("creates private spend material with BN254-safe fields", () => {
    const material = createSandboxSpendMaterial((array) => {
      const bytes = array as unknown as Uint8Array;
      bytes.fill(68);
      return array;
    });

    expect(material.assetId).toBe(SANDBOX_NATIVE_ETH_ASSET_ID);
    expect(material.ownerCommitment).toBe(`0x04${"44".repeat(31)}`);
    expect(material.noteSecret).toBe(`0x04${"44".repeat(31)}`);
    expect(material.blinding).toBe(`0x04${"44".repeat(31)}`);
    expect(material.commitment).toBe(`0x04${"44".repeat(31)}`);
    expect(isBn254FieldElement(material.ownerCommitment)).toBe(true);
    expect(isBn254FieldElement(material.noteSecret)).toBe(true);
    expect(isBn254FieldElement(material.blinding)).toBe(true);
    expect(isBn254FieldElement(material.commitment)).toBe(true);
  });

  it("masks generated commitment entropy into the BN254 scalar field", () => {
    const result = createRandomBytes32((array) => {
      const bytes = array as unknown as Uint8Array;
      bytes.fill(255);
      return array;
    });

    expect(result).toBe(`0x1f${"ff".repeat(31)}`);
    expect(isBn254FieldElement(result)).toBe(true);
  });
});
