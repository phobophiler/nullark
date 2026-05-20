# Security Policy

Nullark is value-moving software. Treat bugs in contracts, proving, note recovery, relayer validation, deployment scripts, and wallet-signing flows as security issues until proven otherwise.

## Supported Scope

Security reports are in scope for:

- `contracts/src/**`
- `circuits/**`
- `apps/web/src/**`
- `packages/core/**`
- `packages/sdk/**`
- `services/indexer/**`
- `services/relay/**`
- `services/relayer-worker/src/**`
- public prover manifests and artifact hash bindings under `apps/web/public/proving/`

Operator-only evidence, local deployment records, Cloudflare state, and private runbooks are outside the public repository.

## Report A Vulnerability

Do not open a public issue for a vulnerability that could move funds, expose note material, bypass relayer allowlists, replay signatures, or weaken proof verification.

Send a private report to the project maintainer with:

- affected component and file path
- chain and network, if relevant
- exploit preconditions
- impact
- minimal reproduction or proof of concept
- whether any private key, note material, proof witness, calldata, or live transaction data is involved

Do not include seed phrases, private keys, raw note secrets, wallet unlock signatures, or unredacted user data in the report.

## Public Security Boundary

Nullark does not claim production anonymity, unlinkability, sender privacy, receiver privacy, amount privacy, MEV protection, or chain-level transaction privacy.

These facts remain public on MegaETH:

- deposits
- withdrawals
- fixed denominations
- destination address
- timing
- commitments
- nullifiers
- encrypted-note bytes
- relayer or wallet submitter

Production privacy claims remain out of scope until the public security model and limitations are updated with reviewable evidence.

## Mainnet Actions

The public repository does not authorize:

- new deployments
- funding or key rotation
- relayer secret changes
- guarded-user cohorts
- new production privacy claims
- broader relayer selectors, pools, verifiers, or endpoints

Mainnet actions require operator authorization outside the public source repository.
