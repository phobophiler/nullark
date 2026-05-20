import { describe, expect, it } from "vitest";
import { classifyPoolEvent } from "./events.js";

describe("pool events", () => {
  it("classifies events as discovery data, not balance authority", () => {
    const event = classifyPoolEvent({ name: "PrivateTransferCommitmentInserted" });
    expect(event.authoritativeForBalance).toBe(false);
    expect(event.kind).toBe("private-transfer");
  });
});
