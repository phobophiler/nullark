# Public Artifacts

Public verification surface for Nullark.

- `current.json` is the stable source of truth for the current public runtime.
- `proving/` is reserved for prover artifact metadata.
- `contracts/` is reserved for public contract verification metadata.

Current public runtime status:

- v1.2 is the current production public artifact set for MegaETH mainnet runtime metadata.
- The current runtime is exactly the pool, verifier, selector, relayer endpoint, and artifact hashes pinned in `current.json`.
- v1.2 value-moving is enabled for the artifact-bound relayer path recorded in `current.json`.
- `current.json` does not by itself authorize new deployments, funding, key rotation, broader relayer endpoints, or production privacy claims.

Do not place operator decision records, funding records, private runbooks, raw witnesses, proof blobs, private keys, note material, or smoke records in this directory.
