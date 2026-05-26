import { describe, expect, it } from "vitest";
import { assertPoolSolvent, derivePrivateBalance, markSpent, type ShieldedNote } from "./notes.js";

const notes: ShieldedNote[] = [
  { commitment: "0xaaa", nullifier: "0x111", ownerViewingKeyId: "view_a", amount: 500n, spent: false },
  { commitment: "0xbbb", nullifier: "0x222", ownerViewingKeyId: "view_a", amount: 700n, spent: false },
  { commitment: "0xccc", nullifier: "0x333", ownerViewingKeyId: "view_b", amount: 900n, spent: false },
  { commitment: "0xddd", nullifier: "0x444", ownerViewingKeyId: "view_a", amount: 300n, spent: true }
];

describe("note balance derivation", () => {
  it("derives balance only from owned unspent notes", () => {
    expect(derivePrivateBalance(notes, "view_a")).toBe(1_200n);
  });

  it("marks a nullifier spent without mutating other notes", () => {
    const updated = markSpent(notes, "0x222");
    expect(derivePrivateBalance(updated, "view_a")).toBe(500n);
    expect(derivePrivateBalance(notes, "view_a")).toBe(1_200n);
  });

  it("checks pool solvency including unswept fees", () => {
    expect(
      assertPoolSolvent(
        { deposited: 2_000n, withdrawnNet: 500n, accruedProtocolFees: 100n, feeSweptAccounting: 25n },
        1_425n
      )
    ).toBe(true);
  });
});
