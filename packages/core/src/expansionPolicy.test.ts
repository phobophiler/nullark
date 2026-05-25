import { describe, expect, it } from "vitest";
import {
  advancedComplianceControlsStayAtPublicEdges,
  canApproveAdditionalAsset,
  canChargeInternalPrivateTransferFees,
  canEnablePrivateIntegration,
  canMarkPhase3ExpansionReady,
  type AssetExpansionPolicy,
  type Phase3ExpansionPolicy
} from "./expansionPolicy.js";

const assetPolicy: AssetExpansionPolicy = {
  explicitAssetApproval: true,
  assetKind: "erc20",
  minAnonymitySetThreshold: 1_000,
  expectedAnonymitySet: 1_250,
  usefulLiquidityThreshold: 100_000n,
  expectedUsefulLiquidity: 125_000n,
  liquidityFragmentationReviewed: true,
  safeERC20IntegrationComplete: true,
  tokenSafetyTestsComplete: true,
  decimals: 18,
  dustPolicy: {
    minimumPrivateUnit: 1_000n,
    handling: "reject",
    documented: true
  }
};

const phase3Policy: Phase3ExpansionPolicy = {
  additionalAssets: [assetPolicy],
  internalPrivateTransferFees: {
    chargesInternalPrivateTransferFee: false,
    feePrivacyImpactDocumented: false,
    feeAccountingImpactDocumented: false
  },
  advancedComplianceControls: {
    enabled: true,
    controlLocations: ["public-edge"],
    documentedPublicEdgeOnly: true
  },
  privateIdentityNameOrPaymentLinkIntegrations: [
    {
      enabled: true,
      noPublicLinkageByDefault: true,
      serverHoldsSpendingKeys: false,
      keyCustodyDocumented: true
    }
  ]
};

describe("Phase 3 expansion policy", () => {
  it("allows additional assets only with approval, useful liquidity, anonymity, token safety, decimals, and dust policy", () => {
    expect(canApproveAdditionalAsset(assetPolicy)).toBe(true);
    expect(canApproveAdditionalAsset({ ...assetPolicy, explicitAssetApproval: false })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, expectedAnonymitySet: 999 })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, expectedUsefulLiquidity: 99_999n })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, safeERC20IntegrationComplete: false })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, tokenSafetyTestsComplete: false })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, decimals: 37 })).toBe(false);
    expect(canApproveAdditionalAsset({ ...assetPolicy, dustPolicy: { ...assetPolicy.dustPolicy, documented: false } })).toBe(
      false
    );
  });

  it("allows native asset expansion without ERC-20-specific safety evidence", () => {
    expect(
      canApproveAdditionalAsset({
        ...assetPolicy,
        assetKind: "native",
        safeERC20IntegrationComplete: false,
        tokenSafetyTestsComplete: false
      })
    ).toBe(true);
  });

  it("blocks internal private-transfer fees unless a versioned rule documents privacy and accounting impact", () => {
    expect(canChargeInternalPrivateTransferFees({ ...phase3Policy.internalPrivateTransferFees })).toBe(true);
    expect(
      canChargeInternalPrivateTransferFees({
        chargesInternalPrivateTransferFee: true,
        feePrivacyImpactDocumented: true,
        feeAccountingImpactDocumented: true
      })
    ).toBe(false);
    expect(
      canChargeInternalPrivateTransferFees({
        chargesInternalPrivateTransferFee: true,
        versionedFeeRuleId: "internal-fee-v1",
        feePrivacyImpactDocumented: true,
        feeAccountingImpactDocumented: true
      })
    ).toBe(true);
  });

  it("keeps advanced compliance controls at public edges", () => {
    expect(advancedComplianceControlsStayAtPublicEdges(phase3Policy.advancedComplianceControls)).toBe(true);
    expect(
      advancedComplianceControlsStayAtPublicEdges({
        enabled: true,
        controlLocations: ["public-edge", "private-balance-authority"],
        documentedPublicEdgeOnly: true
      })
    ).toBe(false);
  });

  it("requires private integrations to avoid public linkage by default and server-held spending keys", () => {
    const [integration] = phase3Policy.privateIdentityNameOrPaymentLinkIntegrations;
    if (!integration) {
      throw new Error("test fixture must include an integration");
    }

    expect(canEnablePrivateIntegration(integration)).toBe(true);
    expect(canEnablePrivateIntegration({ ...integration, noPublicLinkageByDefault: false })).toBe(false);
    expect(canEnablePrivateIntegration({ ...integration, serverHoldsSpendingKeys: true })).toBe(false);
  });

  it("marks Phase 3 ready only when every expansion policy passes", () => {
    expect(canMarkPhase3ExpansionReady(phase3Policy)).toBe(true);
    expect(
      canMarkPhase3ExpansionReady({
        ...phase3Policy,
        advancedComplianceControls: {
          enabled: true,
          controlLocations: ["private-balance-authority"],
          documentedPublicEdgeOnly: false
        }
      })
    ).toBe(false);
  });
});
