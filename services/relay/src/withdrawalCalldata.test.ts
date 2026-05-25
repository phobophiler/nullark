import {
  ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
  ENCRYPTED_NOTE_V1_VERSION,
  hashAbiEncodedToField,
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_1,
  PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
  PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  createEncryptedNoteV1,
  createProofContextV1,
  hashEncryptedNoteV1,
  hashProofContextV1
} from "@nullark/core";
import { encodeAbiParameters, keccak256, stringToBytes } from "viem";
import { describe, expect, it } from "vitest";
import {
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_TESTNET_CHAIN_ID,
  WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  type HexString
} from "./broadcaster.js";
import {
  computeStageBContractBoundEncryptedNoteHash,
  computeStageBProofContextHash,
  computeStageBRelayerPolicyHash,
  computeStageCWithdrawChangeNoteHashes,
  RELAY_SUPPORTED_FIXED_DENOMINATIONS_WEI,
  validateWithdrawalRelayCalldata,
  validateStageCWithdrawChangeNotePreflight,
  type StageBRelayerPolicy
} from "./withdrawalCalldata.js";

const POOL = "0xce4D91A6D10AAfAB3e420e3764C139244057C8E1" as const;
const DESTINATION = "0x4429b0e7eea175b3b4726feaaaeaf69271fd46ce" as const;
const NULLIFIER = `0x${"01".repeat(32)}` as const;
const ROOT = `0x${"02".repeat(32)}` as const;
const SPENT_COMMITMENT = `0x${"03".repeat(32)}` as const;
const CHANGE_COMMITMENT = `0x${"04".repeat(32)}` as const;
const PROOF = "0x1234" as const;
const ENCRYPTED_CHANGE_NOTE = "0xabcd" as const;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const RELAYER = "0x9999999999999999999999999999999999999999" as const;
const DEADLINE = 1_710_000_000;
const GROSS_AMOUNT = 5_000_000_000_000_000n;
const NOTE_AMOUNT_WITH_CHANGE = 10_000_000_000_000_000n;
const CHANGE_AMOUNT = NOTE_AMOUNT_WITH_CHANGE - GROSS_AMOUNT;
const EXPECTED_FEE = (GROSS_AMOUNT * 33n) / 10_000n;
const EXPECTED_NET_AMOUNT = GROSS_AMOUNT - EXPECTED_FEE;
const OLD_WITHDRAW_CHANGE_V1_1_SHAPE = "0x0ec7c43c7b9191444567ce3f23c214b3a509dd7d50bfbc508cdaab9558ca40ab" as const;

const withdrawBoundedParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" }
] as const;

const stageCWithdrawBoundedParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "uint256" },
  { type: "uint256" }
] as const;

const withdrawStageBRelayerPolicyParameters = [
  { type: "bytes" },
  { type: "bytes32[]" },
  { type: "bytes32" },
  { type: "address" },
  { type: "uint256" },
  {
    type: "tuple",
    components: [
      { name: "relayer", type: "address" },
      { name: "minNetAmount", type: "uint256" },
      { name: "maxFeeAmount", type: "uint256" },
      { name: "deadlineOrZero", type: "uint256" }
    ]
  }
] as const;

