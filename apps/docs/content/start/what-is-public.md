---
title: "What is public"
description: "A plain-language map of public chain data, wallet-gated private balance, and metadata risks."
section: "start"
version: "current"
canonicalPath: "/start/what-is-public/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/security/threat-model.md"
status: "public"
order: "30"
---
Nullark has two very different classes of information: public chain records and app-managed private balance state that is gated by the user's wallet. Do not mix them when asking for help, writing tests, or reviewing a transaction.

## Public by design

Deposits and withdrawals are public MegaETH transactions. The chain can show the pool, fixed amount, commitment, accepted root, nullifier, submitter path, withdrawal destination, events, and timing. Relayer submission changes the public sender path, but it does not remove the destination, amount, pool, nullifier, or timing.

## Wallet-gated private state

:::facts
Private balance|Shown by the app after wallet unlock
Recoverable notes|Rescanned by the app for the connected wallet
Wallet unlock|Approve only on the official app origin
Seed phrases|Never enter into Nullark docs or support
:::

In normal use, the app and browser handle private note data, and wallet access gates recovery. Docs and support do not need raw note records, note secrets, spend material, wallet unlock signatures, private keys, or seed phrases. If a wallet request, app origin, browser profile, local storage, or unlock flow is compromised, someone else may be able to recover or spend private balance tied to that wallet.

## Where links come from

:::risk_caveat
Timing correlation, recipient reuse, small anonymity sets, app behavior, and later wallet activity can link activity even when private note data is not published.
:::

The practical link sources are usually outside the proof itself: deposit wallet history, withdrawal recipient reuse, short timing gaps, uncommon operating patterns, relayer metadata, and later movement from the public recipient. Review those choices before withdrawing, not after the transaction is final.

## Practical rule

Treat every deposit and withdrawal as public. Treat wallet unlock prompts and app-managed private note data as sensitive. Use docs to decide what to check; use the app to perform wallet actions.
