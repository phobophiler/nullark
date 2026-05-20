---
title: "Status and networks"
description: "Check which Nullark runtime these docs describe and where each public surface belongs."
section: "start"
version: "current"
canonicalPath: "/start/status-and-networks/"
sourceRefs:
  - "public-artifacts/current.json"
  - "packages/core/src/config.ts"
status: "public"
order: "20"
---
These values pin the runtime described by the public docs. Check them before following an old link, copied address, screenshot, or integration note.

## Current deployment

| Field | Current value |
| --- | --- |
| Product | `{{ runtime.productVersion }}` |
| Network | `{{ runtime.environment }}` |
| Chain ID | `{{ runtime.chainId }}` |
| RPC | `{{ runtime.rpcUrl }}` |

The current docs describe MegaETH mainnet `{{ runtime.chainId }}`. Chain ID is the first wallet-review check because the same interface on the wrong network is not the same system. The active pool is `{{ runtime.pool }}`; treat any different pool as a different deployment until the docs and app both say otherwise.

## Public surfaces

| Surface | Purpose | Boundary |
| --- | --- | --- |
| Docs | Read current public documentation | No wallet, recovery, proof, or transaction submission |
| App | User-facing deposit and withdrawal flow | Verify origin before signing |
| Relayer | Transaction submission API | Machine endpoint, not a wallet destination |
| Contracts | Pool and verifier addresses | Public chain reference |

## Domain boundaries

| Domain | Reader expectation | Must not be confused with |
| --- | --- | --- |
| `docs.nullark.com` | Read public docs and reference values | Wallet app, relayer endpoint, support inbox |
| App origin | Review and sign user actions | Documentation renderer |
| `{{ runtime.relayerEndpoint }}` | Submit a prepared relay request | Machine/API endpoint, not human documentation |

## Fast receipts are not final review

MegaETH can return fast transaction receipts. Treat that as execution feedback after you have already reviewed the action. Before signing or submitting, check chain `{{ runtime.chainId }}`, pool `{{ runtime.pool }}`, recipient, amount, fee, proof path, and whether the sender is your wallet or the relayer.