describe("withdrawal relay calldata validation", () => {
  it("uses the shared core fixed denomination policy", () => {
    expect([...RELAY_SUPPORTED_FIXED_DENOMINATIONS_WEI]).toEqual([...MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI]);
  });

  it("accepts bounded withdrawal calldata bound to the relayer chain and pool", () => {
    const data = encodeBoundedWithdrawCalldata();

    const decision = validateWithdrawalRelayCalldata({
      data,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(decision.errors).toEqual([]);
    expect(decision.allowed).toBe(true);
    expect(decision.decoded).toMatchObject({
      destination: "0x4429B0E7eEa175B3B4726fEaAaeaF69271Fd46ce",
      grossAmount: GROSS_AMOUNT,
      hasUserBounds: true,
      hasChangeNote: false
    });
  });

  it("rejects unbounded and private-change selectors before relay signing", () => {
    const unbounded = validateWithdrawalRelayCalldata({
      data: encodeBoundedWithdrawCalldata({ selector: WITHDRAW_SELECTOR }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(unbounded.errors).toContain("Relayer requires user-bounded withdrawal calldata");

    const data = encodeBoundedWithdrawCalldata({ selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR });

    const decision = validateWithdrawalRelayCalldata({
      data,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toEqual(expect.arrayContaining([
      "Private change commitment must be a nonzero bytes32 value"
    ]));
  });

  it("rejects calldata bound to the wrong chain or pool", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata(),
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal proof chain ID does not match relayer chain");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata(),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: "0x1111111111111111111111111111111111111111"
      }).errors
    ).toContain("withdrawal proof pool does not match relayer pool");
  });

  it("rejects destination amount fee and nullifier mismatches", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ destination: addressToBytes32(POOL) }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal destination does not match public inputs");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ grossAmount: toBytes32(900_000n) }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal gross amount does not match public inputs");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ fee: toBytes32(999n) }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal fee does not match relayer fee policy");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ nullifier: SPENT_COMMITMENT }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal nullifier does not match public inputs");
  });

  it("rejects malformed public inputs and note amount overdraws", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs().slice(0, 9) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("Proof-bound withdrawal calldata must include exactly 12 public inputs");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ spentCommitment: toBytes32(0n) }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal spent commitment must be nonzero");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ publicInputs: basePublicInputs({ noteAmount: toBytes32(900_000n) }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal note amount must be a supported fixed denomination");
  });

  it("rejects user bound violations before relay signing", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ maxFeeAmount: EXPECTED_FEE - 1n }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal fee exceeds user max fee bound");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({ minNetAmount: EXPECTED_NET_AMOUNT + 1n }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal net amount is below user minimum bound");
  });

  it("sources the expected withdrawal fee from the active fee policy instead of a stale constant", () => {
    const activeFeeBps = 50n;
    const fee = (GROSS_AMOUNT * activeFeeBps) / 10_000n;
    const data = encodeBoundedWithdrawCalldata({
      publicInputs: boundedFullExitPublicInputs({
        fee,
        minNetAmount: GROSS_AMOUNT - fee,
        maxFeeAmount: fee,
        proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
      }),
      minNetAmount: GROSS_AMOUNT - fee,
      maxFeeAmount: fee
    });

    expect(
      validateWithdrawalRelayCalldata({
        data,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: { activeFeeBps }
      }).errors
    ).toEqual([]);

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata(),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: { activeFeeBps }
      }).errors
    ).toContain("withdrawal fee does not match active fee policy");
  });

  it("keeps pending fee increases visible but rejects pending-fee calldata before activation", () => {
    const pendingFeeBps = 50n;
    const pendingFee = (GROSS_AMOUNT * pendingFeeBps) / 10_000n;

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({
          publicInputs: boundedFullExitPublicInputs({
            fee: pendingFee,
            minNetAmount: GROSS_AMOUNT - pendingFee,
            maxFeeAmount: pendingFee,
            proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
          }),
          minNetAmount: GROSS_AMOUNT - pendingFee,
          maxFeeAmount: pendingFee
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: {
          activeFeeBps: 33n,
          pendingFeeBps,
          pendingFeeActivationEpochSeconds: BigInt(DEADLINE + 60),
          nowEpochSeconds: BigInt(DEADLINE)
        }
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal fee does not match active fee policy",
      "withdrawal fee matches pending fee before activation"
    ]));

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({
          publicInputs: boundedFullExitPublicInputs({
            proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: {
          activeFeeBps: 33n,
          pendingFeeBps,
          pendingFeeActivationEpochSeconds: BigInt(DEADLINE + 60),
          nowEpochSeconds: BigInt(DEADLINE)
        }
      }).errors
    ).toEqual([]);
  });

  it("rejects proof-bound pending-fee calldata before activation", () => {
    const pendingFeeBps = 50n;
    const pendingFee = (GROSS_AMOUNT * pendingFeeBps) / 10_000n;
    const relayerPolicy = stageBRelayerPolicy({
      minNetAmount: GROSS_AMOUNT - pendingFee,
      maxFeeAmount: pendingFee
    });
    const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT
    });
    const proofContextHash = computeStageBProofContextHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: pendingFee,
      encryptedNoteHash,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero
    });

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: [
            ...basePublicInputs({ fee: toBytes32(pendingFee) }),
            proofContextHash,
            encryptedNoteHash
          ],
          relayerPolicy
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER,
        feePolicy: {
          activeFeeBps: 33n,
          pendingFeeBps,
          pendingFeeActivationEpochSeconds: BigInt(DEADLINE + 60),
          nowEpochSeconds: BigInt(DEADLINE)
        }
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal fee does not match active fee policy",
      "withdrawal fee matches pending fee before activation",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));
  });

  it("enforces maxFeeAmount and minNetAmount against the active fee policy", () => {
    const activeFeeBps = 50n;
    const activeFee = (GROSS_AMOUNT * activeFeeBps) / 10_000n;

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({
          publicInputs: boundedFullExitPublicInputs({
            fee: activeFee,
            minNetAmount: GROSS_AMOUNT - activeFee,
            maxFeeAmount: EXPECTED_FEE,
            proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
          }),
          minNetAmount: GROSS_AMOUNT - activeFee,
          maxFeeAmount: EXPECTED_FEE
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: { activeFeeBps }
      }).errors
    ).toContain("withdrawal fee exceeds user max fee bound");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({
          publicInputs: boundedFullExitPublicInputs({
            fee: activeFee,
            minNetAmount: EXPECTED_NET_AMOUNT,
            maxFeeAmount: activeFee,
            proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
          }),
          minNetAmount: EXPECTED_NET_AMOUNT,
          maxFeeAmount: activeFee
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        feePolicy: { activeFeeBps }
      }).errors
    ).toContain("withdrawal net amount is below user minimum bound");
  });

  it("rejects partial public exits and new commitments on every public-exit chain", () => {
    const partial = validateWithdrawalRelayCalldata({
      data: encodeBoundedWithdrawCalldata({
        publicInputs: basePublicInputs({ noteAmount: toBytes32(GROSS_AMOUNT * 2n) })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(partial.errors).toContain("Public exits without private change must withdraw the full fixed-denomination note");

    const withNewCommitment = validateWithdrawalRelayCalldata({
      data: encodeBoundedWithdrawCalldata({
        publicInputs: basePublicInputs({
          chainId: toBytes32(BigInt(MEGAETH_MAINNET_CHAIN_ID)),
          newCommitment: `0x${"04".repeat(32)}`
        })
      }),
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      pool: POOL
    });

    expect(withNewCommitment.errors).toContain("Public exits without private change must not create new commitments");
  });

  it("rejects encrypted private-change calldata before checking payload size", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeBoundedWithdrawCalldata({
          selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
          encryptedChangeNote: `0x${"ab".repeat(2049)}`
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("Encrypted private change note exceeds relayer policy maximum");
  });

  it("accepts proof-bound relayer-policy withdrawal calldata only when core hashes match public inputs", () => {
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageBWithdrawCalldata(),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      deadlineEpochSeconds: DEADLINE,
      expectedRelayer: RELAYER
    });

    expect(decision.errors).toEqual([]);
    expect(decision.allowed).toBe(true);
    expect(decision.decoded?.selector).toBe(PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR);
    expect(decision.decoded?.publicInputs).toHaveLength(12);
  });

  it("keeps v1.1 proof-bound withdrawal hashes unchanged by default", () => {
    const relayerPolicy = stageBRelayerPolicy();
    const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT
    });
    const explicitV11EncryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT,
      proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_1
    });
    const proofContextHash = computeStageBProofContextHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: EXPECTED_FEE,
      encryptedNoteHash,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero
    });
    const explicitV11ProofContextHash = computeStageBProofContextHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: EXPECTED_FEE,
      encryptedNoteHash: explicitV11EncryptedNoteHash,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero,
      proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_1
    });

    expect(encryptedNoteHash).toBe(explicitV11EncryptedNoteHash);
    expect(proofContextHash).toBe(explicitV11ProofContextHash);
  });

  it("computes distinct v1.2 fee-governance proof-bound withdrawal hashes by explicit helper input", () => {
    const relayerPolicy = stageBRelayerPolicy();
    const v11EncryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT
    });
    const v12EncryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT,
      proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
    });
    const sharedContext = {
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: EXPECTED_FEE,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero
    };

    const v11ProofContextHash = computeStageBProofContextHash({
      ...sharedContext,
      encryptedNoteHash: v11EncryptedNoteHash
    });
    const v12ProofContextHash = computeStageBProofContextHash({
      ...sharedContext,
      encryptedNoteHash: v12EncryptedNoteHash,
      proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
    });

    expect(v12EncryptedNoteHash).not.toBe(v11EncryptedNoteHash);
    expect(v12ProofContextHash).not.toBe(v11ProofContextHash);
  });

  it("rejects stale v1.1 proofContextHash when validating v1.2 fee-governed calldata", () => {
    const activeFeeBps = 50n;
    const activeFee = (GROSS_AMOUNT * activeFeeBps) / 10_000n;
    const relayerPolicy = stageBRelayerPolicy({
      minNetAmount: GROSS_AMOUNT - activeFee,
      maxFeeAmount: activeFee
    });
    const staleV11EncryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT
    });
    const staleV11ProofContextHash = computeStageBProofContextHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: activeFee,
      encryptedNoteHash: staleV11EncryptedNoteHash,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero
    });
    const v12EncryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT,
      proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
    });

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({
            fee: activeFee,
            relayerPolicy,
            encryptedNoteHash: v12EncryptedNoteHash,
            proofContextHash: staleV11ProofContextHash
          }),
          relayerPolicy
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER,
        feePolicy: { activeFeeBps }
      }).errors
    ).toContain("Proof-bound withdrawal proofContextHash does not match public inputs");
  });

  it("rejects proof-bound hashes produced with stale non-withdraw context shape", () => {
    const relayerPolicy = stageBRelayerPolicy();
    const relayerPolicyHash = computeStageBRelayerPolicyHash(relayerPolicy);
    const wrongEncryptedNoteHash = hashEncryptedNoteV1(
      createEncryptedNoteV1({
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        shape: PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER,
        selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
        nullifier: NULLIFIER,
        commitment: ZERO_BYTES32,
        noteAmount: GROSS_AMOUNT,
        encryptedNote: "0x"
      })
    ) as HexString;
    const wrongProofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        shape: PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER,
        selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
        root: ROOT,
        nullifier: NULLIFIER,
        destination: DESTINATION,
        grossAmount: GROSS_AMOUNT,
        fee: EXPECTED_FEE,
        encryptedNoteHash: wrongEncryptedNoteHash,
        relayerPolicyHash,
        deadlineOrZero: relayerPolicy.deadlineOrZero
      })
    ) as HexString;

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({
            relayerPolicy,
            encryptedNoteHash: wrongEncryptedNoteHash,
            proofContextHash: wrongProofContextHash
          }),
          relayerPolicy
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "Proof-bound withdrawal encrypted-note hash does not match public inputs",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));
  });

  it("rejects proof-bound contexts whose fee hash came from a stale public-input snapshot", () => {
    const staleFee = (GROSS_AMOUNT * 50n) / 10_000n;
    const relayerPolicy = stageBRelayerPolicy({ maxFeeAmount: staleFee });
    const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      nullifier: NULLIFIER,
      noteAmount: GROSS_AMOUNT
    });
    const staleProofContextHash = computeStageBProofContextHash({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
      root: ROOT,
      nullifier: NULLIFIER,
      destination: DESTINATION,
      grossAmount: GROSS_AMOUNT,
      fee: staleFee,
      encryptedNoteHash,
      relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
      deadlineOrZero: relayerPolicy.deadlineOrZero
    });

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({
            relayerPolicy,
            proofContextHash: staleProofContextHash
          }),
          relayerPolicy
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("Proof-bound withdrawal proofContextHash does not match public inputs");
  });

  it("rejects proof-bound wrong chain pool verifying contract and selector-bound context", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata(),
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal proof chain ID does not match relayer chain",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata(),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: "0x1111111111111111111111111111111111111111",
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal proof pool does not match relayer pool",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({
            proofSelector: WITHDRAW_BOUNDED_SELECTOR
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("Proof-bound withdrawal proofContextHash does not match public inputs");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({ pool: "0x1111111111111111111111111111111111111111" })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal proof pool does not match relayer pool",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));
  });

  it("rejects proof-bound wrong deadline relayer policy proofContextHash and encryptedNoteHash", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata(),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE + 1,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("Proof-bound withdrawal deadline does not match relayer request");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({ relayerPolicy: stageBRelayerPolicy({ maxFeeAmount: EXPECTED_FEE - 1n }) }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "withdrawal fee exceeds user max fee bound",
      "Proof-bound withdrawal fee exceeds relayer policy max fee"
    ]));

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({ proofContextHash: `0x${"99".repeat(32)}` })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("Proof-bound withdrawal proofContextHash does not match public inputs");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({ encryptedNoteHash: `0x${"88".repeat(32)}` })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toEqual(expect.arrayContaining([
      "Proof-bound withdrawal encrypted-note hash does not match public inputs",
      "Proof-bound withdrawal proofContextHash does not match public inputs"
    ]));
  });

  it("rejects private-change-style proof-bound change commitments and malformed proof-bound payloads", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageBWithdrawCalldata({
          publicInputs: stageBPublicInputs({ newCommitment: `0x${"44".repeat(32)}` })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("Public exits without private change must not create new commitments");

    expect(
      validateWithdrawalRelayCalldata({
        data: `${PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR}00`,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL,
        deadlineEpochSeconds: DEADLINE,
        expectedRelayer: RELAYER
      }).errors
    ).toContain("withdrawal calldata could not be decoded");
  });

  it("accepts private-change withdrawal calldata only when private change ciphertext and context are bound", () => {
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: stageCPublicInputs({ relayerPolicy: stageCContractBoundedRelayerPolicy() })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(decision.allowed).toBe(true);
    expect(decision.errors).toEqual([]);
    expect(decision.decoded).toMatchObject({
      selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      hasChangeNote: true,
      encryptedChangeNote: ENCRYPTED_CHANGE_NOTE,
      grossAmount: GROSS_AMOUNT
    });
  });

  it("accepts v1.2 unlinkable output-note withdrawal calldata with exactly 10 public inputs", () => {
    const encryptedOutputNote = encryptedOutputNoteV2Hex({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: POOL,
      outputCommitment: CHANGE_COMMITMENT,
      ciphertext: "0xabcd"
    });
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({ encryptedOutputNote }),
        encryptedChangeNote: encryptedOutputNote
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(decision.errors).toEqual([]);
    expect(decision.allowed).toBe(true);
    expect(decision.decoded).toMatchObject({
      selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      hasOutputNote: true,
      hasChangeNote: false,
      encryptedOutputNote,
      grossAmount: GROSS_AMOUNT
    });
    expect(decision.decoded).not.toHaveProperty("encryptedChangeNote");
    expect(decision.decoded?.publicInputs).toHaveLength(10);
  });

  it("rejects raw v1.2 unlinkable output note bytes that are not fixed-shape EncryptedOutputNoteV2", () => {
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({ encryptedOutputNote: ENCRYPTED_CHANGE_NOTE }),
        encryptedChangeNote: ENCRYPTED_CHANGE_NOTE
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note must be a valid EncryptedOutputNoteV2 envelope"
    );
  });

  it("rejects v1.2 output-note envelopes with nonzero reserved internal proofContextHash", () => {
    const encryptedOutputNote = encryptedOutputNoteV2Hex({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: POOL,
      outputCommitment: CHANGE_COMMITMENT,
      proofContextHash: `0x${"99".repeat(32)}`,
      ciphertext: "0xabcd"
    });
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({ encryptedOutputNote }),
        encryptedChangeNote: encryptedOutputNote
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain(
      "v1.2 unlinkable withdrawal encrypted output note proofContextHash must be zero until envelope binding v3"
    );
  });

  it("requires v1.2 unlinkable zero-output exits to carry dummy encrypted output note bytes", () => {
    const emptyOutputDecision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({
          outputCommitment: ZERO_BYTES32,
          encryptedOutputNote: "0x"
        }),
        encryptedChangeNote: "0x"
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(emptyOutputDecision.allowed).toBe(false);
    expect(emptyOutputDecision.errors).toContain(
      "v1.2 unlinkable withdrawal requires always-present encrypted output note bytes"
    );

    const dummyOutputDecision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({
          outputCommitment: ZERO_BYTES32,
          encryptedOutputNote: "0x00"
        }),
        encryptedChangeNote: "0x00"
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(dummyOutputDecision.allowed).toBe(false);
    expect(dummyOutputDecision.errors).toContain("v1.2 unlinkable output commitment must be nonzero");

    const nonzeroDummyOutputNote = encryptedOutputNoteV2Hex({
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      verifyingContract: POOL,
      outputCommitment: CHANGE_COMMITMENT,
      ciphertext: "0x00"
    });
    const nonzeroDummyOutputDecision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: v12UnlinkablePublicInputs({
          encryptedOutputNote: nonzeroDummyOutputNote
        }),
        encryptedChangeNote: nonzeroDummyOutputNote
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(nonzeroDummyOutputDecision.errors).toEqual([]);
    expect(nonzeroDummyOutputDecision.allowed).toBe(true);
    expect(nonzeroDummyOutputDecision.decoded).toMatchObject({
      hasOutputNote: true,
      hasChangeNote: false,
      encryptedOutputNote: nonzeroDummyOutputNote
    });
    expect(nonzeroDummyOutputDecision.decoded).not.toHaveProperty("encryptedChangeNote");
  });

  it("rejects v1.2 unlinkable relay calldata that exposes the old 12-input spent note shape", () => {
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: stageCPublicInputs({
          proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
        })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      relayValidationMode: "v1.2-unlinkable",
      feePolicy: { activeFeeBps: 33n }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toEqual(expect.arrayContaining([
      "v1.2 unlinkable withdrawal calldata must include exactly 10 public inputs",
      "v1.2 unlinkable withdrawal calldata must not expose spentCommitment or noteAmount public inputs"
    ]));
  });

  it("rejects empty encrypted private-change note bytes", () => {
    const valid = stageCPreflightInput();
    const validHashes = computeStageCWithdrawChangeNoteHashes(valid);

    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...validHashes,
        encryptedChangeNote: "0x"
      })
    ).toEqual(["Encrypted private change note must be nonempty even-length hex"]);

    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...validHashes,
        encryptedChangeNote: "0xabc"
      })
    ).toEqual(["Encrypted private change note must be nonempty even-length hex"]);

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({ encryptedChangeNote: "0x" }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(["Encrypted private change note must be nonempty even-length hex"]);
  });

  it("accepts unified selector full exits with empty encrypted change note", () => {
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        grossAmount: GROSS_AMOUNT,
        encryptedChangeNote: "0x",
        publicInputs: stageCPublicInputs({
          grossAmount: GROSS_AMOUNT,
          noteAmount: GROSS_AMOUNT,
          changeCommitment: ZERO_BYTES32,
          encryptedChangeNote: "0x",
          relayerPolicy: stageCContractBoundedRelayerPolicy()
        })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL
    });

    expect(decision.errors).toEqual([]);
    expect(decision.allowed).toBe(true);
    expect(decision.decoded).toMatchObject({
      selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
      encryptedChangeNote: "0x",
      grossAmount: GROSS_AMOUNT
    });
  });

  it("rejects private-change exits that would rely on unsupported gross or private change denominations", () => {
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          grossAmount: 30_000_000_000_000_000n,
          publicInputs: stageCPublicInputs({
            grossAmount: 30_000_000_000_000_000n,
            noteAmount: 100_000_000_000_000_000n
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("Private change amount must be a supported fixed denomination");

    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          grossAmount: 4_000_000_000_000_000n,
          publicInputs: stageCPublicInputs({
            grossAmount: 4_000_000_000_000_000n,
            noteAmount: 10_000_000_000_000_000n
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toContain("withdrawal gross amount must be a supported fixed denomination");
  });

  it("accepts browser private-change bounded calldata even when the Worker request has its own relayer deadline", () => {
    const zeroRelayerPolicy = stageCContractBoundedRelayerPolicy();
    const decision = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: stageCPublicInputs({ relayerPolicy: zeroRelayerPolicy })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      deadlineEpochSeconds: DEADLINE,
      expectedRelayer: RELAYER
    });

    expect(decision.allowed).toBe(true);
    expect(decision.errors).toEqual([]);
  });

  it("rejects private-change bounded calldata whose proof hash is bound to the Worker request instead of the contract overload", () => {
    const relayerPolicy = stageBRelayerPolicy({ relayer: RELAYER, deadlineOrZero: BigInt(DEADLINE) });
    const relayerBoundRequest = validateWithdrawalRelayCalldata({
      data: encodeStageCWithdrawCalldata({
        publicInputs: stageCPublicInputs({ relayerPolicy })
      }),
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      pool: POOL,
      deadlineEpochSeconds: DEADLINE,
      expectedRelayer: RELAYER
    });

    expect(relayerBoundRequest.allowed).toBe(false);
    expect(relayerBoundRequest.errors).toContain("Private-change withdrawal proofContextHash does not match preflight context");
  });

  it("rejects private-change hashes bound to a stale selector context", () => {
    const valid = stageCPreflightInput();
    const staleSelectorHashes = computeStageCWithdrawChangeNoteHashes({
      ...valid,
      selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR
    });

    expect(staleSelectorHashes.encryptedNoteHash).not.toBe(computeStageCWithdrawChangeNoteHashes(valid).encryptedNoteHash);
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        encryptedNoteHash: staleSelectorHashes.encryptedNoteHash,
        proofContextHash: staleSelectorHashes.proofContextHash
      })
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          publicInputs: stageCPublicInputs({
            encryptedNoteHash: staleSelectorHashes.encryptedNoteHash,
            proofContextHash: staleSelectorHashes.proofContextHash
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
  });

  it("rejects private-change hashes produced with obsolete withdraw_change_v1_1 shape", () => {
    const valid = stageCPreflightInput();
    const relayerPolicyHash = computeStageBRelayerPolicyHash(valid.relayerPolicy);
    const wrongEncryptedNoteHash = hashEncryptedNoteV1(
      createEncryptedNoteV1({
        chainId: valid.chainId,
        pool: valid.pool,
        shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE,
        selector: valid.selector,
        nullifier: valid.nullifier,
        commitment: valid.changeCommitment,
        noteAmount: valid.changeAmount,
        encryptedNote: valid.encryptedChangeNote
      })
    ) as HexString;
    const wrongProofContextHash = hashProofContextV1(
      createProofContextV1({
        chainId: valid.chainId,
        pool: valid.pool,
        shape: OLD_WITHDRAW_CHANGE_V1_1_SHAPE,
        selector: valid.selector,
        root: valid.root,
        nullifier: valid.nullifier,
        destination: valid.destination,
        grossAmount: valid.grossAmount,
        fee: valid.fee,
        encryptedNoteHash: wrongEncryptedNoteHash,
        relayerPolicyHash,
        deadlineOrZero: valid.relayerPolicy.deadlineOrZero
      })
    ) as HexString;

    expect(wrongEncryptedNoteHash).not.toBe(computeStageCWithdrawChangeNoteHashes(valid).encryptedNoteHash);
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        encryptedNoteHash: wrongEncryptedNoteHash,
        proofContextHash: wrongProofContextHash
      })
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          publicInputs: stageCPublicInputs({
            encryptedNoteHash: wrongEncryptedNoteHash,
            proofContextHash: wrongProofContextHash
          })
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
  });

  it("rejects private-change wrong ciphertext change commitment and amount", () => {
    const valid = stageCPreflightInput();
    const validHashes = computeStageCWithdrawChangeNoteHashes(valid);

    expect(validateStageCWithdrawChangeNotePreflight({ ...valid, ...validHashes })).toEqual([]);
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({ encryptedChangeNote: "0xabce" }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          publicInputs: mutatePublicInput(stageCPublicInputs(), 2, `0x${"55".repeat(32)}`)
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata({
          publicInputs: mutatePublicInput(stageCPublicInputs(), 9, toBytes32(NOTE_AMOUNT_WITH_CHANGE + 1n))
        }),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual(expect.arrayContaining([
      "Private change note hash does not match preflight context",
      "Private-change withdrawal proofContextHash does not match preflight context"
    ]));
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...validHashes,
        changeAmount: valid.changeAmount + 1n
      })
    ).toContain("Private-change withdrawal value conservation must satisfy noteAmount = grossAmount + changeAmount");
    expect(
      validateWithdrawalRelayCalldata({
        data: encodeStageCWithdrawCalldata(),
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        pool: POOL
      }).errors
    ).toEqual([]);
  });

  it("rejects private-change arbitrary output arrays and output/ciphertext order swaps", () => {
    const valid = stageCPreflightInput();
    const hashes = computeStageCWithdrawChangeNoteHashes(valid);

    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...hashes,
        outputCommitments: [CHANGE_COMMITMENT, `0x${"66".repeat(32)}`],
        encryptedChangeNotes: [ENCRYPTED_CHANGE_NOTE],
        changeAmounts: [CHANGE_AMOUNT]
      })
    ).toContain("Private-change withdrawal supports exactly one private change output");
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...hashes,
        outputCommitments: [`0x${"66".repeat(32)}`],
        encryptedChangeNotes: [ENCRYPTED_CHANGE_NOTE],
        changeAmounts: [CHANGE_AMOUNT]
      })
    ).toContain("Private change output commitment order does not match the change commitment");
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...hashes,
        outputCommitments: [CHANGE_COMMITMENT],
        encryptedChangeNotes: ["0xabce"],
        changeAmounts: [CHANGE_AMOUNT]
      })
    ).toContain("Private change ciphertext order does not match the change output");
    expect(
      validateStageCWithdrawChangeNotePreflight({
        ...valid,
        ...hashes,
        outputCommitments: [CHANGE_COMMITMENT],
        encryptedChangeNotes: [ENCRYPTED_CHANGE_NOTE],
        changeAmounts: [CHANGE_AMOUNT + 1n]
      })
    ).toContain("Private change amount order does not match the change output");
  });
});

