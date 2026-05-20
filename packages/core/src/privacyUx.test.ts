import { describe, expect, it } from "vitest";
import {
  HOSTED_SERVICE_KEY_CUSTODY_NOTICE,
  PUBLIC_EDGE_COMPLIANCE_NOTICE,
  PUBLIC_WITHDRAWAL_METADATA_NOTICE,
  SMALL_ANONYMITY_SET_WARNING,
  assertHostedServiceCannotHoldSpendingKey,
  phase2PublicEdgeNotice,
  publicWithdrawalMetadataNotice,
  proofModeDisclosure
} from "./privacyUx.js";

describe("Phase 2 privacy UX policy", () => {
  it("keeps the required small anonymity-set warning exact", () => {
    expect(SMALL_ANONYMITY_SET_WARNING).toBe("Small anonymity sets do not provide strong privacy.");
  });

  it("distinguishes local and service-assisted proving", () => {
    expect(proofModeDisclosure({ kind: "local", sensitiveWitnessLeavesDevice: false })).toEqual({
      label: "privacy-preserving",
      heading: "Local proving",
      body: "Witness data and spending keys stay on the user's device."
    });

    expect(proofModeDisclosure({ kind: "service-assisted", sensitiveWitnessLeavesDevice: false })).toEqual({
      label: "privacy-preserving",
      heading: "Service-assisted proving",
      body: "The service may coordinate public proving jobs, but witness data and spending keys stay on the user's device."
    });
  });

  it("blocks witness-leaving service-assisted proving as a Phase 2 UX path", () => {
    expect(() => proofModeDisclosure({ kind: "service-assisted", sensitiveWitnessLeavesDevice: true })).toThrow(
      "Phase 2 service-assisted proving must keep witness data on device"
    );
  });

  it("keeps compliance checks at public edges", () => {
    expect(phase2PublicEdgeNotice("deposit")).toBe("deposit is public and can be screened at the public edge.");
    expect(phase2PublicEdgeNotice("withdrawal")).toBe("withdrawal is public and can be screened at the public edge.");
    expect(phase2PublicEdgeNotice("internal-transfer")).toBe(PUBLIC_EDGE_COMPLIANCE_NOTICE);
  });

  it("does not allow public withdrawal destination or amount privacy overclaims", () => {
    expect(publicWithdrawalMetadataNotice()).toBe(PUBLIC_WITHDRAWAL_METADATA_NOTICE);
    expect(PUBLIC_WITHDRAWAL_METADATA_NOTICE).toContain("destination");
    expect(PUBLIC_WITHDRAWAL_METADATA_NOTICE).toContain("gross amount");
    expect(PUBLIC_WITHDRAWAL_METADATA_NOTICE).toContain("net amount");
    expect(PUBLIC_WITHDRAWAL_METADATA_NOTICE).toContain("fee");
    expect(PUBLIC_WITHDRAWAL_METADATA_NOTICE).toContain("nullifier");
  });

  it("blocks hosted services that hold spending keys", () => {
    expect(HOSTED_SERVICE_KEY_CUSTODY_NOTICE).toContain("must never hold spending keys");
    expect(assertHostedServiceCannotHoldSpendingKey({ service: "identity", holdsSpendingKey: false })).toEqual({
      service: "identity",
      holdsSpendingKey: false
    });
    expect(() => assertHostedServiceCannotHoldSpendingKey({ service: "link", holdsSpendingKey: true })).toThrow(
      "link service must not hold spending keys"
    );
  });
});
