# Threat Model

## Assets

- ETH held by `NullarkPool`
- note secrets and recovery material
- withdrawal nullifiers
- prover artifact identity
- relayer funds and signing authority
- runtime configuration used by the web app, SDK, CLI, and relayer

## Actors

- users who deposit and withdraw
- public recipients
- wallet providers
- relayers
- indexers
- RPC providers
- maintainers and operators

## Invariants

- no unauthorized withdrawal
- no double spend
- no inflation
- no stuck user principal from accounting drift
- no relayer submission outside the allowed pool, chain, selector, and verifier binding
- no public privacy claim beyond the documented limitations

## Boundaries

Docs are read-only. The web app handles wallet interaction. The relayer is an API endpoint, not a place to paste note material. Private operational runbooks, keys, Cloudflare state, and funding records are outside the public repo.
