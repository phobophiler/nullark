import { describe, expect, it } from "vitest";
import { createFreshnessTracker, observeEventLatency } from "./freshness.js";

describe("freshness tracker", () => {
  it("records observed latency by event type", () => {
    const tracker = createFreshnessTracker();
    observeEventLatency(tracker, {
      eventType: "deposit-note",
      transactionSubmittedAtMs: 1_000,
      eventObservedAtMs: 1_085,
      blockNumber: 100n
    });

    expect(tracker.latest.depositNote).toMatchObject({
      latencyMs: 85,
      blockNumber: 100n
    });
  });

  it("records v1.2 withdrawal output-note freshness without using the change-note bucket", () => {
    const tracker = createFreshnessTracker();
    observeEventLatency(tracker, {
      eventType: "output-note",
      transactionSubmittedAtMs: 2_000,
      eventObservedAtMs: 2_144,
      blockNumber: 101n
    });

    expect(tracker.latest.outputNote).toMatchObject({
      latencyMs: 144,
      blockNumber: 101n
    });
    expect(tracker.latest.changeNote).toBeNull();
  });
});
