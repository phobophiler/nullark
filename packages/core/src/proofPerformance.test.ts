import { describe, expect, it } from "vitest";
import { classifyProvingMode } from "./proofPerformance.js";

describe("proof performance UX policy", () => {
  it("classifies local desktop proving as allowed", () => {
    expect(
      classifyProvingMode({
        kind: "local",
        witnessLeavesDevice: false,
        spendingKeyLeavesDevice: false,
        estimatedProvingMs: 8_000
      })
    ).toEqual({
      uxClass: "desktop-local",
      allowed: true,
      warnings: [],
      errors: []
    });
  });

  it("classifies mobile proving with a long-running UX warning", () => {
    expect(
      classifyProvingMode({
        kind: "mobile",
        witnessLeavesDevice: false,
        spendingKeyLeavesDevice: false,
        estimatedProvingMs: 45_000
      })
    ).toEqual({
      uxClass: "mobile-local",
      allowed: true,
      warnings: ["mobile proving may need progress, pause, or fallback UX"],
      errors: []
    });
  });

  it("allows service assistance only when witness and spending keys stay on device", () => {
    expect(
      classifyProvingMode({
        kind: "service-assisted",
        witnessLeavesDevice: false,
        spendingKeyLeavesDevice: false,
        serviceReceivesWitness: false,
        serviceRequestsSpendingKey: false
      })
    ).toEqual({
      uxClass: "service-assisted-safe",
      allowed: true,
      warnings: ["service assistance is limited to public inputs, job coordination, or device-held proving"],
      errors: []
    });
  });

  it("blocks witness or spending-key leakage", () => {
    expect(
      classifyProvingMode({
        kind: "service-assisted",
        witnessLeavesDevice: true,
        spendingKeyLeavesDevice: true,
        serviceReceivesWitness: true,
        serviceRequestsSpendingKey: true
      })
    ).toEqual({
      uxClass: "blocked",
      allowed: false,
      warnings: [],
      errors: ["spending keys must never leave the device", "private witness data must not leave the device"]
    });
  });

  it("rejects invalid estimated proving time metadata", () => {
    expect(() =>
      classifyProvingMode({
        kind: "mobile",
        witnessLeavesDevice: false,
        spendingKeyLeavesDevice: false,
        estimatedProvingMs: -1
      })
    ).toThrow("estimatedProvingMs must be a nonnegative safe integer");
  });
});
