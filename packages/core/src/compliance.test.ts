import { describe, expect, it } from "vitest";
import { publicEdgePolicy } from "./compliance.js";

describe("public edge policy", () => {
  it("does not gate local identity creation", () => {
    expect(publicEdgePolicy("identity-create").requiresScreening).toBe(false);
  });

  it("screens deposit and withdrawal edges when policy requires it", () => {
    expect(publicEdgePolicy("deposit").screenablePublicEdge).toBe(true);
    expect(publicEdgePolicy("withdrawal").screenablePublicEdge).toBe(true);
  });

  it("does not claim transparent internal transfer screening", () => {
    expect(publicEdgePolicy("internal-transfer").screenablePublicEdge).toBe(false);
  });

  it("never lets compliance or hosted identity controls authorize private balances", () => {
    expect(publicEdgePolicy("deposit").canAuthorizePrivateBalance).toBe(false);
    expect(publicEdgePolicy("withdrawal").canAuthorizePrivateBalance).toBe(false);
    expect(publicEdgePolicy("private-name-resolve").canAuthorizePrivateBalance).toBe(false);
    expect(publicEdgePolicy("payment-link-create").canAuthorizePrivateBalance).toBe(false);
  });
});