function encodeBoundedWithdrawCalldata(input: {
  selector?: HexString;
  publicInputs?: readonly HexString[];
  encryptedChangeNote?: HexString;
  minNetAmount?: bigint;
  maxFeeAmount?: bigint;
} = {}): HexString {
  const selector = input.selector ?? WITHDRAW_BOUNDED_SELECTOR;
  const minNetAmount = input.minNetAmount ?? EXPECTED_NET_AMOUNT;
  const maxFeeAmount = input.maxFeeAmount ?? EXPECTED_FEE;
  const publicInputs = input.publicInputs ?? boundedFullExitPublicInputs({ minNetAmount, maxFeeAmount });

  if (selector === STAGE_C_WITHDRAW_BOUNDED_SELECTOR) {
    return `${selector}${encodeAbiParameters(stageCWithdrawBoundedParameters, [
      PROOF,
      publicInputs,
      NULLIFIER,
      DESTINATION,
      GROSS_AMOUNT,
      input.encryptedChangeNote ?? ENCRYPTED_CHANGE_NOTE,
      minNetAmount,
      maxFeeAmount
    ]).slice(2)}` as HexString;
  }

  return `${selector}${encodeAbiParameters(withdrawBoundedParameters, [
    PROOF,
    publicInputs,
    NULLIFIER,
    DESTINATION,
    GROSS_AMOUNT,
    minNetAmount,
    maxFeeAmount
  ]).slice(2)}` as HexString;
}

