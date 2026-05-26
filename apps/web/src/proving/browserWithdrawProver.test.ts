import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateBrowserWithdrawProof,
  parseSolidityCalldataProof,
  proofObjectToBytes,
  proofObjectToCandidateBytes,
  validateV12UnlinkableWithdrawProofIntent,
  validateWithdrawProofIntent
} from "./browserWithdrawProver.js";

const mockedSnarkjs = vi.hoisted(() => ({
  fullProve: vi.fn(),
  exportSolidityCallData: vi.fn()
}));

vi.mock("snarkjs", () => ({
  groth16: {
    fullProve: mockedSnarkjs.fullProve,
    exportSolidityCallData: mockedSnarkjs.exportSolidityCallData
  }
}));

describe("browser withdraw prover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSnarkjs.fullProve.mockResolvedValue({
      proof: {
        pi_a: ["1", "2", "1"],
        pi_b: [
          ["3", "4"],
          ["5", "6"],
          ["1", "0"]
        ],
        pi_c: ["7", "8", "1"]
      },
      publicSignals: [
        "123456789012345678901234567890",
        "10",
        "11",
        "97433442488726861213578988847752201310395502865",
        "10000000000000",
        "33000000000",
        "6343",
        "961952465256178657810387287942384143135767844164",
        "12345",
        "10000000000000",
        "19",
        "20"
      ]
    });
    mockedSnarkjs.exportSolidityCallData.mockResolvedValue(
      `["1","2"],[["3","4"],["5","6"]],["7","8"],${JSON.stringify([
        "123456789012345678901234567890",
        "10",
        "11",
        "97433442488726861213578988847752201310395502865",
        "10000000000000",
        "33000000000",
        "6343",
        "961952465256178657810387287942384143135767844164",
        "12345",
        "10000000000000",
        "19",
        "20"
      ])}`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates proof with browser artifacts and returns encoded proof/public inputs", async () => {
    const result = await generateBrowserWithdrawProof({
      witness: {
        root: "123456789012345678901234567890",
        nullifier: "10"
      },
      wasmUrl: "/proving/withdraw.wasm",
      zkeyUrl: "/proving/withdraw_final.zkey"
    });

    expect(mockedSnarkjs.fullProve).toHaveBeenCalledWith(
      {
        root: "123456789012345678901234567890",
        nullifier: "10"
      },
      "/proving/withdraw.wasm",
      "/proving/withdraw_final.zkey"
    );
    expect(mockedSnarkjs.exportSolidityCallData).not.toHaveBeenCalled();
    expect(result.proof).toMatch(/^0x[0-9a-f]+$/);
    expect(result.proofCandidates).toContain(result.proof);
    expect(result.publicInputs).toHaveLength(12);
    expect(result.publicInputs[0]).toBe(
      "0x00000000000000000000000000000000000000018ee90ff6c373e0ee4e3f0ad2"
    );
    expect(result.publicInputs[6]).toBe("0x00000000000000000000000000000000000000000000000000000000000018c7");
    expect(result.proofGenerationStatus).toBe("browser-groth16-generated");
  });

  it("parses snarkjs solidity calldata into proof bytes and bytes32 public inputs", () => {
    const parsed = parseSolidityCalldataProof(
      '["1","2"],[["3","4"],["5","6"]],["7","8"],["9","10","11","12","13","14","6343","16","17","18","19","20"]'
    );

    expect(parsed.publicInputs).toHaveLength(12);
    expect(parsed.proof).toMatch(/^0x[0-9a-f]+$/);
  });

  it("packs a Groth16 proof object in the same order as snarkjs Solidity calldata", () => {
    const proof = {
      pi_a: ["1", "2", "1"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
        ["1", "0"]
      ],
      pi_c: ["7", "8", "1"]
    };
    const parsed = parseSolidityCalldataProof(
      '["1","2"],[["4","3"],["6","5"]],["7","8"],["9","10","11","12","13","14","6343","16","17","18","19","20"]'
    );

    expect(proofObjectToBytes(proof)).toBe(parsed.proof);
  });

  it("returns unique Groth16 proof byte candidates with Solidity calldata order first", () => {
    const proof = {
      pi_a: ["1", "2", "1"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
        ["1", "0"]
      ],
      pi_c: ["7", "8", "1"]
    };
    const candidates = proofObjectToCandidateBytes(proof);

    expect(candidates).toHaveLength(new Set(candidates).size);
    expect(candidates[0]).toBe(proofObjectToBytes(proof));
    expect(candidates.every((candidate) => candidate.length === 514)).toBe(true);
  });

  it("rejects calldata that does not contain the withdrawal circuit public input shape", () => {
    expect(() =>
      parseSolidityCalldataProof('["1","2"],[["3","4"],["5","6"]],["7","8"],["9","10"]')
    ).toThrow("Withdraw proof must contain 12 public inputs.");
  });

  it("rejects legacy 12-input prover output in explicit v1.2 unlinkable mode", async () => {
    await expect(
      generateBrowserWithdrawProof({
        witness: {
          root: "123456789012345678901234567890",
          nullifier: "10"
        },
        wasmUrl: "/proving/withdraw_v1_2.wasm",
        zkeyUrl: "/proving/withdraw_v1_2_final.zkey",
        publicInputSchema: "v1.2-unlinkable"
      })
    ).rejects.toThrow(/v1\.2 unlinkable|10|spentCommitment|noteAmount|encryptedOutputNoteHash/);
  });

  it("accepts exactly 10 public inputs in explicit v1.2 unlinkable mode", async () => {
    mockedSnarkjs.fullProve.mockResolvedValueOnce({
      proof: {
        pi_a: ["1", "2", "1"],
        pi_b: [
          ["3", "4"],
          ["5", "6"],
          ["1", "0"]
        ],
        pi_c: ["7", "8", "1"]
      },
      publicSignals: [
        "123456789012345678901234567890",
        "10",
        "11",
        "97433442488726861213578988847752201310395502865",
        "10000000000000",
        "33000000000",
        "6343",
        "961952465256178657810387287942384143135767844164",
        "19",
        "20"
      ]
    });

    const result = await generateBrowserWithdrawProof({
      witness: {
        root: "123456789012345678901234567890",
        nullifier: "10"
      },
      wasmUrl: "/proving/withdraw_v1_2.wasm",
      zkeyUrl: "/proving/withdraw_v1_2_final.zkey",
      publicInputSchema: "v1.2-unlinkable"
    });

    expect(result.publicInputs).toHaveLength(10);
    expect(() =>
      validateV12UnlinkableWithdrawProofIntent(result.publicInputs, {
        root: "0x00000000000000000000000000000000000000018ee90ff6c373e0ee4e3f0ad2",
        nullifier: "0x000000000000000000000000000000000000000000000000000000000000000a",
        outputCommitment: "0x000000000000000000000000000000000000000000000000000000000000000b",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10000000000000",
        feeWei: "33000000000",
        chainId: 6343,
        verifyingContract: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
        proofContextHash: "0x0000000000000000000000000000000000000000000000000000000000000013",
        encryptedOutputNoteHash: "0x0000000000000000000000000000000000000000000000000000000000000014"
      })
    ).not.toThrow();
  });

  it("parses v1.2 unlinkable solidity calldata with the 10-input order", () => {
    const parsed = parseSolidityCalldataProof(
      '["1","2"],[["3","4"],["5","6"]],["7","8"],["9","10","11","12","13","14","6343","16","19","20"]',
      { publicInputSchema: "v1.2-unlinkable" }
    );

    expect(parsed.publicInputs).toHaveLength(10);
  });

  it("validates public inputs against the intended withdrawal before wallet confirmation", async () => {
    const result = await generateBrowserWithdrawProof({
      witness: {
        root: "123456789012345678901234567890",
        nullifier: "10"
      },
      wasmUrl: "/proving/withdraw.wasm",
      zkeyUrl: "/proving/withdraw_final.zkey"
    });

    expect(() =>
      validateWithdrawProofIntent(result.publicInputs, {
        root: "0x00000000000000000000000000000000000000018ee90ff6c373e0ee4e3f0ad2",
        nullifier: "0x000000000000000000000000000000000000000000000000000000000000000a",
        changeCommitment: "0x000000000000000000000000000000000000000000000000000000000000000b",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "10000000000000",
        feeWei: "33000000000",
        chainId: 6343,
        pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
        spentCommitment: "0x0000000000000000000000000000000000000000000000000000000000003039",
        noteAmountWei: "10000000000000",
        proofContextHash: "0x0000000000000000000000000000000000000000000000000000000000000013",
        encryptedNoteHash: "0x0000000000000000000000000000000000000000000000000000000000000014"
      })
    ).not.toThrow();

    expect(() =>
      validateWithdrawProofIntent(result.publicInputs, {
        root: "0x00000000000000000000000000000000000000018ee90ff6c373e0ee4e3f0ad2",
        nullifier: "0x000000000000000000000000000000000000000000000000000000000000000a",
        changeCommitment: "0x000000000000000000000000000000000000000000000000000000000000000b",
        destination: "0x1111111111111111111111111111111111111111",
        grossAmountWei: "20000000000000",
        feeWei: "33000000000",
        chainId: 6343,
        pool: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544",
        spentCommitment: "0x0000000000000000000000000000000000000000000000000000000000003039",
        noteAmountWei: "10000000000000",
        proofContextHash: "0x0000000000000000000000000000000000000000000000000000000000000013",
        encryptedNoteHash: "0x0000000000000000000000000000000000000000000000000000000000000014"
      })
    ).toThrow("Withdrawal proof gross amount does not match the intended withdrawal.");
  });

  it("rejects stale withdrawal witnesses before snarkjs hits the circuit fee bound", async () => {
    await expect(
      generateBrowserWithdrawProof({
        witness: {
          grossAmount: "10000000000000",
          fee: "21000000000"
        },
        wasmUrl: "/proving/withdraw.wasm",
        zkeyUrl: "/proving/withdraw_final.zkey",
        expectedFeeBps: 33
      })
    ).rejects.toThrow("Withdrawal witness fee must equal floor(grossAmount * 33 / 10000).");
    expect(mockedSnarkjs.fullProve).not.toHaveBeenCalled();
  });

  it("requires active runtime fee bps before proving fee-bearing witnesses", async () => {
    await expect(
      generateBrowserWithdrawProof({
        witness: {
          grossAmount: "10000000000000",
          fee: "33000000000"
        },
        wasmUrl: "/proving/withdraw.wasm",
        zkeyUrl: "/proving/withdraw_final.zkey"
      })
    ).rejects.toThrow("Withdrawal witness expected fee bps must be provided by the active runtime.");
    expect(mockedSnarkjs.fullProve).not.toHaveBeenCalled();
  });
});
