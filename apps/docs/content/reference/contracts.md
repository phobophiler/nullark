---
title: "Contract Reference"
description: "Current public contract reference for developers."
section: "reference"
version: "current"
canonicalPath: "/reference/contracts/"
sourceRefs:
  - "public-artifacts/current.json"
status: "public"
order: "170"
---
Surface: public reference. Network: MegaETH mainnet. Raw calldata and operator-only evidence records are not included.

| Component | Address |
| --- | --- |
| `{{ runtime.poolContractName }}` | `{{ runtime.pool }}` |
| `{{ runtime.withdrawVerifierName }}` | `{{ runtime.withdrawVerifier }}` |
| `{{ runtime.privateTransferVerifierName }}` | `{{ runtime.privateTransferVerifier }}` |
| `{{ runtime.verifierAdapterName }}` | `{{ runtime.verifierAdapter }}` |
| Poseidon2 | `{{ runtime.poseidon2 }}` |
| Fee controller | `{{ runtime.feeController }}` |

## Verifier binding

The adapter routes `{{ runtime.groth16PublicInputCount }}`-input Groth16 proofs to the generated verifier that matches the public input shape. The withdrawal verifier bytecode hash is `{{ runtime.withdrawVerifierBytecodeHash }}`. See [Proving artifacts](/developers/proving-artifacts/) for the public input order and browser artifact hashes.