function encodeStageBWithdrawCalldata(input: {
  publicInputs?: readonly HexString[];
  relayerPolicy?: StageBRelayerPolicy;
} = {}): HexString {
  const relayerPolicy = input.relayerPolicy ?? stageBRelayerPolicy();
  return `${PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR}${encodeAbiParameters(withdrawStageBRelayerPolicyParameters, [
    PROOF,
    input.publicInputs ?? stageBPublicInputs({ relayerPolicy }),
    NULLIFIER,
    DESTINATION,
    GROSS_AMOUNT,
    relayerPolicy
  ]).slice(2)}` as HexString;
}

function encodeStageCWithdrawCalldata(input: {
  publicInputs?: readonly HexString[];
  encryptedChangeNote?: HexString;
  grossAmount?: bigint;
} = {}): HexString {
  const grossAmount = input.grossAmount ?? GROSS_AMOUNT;
  const fee = (grossAmount * 33n) / 10_000n;
  return `${STAGE_C_WITHDRAW_BOUNDED_SELECTOR}${encodeAbiParameters(stageCWithdrawBoundedParameters, [
    PROOF,
    input.publicInputs ?? stageCPublicInputs(),
    NULLIFIER,
    DESTINATION,
    grossAmount,
    input.encryptedChangeNote ?? ENCRYPTED_CHANGE_NOTE,
    grossAmount - fee,
    fee
  ]).slice(2)}` as HexString;
}

