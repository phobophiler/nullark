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
});
