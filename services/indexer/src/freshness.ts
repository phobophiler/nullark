export type FreshnessEventType = "deposit-note" | "root" | "nullifier" | "change-note";

export type FreshnessObservation = {
  eventType: FreshnessEventType;
  transactionSubmittedAtMs: number;
  eventObservedAtMs: number;
  blockNumber: bigint;
};

export type FreshnessMetric = {
  latencyMs: number;
  blockNumber: bigint;
  observedAtMs: number;
};

export type FreshnessTracker = {
  latest: {
    depositNote: FreshnessMetric | null;
    root: FreshnessMetric | null;
    nullifier: FreshnessMetric | null;
    changeNote: FreshnessMetric | null;
  };
};

export function createFreshnessTracker(): FreshnessTracker {
  return {
    latest: {
      depositNote: null,
      root: null,
      nullifier: null,
      changeNote: null
    }
  };
}

export function observeEventLatency(tracker: FreshnessTracker, observation: FreshnessObservation): void {
  const metric = {
    latencyMs: observation.eventObservedAtMs - observation.transactionSubmittedAtMs,
    blockNumber: observation.blockNumber,
    observedAtMs: observation.eventObservedAtMs
  };
  if (observation.eventType === "deposit-note") {
    tracker.latest.depositNote = metric;
  } else if (observation.eventType === "root") {
    tracker.latest.root = metric;
  } else if (observation.eventType === "nullifier") {
    tracker.latest.nullifier = metric;
  } else {
    tracker.latest.changeNote = metric;
  }
}