function basePublicInputs(overrides: Partial<{
  nullifier: HexString;
  newCommitment: HexString;
  destination: HexString;
  grossAmount: HexString;
  fee: HexString;
  chainId: HexString;
  pool: HexString;
  spentCommitment: HexString;
  noteAmount: HexString;
}> = {}): HexString[] {
  return [
    ROOT,
    overrides.nullifier ?? NULLIFIER,
    overrides.newCommitment ?? ZERO_BYTES32,
    overrides.destination ?? addressToBytes32(DESTINATION),
    overrides.grossAmount ?? toBytes32(GROSS_AMOUNT),
    overrides.fee ?? toBytes32(EXPECTED_FEE),
    overrides.chainId ?? toBytes32(BigInt(MEGAETH_TESTNET_CHAIN_ID)),
    overrides.pool ?? addressToBytes32(POOL),
    overrides.spentCommitment ?? SPENT_COMMITMENT,
    overrides.noteAmount ?? toBytes32(GROSS_AMOUNT)
  ] as HexString[];
}

function boundedFullExitPublicInputs(overrides: Partial<{
  chainId: number;
  pool: HexString;
  fee: bigint;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  proofContextShape: HexString;
}> = {}): HexString[] {
  const chainId = overrides.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const pool = overrides.pool ?? POOL;
  const fee = overrides.fee ?? EXPECTED_FEE;
  const minNetAmount = overrides.minNetAmount ?? EXPECTED_NET_AMOUNT;
  const maxFeeAmount = overrides.maxFeeAmount ?? EXPECTED_FEE;
  const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
    chainId,
    pool,
    selector: WITHDRAW_BOUNDED_SELECTOR,
    nullifier: NULLIFIER,
    noteAmount: GROSS_AMOUNT,
    proofContextShape: overrides.proofContextShape
  });
  const relayerPolicyHash = computeStageBRelayerPolicyHash({
    relayer: ZERO_ADDRESS,
    minNetAmount,
    maxFeeAmount,
    deadlineOrZero: 0n
  });
  const proofContextHash = computeStageBProofContextHash({
    chainId,
    pool,
    selector: WITHDRAW_BOUNDED_SELECTOR,
    root: ROOT,
    nullifier: NULLIFIER,
    destination: DESTINATION,
    grossAmount: GROSS_AMOUNT,
    fee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: 0n,
    proofContextShape: overrides.proofContextShape
  });
  return [
    ...basePublicInputs({ chainId: toBytes32(BigInt(chainId)), pool: addressToBytes32(pool), fee: toBytes32(fee) }),
    proofContextHash,
    encryptedNoteHash
  ] as HexString[];
}

