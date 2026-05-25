import { describe, expect, it } from "vitest";
import { evaluateAnonymitySet, isEligibleAnonymityNote, type AnonymitySetNote, type AnonymitySetPolicy } from "./anonymity.js";

const nowMs = 10_000;
const policy: AnonymitySetPolicy = {
  minEligibleCommitments: 3,
  minUniqueDepositors: 2,
  minAgeMs: 1_000,
  windowMs: 8_000
};

const notes: AnonymitySetNote[] = [
  { commitment: "0xaaa", depositorId: "alice", depositedAtMs: 8_000 },
  { commitment: "0xbbb", depositorId: "bob", depositedAtMs: 7_000 },
  { commitment: "0xccc", depositorId: "alice", depositedAtMs: 6_000 },
  { commitment: "0xddd", depositorId: "carol", depositedAtMs: 9_500 },
  { commitment: "0xeee", depositorId: "fixture", depositedAtMs: 5_000, internalFixture: true },
  { commitment: "0xfff", depositorId: "dave", depositedAtMs: 5_000, spent: true },
  { commitment: "0x111", depositorId: "erin", depositedAtMs: 1_000 }
];

describe("anonymity set policy", () => {
  it("selects eligible notes by fixture, spent, age, and window rules", () => {
    expect(evaluateAnonymitySet(notes, policy, nowMs)).toEqual({
      eligibleCommitments: ["0xaaa", "0xbbb", "0xccc"],
      eligibleNoteCount: 3,
      uniqueDepositorCount: 2,
      thresholdMet: true,
      warnings: []
    });
  });

  it("reports below-threshold warnings without claiming privacy readiness", () => {
    const result = evaluateAnonymitySet(notes.slice(0, 2), policy, nowMs);

    expect(result.thresholdMet).toBe(false);
    expect(result.warnings).toEqual(["anonymity set below commitment threshold: 2/3 eligible commitments"]);
  });

  it("counts unique depositors separately from eligible commitment count", () => {
    const result = evaluateAnonymitySet([notes[0]!, notes[2]!], { ...policy, minEligibleCommitments: 2 }, nowMs);

    expect(result.eligibleNoteCount).toBe(2);
    expect(result.uniqueDepositorCount).toBe(1);
    expect(result.thresholdMet).toBe(false);
    expect(result.warnings).toEqual(["anonymity set below depositor threshold: 1/2 unique depositors"]);
  });

  it("rejects invalid policy and note metadata", () => {
    expect(() => evaluateAnonymitySet(notes, { ...policy, minEligibleCommitments: 0 }, nowMs)).toThrow(
      "minEligibleCommitments must be a positive safe integer"
    );
    expect(() => isEligibleAnonymityNote({ ...notes[0]!, depositorId: " " }, policy, nowMs)).toThrow("depositorId required");
    expect(() => evaluateAnonymitySet(notes, { ...policy, windowMs: 999 }, nowMs)).toThrow(
      "windowMs must be a safe integer greater than or equal to minAgeMs"
    );
  });
});
