---
title: "Architecture"
description: "Nullark runtime components and public integration boundaries."
section: "developers"
version: "current"
canonicalPath: "/developers/architecture/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/security/threat-model.md"
status: "public"
order: "80"
---
Architecture here means public runtime surfaces and integration boundaries, not private operations records.

## Runtime surfaces

| Surface | Interface | Runtime value |
| --- | --- | --- |
| Chain | MegaETH mainnet | `{{ runtime.chainId }}` |
| Pool | `{{ runtime.poolContractName }}` | `{{ runtime.pool }}` |
| Groth16 verifier adapter | `{{ runtime.verifierAdapterName }}` | `{{ runtime.verifierAdapter }}` |
| Withdrawal verifier | `{{ runtime.withdrawVerifierName }}` | `{{ runtime.withdrawVerifier }}` |
| Private-transfer verifier | `{{ runtime.privateTransferVerifierName }}` | `{{ runtime.privateTransferVerifier }}` |
| Relayer | Submit prepared withdrawal requests | `{{ runtime.relayerEndpointLabel }}` |

Runtime values are versioned public configuration. Bind integrations to the current docs/runtime output and reject old screenshots, stale examples, and copied addresses that do not match.

`Private-transfer verifier` is kept as the runtime contract label where it appears in deployed configuration. Treat it as a verifier role name, not as a production privacy claim.

## Data flow

| Step | User-side object | Public object |
| --- | --- | --- |
| Deposit | Wallet action and app-created private note | Deposit transaction and commitment event |
| Hold | Wallet-gated recoverable note state | Pool state and accepted roots |
| Withdraw | Browser-generated Groth16 proof and recipient choice | Nullifier, destination, amount, fee, timing |
| Relay optional | Prepared submission request | Relayer sender path and chain receipt |

## Trust boundaries

| Boundary | Owned by | Rule |
| --- | --- | --- |
| Wallet signing | User wallet | Docs never request signatures |
| Private note state | App and wallet-gated recovery flow | Docs never receive or validate raw note records |
| Proof generation | Browser app/runtime artifacts | Docs publish artifact identities, not witnesses or proof blobs |
| Groth16 verification | Adapter and generated verifiers | Public input order and verifier addresses must match the current runtime |
| Relayer submission | Operator API | Treat as machine endpoint, not wallet UI |

## Public references

[Proving artifacts](/developers/proving-artifacts/) covers the Groth16 browser prover, artifact hashes, and public input order. [Runtime config](/developers/runtime-config/) covers chain, pool, verifier, fee, and artifact fields. [Contracts](/reference/contracts/) lists public addresses. [Relayer model](/operators/relayer-model/) covers the submission boundary. Raw proofs, calldata, deployment secrets, relayer credentials, funding records, and private evidence paths are outside this public reference.
