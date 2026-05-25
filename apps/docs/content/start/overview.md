---
title: "Overview"
description: "Verify the current Nullark pool, learn the user flows, and review the public trust boundaries."
section: "start"
version: "current"
canonicalPath: "/start/overview/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/CURRENT.md"
  - "public-artifacts/current.json"
status: "public"
order: "10"
---
:::hero
Nullark on MegaETH
Use fixed-denomination ETH notes with explicit public-exit checks
Verify the live pool, check what stays public, and follow the deposit, recovery, and withdrawal paths without exposing note material.
Start with deposit checks|/users/deposit/
See what is public|/start/what-is-public/
:::

| Check | Current value |
| --- | --- |
| Network | MegaETH mainnet `{{ runtime.chainId }}` |
| Pool | `{{ runtime.pool }}` |
| Withdrawal fee | `{{ runtime.withdrawalFeeBps }}` bps |
| Relayer | Machine/API endpoint |

## Start here

If you are about to use Nullark, read the deposit and withdrawal pages as operational checklists. If you are integrating or reviewing the system, start from runtime configuration, contracts, and the privacy model. If a page asks you to verify a value, verify it in the app before signing.

## Current runtime

The current public docs track MegaETH mainnet `{{ runtime.chainId }}` and pool `{{ runtime.pool }}`. The chain ID matters because proofs, wallet prompts, and transaction review must be bound to the intended network. The pool address matters because deposits and withdrawals only belong to the pool the app is currently operating.

## Main paths

Choose the path that matches your task. User actions, public reference, and security review are separated so recovery and relayer boundaries stay visible.

:::cards
Use Nullark|/users/deposit/|Deposit, withdraw, restore private balance, and avoid common self-linking mistakes.
Review the runtime|/developers/runtime-config/|Check chain, pool, verifier, fee, relayer label, and public artifact values.
Review trust boundaries|/security/privacy-model/|See what is public, what users control, and what Nullark does not promise.
:::

## Hard boundaries

Docs are read-only. Use the app origin for wallet actions. Treat `{{ runtime.relayerEndpoint }}` as a `{{ runtime.relayerEndpointLabel }}`, not as a website to paste recovery data into. Never send raw proofs, calldata, raw note records, wallet unlock signatures, seed phrases, or private keys through docs, support channels, screenshots, or issue reports.

:::non_claim
Nullark docs make no production privacy, anonymity, unlinkability, sender privacy, receiver privacy, amount privacy, MEV-protection, or chain-level privacy claims. Deposits and withdrawals are public on MegaETH.
:::
