import { publicEdgePolicy, type ProductAction } from "./compliance.js";
import { assertProofModeAllowed, type ProofMode, type ProofPrivacyLabel } from "./proofs.js";

export const SMALL_ANONYMITY_SET_WARNING = "Small anonymity sets do not provide strong privacy.";
export const PUBLIC_EDGE_COMPLIANCE_NOTICE =
  "Compliance checks apply at public deposit and withdrawal edges, not inside private transfers.";
export const HOSTED_SERVICE_KEY_CUSTODY_NOTICE = "Hosted identity or link services must never hold spending keys.";
export const PUBLIC_WITHDRAWAL_METADATA_NOTICE =
  "Public withdrawals reveal the destination, gross amount, net amount, fee, timing, and nullifier on-chain.";

export type ProofModeDisclosure = {
  label: ProofPrivacyLabel;
  heading: string;
  body: string;
};

export type HostedServiceCustodyRequest = {
  service: "identity" | "link" | "backup" | "relay";
  holdsSpendingKey: boolean;
};

export function proofModeDisclosure(mode: ProofMode): ProofModeDisclosure {
  if (mode.kind === "service-assisted" && mode.sensitiveWitnessLeavesDevice) {
    throw new Error("Phase 2 service-assisted proving must keep witness data on device");
  }

  const label = assertProofModeAllowed(mode);

  if (mode.kind === "local") {
    return {
      label,
      heading: "Local proving",
      body: "Witness data and spending keys stay on the user's device."
    };
  }

  return {
    label,
    heading: "Service-assisted proving",
    body: "The service may coordinate public proving jobs, but witness data and spending keys stay on the user's device."
  };
}

export function phase2PublicEdgeNotice(action: ProductAction): string {
  const policy = publicEdgePolicy(action);

  if (action === "deposit" || action === "withdrawal") {
    if (!policy.requiresScreening || !policy.screenablePublicEdge) {
      throw new Error(`${action} must remain a screenable public edge`);
    }
    return `${action} is public and can be screened at the public edge.`;
  }

  if (policy.canAuthorizePrivateBalance) {
    throw new Error(`${action} policy must not authorize private balances`);
  }

  return PUBLIC_EDGE_COMPLIANCE_NOTICE;
}

export function publicWithdrawalMetadataNotice(): string {
  return PUBLIC_WITHDRAWAL_METADATA_NOTICE;
}

export function assertHostedServiceCannotHoldSpendingKey(request: HostedServiceCustodyRequest): HostedServiceCustodyRequest {
  if (request.holdsSpendingKey) {
    throw new Error(`${request.service} service must not hold spending keys`);
  }

  return request;
}
