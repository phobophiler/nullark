# Contributing

Nullark welcomes review and patches, but security boundaries are stricter than ordinary web apps because the project handles value-moving flows, note material, proofs, relayer submission, and MegaETH mainnet configuration.

## Before Opening A Pull Request

Run the checks that match your change:

```bash
npm test
npm run typecheck
npm run secret-hygiene:validate
```

For contract changes:

```bash
npm run contracts:test
```

For circuit changes:

```bash
npm run circuits:test
```

For docs changes:

```bash
npm run docs:check
```

## Hard Rules

- Do not commit `.env*`, `.wrangler/`, private keys, seed phrases, raw note material, wallet unlock signatures, proofs, witnesses, or unredacted calldata.
- Do not add production privacy claims unless the public safety boundary is explicitly updated.
- Do not add a mainnet broadcast, funding, key-rotation, or deployment path that can run without an explicit operator gate.
- Do not broaden relayer selectors, pools, verifiers, endpoints, chain IDs, or transaction value policy without tests.
- Do not turn docs into a wallet or recovery surface. Docs must never ask users to paste note material or approve signatures.

## Tests

Keep tests in the source repository. They are part of the public review surface.

Do not ship tests in production runtime bundles unless a package intentionally publishes source tests as examples.

## Public Copy

Use precise language:

- "fixed-denomination notes"
- "wallet-gated recovery"
- "proof-checked public exits"
- "note secrets are not public chain data"

Avoid unsupported claims:

- anonymity
- unlinkability
- hidden sender
- hidden receiver
- hidden amount
- MEV protection
- chain-level privacy

## Private Operations

Keep operator-only decision records, provider namespace IDs, smoke records, funding records, key rotation plans, and deployment runbooks out of public commits. Public documentation belongs under `docs/`; private operations belong outside the public repository or in disabled templates.
