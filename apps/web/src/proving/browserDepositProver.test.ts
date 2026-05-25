import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateBrowserDepositProof } from "./browserDepositProver.js";
import type { HexString } from "../product/shieldedTransfersHelpers.js";

const mockedSnarkjs = vi.hoisted(() => ({
  fullProve: vi.fn()
}));

vi.mock("snarkjs", () => ({
  groth16: {
    fullProve: mockedSnarkjs.fullProve
  }
}));

describe("browser deposit prover", () => {
  const commitment = "0x0d1492c034698ab1acb66c38bfee13aa7487d77b3a388e4b91c46aad85325043" as const;
  const pool = "0xEc61D863700DeF260E7BABA634FAa24AEC81f29e" as const;
  const assetId = `0x${"00".repeat(31)}01` as HexString;
  const ownerCommitment = `0x${"02".repeat(32)}` as HexString;
  const noteSecret = `0x${"03".repeat(32)}` as HexString;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSnarkjs.fullProve.mockImplementation((witness: Record<string, string>) =>
      Promise.resolve({
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
          witness.commitment,
          witness.amount,
          witness.chainId,
          witness.verifyingContract,
          witness.expectedDepositContextHash,
          witness.expectedEncryptedDepositNoteHash
        ]
      })
    );
  });

  it("builds the v1.2 deposit witness and returns proof-bound public inputs", async () => {
    const result = await generateBrowserDepositProof({
      commitment,
      amountWei: "5000000000000000",
      chainId: 6343,
      pool,
      assetId,
      ownerCommitment,
      noteSecret,
      encryptedNote: "0x010203",
      wasmUrl: "/proving/deposit.wasm",
      zkeyUrl: "/proving/deposit_final.zkey"
    });

    expect(mockedSnarkjs.fullProve).toHaveBeenCalledWith(
      expect.objectContaining({
        commitment: BigInt(commitment).toString(),
        amount: "5000000000000000",
        chainId: "6343",
        verifyingContract: BigInt(pool).toString(),
        assetId: BigInt(assetId).toString(),
        ownerCommitment: BigInt(ownerCommitment).toString(),
        noteSecret: BigInt(noteSecret).toString(),
        expectedChainId: "6343",
        expectedVerifyingContract: BigInt(pool).toString()
      }),
      "/proving/deposit.wasm",
      "/proving/deposit_final.zkey"
    );
    expect(result.proof).toMatch(/^0x[0-9a-f]+$/);
    expect(result.proofCandidates).toContain(result.proof);
    expect(result.publicInputs).toHaveLength(6);
    expect(result.publicInputs[0]).toBe(commitment);
    expect(result.publicInputs[1]).toBe("0x0000000000000000000000000000000000000000000000000011c37937e08000");
    expect(result.publicInputs[2]).toBe("0x00000000000000000000000000000000000000000000000000000000000018c7");
    expect(result.publicInputs[3]).toBe(`0x${pool.slice(2).toLowerCase().padStart(64, "0")}`);
    expect(result.depositContextHash).toBe(result.publicInputs[4]);
    expect(result.encryptedDepositNoteHash).toBe(result.publicInputs[5]);
  });

  it("uses production deposit artifact paths by default", async () => {
    await generateBrowserDepositProof({
      commitment,
      amountWei: "5000000000000000",
      chainId: 4326,
      pool,
      assetId,
      ownerCommitment,
      noteSecret,
      encryptedNote: "0x010203"
    });

    expect(mockedSnarkjs.fullProve).toHaveBeenCalledWith(
      expect.any(Object),
      "/proving/deposit.wasm",
      "/proving/deposit_final.zkey"
    );
  });

  it("rejects deposit public signals that are not bound to the prepared deposit", async () => {
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
      publicSignals: ["1", "2", "3", "4", "5", "6"]
    });

    await expect(
      generateBrowserDepositProof({
        commitment,
        amountWei: "5000000000000000",
        chainId: 6343,
        pool,
        assetId,
        ownerCommitment,
        noteSecret,
        encryptedNote: "0x010203"
      })
    ).rejects.toThrow("v1.2 deposit proof public inputs do not match the prepared deposit.");
  });
});
