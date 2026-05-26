import { describe, expect, it } from "vitest";
import { computeAnonymitySetSummary, toUiAnonymitySummary, type AnonymityEvent } from "./anonymity.js";

describe("indexer anonymity helpers", () => {
  it("computes eligible anonymity-set counts from commitment events without balance authority", () => {
    const events: AnonymityEvent[] = [
      { kind: "deposit", commitment: "note-1", blockNumber: 1, transactionHash: "0xaaa", amount: 10n },
      { kind: "private-transfer", commitment: "note-2", blockNumber: 2, transactionHash: "0xbbb", account: "0xuser" },
      { kind: "nullifier", nullifier: "spent-1", blockNumber: 3, transactionHash: "0xccc" },
      { kind: "withdrawal", blockNumber: 4, transactionHash: "0xddd", amount: 5n },
      { kind: "fees-accrued" }
    ];

    expect(computeAnonymitySetSummary(events)).toEqual({
      eligibleCommitmentCount: 2,
      depositCommitmentCount: 1,
      privateTransferCommitmentCount: 1,
      spentNullifierCount: 1,
      withdrawalCount: 1,
      authoritativeForBalance: false,
      claim: "count-only-anonymity-set"
    });
  });

  it("minimizes UI metadata to count and non-authority claim only", () => {
    const summary = computeAnonymitySetSummary([
      { kind: "deposit", commitment: "note-1", transactionHash: "0xaaa", logIndex: 0 },
      { kind: "private-transfer", commitment: "note-2", transactionHash: "0xbbb", logIndex: 1 }
    ]);

    expect(toUiAnonymitySummary(summary)).toEqual({
      eligibleCommitmentCount: 2,
      authoritativeForBalance: false,
      claim: "count-only-anonymity-set"
    });
    expect(Object.keys(toUiAnonymitySummary(summary)).sort()).toEqual([
      "authoritativeForBalance",
      "claim",
      "eligibleCommitmentCount"
    ]);
  });
});
