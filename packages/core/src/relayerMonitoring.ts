export const REQUIRED_RELAYER_MONITORING_ALERTS = [
  "lowBalance",
  "nonceDrift",
  "failedSubmission",
  "revertedProof",
  "rpcMismatch",
  "selectorPolicyDrift"
] as const;

export type RelayerMonitoringAlert = (typeof REQUIRED_RELAYER_MONITORING_ALERTS)[number];

export type RelayerMonitoringStatus = "draft" | "review-ready" | "approved-for-mainnet";

export type RelayerMonitoringRecord = {
  recordVersion: 1;
  status: RelayerMonitoringStatus;
  chainId: number;
  environment: "megaeth-mainnet" | "megaeth-testnet";
  mainnet4326Blocked: boolean;
  ownerApprovalRef?: string;
  deploymentBindingRef: string;
  alertDestinationRef: string;
  alertDestinationBinding: RelayerMonitoringAlertDestinationBinding;
  runbookRef: string;
  alerts: readonly RelayerMonitoringAlertRecord[];
  launchClaims?: RelayerMonitoringLaunchClaims;
  blockedUntil?: readonly string[];
};

export type RelayerMonitoringAlertDestinationBinding = {
  status: "pending-provider-binding" | "provider-bound-owner-approved";
  provider: "pagerduty" | "opsgenie" | "slack" | "email" | "cloudflare-notification" | "other";
  destinationRef: string;
  ownerApprovalRef: string;
  testAlertRef: string;
  escalationPolicyRef: string;
};

export type RelayerMonitoringAlertRecord = {
  type: RelayerMonitoringAlert;
  enabled: boolean;
  severity: "warning" | "critical";
  signal: string;
  threshold: string;
  destinationRef: string;
  runbookRef: string;
};

export type RelayerMonitoringLaunchClaims = {
  approvesRelayerEnablement?: boolean;
  productionRelayerEnabled?: boolean;
  relayersEnabled?: boolean;
  approvesGuardedUsers?: boolean;
  guardedUsersApproved?: boolean;
  approvesPrivacyClaims?: boolean;
  productionPrivacyClaimsApproved?: boolean;
};

export function assertRelayerMonitoringReady(record: RelayerMonitoringRecord): RelayerMonitoringRecord {
  if (record.recordVersion !== 1) {
    throw new Error("unsupported relayer monitoring record version");
  }
  if (record.status === "draft") {
    throw new Error("relayer monitoring record is still draft");
  }
  if (record.status !== "approved-for-mainnet") {
    throw new Error("relayer monitoring record must be approved-for-mainnet");
  }
  if (record.chainId !== 4326 || record.environment !== "megaeth-mainnet") {
    throw new Error("relayer monitoring record must target MegaETH mainnet 4326");
  }
  if (record.mainnet4326Blocked) {
    throw new Error("relayer monitoring record must unblock MegaETH mainnet 4326");
  }
  if ((record.blockedUntil ?? []).length !== 0) {
    throw new Error("relayer monitoring record cannot have remaining blockers");
  }
  assertNoLaunchClaims(record.launchClaims);

  assertOwnerApprovalRef(record.ownerApprovalRef);
  assertPromotionPath(record.deploymentBindingRef, "deployment binding ref");
  assertPromotionPath(record.alertDestinationRef, "alert destination ref");
  assertAlertDestinationBinding(record.alertDestinationBinding, record.alertDestinationRef, record.ownerApprovalRef);
  assertPromotionPath(record.runbookRef, "monitoring runbook ref");

  const byType = new Map<RelayerMonitoringAlert, RelayerMonitoringAlertRecord>();
  for (const alert of record.alerts) {
    if (!REQUIRED_RELAYER_MONITORING_ALERTS.includes(alert.type)) {
      throw new Error(`unknown relayer monitoring alert type: ${alert.type}`);
    }
    if (byType.has(alert.type)) {
      throw new Error(`duplicate relayer monitoring alert type: ${alert.type}`);
    }
    if (!alert.enabled) {
      throw new Error(`relayer monitoring alert ${alert.type} must be enabled`);
    }
    assertAlertSeverity(alert);
    assertSignal(alert.signal, `${alert.type} signal`);
    assertThreshold(alert.threshold, `${alert.type} threshold`);
    assertPromotionPath(alert.destinationRef, `${alert.type} destination ref`);
    assertPromotionPath(alert.runbookRef, `${alert.type} runbook ref`);
    if (alert.destinationRef !== record.alertDestinationRef) {
      throw new Error(`relayer monitoring alert ${alert.type} destination must match the approved alert destination ref`);
    }
    if (alert.runbookRef !== record.runbookRef) {
      throw new Error(`relayer monitoring alert ${alert.type} runbook must match the approved monitoring runbook ref`);
    }
    byType.set(alert.type, alert);
  }

  for (const required of REQUIRED_RELAYER_MONITORING_ALERTS) {
    if (!byType.has(required)) {
      throw new Error(`relayer monitoring record missing alert: ${required}`);
    }
  }

  return record;
}

