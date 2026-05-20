import { describe, expect, it } from "vitest";
import { assertNoOverDisclosure, createDisclosureReceipt, type DisclosureSubject } from "./selectiveDisclosure.js";

const subject: DisclosureSubject = {
  amount: 123n,
  destination: "0x4444444444444444444444444444444444444444",
  nullifierHash: "0xaaa",
  commitment: "0xbbb",
  timestamp: 1_000
};

describe("selective disclosure policy", () => {
  it("creates a minimal receipt with only requested fields", () => {
    const receipt = createDisclosureReceipt(subject, ["amount", "commitment"]);

    expect(receipt).toEqual({
      receiptVersion: 1,
      requestedFields: ["amount", "commitment"],
      revealed: {
        amount: 123n,
        commitment: "0xbbb"
      }
    });
    expect("destination" in receipt.revealed).toBe(false);
    expect("nullifierHash" in receipt.revealed).toBe(false);
  });

  it("deduplicates requested fields deterministically", () => {
    expect(createDisclosureReceipt(subject, ["amount", "amount", "timestamp"]).requestedFields).toEqual(["amount", "timestamp"]);
  });

  it("rejects over-disclosure against the requested field set", () => {
    expect(() => assertNoOverDisclosure(["amount"], ["amount", "destination"])).toThrow(
      "over-disclosure rejected: destination"
    );
    expect(() => assertNoOverDisclosure(["amount", "destination"], ["amount"])).not.toThrow();
  });

  it("rejects empty disclosures and invalid subjects", () => {
    expect(() => createDisclosureReceipt(subject, [])).toThrow("at least one disclosure field required");
    expect(() => createDisclosureReceipt({ ...subject, amount: -1n }, ["amount"])).toThrow("amount must be a nonnegative bigint");
    expect(() => createDisclosureReceipt({ ...subject, commitment: "" as DisclosureSubject["commitment"] }, ["commitment"])).toThrow(
      "commitment must be a nonempty hex-like string"
    );
  });
});
