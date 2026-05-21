# Dependency Audit Notes

Last reviewed: 2026-05-21

## Current status

The public dependency tree has been updated so direct `viem` consumers resolve to `viem@2.50.4`, which removes the production `viem -> ws` advisory from `npm audit --omit=dev`.

`npm audit --omit=dev` still reports advisories through two dependency families:

- `circomlibjs@0.1.7 -> ethers@5.8.0 -> @ethersproject/* -> elliptic/ws`
- `snarkjs@0.7.5 -> bfj@7.1.0 -> jsonpath@1.3.0 -> underscore@1.13.6`

## Exposure assessment

`circomlibjs` is used for Poseidon-compatible note derivation in the SDK and browser app. This path is runtime-relevant, but the exposed use is Poseidon construction, not wallet creation, private-key import, JSON wallet parsing, or transaction signing through `ethers@5`.

`snarkjs` is used by the browser prover path for Groth16 proof generation and calldata formatting. The reported `underscore` advisory is a recursive input denial-of-service issue in a transitive JSON utility path. It is not part of server request handling, but it remains in the browser proving dependency tree.

## Follow-up policy

Do not use `npm audit fix --force` for this tree without a proof-parity review. Forced changes can alter ZK/proving dependencies and must be validated against proof generation, public input ordering, verifier calldata, and Poseidon parity tests.

Remaining fixes should prefer one of these paths:

- Upgrade `circomlibjs` only if Poseidon output parity is proven against existing fixtures and contract tests.
- Replace or isolate `snarkjs` only if browser proof generation and calldata packing remain byte-compatible.
- Keep advisories documented when no safe upstream fix exists and runtime exposure is bounded.
