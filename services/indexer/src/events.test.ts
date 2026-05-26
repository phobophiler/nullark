import { describe, expect, it } from "vitest";
import { classifyPoolEvent } from "./events.js";

describe("pool events", () => {
  it("classifies events as discovery data, not balance authority", () => {
    const event = classifyPoolEvent({ name: "PrivateTransferCommitmentInserted" });
    expect(event.authoritativeForBalance).toBe(false);
    expect(event.kind).toBe("private-transfer");
  });

  it("classifies v1.2 unlinkable withdrawal output-note events explicitly", () => {
    const event = classifyPoolEvent({ name: "WithdrawalOutputNoteCreated" });
    expect(event.authoritativeForBalance).toBe(false);
    expect(event.kind).toBe("withdrawal-output-note");
  });
});
