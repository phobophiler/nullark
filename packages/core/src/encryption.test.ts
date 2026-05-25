import { describe, expect, it } from "vitest";
import { decryptBackup, encryptForBackup } from "./encryption.js";

describe("encrypted backup helper", () => {
  it("round trips backup data without exposing plaintext in storage", () => {
    const blob = encryptForBackup("view_123", "secret-note-state");

    expect(blob.ciphertext).not.toContain("secret-note-state");
    expect(decryptBackup(blob, "view_123")).toBe("secret-note-state");
  });

  it("rejects the wrong key", () => {
    const blob = encryptForBackup("view_123", "secret-note-state");
    expect(() => decryptBackup(blob, "view_456")).toThrow("backup key mismatch");
  });
});
