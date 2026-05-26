# Nullark Shielded Balance Transfers

Nullark is a fixed-denomination shielded ETH balance system for MegaETH. Users deposit native ETH into `NullarkPool`; the app generates and handles private-balance note material through browser state and wallet-gated recovery; users later withdraw to a public MegaETH address with a Groth16 proof.

Public positioning:

> Send value through a denomination-based pool. Deposits and withdrawals are public. The current public release does not claim anonymity, unlinkability, sender privacy, receiver privacy, amount privacy, MEV protection, or chain-level transaction privacy.

This repository does not claim full transaction anonymity. MegaETH provides realtime transaction UX, not chain-level privacy.

## Current Status

- Product version: Nullark v1.2 fee-governance runtime.
- Current runtime: MegaETH mainnet chain ID `4326`.
- Current pool: `0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8`.
- Current withdrawal selector: `0x678d8506`.
- Current production relayer endpoint: `https://relayer.nullark.com/transaction`.
- Current withdrawal relayer: `0x8684bCb6D1deCb9b89733E7120625947615Cc14F`.
- `public-artifacts/current.json` records mainnet value-moving and relayer approval for the current runtime, prover artifacts, and relayer path. This public checkout does not contain the private operator evidence packet, so README text alone must not be used as production readiness approval.
- Production privacy claims remain outside the current public state unless a later public privacy-claims artifact is published and wired into runtime.

The public repo keeps runtime facts in one reviewable source of truth:

- Current public runtime: `public-artifacts/current.json`
- Public prover manifest: `apps/web/public/proving/withdraw-artifacts.manifest.json`
- Trusted setup record: `apps/web/public/proving/trusted-setup-record.json`
- Web env example: `apps/web/.env.example`
- Relayer Worker example: `services/relayer-worker/wrangler.example.toml`

Private operations such as funding, broadcast decisions, key rotation, smoke records, provider namespace IDs, and deployer runbooks are not public source artifacts.
Those private operator packets are intentionally kept outside this repository. Public verification checks prove the public runtime/source package boundary; if the private operator evidence is missing, stale, or unavailable in a workspace, production readiness is not proven from that workspace.

## Network Policy

- Mainnet target: MegaETH chain ID `4326`, RPC `https://mainnet.megaeth.com/rpc`.
- Testnet reference target: MegaETH testnet chain ID `6343`, RPC `https://carrot.megaeth.com/rpc`.
- `eth_sendRawTransactionSync` is for fast receipt UX. It is not a substitute for proof verification, invariant checks, or high-value finality policy.
- Never expose private keys, mnemonics, raw note material, wallet unlock signatures, or relayer signing material in browser code, logs, docs, screenshots, or commits.

## Repository Layout

- `apps/web/` - Vite web app and public prover artifacts.
- `apps/docs/` - local docs app/generator for `docs.nullark.com`.
- `contracts/` - Foundry contracts, generated mainnet verifier sources, and contract tests.
- `circuits/` - Circom sources, fixtures, and local artifact generation scripts.
- `packages/core/` - shared config, proof, note, recovery, and runtime validation helpers.
- `packages/sdk/` - app-independent Nullark SDK surface.
- `packages/cli/` - CLI wrapper over the SDK.
- `services/indexer/` - encrypted-note/event indexing and recovery helpers.
- `services/relay/` - relay request/calldata logic.
- `services/relayer-worker/` - Cloudflare Worker relayer entrypoint and public example config.
- `public-artifacts/` - public runtime and verification metadata.
- `docs/` - public user, developer, and security documentation.
- `examples/` - sanitized SDK and CLI examples.

Generated output and private local state such as `apps/web/dist-*`, `apps/docs/dist`, `.wrangler`, `broadcast`, `cache`, and `circuits/build` are not source of truth for the public package.

## Verification

Install dependencies:

```bash
npm install
```

Core local checks:

```bash
npm test
npm run typecheck
npm run contracts:test
npm run circuits:test
```

Public repo checks:

```bash
npm run docs:check
npm run public:verify
npm run secret-hygiene:validate
```

`public:verify` runs the public release boundary validator, tracked-secret scan, workspace tests, type checks, docs checks, and contract tests. It does not require private owner approvals, live-smoke records, deployment receipts, signing material, funding packets, or Cloudflare namespace records.

The public package intentionally does not expose `mainnet:readiness:*` scripts. Public launch state is published in `public-artifacts/current.json`; owner approvals, deployment receipts, funding/smoke evidence, scoped signing controls, and final operator evidence remain in the private ops packet and must be checked there before any production operation.

Dependency advisories are tracked separately:

```bash
npm run dependency-audit
```

The root public package audit is expected to pass. Circuit-local dependency changes remain a proof-parity surface; see `docs/security/dependency-audit.md` before applying dependency fixes or forced upgrades that could alter proof generation, calldata packing, Poseidon parity, or verifier compatibility.

Mainnet funding, broadcast, key-rotation, smoke, and fee-sweep operations are private operator workflows. They are not implied by this public repository.

## Local Web Dev

```bash
npm run dev:web
npm run dev:local-proof-service
```

`dev:web` starts the Vite web app. The local proof-service command is a disabled placeholder in this public repo; raw note material must stay out of backend custody and remote proof services. The app, browser storage, wallet unlock flow, and local prover boundary remain sensitive trust boundaries.

## Public Safety Boundary

Nullark keeps these facts public:

- deposits
- withdrawals
- fixed denominations
- destination address
- timing
- commitments
- nullifiers
- encrypted-note bytes
- relayer or wallet submitter

Nullark does not post these plaintext values as public chain data, but the app and browser still handle them and encrypted note envelopes are public chain/event data:

- note secret
- recovery secret
- spend material

Wallet unlock requests, app origin integrity, browser storage, raw note records, proof witnesses, and local prover boundaries are sensitive. A compromised wallet request, app origin, browser profile, or raw note record can expose or spend recoverable private balance.

The current public release does not support production anonymity, unlinkability, receiver privacy, amount privacy, sender privacy, MEV protection, or chain-level privacy claims.
