---
title: "Relayer Model"
description: "The public relayer boundary, metadata tradeoffs, and machine/API endpoint treatment."
section: "operators"
version: "current"
canonicalPath: "/operators/relayer-model/"
sourceRefs:
  - "docs/operators/README.md"
  - "public-artifacts/current.json"
status: "public"
order: "120"
---
Relayer submit is an operational submission path. It is not a privacy guarantee and it is not a user-facing docs destination.

| Field | Current value |
| --- | --- |
| Endpoint label | Machine/API endpoint |
| Endpoint | `{{ runtime.relayerEndpoint }}` |
| Chain | MegaETH mainnet `{{ runtime.chainId }}` |
| Selector | `{{ runtime.withdrawSelector }}` |

## What Relayer Submit Changes

The relayer can be the public transaction sender. This can be useful when users do not want their wallet to submit the withdrawal directly.

Use relayer submit when you want the relayer to submit the withdrawal transaction. Do not use it as a recipient-hiding feature; the destination, amount, pool, nullifier, and timing remain public.

## What Relayer Submit Does Not Change

:::checklist
- Withdrawal destination remains public.
- Fixed amount and fee remain public.
- Pool interaction remains public.
- Nullifier and events remain public.
- Timing remains observable.
:::

:::risk_caveat
The relayer can receive request metadata. Users should choose relayer submit only when they accept that trust boundary.
:::
