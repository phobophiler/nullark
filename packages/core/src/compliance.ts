export type ProductAction =
  | "identity-create"
  | "deposit"
  | "internal-transfer"
  | "withdrawal"
  | "fee-sweep"
  | "private-name-resolve"
  | "payment-link-create";

export type PublicEdgePolicy = {
  requiresScreening: boolean;
  screenablePublicEdge: boolean;
  rateLimitHostedService: boolean;
  canAuthorizePrivateBalance: boolean;
};

export function publicEdgePolicy(action: ProductAction): PublicEdgePolicy {
  if (action === "identity-create") {
    return {
      requiresScreening: false,
      screenablePublicEdge: false,
      rateLimitHostedService: true,
      canAuthorizePrivateBalance: false
    };
  }

  if (action === "deposit" || action === "withdrawal") {
    return {
      requiresScreening: true,
      screenablePublicEdge: true,
      rateLimitHostedService: false,
      canAuthorizePrivateBalance: false
    };
  }

  if (action === "fee-sweep") {
    return {
      requiresScreening: false,
      screenablePublicEdge: true,
      rateLimitHostedService: false,
      canAuthorizePrivateBalance: false
    };
  }

  if (action === "private-name-resolve" || action === "payment-link-create") {
    return {
      requiresScreening: false,
      screenablePublicEdge: false,
      rateLimitHostedService: true,
      canAuthorizePrivateBalance: false
    };
  }

  return {
    requiresScreening: false,
    screenablePublicEdge: false,
    rateLimitHostedService: false,
    canAuthorizePrivateBalance: false
  };
}
