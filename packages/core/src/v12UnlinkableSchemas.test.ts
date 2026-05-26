import { describe, expect, it } from "vitest";
import {
  V12_DEPOSIT_PUBLIC_INPUT_ORDER,
  V12_ENCRYPTED_OUTPUT_NOTE_HASH_RULE,
  V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA,
  V12_FORBIDDEN_SPEND_PUBLIC_INPUTS,
  V12_RECOVERY_KIT_V1_SCHEMA,
  V12_RECOVERY_KIT_V1_SCHEMA_HASH,
  V12_SCHEMA_DESCRIPTORS,
  V12_SCHEMA_DESCRIPTOR_HASHES,
  V12_SCHEMA_DESCRIPTOR_LIST,
  V12_SPEND_PUBLIC_INPUT_ORDER,
  assertV12SpendPublicInputOrder,
  canonicalJson,
  schemaDescriptorHash,
  sha256CanonicalJson,
  sha256String,
  type V12SchemaDescriptor
} from "./v12UnlinkableSchemas.js";

const oldTwelveInputOrder = [
  "root",
  "nullifier",
  "newCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "spentCommitment",
  "noteAmount",
  "proofContextHash",
  "encryptedNoteHash"
] as const;

describe("Nullark v1.2 unlinkable spend public input freeze", () => {
  it("freezes the deposit proof public input order for amount binding", () => {
    expect(V12_DEPOSIT_PUBLIC_INPUT_ORDER).toHaveLength(6);
    expect([...V12_DEPOSIT_PUBLIC_INPUT_ORDER]).toEqual([
      "commitment",
      "amount",
      "chainId",
      "verifyingContract",
      "depositContextHash",
      "encryptedDepositNoteHash"
    ]);
  });

  it("freezes the spend order length at exactly 10", () => {
    expect(V12_SPEND_PUBLIC_INPUT_ORDER).toHaveLength(10);
  });

  it("freezes the canonical v1.2 spend order", () => {
    expect(assertV12SpendPublicInputOrder(V12_SPEND_PUBLIC_INPUT_ORDER)).toBe(V12_SPEND_PUBLIC_INPUT_ORDER);
    expect([...V12_SPEND_PUBLIC_INPUT_ORDER]).toEqual([
      "root",
      "nullifier",
      "outputCommitment",
      "destination",
      "grossAmount",
      "fee",
      "chainId",
      "verifyingContract",
      "proofContextHash",
      "encryptedOutputNoteHash"
    ]);
  });

  it("rejects the old 12-input public order", () => {
    expect(() => assertV12SpendPublicInputOrder(oldTwelveInputOrder)).toThrow(
      "v1.2 spend public inputs include forbidden public fields"
    );
  });

  it("rejects any order containing spentCommitment", () => {
    const withSpentCommitment: string[] = [...V12_SPEND_PUBLIC_INPUT_ORDER];
    withSpentCommitment[2] = "spentCommitment";

    expect(() => assertV12SpendPublicInputOrder(withSpentCommitment)).toThrow("spentCommitment");
  });

  it("rejects any order containing old amount, output amount, or full-vs-partial flags", () => {
    for (const forbiddenInput of V12_FORBIDDEN_SPEND_PUBLIC_INPUTS) {
      const order: string[] = [...V12_SPEND_PUBLIC_INPUT_ORDER];
      order[2] = forbiddenInput;

      expect(() => assertV12SpendPublicInputOrder(order), forbiddenInput).toThrow(forbiddenInput);
    }
  });

  it("rejects the same names even when the order still has length 10", () => {
    const linkableTenInputOrder = [
      "root",
      "nullifier",
      "outputCommitment",
      "destination",
      "grossAmount",
      "fee",
      "chainId",
      "verifyingContract",
      "proofContextHash",
      "noteAmount"
    ];

    expect(() => assertV12SpendPublicInputOrder(linkableTenInputOrder)).toThrow("noteAmount");
  });
});

describe("Nullark v1.2 recovery kit schema freeze", () => {
  it("freezes the recovery kit schema hash and exact field order", () => {
    expect(V12_RECOVERY_KIT_V1_SCHEMA_HASH).toBe(
      "sha256:b7935a0848b972e16be5790040136f50712e84e44c272079170192b9a56d18d8"
    );
    expect([...V12_RECOVERY_KIT_V1_SCHEMA.order]).toEqual([
      "domain",
      "version",
      "recoveryKitSchemaHash",
      "checksumAlgorithm",
      "chainId",
      "poolAddress",
      "runtimeId",
      "noteVersion",
      "amount",
      "assetId",
      "ownerCommitment",
      "noteSecret",
      "blinding",
      "commitment",
      "txHashHint",
      "blockNumberHint",
      "leafIndexHint",
      "createdAt",
      "checksum"
    ]);
  });
});

