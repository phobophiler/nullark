---
title: "Withdraw public exit"
description: "Verify the public exit details before spending private balance into a normal address."
section: "users"
version: "current"
canonicalPath: "/users/withdraw-public-exit/"
sourceRefs:
  - "docs/public/README.md"
  - "docs/operators/README.md"
status: "public"
order: "50"
---
Withdrawing spends private balance into a public MegaETH address. The recipient, amount, timing, pool, and nullifier are public.

## Before you withdraw

Check the recipient, gross amount, fee, net amount, chain ID, pool, and submitter path in the app. Do not withdraw to an address that obviously links back to the deposit wallet unless that is acceptable.

| Check | Current value |
| --- | --- |
| Pool | `{{ runtime.pool }}` |
| Selector | `{{ runtime.withdrawSelector }}` |
| Fee | `{{ runtime.withdrawalFeeBps }}` bps |
| Submitter | Wallet or relayer path |

## Recipient choice

The withdrawal recipient is a public address. Confirm it is the address you intend to expose as the exit destination. Avoid immediate deposit-then-withdraw behavior and avoid reusing a recipient that makes the deposit wallet relationship obvious unless that is the intended outcome.

## Wallet submit or relayer submit

Wallet submit gives direct wallet control and makes the wallet the public transaction sender. Relayer submit can make the relayer the public sender, but it does not hide the withdrawal destination, amount, pool, nullifier, or timing.

| Submit path | Public sender | Still public | Boundary |
| --- | --- | --- | --- |
| Wallet submit | User wallet | Destination, amount, pool, nullifier, timing | Direct wallet transaction |
| Relayer submit | Relayer account | Destination, amount, pool, nullifier, timing | Machine/API endpoint |

See [Relayer Model](/operators/relayer-model/) for the machine/API boundary.

## After the transaction

Check the chain result against the app result: destination, fee, net amount, pool, and submitter path. A fast receipt is useful feedback, but if the visible destination or amount is wrong, treat it as an incident and stop using that note path.
