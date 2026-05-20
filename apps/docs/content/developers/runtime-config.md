---
title: "Runtime Config"
description: "Generated public runtime values and the allowlist for public docs."
section: "developers"
version: "current"
canonicalPath: "/developers/runtime-config/"
sourceRefs:
  - "public-artifacts/current.json"
status: "public"
order: "110"
---
Runtime-sensitive docs are generated from an allowlist. Public pages render the current fields users and developers need, without operator records, operator-only values, or smoke transaction records.

:::facts
Chain ID|`{{ runtime.chainId }}`
Pool block|`{{ runtime.poolDeploymentBlock }}`
Merkle depth|`{{ runtime.merkleTreeDepth }}`
Fee|`{{ runtime.withdrawalFeeBps }}` bps
:::

## Public Runtime Values

| Field | Current public value | Use |
| --- | --- | --- |
| Chain ID | `{{ runtime.chainId }}` | Wallet and proof binding |
| Pool | `{{ runtime.pool }}` | Deposit and withdrawal target |
| Withdrawal verifier | `{{ runtime.withdrawVerifier }}` | Proof verification reference |
| Withdrawal selector | `{{ runtime.withdrawSelector }}` | Public exit calldata reference |
| Public prover manifest | `{{ runtime.publicBrowserProverManifestPath }}` | Browser proof artifact lookup |
| Relayer endpoint label | `{{ runtime.relayerEndpointLabel }}` | Machine/API boundary label |

```json
{
  "chainId": "{{ runtime.chainId }}",
  "pool": "{{ runtime.pool }}",
  "withdrawSelector": "{{ runtime.withdrawSelector }}",
  "relayerEndpointLabel": "{{ runtime.relayerEndpointLabel }}"
}
```

## Allowlist Rule

:::checklist
- Public runtime values must match the current manifest allowlist.
- Operator-only evidence paths must stay out of `apps/docs/dist`.
- Source maps stay outside the generated public docs output.
- Search indexes are built only from rendered public pages.
:::

:::tabs
Public|Runtime values that users and developers need to verify the current app and contracts.
Operator-only|Evidence paths, operator records, raw smoke artifacts, and source maps used outside the public docs output.
:::