function stageBPublicInputs(overrides: Partial<{
  chainId: number;
  pool: HexString;
  proofSelector: HexString;
  proofContextHash: HexString;
  encryptedNoteHash: HexString;
  relayerPolicy: StageBRelayerPolicy;
  newCommitment: HexString;
  fee: bigint;
  proofContextShape: HexString;
}> = {}): HexString[] {
  const chainId = overrides.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const pool = overrides.pool ?? POOL;
  const selector = overrides.proofSelector ?? PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR;
  const relayerPolicy = overrides.relayerPolicy ?? stageBRelayerPolicy();
  const relayerPolicyHash = computeStageBRelayerPolicyHash(relayerPolicy);
  const encryptedNoteHash = overrides.encryptedNoteHash ?? computeStageBContractBoundEncryptedNoteHash({
    chainId,
    pool,
    selector,
    nullifier: NULLIFIER,
    noteAmount: GROSS_AMOUNT,
    proofContextShape: overrides.proofContextShape
  });
  const proofContextHash = overrides.proofContextHash ?? computeStageBProofContextHash({
    chainId,
    pool,
    selector,
    root: ROOT,
    nullifier: NULLIFIER,
    destination: DESTINATION,
    grossAmount: GROSS_AMOUNT,
    fee: overrides.fee ?? EXPECTED_FEE,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: relayerPolicy.deadlineOrZero,
    proofContextShape: overrides.proofContextShape
  });

  const baseOverrides: Parameters<typeof basePublicInputs>[0] = {
    chainId: toBytes32(BigInt(chainId)),
    pool: addressToBytes32(pool),
    fee: toBytes32(overrides.fee ?? EXPECTED_FEE)
  };
  if (overrides.newCommitment !== undefined) {
    baseOverrides.newCommitment = overrides.newCommitment;
  }

  return [
    ...basePublicInputs(baseOverrides),
    proofContextHash,
    encryptedNoteHash
  ] as HexString[];
}

