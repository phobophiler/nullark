---
title: "Troubleshooting"
description: "Fast checks for common user, relayer, recovery, and runtime confusion."
section: "troubleshooting"
version: "current"
canonicalPath: "/troubleshooting/"
sourceRefs:
  - "docs/public/README.md"
status: "public"
order: "200"
---
Start by identifying which boundary you are in: docs, app, relayer, wallet, or chain.

:::cards
I cannot see balance|/users/private-balance-recovery/|Check wallet account, official app origin, chain ID, and pool before assuming funds are gone.
Withdrawal failed|/users/withdraw-public-exit/|Check recipient, amount, fee, accepted root, chain, pool, and submitter path.
Relayer unavailable|/developers/architecture/|Use the architecture page to understand fallback and metadata tradeoffs.
Runtime looks wrong|/developers/runtime-config/|Compare public values against the generated runtime reference.
:::

## Do Not Paste These Into Docs Or Support

You normally should not see these in the main app. If any site asks you to paste them, stop and verify the origin.

:::checklist
- Note secrets.
- Spend material.
- Wallet unlock signatures.
- Private keys or seed phrases.
- Raw proof or calldata payloads.
:::

If a public docs page asks for wallet connection or raw note records, treat that as the wrong surface.
