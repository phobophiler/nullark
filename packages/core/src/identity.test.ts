import { describe, expect, it } from "vitest";
import { createReceiverIdentity } from "./identity.js";

describe("receiver identity", () => {
  it("creates separate viewing and spending identifiers", () => {
    const identity = createReceiverIdentity("receiver-device");

    expect(identity.viewingKeyId).not.toBe(identity.spendingKeyId);
    expect(identity.serverCanSpend).toBe(false);
    expect(identity.shareableHandle.endsWith(".shield")).toBe(true);
  });

  it("does not allow empty local identity seed", () => {
    expect(() => createReceiverIdentity(" ")).toThrow("device id required");
  });
});
