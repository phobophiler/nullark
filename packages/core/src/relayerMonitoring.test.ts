import { describe, expect, it } from "vitest";
import {
  REQUIRED_RELAYER_MONITORING_ALERTS,
  assertRelayerMonitoringReady,
  type RelayerMonitoringRecord
} from "./relayerMonitoring.js";

const record: RelayerMonitoringRecord = {
  recordVersion: 1,
  status: "approved-for-mainnet",
  chainId: 4326,
  environment: "megaeth-mainnet",
  mainnet4326Blocked: false,
  ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
  deploymentBindingRef: "docs/evidence/mainnet-readiness/relayer-deployment-binding.md",
  alertDestinationRef: "docs/evidence/mainnet-readiness/relayer-alert-destinations.md",
  alertDestinationBinding: {
    status: "provider-bound-owner-approved",
    provider: "pagerduty",
    destinationRef: "docs/evidence/mainnet-readiness/relayer-alert-destinations.md",
    ownerApprovalRef: "private-owner-approval-record-not-in-public-repo",
    testAlertRef: "docs/evidence/mainnet-readiness/relayer-alert-destination-test.approved.json",
    escalationPolicyRef: "docs/evidence/mainnet-readiness/relayer-alert-escalation-policy.approved.md"
  },
  runbookRef: "docs/evidence/mainnet-readiness/relayer-monitoring-runbook.md",
  alerts: REQUIRED_RELAYER_MONITORING_ALERTS.map((type) => ({
    type,
    enabled: true,
    severity: type === "lowBalance" ? "warning" : "critical",
    signal: `relayer.${type}`,
    threshold: "1 event in 5 minutes",
    destinationRef: "docs/evidence/mainnet-readiness/relayer-alert-destinations.md",
    runbookRef: "docs/evidence/mainnet-readiness/relayer-monitoring-runbook.md"
  })),
  blockedUntil: []
};

describe("relayer monitoring readiness gate", () => {
  it("accepts a complete owner-approved mainnet monitoring record", () => {
    expect(assertRelayerMonitoringReady(record)).toBe(record);
  });

  it("rejects draft blocked or non-mainnet records", () => {
    expect(() => assertRelayerMonitoringReady({ ...record, status: "draft" })).toThrow(
      "relayer monitoring record is still draft"
    );
    expect(() => assertRelayerMonitoringReady({ ...record, status: "review-ready" })).toThrow(
      "relayer monitoring record must be approved-for-mainnet"
    );
    expect(() => assertRelayerMonitoringReady({ ...record, mainnet4326Blocked: true })).toThrow(
      "relayer monitoring record must unblock MegaETH mainnet 4326"
    );
    expect(() => assertRelayerMonitoringReady({ ...record, chainId: 6343 })).toThrow(
      "relayer monitoring record must target MegaETH mainnet 4326"
    );
  });

  it("requires every production alert to be present and enabled", () => {
    expect(() => assertRelayerMonitoringReady({ ...record, alerts: record.alerts.slice(1) })).toThrow(
      "relayer monitoring record missing alert: lowBalance"
    );
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.filter((alert) => alert.type !== "selectorPolicyDrift")
      })
    ).toThrow("relayer monitoring record missing alert: selectorPolicyDrift");
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) => (alert.type === "nonceDrift" ? { ...alert, enabled: false } : alert))
      })
    ).toThrow("relayer monitoring alert nonceDrift must be enabled");
  });

  it("rejects placeholder destinations and runbooks", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) =>
          alert.type === "failedSubmission" ? { ...alert, destinationRef: "replace-me" } : alert
        )
      })
    ).toThrow("relayer monitoring record requires valid failedSubmission destination ref");
  });

  it("requires a provider-bound owner-approved alert destination", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alertDestinationBinding: { ...record.alertDestinationBinding, status: "pending-provider-binding" }
      })
    ).toThrow("relayer monitoring alert destination must be provider-bound and owner-approved");
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alertDestinationBinding: { ...record.alertDestinationBinding, testAlertRef: "replace-me" }
      })
    ).toThrow("relayer monitoring record requires valid alert destination test ref");
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alertDestinationBinding: {
          ...record.alertDestinationBinding,
          destinationRef: "docs/evidence/mainnet-readiness/alternate-alert-destination.md"
        }
      })
    ).toThrow("relayer monitoring alert destination binding must match the approved alert destination ref");
  });

  it("rejects draft evidence refs and unapproved owner approval refs", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        ownerApprovalRef: "docs/evidence/mainnet-readiness/mainnet-relayer-monitoring.md"
      })
    ).toThrow("relayer monitoring owner approval ref must live under docs/evidence/owner-approval");
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        deploymentBindingRef: "docs/evidence/mainnet-readiness/relayer-ops-record.draft.json"
      })
    ).toThrow("relayer monitoring record deployment binding ref cannot reference draft or review-ready evidence");
  });

  it("requires critical severities and measurable metric thresholds", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) => (alert.type === "rpcMismatch" ? { ...alert, severity: "warning" } : alert))
      })
    ).toThrow("relayer monitoring alert rpcMismatch must be critical");

    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) => (alert.type === "revertedProof" ? { ...alert, threshold: "documented threshold" } : alert))
      })
    ).toThrow("relayer monitoring record requires measurable revertedProof threshold");
  });

  it("binds every alert to the approved destination and runbook", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) =>
          alert.type === "failedSubmission"
            ? { ...alert, destinationRef: "docs/evidence/mainnet-readiness/alternate-alert-destination.md" }
            : alert
        )
      })
    ).toThrow("relayer monitoring alert failedSubmission destination must match the approved alert destination ref");

    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) =>
          alert.type === "nonceDrift"
            ? { ...alert, runbookRef: "docs/evidence/mainnet-readiness/alternate-monitoring-runbook.md" }
            : alert
        )
      })
    ).toThrow("relayer monitoring alert nonceDrift runbook must match the approved monitoring runbook ref");
  });

  it("requires metric-style relayer signals", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) => (alert.type === "lowBalance" ? { ...alert, signal: "replace-me" } : alert))
      })
    ).toThrow("relayer monitoring record requires valid lowBalance signal");

    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        alerts: record.alerts.map((alert) => (alert.type === "lowBalance" ? { ...alert, signal: "wallet balance low" } : alert))
      })
    ).toThrow("relayer monitoring record requires metric-style lowBalance signal");
  });

  it("rejects monitoring records that imply guarded-user or production privacy approval", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        launchClaims: {
          approvesGuardedUsers: true,
          approvesPrivacyClaims: false
        }
      } as RelayerMonitoringRecord)
    ).toThrow("relayer monitoring record cannot approve guarded users or production privacy claims");

    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        launchClaims: {
          approvesGuardedUsers: false,
          productionPrivacyClaimsApproved: true
        }
      } as RelayerMonitoringRecord)
    ).toThrow("relayer monitoring record cannot approve guarded users or production privacy claims");
  });

  it("rejects monitoring records that imply relayer enablement", () => {
    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        launchClaims: {
          productionRelayerEnabled: true,
          relayersEnabled: false
        }
      } as RelayerMonitoringRecord)
    ).toThrow("relayer monitoring record cannot approve or imply relayer enablement");

    expect(() =>
      assertRelayerMonitoringReady({
        ...record,
        launchClaims: {
          approvesRelayerEnablement: true
        }
      } as RelayerMonitoringRecord)
    ).toThrow("relayer monitoring record cannot approve or imply relayer enablement");
  });
});
