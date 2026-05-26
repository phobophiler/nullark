# SDK Basic Example

Minimal SDK example without note secrets or live signing.

```ts
import { getCurrentRuntime } from "@nullark/sdk";

const runtime = getCurrentRuntime();

console.log({
  chainId: runtime.chainId,
  pool: runtime.pool,
  withdrawSelector: runtime.withdrawSelector,
  privacyClaimsApproved: false
});
```

Do not put private keys, note secrets, wallet unlock signatures, raw witnesses, proof blobs, or live calldata in examples.
