---
title: "Contracts"
description: "Current public contract addresses for the selected runtime."
section: "developers"
version: "current"
canonicalPath: "/developers/contracts/"
sourceRefs:
  - "public-artifacts/current.json"
status: "public"
order: "90"
---
Current contract bindings:

- Pool contract: `{{ runtime.poolContractName }}`
- Pool address: `{{ runtime.pool }}`
- Private transfer verifier: `{{ runtime.privateTransferVerifier }}`
- Withdrawal verifier: `{{ runtime.withdrawVerifier }}`
- Verifier adapter: `{{ runtime.verifierAdapter }}`
- Poseidon2: `{{ runtime.poseidon2 }}`
- Fee controller: `{{ runtime.feeController }}`

The current pool is not presented as a proxy in public docs.
