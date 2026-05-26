import { describe, expect, it } from "vitest";
import { NULLARK_REDACTED, redactNullarkDiagnostics } from "./index.js";

describe("redaction", () => {
  it("redacts user private material and prepared calldata from diagnostics", () => {
    expect(
      redactNullarkDiagnostics({
        chainId: 4326,
        pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
        privateKeysIncluded: false,
        noteSecretsIncluded: false,
        rawProofIncluded: false,
        fullCalldataIncluded: false,
        noteSecret: "0xsecret",
        spendMaterial: { nullifier: "0xabc" },
        walletSignature: "0xsig",
        proof: "0xproof",
        calldata: "0x678d8506",
        nested: { seedPhrase: "never" }
      })
    ).toEqual({
      chainId: 4326,
      pool: "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15",
      privateKeysIncluded: false,
      noteSecretsIncluded: false,
      rawProofIncluded: false,
      fullCalldataIncluded: false,
      noteSecret: NULLARK_REDACTED,
      spendMaterial: NULLARK_REDACTED,
      walletSignature: NULLARK_REDACTED,
      proof: NULLARK_REDACTED,
      calldata: NULLARK_REDACTED,
      nested: { seedPhrase: NULLARK_REDACTED }
    });
  });
});
