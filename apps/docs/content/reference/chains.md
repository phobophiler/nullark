---
title: "Chains"
description: "Current public chain and RPC reference."
section: "reference"
version: "current"
canonicalPath: "/reference/chains/"
sourceRefs:
  - "public-artifacts/current.json"
  - "packages/core/src/config.ts"
status: "public"
order: "160"
---
Current public chain reference:

| Network | Chain ID | RPC |
| --- | --- | --- |
| MegaETH mainnet | `{{ runtime.chainId }}` | `{{ runtime.rpcUrl }}` |

Always check the selected wallet network before value-moving actions in the app.