describe("Nullark v1.2 schema descriptor hashes", () => {
  it("hashes strings and canonical JSON deterministically", () => {
    expect(sha256String("nullark-v1.2")).toBe(sha256String("nullark-v1.2"));
    expect(canonicalJson({ b: 2, a: ["x", true, null] })).toBe('{"a":["x",true,null],"b":2}');
    expect(sha256CanonicalJson({ b: 2, a: ["x", true, null] })).toBe(
      sha256CanonicalJson({ a: ["x", true, null], b: 2 })
    );
  });

  it("schema hashes are deterministic and change when order changes", () => {
    const descriptor = {
      name: "NullarkV12SpendPublicInputs",
      version: "1.2",
      domain: "nullark.v1.2.spend-public-inputs",
      order: V12_SPEND_PUBLIC_INPUT_ORDER
    } as const satisfies V12SchemaDescriptor;
    const changedOrder = {
      ...descriptor,
      order: [...V12_SPEND_PUBLIC_INPUT_ORDER].reverse()
    };

    expect(schemaDescriptorHash(descriptor)).toBe(schemaDescriptorHash(descriptor));
    expect(schemaDescriptorHash(changedOrder)).not.toBe(schemaDescriptorHash(descriptor));
  });

  it("freezes names, versions, domains, and orders for each descriptor", () => {
    expect(V12_SCHEMA_DESCRIPTOR_LIST).toHaveLength(8);

    for (const descriptor of V12_SCHEMA_DESCRIPTOR_LIST) {
      expect(descriptor.name).toEqual(expect.any(String));
      expect(descriptor.version).toEqual(expect.any(String));
      expect(descriptor.domain).toMatch(/^nullark\./);
      expect(Array.isArray(descriptor.order)).toBe(true);
      expect(schemaDescriptorHash(descriptor)).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("freezes canonical descriptor hashes for every v1.2 schema surface", () => {
    expect(V12_SCHEMA_DESCRIPTOR_HASHES).toEqual({
      depositPublicInputs: "sha256:0715130ade10dddad1eedffe4092ef224c7083dd93a267e49dd85c9848c01f1f",
      spendPublicInputs: "sha256:4212309560f544cf3596e72c2c3c3136641c4efaae9166ee87dece340ab872cd",
      proofContext: "sha256:6dc0fb940000c7c9347850918acabf9b2a898def60b325cf211e82d8319c32fe",
      encryptedOutputNoteV2: "sha256:faddbd0f9e353e3ed0841ffda38067c16016d65aef1271348bff7f4312ae9a0e",
      recoveryKitV1: "sha256:4d2be130e549956c3867d925807f2538375c7a9d3c76490b6fc58c79b54293e3",
      walletUnlock: "sha256:e9c935ac2b1461b590a17ac80b19521a865dfa88ca53a67465d488a76e19b780",
      privacyHintPolicy: "sha256:de12e22fae1047ce3de97935ddbf606d975870e6ae9c73ee60930aa822e7a95f",
      treeSnapshot: "sha256:2af98c4e7e77c6d287c212545514d5394d5da491e9defc872a1a171b3a1166e4"
    });

    for (const [name, descriptor] of Object.entries(V12_SCHEMA_DESCRIPTORS)) {
      expect(V12_SCHEMA_DESCRIPTOR_HASHES[name as keyof typeof V12_SCHEMA_DESCRIPTOR_HASHES]).toBe(
        schemaDescriptorHash(descriptor)
      );
    }
  });
});

describe("Nullark encrypted output note V2 schema freeze", () => {
  it("freezes the V2 output-note hash domain, version, and payload digest rule", () => {
    expect(V12_ENCRYPTED_OUTPUT_NOTE_HASH_RULE).toEqual({
      domain: "nullark.encrypted-output-note.v2",
      version: 2,
      payloadBinding: "keccak256(encryptedOutputNote)",
      hashEncoding: [
        "domainSeparator",
        "version",
        "chainId",
        "verifyingContract",
        "shape",
        "selector",
        "nullifier",
        "outputCommitment",
        "encryptedOutputNoteDigest"
      ]
    });
  });

  it("freezes V2 as always-present, fixed-shape, and padded by descriptor fields", () => {
    const fieldNames = V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.fields.map((field) => field.name);

    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.name).toBe("NullarkEncryptedOutputNote");
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.version).toBe("2");
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.domain).toBe("nullark.encrypted-output-note.v2");
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.presence).toBe("always-present");
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.shape).toBe("fixed");
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.padding.required).toBe(true);
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.padding.fields).toEqual([
      "paddingBytes",
      "paddingByteLength",
      "paddedCiphertextByteLength"
    ]);
    expect(fieldNames).toEqual([...V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.order]);
    expect(V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.fields.every((field) => field.required)).toBe(true);
    expect(
      V12_ENCRYPTED_OUTPUT_NOTE_V2_SCHEMA.fields
        .filter((field) => "padded" in field && field.padded)
        .map((field) => field.name)
    ).toEqual(["ciphertext", "paddingBytes"]);
  });
});
