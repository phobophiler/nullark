# Current Docs Index

Public entrypoint for the `docs/` tree.

## Current Source Of Truth

- Public machine-readable runtime: `public-artifacts/current.json`
- Public package: `docs/public/README.md`
- Security threat model: `docs/security/threat-model.md`
- Known limitations: `docs/security/known-limitations.md`
- Security reporting: `docs/security/reporting.md`
- Runtime config: `docs/developers/runtime-config.md`
- Artifact verification: `docs/developers/verifying-artifacts.md`

## Public Source Policy

Historical, superseded, blocked, testnet-only, sandbox-only, old-pool, operator decision, smoke, funding, key-rotation, and Cloudflare records are not public runtime sources of truth. `public-artifacts/current.json` is the canonical machine-readable public runtime file.

## Current Mainnet Runtime Summary

- Chain: MegaETH mainnet `4326`
- RPC: `https://mainnet.megaeth.com/rpc`
- Pool: `0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15`
- Withdraw verifier: `0x9023FAfB13320D4A34AAD6C25E0411862b0E3397`
- Private-transfer verifier: `0x0C78dE1615892205908810bF0129f10165346B57`
- Verifier adapter: `0x311d92DAc355F239B039C4298A7f374E09E23e52`
- Poseidon2: `0x9146549928FEABd8c63Ee04371672D958deAc563`
- Fee controller: `0x3de86495E180c418e9189Af7Fba51BB20C49Ba00`
- Withdrawal selector: `0x678d8506`
- Production relayer endpoint: `https://relayer.nullark.com/transaction`

## Current Mainnet Decision Summary

- Trusted setup status: mainnet.
- Mainnet `4326` blocked: no.
- Production relayer: enabled.
- Current withdrawal relayer: `0x4246e9271D82eFDfEE1566A98dF2858B52f88d77`.
- Mainnet value-moving: enabled for the current pool, selector, verifier, endpoint, and artifact-bound runtime.
- Live smoke evidence: recorded for the May 19 deposit and withdrawal.
- Automated value movement by the trusted setup record itself: no.
- Guarded-user cohorts, invites, and support SLA claims: not part of the current public state.
- Production privacy claims: not part of the current public state.
- Remaining blockers for the current value-moving runtime: none.

The current live trusted-setup record at `https://nullark.com/proving/trusted-setup-record.json` records `guardedUsersApproved: false` and `productionPrivacyClaimsApproved: false`. The public state is value-moving and relayer-enabled for the current runtime, while guarded-user rollout and production privacy claims remain disabled.