function stageCPublicInputs(overrides: Partial<{
  chainId: number;
  pool: HexString;
  changeCommitment: HexString;
  grossAmount: bigint;
  noteAmount: bigint;
  encryptedChangeNote: HexString;
  proofContextHash: HexString;
  encryptedNoteHash: HexString;
  relayerPolicy: StageBRelayerPolicy;
  proofContextShape: HexString;
}> = {}): HexString[] {
  const stageCOverrides: Parameters<typeof stageCPreflightInput>[0] = {};
  if (overrides.chainId !== undefined) {
    stageCOverrides.chainId = overrides.chainId;
  }
  if (overrides.pool !== undefined) {
    stageCOverrides.pool = overrides.pool;
  }
  if (overrides.changeCommitment !== undefined) {
    stageCOverrides.changeCommitment = overrides.changeCommitment;
  }
  if (overrides.grossAmount !== undefined) {
    stageCOverrides.grossAmount = overrides.grossAmount;
  }
  if (overrides.noteAmount !== undefined) {
    stageCOverrides.noteAmount = overrides.noteAmount;
  }
  if (overrides.encryptedChangeNote !== undefined) {
    stageCOverrides.encryptedChangeNote = overrides.encryptedChangeNote;
  }
  if (overrides.relayerPolicy !== undefined) {
    stageCOverrides.relayerPolicy = overrides.relayerPolicy;
  }
  if (overrides.proofContextShape !== undefined) {
    stageCOverrides.proofContextShape = overrides.proofContextShape;
  }
  const input = stageCPreflightInput(stageCOverrides);
  const isUnifiedFullExit =
    input.changeAmount === 0n &&
    input.changeCommitment.toLowerCase() === ZERO_BYTES32 &&
    input.encryptedChangeNote.toLowerCase() === "0x";
  const hashes = isUnifiedFullExit
    ? (() => {
        const encryptedNoteHash = computeStageBContractBoundEncryptedNoteHash({
          chainId: input.chainId,
          pool: input.pool,
          selector: input.selector,
          nullifier: input.nullifier,
          noteAmount: input.noteAmount,
          proofContextShape: input.proofContextShape
        });
        const relayerPolicyHash = computeStageBRelayerPolicyHash(input.relayerPolicy);
        const proofContextHash = computeStageBProofContextHash({
          chainId: input.chainId,
          pool: input.pool,
          selector: input.selector,
          root: input.root,
          nullifier: input.nullifier,
          destination: input.destination,
          grossAmount: input.grossAmount,
          fee: input.fee,
          encryptedNoteHash,
          relayerPolicyHash,
          deadlineOrZero: input.relayerPolicy.deadlineOrZero,
          proofContextShape: input.proofContextShape
        });

        return { encryptedNoteHash, relayerPolicyHash, proofContextHash };
      })()
    : computeStageCWithdrawChangeNoteHashes(input);
  const baseOverrides: Parameters<typeof basePublicInputs>[0] = {
    newCommitment: overrides.changeCommitment ?? CHANGE_COMMITMENT,
    grossAmount: toBytes32(input.grossAmount),
    fee: toBytes32(input.fee),
    chainId: toBytes32(BigInt(input.chainId)),
    pool: addressToBytes32(input.pool),
    noteAmount: toBytes32(overrides.noteAmount ?? input.noteAmount)
  };

  return [
    ...basePublicInputs(baseOverrides),
    overrides.proofContextHash ?? hashes.proofContextHash,
    overrides.encryptedNoteHash ?? hashes.encryptedNoteHash
  ] as HexString[];
}