function assertNoLaunchClaims(claims: RelayerMonitoringLaunchClaims | undefined): void {
  if (claims?.approvesRelayerEnablement === true || claims?.productionRelayerEnabled === true || claims?.relayersEnabled === true) {
    throw new Error("relayer monitoring record cannot approve or imply relayer enablement");
  }
  if (
    claims?.approvesGuardedUsers === true ||
    claims?.guardedUsersApproved === true ||
    claims?.approvesPrivacyClaims === true ||
    claims?.productionPrivacyClaimsApproved === true
  ) {
    throw new Error("relayer monitoring record cannot approve guarded users or production privacy claims");
  }
}

function assertAlertDestinationBinding(
  binding: RelayerMonitoringAlertDestinationBinding,
  alertDestinationRef: string,
  ownerApprovalRef: string
): void {
  if (!binding || binding.status !== "provider-bound-owner-approved") {
    throw new Error("relayer monitoring alert destination must be provider-bound and owner-approved");
  }
  if (!["pagerduty", "opsgenie", "slack", "email", "cloudflare-notification", "other"].includes(binding.provider)) {
    throw new Error("relayer monitoring alert destination provider must be explicit");
  }
  assertPromotionPath(binding.destinationRef, "alert destination binding ref");
  if (binding.destinationRef !== alertDestinationRef) {
    throw new Error("relayer monitoring alert destination binding must match the approved alert destination ref");
  }
  assertOwnerApprovalRef(binding.ownerApprovalRef);
  if (binding.ownerApprovalRef !== ownerApprovalRef) {
    throw new Error("relayer monitoring alert destination owner approval must match the monitoring owner approval ref");
  }
  assertPromotionPath(binding.testAlertRef, "alert destination test ref");
  assertPromotionPath(binding.escalationPolicyRef, "alert destination escalation policy ref");
}

function assertAlertSeverity(alert: RelayerMonitoringAlertRecord): void {
  if (alert.type === "lowBalance") {
    if (alert.severity !== "warning" && alert.severity !== "critical") {
      throw new Error("relayer monitoring lowBalance severity must be warning or critical");
    }
    return;
  }

  if (alert.severity !== "critical") {
    throw new Error(`relayer monitoring alert ${alert.type} must be critical`);
  }
}

function assertSignal(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  if (!/^relayer\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/i.test(value)) {
    throw new Error(`relayer monitoring record requires metric-style ${label}`);
  }
}

function assertThreshold(value: string, label: string): void {
  assertNonPlaceholder(value, label);
  if (!/\d/.test(value)) {
    throw new Error(`relayer monitoring record requires measurable ${label}`);
  }
}

function assertPromotionPath(value: string | undefined, label: string): asserts value is string {
  assertNonPlaceholder(value, label);
  const lower = value.toLowerCase();
  if (/(local|untrusted|sandbox|replace-me|placeholder|pending|todo|tbd|\/tmp\/|\.\.)/.test(lower)) {
    throw new Error(`relayer monitoring record ${label} cannot reference placeholder or local artifacts`);
  }
  if (/(^|[./-])(draft|review-ready)([./-]|$)/.test(lower)) {
    throw new Error(`relayer monitoring record ${label} cannot reference draft or review-ready evidence`);
  }
}

function assertOwnerApprovalRef(value: string | undefined): asserts value is string {
  assertPromotionPath(value, "owner approval ref");
  if (!isPrivateOwnerApprovalRef(value) && !/^docs\/evidence\/owner-approval\/.+/i.test(value)) {
    throw new Error("relayer monitoring owner approval ref must live under docs/evidence/owner-approval");
  }
}

function isPrivateOwnerApprovalRef(value: string | undefined): boolean {
  return value === "private-owner-approval-record-not-in-public-repo" || /^private-owner-approval-records\/.+/i.test(value ?? "");
}

function assertNonPlaceholder(value: string | undefined, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || /(replace-me|placeholder|pending|todo|tbd|dummy|sample|example)/i.test(value)) {
    throw new Error(`relayer monitoring record requires valid ${label}`);
  }
}
