---
title: "Privacy model"
description: "What Nullark hides, what remains public, and which user actions can still create links."
section: "security"
version: "current"
canonicalPath: "/security/privacy-model/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/security/known-limitations.md"
status: "public"
order: "130"
---
Privacy depends on the plaintext note boundary, the public chain data, and the user's address and timing choices.

## The claim

Plaintext private note data is not posted as a public chain value. The app encrypts recoverable note material into public encrypted-note events, and a withdrawal proves spend authorization against accepted pool state without publishing the plaintext note data. The surrounding deposit and withdrawal transactions remain visible.

:::non_claim
Public docs make no production privacy, anonymity, unlinkability, sender privacy, receiver privacy, amount privacy, MEV-protection, or chain-level privacy claims.
:::

## What remains public

:::facts
Deposits|Public
Withdrawals|Public
Destinations|Public
Private note data|App/browser handled and wallet-gated
:::

Deposit wallets, withdrawal destinations, fixed amounts, timing, pool interaction, submitter path, commitments, roots, nullifiers, and events are public. Relayer submission changes the submitter path, not the public destination or amount.

## Where links come from

:::risk_caveat
Recipient reuse, small anonymity sets, timing patterns, off-chain behavior, and later wallet activity can make activity linkable.
:::

The highest-risk links usually come from user choices: depositing and withdrawing close together, withdrawing to a known wallet, reusing recipients, sharing screenshots, approving unlock prompts on fake domains, or moving funds in a way that ties the exit address back to a known identity.

## How to reduce avoidable links

Before withdrawing, review recipient reuse, timing, submitter path, and later wallet activity. Do not use relayer submit as recipient hiding. Do not publish raw note records, wallet unlock screenshots, or recovery screenshots. If a choice would obviously identify the flow, change the choice before submitting.
