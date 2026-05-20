export type RecoveryMode = "local-backup" | "service-assisted-viewing" | "custodial-service";

export type RecoveryModeLabel =
  | "local encrypted backup"
  | "service-assisted viewing recovery"
  | "blocked custodial recovery";

export type EncryptedBackupMetadata = {
  backupId: string;
  encryptionScheme: string;
  ciphertextRef: string;
  createdAtMs: number;
  viewingKeyId?: string;
  includesViewingKey: boolean;
  includesSpendingKey?: boolean;
  serviceStoresSpendingKey?: boolean;
  serviceCanDecrypt?: boolean;
};

export type BackupMetadataValidation = {
  valid: boolean;
  modeLabel: RecoveryModeLabel;
  errors: string[];
  warnings: string[];
};

export function validateEncryptedBackupMetadata(metadata: EncryptedBackupMetadata): BackupMetadataValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (metadata.backupId.trim().length === 0) {
    errors.push("backupId required");
  }

  if (metadata.encryptionScheme.trim().length === 0) {
    errors.push("encryptionScheme required");
  }

  if (metadata.ciphertextRef.trim().length === 0) {
    errors.push("ciphertextRef required");
  }

  if (!Number.isSafeInteger(metadata.createdAtMs) || metadata.createdAtMs < 0) {
    errors.push("createdAtMs must be a nonnegative safe integer");
  }

  if (metadata.includesSpendingKey) {
    errors.push("encrypted backups must not include spending keys");
  }

  if (metadata.serviceStoresSpendingKey) {
    errors.push("services must not store spending keys");
  }

  if (metadata.serviceCanDecrypt) {
    errors.push("services must not be able to decrypt recovery backups");
  }

  if (!metadata.includesViewingKey && metadata.viewingKeyId === undefined) {
    warnings.push("backup does not advertise viewing-key recovery");
  }

  return {
    valid: errors.length === 0,
    modeLabel: recoveryModeLabel(metadata.serviceCanDecrypt || metadata.serviceStoresSpendingKey ? "custodial-service" : "local-backup"),
    errors,
    warnings
  };
}

export function recoveryModeLabel(mode: RecoveryMode): RecoveryModeLabel {
  if (mode === "local-backup") {
    return "local encrypted backup";
  }

  if (mode === "service-assisted-viewing") {
    return "service-assisted viewing recovery";
  }

  return "blocked custodial recovery";
}
