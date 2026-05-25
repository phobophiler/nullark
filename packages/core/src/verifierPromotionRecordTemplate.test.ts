import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertVerifierPromotionRecordPromoted,
  assertVerifierPromotionRecordReviewReady,
  type TrustedSetupVerifierPromotionRecord
} from "./verifierPromotion.js";

const templatePath = path.resolve(process.cwd(), "test-fixtures/evidence/trusted-setup-verifier-promotion.record.template.json");
const publicTrustedSetupRecordPath = path.resolve(process.cwd(), "../../apps/web/public/proving/trusted-setup-record.json");

describe("trusted setup verifier promotion record template", () => {
  it("keeps the checked-in template blocked as a draft", () => {
    const record = JSON.parse(fs.readFileSync(templatePath, "utf8")) as TrustedSetupVerifierPromotionRecord;

    expect(record.status).toBe("draft");
    expect(record.chainId).toBe(6343);
    expect(record.deploymentApproved).toBe(false);
    expect(record.signingApproved).toBe(false);
    expect(record.privateKeysIncluded).toBe(false);
    expect(record.realFundsApproved).toBe(false);
    expect(record.productionPrivacyClaimsBlocked).toBe(true);
    expect(() => assertVerifierPromotionRecordReviewReady(record)).toThrow();
    expect(() => assertVerifierPromotionRecordPromoted(record)).toThrow();
  });

  it("keeps the public v1.2 trusted setup record scoped and non-authorizing for privacy claims", () => {
    const record = JSON.parse(fs.readFileSync(publicTrustedSetupRecordPath, "utf8")) as {
      status?: string;
      chainId?: number;
      mainnet4326Blocked?: boolean;
      mainnetOperatorDecisions?: {
        mainnetValueMovingApproved?: boolean;
        guardedUsersApproved?: boolean;
        productionPrivacyClaimsApproved?: boolean;
      };
      explicitNonAuthorizations?: readonly string[];
    };

    expect(record.status).toBe("approved-for-mainnet");
    expect(record.chainId).toBe(4326);
    expect(record.mainnet4326Blocked).toBe(false);
    expect(record.mainnetOperatorDecisions?.mainnetValueMovingApproved).toBe(true);
    expect(record.mainnetOperatorDecisions?.guardedUsersApproved).toBe(true);
    expect(record.mainnetOperatorDecisions?.productionPrivacyClaimsApproved).toBe(false);
    expect(record.explicitNonAuthorizations).toContain("Does not authorize production privacy claims.");
    expect(record.explicitNonAuthorizations).toContain("Does not set or rotate Cloudflare secrets.");
    expect(record.explicitNonAuthorizations).toContain(
      "Does not broaden the approved pool, verifier, selector, endpoint, or relayer beyond the current v1.2 runtime binding."
    );
  });
});
