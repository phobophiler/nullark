export type DustHandling = "reject" | "round-down-and-refund" | "sweep-to-public-edge";

export type AssetExpansionPolicy = {
  explicitAssetApproval: boolean;
  assetKind: "native" | "erc20";
  minAnonymitySetThreshold: number;
  expectedAnonymitySet: number;
  usefulLiquidityThreshold: bigint;
  expectedUsefulLiquidity: bigint;
  liquidityFragmentationReviewed: boolean;
  safeERC20IntegrationComplete?: boolean;
  tokenSafetyTestsComplete?: boolean;
  decimals: number;
  dustPolicy: {
    minimumPrivateUnit: bigint;
    handling: DustHandling;
    documented: boolean;
  };
};

export type InternalPrivateTransferFeePolicy = {
  chargesInternalPrivateTransferFee: boolean;
  versionedFeeRuleId?: string;
  feePrivacyImpactDocumented: boolean;
  feeAccountingImpactDocumented: boolean;
};

export type ComplianceControlLocation = "public-edge" | "private-balance-authority";

export type AdvancedComplianceControlPolicy = {
  enabled: boolean;
  controlLocations: ComplianceControlLocation[];
  documentedPublicEdgeOnly: boolean;
};

export type PrivateIntegrationPolicy = {
  enabled: boolean;
  noPublicLinkageByDefault: boolean;
  serverHoldsSpendingKeys: boolean;
  keyCustodyDocumented: boolean;
};

export type Phase3ExpansionPolicy = {
  additionalAssets: AssetExpansionPolicy[];
  internalPrivateTransferFees: InternalPrivateTransferFeePolicy;
  advancedComplianceControls: AdvancedComplianceControlPolicy;
  privateIdentityNameOrPaymentLinkIntegrations: PrivateIntegrationPolicy[];
};

export function canApproveAdditionalAsset(policy: AssetExpansionPolicy): boolean {
  if (!policy.explicitAssetApproval || !policy.liquidityFragmentationReviewed) {
    return false;
  }

  if (policy.assetKind === "erc20" && (!policy.safeERC20IntegrationComplete || !policy.tokenSafetyTestsComplete)) {
    return false;
  }

  if (policy.minAnonymitySetThreshold <= 0 || policy.expectedAnonymitySet < policy.minAnonymitySetThreshold) {
    return false;
  }

  if (policy.usefulLiquidityThreshold <= 0n || policy.expectedUsefulLiquidity < policy.usefulLiquidityThreshold) {
    return false;
  }

  if (!Number.isInteger(policy.decimals) || policy.decimals < 0 || policy.decimals > 36) {
    return false;
  }

  return policy.dustPolicy.documented && policy.dustPolicy.minimumPrivateUnit > 0n;
}

export function canChargeInternalPrivateTransferFees(policy: InternalPrivateTransferFeePolicy): boolean {
  if (!policy.chargesInternalPrivateTransferFee) {
    return true;
  }

  return Boolean(
    policy.versionedFeeRuleId &&
      policy.versionedFeeRuleId.trim() &&
      policy.feePrivacyImpactDocumented &&
      policy.feeAccountingImpactDocumented
  );
}

export function advancedComplianceControlsStayAtPublicEdges(policy: AdvancedComplianceControlPolicy): boolean {
  if (!policy.enabled) {
    return true;
  }

  return (
    policy.documentedPublicEdgeOnly &&
    policy.controlLocations.length > 0 &&
    policy.controlLocations.every((location) => location === "public-edge")
  );
}

export function canEnablePrivateIntegration(policy: PrivateIntegrationPolicy): boolean {
  if (!policy.enabled) {
    return true;
  }

  return policy.noPublicLinkageByDefault && !policy.serverHoldsSpendingKeys && policy.keyCustodyDocumented;
}

export function canMarkPhase3ExpansionReady(policy: Phase3ExpansionPolicy): boolean {
  return (
    policy.additionalAssets.every(canApproveAdditionalAsset) &&
    canChargeInternalPrivateTransferFees(policy.internalPrivateTransferFees) &&
    advancedComplianceControlsStayAtPublicEdges(policy.advancedComplianceControls) &&
    policy.privateIdentityNameOrPaymentLinkIntegrations.every(canEnablePrivateIntegration)
  );
}
