# Current Docs Index

Public entrypoint for the `docs/` tree.

## Current Source Of Truth

- Public machine-readable runtime: `public-artifacts/current.json`
- Private/operator manifests: held outside the public repository
- Public package: `docs/public/README.md`
- Security threat model: `docs/security/threat-model.md`
- Known limitations: `docs/security/known-limitations.md`
- Security reporting: `docs/security/reporting.md`
- Runtime config: `docs/developers/runtime-config.md`
- Artifact verification: `docs/developers/verifying-artifacts.md`

## Public Source Policy

Historical, superseded, blocked, testnet-only, sandbox-only, old-pool, operator decision, smoke, funding, key-rotation, and Cloudflare records are not public runtime sources of truth. `public-artifacts/current.json` is the canonical machine-readable public runtime file.

## Current Mainnet Runtime Summary

This section describes the current v1.2 production runtime. `public-artifacts/current.json` remains the canonical machine-readable source of truth for these values.

- Chain: MegaETH mainnet `4326`
- RPC: `https://mainnet.megaeth.com/rpc`
- Pool: `0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8`
- Deposit verifier: `0x1c62f992d1B2499f0E4CE3DecD4c0833d3B7C691`
- Private-transfer verifier: `0xd61c14635A7951E6E330a75814304656Db7e9ee9`
- Withdraw verifier: `0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92`
- Verifier adapter: `0xc63269E567f4984Cd5d5ED4D27117c589732b186`
- Poseidon2: `0x962dB28fe5Ae5737FdE62F438309cFFDefE8C182`
- Fee controller: `0x951b8ABC24528Fb2512f813504fbA0bC88638911`
- Withdrawal selector: `0x678d8506`
- Production relayer endpoint: `https://relayer.nullark.com/transaction`

## Current Mainnet Decision Summary

- Trusted setup status: mainnet.
- Mainnet `4326` blocked: no.
- Production relayer: enabled.
- Current withdrawal relayer: `0x8684bCb6D1deCb9b89733E7120625947615Cc14F`.
- Mainnet value-moving: enabled for the current pool, selector, verifier, endpoint, and artifact-bound runtime.
- Live smoke evidence: recorded in the v1.2 readiness evidence set.
- Automated value movement by the public artifact record: enabled for the current v1.2 binding only.
- Guarded-user runtime support: enabled by `public-artifacts/current.json`.
- Production privacy claims: not part of the current public state.
- Remaining blockers for the current v1.2 value-moving runtime: none.

The current live trusted-setup record at `https://nullark.com/proving/trusted-setup-record.json` records `guardedUsersApproved: true` and `productionPrivacyClaimsApproved: false`. The public state is value-moving and relayer-enabled for the current runtime, while production privacy claims remain disabled.
