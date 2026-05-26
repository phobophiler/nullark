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

- Trusted setup status: approved in `public-artifacts/current.json`.
- Mainnet `4326` blocked in `public-artifacts/current.json`: no.
- Production relayer: approved by `public-artifacts/current.json`; not independently proven by private operator evidence in this public checkout.
- Current withdrawal relayer: `0x8684bCb6D1deCb9b89733E7120625947615Cc14F`.
- Mainnet value-moving: approved by `public-artifacts/current.json` for the current pool, selector, verifier, endpoint, and artifact-bound runtime; private operator evidence is required before treating a workspace as production-ready.
- Live smoke evidence: not present in this public checkout; verify the private v1.2 readiness evidence set before relying on this claim operationally.
- Automated value movement by the public artifact record: approved for the current v1.2 binding only; execution still requires private operator controls and evidence.
- Guarded-user runtime support: approved by `public-artifacts/current.json`; guarded-user rollout evidence is not present in this public checkout.
- Production privacy claims: not part of the current public state.
- Remaining public-runtime blockers in `public-artifacts/current.json`: none. Remaining workspace-local blocker: private operator evidence is not present here, so production readiness is not independently proven from this checkout.

The hash-pinned trusted setup record at `apps/web/public/proving/trusted-setup-record.json` is served from `https://nullark.com/proving/trusted-setup-record.json` and has SHA-256 `b87aa47a407f0347a920fcebe76f84d402be8bd5e82f5fe5980ffea557bfa996`. That record records `guardedUsersApproved: true` and `productionPrivacyClaimsApproved: false`. The public artifact state records value-moving and relayer approval for the exact runtime binding, while production privacy claims remain disabled.

The approval booleans in `public-artifacts/current.json` are evidence-bound by `approvalEvidence.publicApprovalSource` and scoped by `approvalSemantics`. Required private evidence before operational reliance includes owner approval, deployment receipts, funding and smoke evidence, relayer Worker deployment/self-test evidence, scoped signing controls, guarded-user rollout evidence, and incident/recovery stop-condition records.
