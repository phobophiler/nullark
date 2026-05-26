---
title: "Deposit"
description: "Prepare a fixed-denomination deposit without confusing docs, app, and chain boundaries."
section: "users"
version: "current"
canonicalPath: "/users/deposit/"
sourceRefs:
  - "docs/public/README.md"
  - "packages/core/src/denominations.ts"
status: "public"
order: "40"
---
A deposit is a public transaction into the current Nullark pool. The app creates recoverable note material, handles it through app/browser state, and gates recovery through the wallet unlock flow.

## Before you deposit

Open the official app, not docs. Confirm MegaETH mainnet `{{ runtime.chainId }}` and pool `{{ runtime.pool }}` in the app before signing. If the app shows a different chain or pool, stop and resolve that mismatch first.

Keep recovery inside the app-supported wallet flow. Do not paste raw note records, wallet unlock signatures, seed phrases, or private keys into docs, support chat, or issue reports.

## Choose an amount

Nullark uses fixed denominations so users choose from shared preset amounts instead of custom deposit values. Fixed denominations reduce one obvious link source, but they do not hide wallet history, timing, or later recipient behavior.

| Denomination | Asset | Notes |
| --- | --- | --- |
| `0.005 ETH` | Native ETH | Fixed amount |
| `0.01 ETH` | Native ETH | Fixed amount |
| `0.02 ETH` | Native ETH | Fixed amount |
| `0.03 ETH` | Native ETH | Fixed amount |
| `0.05 ETH` | Native ETH | Fixed amount |
| `0.1 ETH` | Native ETH | Fixed amount |
| `0.2 ETH` | Native ETH | Fixed amount |
| `0.3 ETH` | Native ETH | Fixed amount |
| `0.5 ETH` | Native ETH | Fixed amount |
| `1 ETH` | Native ETH | Fixed amount |

## What gets written on-chain

The deposit wallet, amount, pool, commitment event, encrypted-note bytes, and timing are public. The plaintext note data the app uses to spend later is not posted as a public chain value.

:::risk_caveat
Fixed denominations improve amount grouping, but they do not remove timing or wallet-history links.
:::

## After deposit

Wait until the app shows the deposit state it expects before planning a withdrawal. Keep access to the same wallet, because that is how the app restores recoverable private notes. If you intend to withdraw later, choose a recipient strategy before spending, because the withdrawal destination will be public.
