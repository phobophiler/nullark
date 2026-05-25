---
title: "Proving Artifacts"
description: "Groth16 browser proving artifacts, verifier bindings, and public input order."
section: "developers"
version: "current"
canonicalPath: "/developers/proving-artifacts/"
sourceRefs:
  - "public-artifacts/current.json"
  - "docs/public/README.md"
  - "apps/web/public/proving/withdraw-artifacts.manifest.json"
  - "apps/web/public/proving/trusted-setup-record.json"
status: "public"
order: "100"
---
Nullark uses `{{ runtime.provingSystem }}` for the current browser withdrawal prover. The browser downloads the published withdrawal WASM and zkey, builds a withdrawal proof locally, and submits only the public transaction data needed by the app-supported withdrawal flow.

## Groth16 verifier path

| Component | Current binding | Role |
| --- | --- | --- |
| Adapter | `{{ runtime.verifierAdapterName }}` at `{{ runtime.verifierAdapter }}` | Routes proof verification by public input shape |
| Withdrawal verifier | `{{ runtime.withdrawVerifierName }}` at `{{ runtime.withdrawVerifier }}` | Verifies withdrawal proofs |
| Private-transfer verifier | `{{ runtime.privateTransferVerifierName }}` at `{{ runtime.privateTransferVerifier }}` | Verifies private-transfer shaped proofs |
| Pool | `{{ runtime.pool }}` | Rechecks public withdrawal fields before release |

The adapter expects Groth16 proof bytes and `{{ runtime.groth16PublicInputCount }}` public inputs. A withdrawal proof is not treated as a private transfer proof; the public input shape determines the routed verifier.

`Private-transfer verifier` is a runtime verifier role label. It is not a production privacy claim, and it does not change the public privacy boundary described in the security docs.

## Browser artifacts

| Field | Current value | Why it matters |
| --- | --- | --- |
| Prover manifest | `{{ runtime.publicBrowserProverManifestPath }}` | Public lookup for the browser prover package |
| Manifest hash | `{{ runtime.publicBrowserProverManifestSha256 }}` | Detects manifest drift |
| Trusted setup record | `{{ runtime.trustedSetupRecordPath }}` | Public setup record bound to the current artifacts |
| Trusted setup hash | `{{ runtime.trustedSetupRecordSha256 }}` | Pins the setup record used by the manifest |
| Withdrawal WASM | `{{ runtime.withdrawWasmPath }}` | Browser witness/prover artifact |
| Withdrawal WASM hash | `{{ runtime.withdrawWasmSha256 }}` | Detects WASM drift |
| Withdrawal zkey | `{{ runtime.withdrawFinalZkeyPath }}` | Groth16 proving key used by the browser |
| Withdrawal zkey hash | `{{ runtime.withdrawFinalZkeySha256 }}` | Detects proving-key drift |
| Verifier bytecode hash | `{{ runtime.withdrawVerifierBytecodeHash }}` | Checks the deployed withdrawal verifier bytecode |

## Public input order

The verifier adapter and generated verifiers are bound to this public input order:

```text
{{ runtime.groth16PublicInputOrderText }}
```

The proof binds chain `{{ runtime.chainId }}`, the current pool, the withdrawal verifier path, the spent note context, destination, amount, fee, nullifier, root, and encrypted-note hash. A stale order, stale verifier, stale pool, or stale artifact hash is a different proving stack.

## What is not published

The docs do not publish raw witnesses, proof blobs, zkey internals, public-signal dumps, private note material, full calldata, local proof-service payloads, or operator-only evidence paths. The public surface is the artifact identity and verifier binding, not private proving material.

## Related pages

| Page | Use it for |
| --- | --- |
| [Runtime config](/developers/runtime-config/) | Chain, pool, verifier, fee, selector, and public manifest binding |
| [Contracts](/reference/contracts/) | Current public contract addresses |
| [Privacy model](/security/privacy-model/) | Public privacy boundary and metadata caveats |
