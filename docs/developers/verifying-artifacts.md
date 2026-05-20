# Verifying Artifacts

Use `public-artifacts/current.json` as the root public index. Then verify:

1. The pool and verifier addresses match the intended MegaETH chain ID.
2. The withdrawal selector is `0x678d8506`.
3. The browser prover manifest hash matches `artifacts.proverManifestSha256`.
4. The trusted setup record hash matches `artifacts.trustedSetupRecordSha256`.
5. `withdraw.wasm` and `withdraw_final.zkey` match the published SHA-256 values.
6. The Groth16 public input order has exactly 12 entries and matches the order in `current.json`.

Raw witnesses, private note material, proof blobs, unredacted calldata, and operator authorization records are not public verification artifacts.
