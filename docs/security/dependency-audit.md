# Dependency Audit Notes

Last reviewed: 2026-05-25

## Current status

The root public dependency tree is expected to pass `npm run dependency-audit` with zero reported vulnerabilities.

The previous root audit finding reported `18 vulnerabilities (12 low, 3 moderate, 3 high)` through two dependency families:

- `circomlibjs@0.1.7 -> ethers@5.8.0 -> @ethersproject/* -> elliptic/ws`
- `snarkjs@0.7.5 -> bfj@7.1.0 -> jsonpath@1.3.0 -> underscore@1.13.6`

The public runtime path no longer depends on `circomlibjs`; SDK and browser note derivation use `poseidon-lite` with Poseidon parity tests covering the existing fixture boundary. Browser proving continues to use `snarkjs@0.7.5`, pinned from the root package, with an override to `bfj@9.1.3` so the audited `jsonpath -> underscore` path is not installed. `ws` is pinned to `8.21.0` through root overrides.

## Boundary assessment

`snarkjs` remains runtime-relevant for browser Groth16 proof generation and calldata formatting. Keep it pinned unless browser proof generation, public-input ordering, Solidity calldata packing, and verifier compatibility are revalidated.

The `circuits/` package is a local circuit toolchain and artifact-provenance surface, not part of the root public runtime `npm audit --omit=dev` gate. It still records `circomlibjs` and `snarkjs` versions used for circuit compilation/provenance. Changes there require circuit artifact parity checks, not only a dependency audit.

## Follow-up policy

Do not use `npm audit fix --force` for this tree without a proof-parity review. Forced changes can alter ZK/proving dependencies and must be validated against proof generation, public input ordering, verifier calldata, and Poseidon parity tests.

Remaining fixes should prefer one of these paths:

- Keep `npm run dependency-audit` as a failing CI gate for the root public package.
- Change `snarkjs`, `bfj`, or `ws` only with browser prover and calldata packing tests.
- Change `circuits/` dependencies only with circuit compile/provenance, artifact hash, and verifier compatibility checks.
- Keep any future unavoidable advisory documented with exposure, owner, and review date.

Root public dependency advisories are not treated as ignored. A future non-zero audit result should either be fixed without force or documented as an explicit release risk with proof/runtime impact analysis.
