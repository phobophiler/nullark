import { describe, expect, it } from "vitest";
import { recoveryModeLabel, validateEncryptedBackupMetadata, type EncryptedBackupMetadata } from "./recovery.js";

const validBackup: EncryptedBackupMetadata = {
  backupId: "backup_1",
  encryptionScheme: "xchacha20-poly1305-client-key",
  ciphertextRef: "local://device-backup/1",
  createdAtMs: 1_000,
  viewingKeyId: "view_123",
  includesViewingKey: true
};

describe("recovery backup policy", () => {
  it("validates encrypted backup metadata without claiming server spend authority", () => {
    expect(validateEncryptedBackupMetadata(validBackup)).toEqual({
      valid: true,
      modeLabel: "local encrypted backup",
      errors: [],
      warnings: []
    });
  });

  it("rejects spending keys in backups or services", () => {
    const result = validateEncryptedBackupMetadata({
      ...validBackup,
      includesSpendingKey: true,
      serviceStoresSpendingKey: true,
      serviceCanDecrypt: true
    });

    expect(result.valid).toBe(false);
    expect(result.modeLabel).toBe("blocked custodial recovery");
    expect(result.errors).toEqual([
      "encrypted backups must not include spending keys",
      "services must not store spending keys",
      "services must not be able to decrypt recovery backups"
    ]);
  });

  it("labels recovery modes for UX copy without changing security policy", () => {
    expect(recoveryModeLabel("local-backup")).toBe("local encrypted backup");
    expect(recoveryModeLabel("service-assisted-viewing")).toBe("service-assisted viewing recovery");
    expect(recoveryModeLabel("custodial-service")).toBe("blocked custodial recovery");
  });

  it("reports missing metadata and non-viewing backups", () => {
    const result = validateEncryptedBackupMetadata({
      backupId: " ",
      encryptionScheme: "",
      ciphertextRef: "",
      createdAtMs: -1,
      includesViewingKey: false
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      "backupId required",
      "encryptionScheme required",
      "ciphertextRef required",
      "createdAtMs must be a nonnegative safe integer"
    ]);
    expect(result.warnings).toEqual(["backup does not advertise viewing-key recovery"]);
  });
});
