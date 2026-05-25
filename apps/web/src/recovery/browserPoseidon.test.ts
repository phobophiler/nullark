import { describe, expect, it } from "vitest";
import { deriveBrowserNoteCommitment, deriveBrowserNullifier } from "./browserPoseidon.js";

const deterministicField = `0x02${"22".repeat(31)}` as const;

describe("browser Poseidon helpers", () => {
  it("matches the circuit note commitment formula", async () => {
    await expect(
      deriveBrowserNoteCommitment({
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "123456789000000000",
        ownerCommitment: deterministicField,
        noteSecret: deterministicField
      })
    ).resolves.toBe("0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb");
  });

  it("matches the circuit nullifier formula with chain and pool binding", async () => {
    const nullifier = await deriveBrowserNullifier({
      noteSecret: deterministicField,
      leafIndex: 7,
      chainId: 6343,
      verifyingContract: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544"
    });
    const differentChain = await deriveBrowserNullifier({
      noteSecret: deterministicField,
      leafIndex: 7,
      chainId: 1,
      verifyingContract: "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544"
    });

    expect(nullifier).toBe("0x1503e196e7ef09a03280c9b78327ced1658f56358bfbf039a52d8f94c2bb8e3b");
    expect(differentChain).not.toBe(nullifier);
  });
});