function v12UnlinkablePublicInputs(overrides: Partial<{
  chainId: number;
  pool: HexString;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
  fee: bigint;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
}> = {}): HexString[] {
  const chainId = overrides.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const pool = overrides.pool ?? POOL;
  const fee = overrides.fee ?? EXPECTED_FEE;
  const outputCommitment = overrides.outputCommitment ?? CHANGE_COMMITMENT;
  const encryptedOutputNote = overrides.encryptedOutputNote ?? ENCRYPTED_CHANGE_NOTE;
  const relayerPolicy = stageCContractBoundedRelayerPolicy({
    minNetAmount: overrides.minNetAmount ?? GROSS_AMOUNT - fee,
    maxFeeAmount: overrides.maxFeeAmount ?? fee
  });
  const encryptedOutputNoteHash = computeV12EncryptedOutputNoteHash({
    chainId,
    pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    nullifier: NULLIFIER,
    outputCommitment,
    encryptedOutputNote
  });
  const proofContextHash = computeStageBProofContextHash({
    chainId,
    pool,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root: ROOT,
    nullifier: NULLIFIER,
    destination: DESTINATION,
    grossAmount: GROSS_AMOUNT,
    fee,
    encryptedNoteHash: encryptedOutputNoteHash,
    relayerPolicyHash: computeStageBRelayerPolicyHash(relayerPolicy),
    deadlineOrZero: relayerPolicy.deadlineOrZero,
    proofContextShape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE
  });

  return [
    ROOT,
    NULLIFIER,
    outputCommitment,
    addressToBytes32(DESTINATION),
    toBytes32(GROSS_AMOUNT),
    toBytes32(fee),
    toBytes32(BigInt(chainId)),
    addressToBytes32(pool),
    proofContextHash,
    encryptedOutputNoteHash
  ] as HexString[];
}

function computeV12EncryptedOutputNoteHash(input: {
  chainId: number;
  pool: HexString;
  selector: HexString;
  nullifier: HexString;
  outputCommitment: HexString;
  encryptedOutputNote: HexString;
}): HexString {
  return hashAbiEncodedToField(encodeAbiParameters([
    { type: "bytes32" },
    { type: "uint16" },
    { type: "uint256" },
    { type: "address" },
    { type: "bytes32" },
    { type: "bytes4" },
    { type: "bytes32" },
    { type: "bytes32" },
    { type: "bytes32" }
  ], [
    keccak256(stringToBytes("nullark.encrypted-output-note.v2")),
    2,
    BigInt(input.chainId),
    input.pool,
    PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE,
    input.selector,
    input.nullifier,
    input.outputCommitment,
    keccak256(input.encryptedOutputNote)
  ])) as HexString;
}

function encryptedOutputNoteV2Hex(input: {
  chainId: number;
  verifyingContract: HexString;
  outputCommitment: HexString;
  proofContextHash?: HexString;
  ciphertext: HexString;
}): HexString {
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
      proofContextHash: (input.proofContextHash ?? ZERO_BYTES32).toLowerCase(),
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

function utf8ToHex(value: string): HexString {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

function hexByteLength(value: HexString): number {
  return (value.length - 2) / 2;
}

function stageCPreflightInput(overrides: Partial<{
  chainId: number;
  pool: HexString;
  changeCommitment: HexString;
  grossAmount: bigint;
  noteAmount: bigint;
  encryptedChangeNote: HexString;
  relayerPolicy: StageBRelayerPolicy;
  proofContextShape: HexString;
}> = {}) {
  const grossAmount = overrides.grossAmount ?? GROSS_AMOUNT;
  const fee = (grossAmount * 33n) / 10_000n;
  const noteAmount = overrides.noteAmount ?? NOTE_AMOUNT_WITH_CHANGE;
  return {
    chainId: overrides.chainId ?? MEGAETH_TESTNET_CHAIN_ID,
    pool: overrides.pool ?? POOL,
    selector: STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
    root: ROOT,
    nullifier: NULLIFIER,
    destination: DESTINATION,
    grossAmount,
    fee,
    noteAmount,
    changeCommitment: overrides.changeCommitment ?? CHANGE_COMMITMENT,
    changeAmount: noteAmount - grossAmount,
    encryptedChangeNote: overrides.encryptedChangeNote ?? ENCRYPTED_CHANGE_NOTE,
    relayerPolicy: overrides.relayerPolicy ?? stageCContractBoundedRelayerPolicy(),
    proofContextShape: overrides.proofContextShape
  };
}

function stageBRelayerPolicy(overrides: Partial<StageBRelayerPolicy> = {}): StageBRelayerPolicy {
  return {
    relayer: overrides.relayer ?? RELAYER,
    minNetAmount: overrides.minNetAmount ?? EXPECTED_NET_AMOUNT,
    maxFeeAmount: overrides.maxFeeAmount ?? EXPECTED_FEE,
    deadlineOrZero: overrides.deadlineOrZero ?? BigInt(DEADLINE)
  };
}

function stageCContractBoundedRelayerPolicy(overrides: Partial<StageBRelayerPolicy> = {}): StageBRelayerPolicy {
  return {
    relayer: overrides.relayer ?? ZERO_ADDRESS,
    minNetAmount: overrides.minNetAmount ?? EXPECTED_NET_AMOUNT,
    maxFeeAmount: overrides.maxFeeAmount ?? EXPECTED_FEE,
    deadlineOrZero: overrides.deadlineOrZero ?? 0n
  };
}

function addressToBytes32(address: HexString): HexString {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as HexString;
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}` as HexString;
}

function mutatePublicInput(publicInputs: HexString[], index: number, value: HexString): HexString[] {
  const mutated = [...publicInputs];
  mutated[index] = value;
  return mutated;
}
