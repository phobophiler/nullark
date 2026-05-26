---
title: "Private-balance recovery"
description: "Recover wallet-scoped private balance without treating docs as a recovery surface."
section: "users"
version: "current"
canonicalPath: "/users/private-balance-recovery/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/security/threat-model.md"
status: "public"
order: "60"
---
Recovery is wallet-scoped. Decide whether the app can rescan recoverable notes for the wallet you still control before approving any unlock request.

## What recovery can restore

If the same wallet is available, the app can rescan public encrypted on-chain note events and decrypt matching records after wallet unlock. This helps with a new browser, refreshed local state, or a device migration where wallet custody is still intact.

| Situation | Expected outcome | What to check |
| --- | --- | --- |
| Same wallet, new browser | App can rescan recoverable events | Official app origin and expected wallet |
| Same wallet, new device | Recovery can work after wallet setup | Wallet account matches the deposit path |
| Cleared local storage | App can rebuild from public events and wallet unlock | Unlock request appears only on the app origin |

## What it cannot restore

Recovery cannot replace wallet custody or browser/app integrity. If the wallet is lost, private balance tied to that wallet can become unrecoverable. If a wallet unlock request was approved on a fake domain, or if the app origin or browser profile is compromised, someone else may already have enough access to recover or spend private balance.

## Safe recovery checklist

Use only the official app origin. Do not paste raw note records, wallet signatures, private keys, or seed phrases into docs, support chats, or unknown websites.

:::checklist
- Verify the app origin before approving an unlock request.
- Confirm the wallet account is the one that created the recoverable notes.
- Stop if any site asks for a seed phrase, private key, raw note record, wallet unlock signature, debug spend material, or recovery screenshot.
:::

## Failure cases

:::risk_caveat
Wallet-level recovery improves device portability. It does not protect users who lose wallet control or approve unlock prompts on a fake domain.
:::

If recovery does not find a note, check the wallet account, chain `{{ runtime.chainId }}`, and pool `{{ runtime.pool }}` before assuming funds are gone. If the wallet was compromised, stop using the affected recovery path and avoid sharing further material while investigating.
