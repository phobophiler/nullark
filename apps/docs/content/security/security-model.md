---
title: "Security model"
description: "Core assets, trust boundaries, and failure modes behind the public Nullark docs."
section: "security"
version: "current"
canonicalPath: "/security/security-model/"
sourceRefs:
  - "docs/security/threat-model.md"
  - "docs/security/threat-model.md"
status: "public"
order: "140"
---
Nullark separates user wallet actions, public chain records, relayer submission, and docs. Each boundary has different failure modes.

:::cards
Wallet-gated private balance|/users/private-balance-recovery/|Wallet control and official-app recovery prompts determine whether private balance can be restored safely.
Runtime bindings|/developers/runtime-config/|Chain, pool, verifier, selector, fee, and prover references must match the current public runtime.
Relayer boundary|/developers/architecture/|Relayer submission is bounded API behavior, not a privacy guarantee.
Privacy model|/security/privacy-model/|Public data, user-controlled choices, and linkability risks.
:::

## Boundary checks

:::checklist
- No docs page can connect a wallet or request a signature.
- No public docs output contains operator-only evidence paths or raw artifacts.
- Public runtime values are generated from allowlisted fields.
- Privacy language stays tied to visible system behavior and user checks.
- Relayer endpoint copy labels it as a machine/API endpoint.
:::
