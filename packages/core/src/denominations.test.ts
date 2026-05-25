import { describe, expect, it } from "vitest";
import {
  assertFixedDenominationPublicExit,
  isSupportedFixedDenomination,
  MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  spendablePublicExitAmountsForNote,
  splitIntoFixedDenominations
} from "./denominations.js";

describe("fixed denomination policy", () => {
  it("splits flexible UI totals into fixed protocol notes", () => {
    const split = splitIntoFixedDenominations(35_000_000_000_000_000n);

    expect(split.notesWei).toEqual([
      30_000_000_000_000_000n,
      5_000_000_000_000_000n
    ]);
    expect(split.noteCount).toBe(2);
    expect(split.uniqueDenominationsWei).toEqual([
      30_000_000_000_000_000n,
      5_000_000_000_000_000n
    ]);
  });

  it("rejects unique dust that would create amount-linkable protocol notes", () => {
    expect(() => splitIntoFixedDenominations(37_000_000_000_000_000n)).toThrow(
      "amountWei has unsupported dust remainder 2000000000000000"
    );
  });

  it("enforces a maximum note count so a flexible amount cannot create unbounded deposits", () => {
    expect(() =>
      splitIntoFixedDenominations(33_000_000_000_000_000n, {
        denominationsWei: [1_000_000_000_000_000n],
        maxNoteCount: 32
      })
    ).toThrow("fixed-denomination split exceeds max note count 32");
  });

  it("recognizes only configured fixed denominations as direct protocol notes", () => {
    expect(isSupportedFixedDenomination(10_000_000_000_000_000n)).toBe(true);
    expect(isSupportedFixedDenomination(11_000_000_000_000_000n)).toBe(false);
    expect(isSupportedFixedDenomination(1_000_000_000_000_000_000n)).toBe(true);
    expect(MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI).toContain(5_000_000_000_000_000n);
    expect(MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI).not.toContain(100_000_000_000_000n);
    expect(MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI).not.toContain(10_000_000_000_000n);
  });

  it("derives public exit amounts that leave spendable private change", () => {
    expect(spendablePublicExitAmountsForNote(10_000_000_000_000_000n)).toEqual([
      10_000_000_000_000_000n,
      5_000_000_000_000_000n
    ]);
    expect(
      spendablePublicExitAmountsForNote(10_000_000_000_000_000n, {
        denominationsWei: MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
        allowFullExit: false
      })
    ).toEqual([5_000_000_000_000_000n]);
    expect(spendablePublicExitAmountsForNote(900_000_000_000_000n)).toEqual([]);
    expect(spendablePublicExitAmountsForNote(50_000_000_000_000_000n)).toContain(20_000_000_000_000_000n);
    expect(spendablePublicExitAmountsForNote(1_000_000_000_000_000_000n)).toContain(500_000_000_000_000_000n);
  });

  it("requires mainnet public exits and private change to use fixed denominations", () => {
    expect(
      assertFixedDenominationPublicExit({
        noteAmountWei: 10_000_000_000_000_000n,
        grossAmountWei: 5_000_000_000_000_000n
      })
    ).toEqual({
      noteAmountWei: 10_000_000_000_000_000n,
      grossAmountWei: 5_000_000_000_000_000n
    });

    expect(() =>
      assertFixedDenominationPublicExit({
        noteAmountWei: 10_000_000_000_000_000n,
        grossAmountWei: 4_000_000_000_000_000n
      })
    ).toThrow("public exit amount must be a supported fixed denomination");

    expect(() =>
      assertFixedDenominationPublicExit({
        noteAmountWei: 11_000_000_000_000_000n,
        grossAmountWei: 11_000_000_000_000_000n
      })
    ).toThrow("public exit note amount must be a supported fixed denomination");

    expect(() =>
      assertFixedDenominationPublicExit({
        noteAmountWei: 50_000_000_000_000_000n,
        grossAmountWei: 10_000_000_000_000_000n
      })
    ).toThrow("public exit private change must be a supported fixed denomination");
  });
});
