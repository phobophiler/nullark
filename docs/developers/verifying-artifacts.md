# Verifying Artifacts

Use `public-artifacts/current.json` as the root public index for the current production public artifact set. As of this document, that runtime is Nullark v1.2 on MegaETH mainnet. Do not use superseded v1.1 public artifacts, hashes, or relayer records as v1.2 artifact verification.

For the current v1.2 runtime, verify:

1. The pool and verifier addresses match the intended MegaETH chain ID.
2. The withdrawal selector is `0x678d8506`.
3. The browser prover manifest hash matches `artifacts.proverManifestSha256`.
4. The trusted setup record hash matches `artifacts.trustedSetupRecordSha256`.
5. `withdraw.wasm` and `withdraw_final.zkey` match the published SHA-256 values.
6. The Groth16 spend public input order has exactly 10 v1.2 entries and matches the order in `current.json`: `root`, `nullifier`, `outputCommitment`, `destination`, `grossAmount`, `fee`, `chainId`, `verifyingContract`, `proofContextHash`, `encryptedOutputNoteHash`.
7. Any approval boolean in `current.json` is interpreted only through `approvalEvidence` and `approvalSemantics`; the trusted setup record hash must match `approvalEvidence.publicApprovalSource.sha256`.

## v1.2 Runtime Boundary

v1.2 is promoted only through the current public artifact record and its pinned readiness evidence. Draft implementation files, generated artifacts, validator modes, labels, or docs are not enough by themselves.

The v1.2 deposit public input order is 6 entries: `commitment`, `amount`, `chainId`, `verifyingContract`, `depositContextHash`, `encryptedDepositNoteHash`.

The v1.2 spend public input order is 10 entries: `root`, `nullifier`, `outputCommitment`, `destination`, `grossAmount`, `fee`, `chainId`, `verifyingContract`, `proofContextHash`, `encryptedOutputNoteHash`.

The v1.2 spend order must not include public `newCommitment`, `spentCommitment`, `noteAmount`, old note amount, public output amount, or full-vs-partial withdrawal status. Any v1.2 record that depends on those fields as public spend inputs is stale and must block artifact verification.

Treat production privacy claims as fail-closed until a future public privacy-claims artifact explicitly enables them. The current v1.2 runtime enables the value-moving relayer path for the exact pool, selector, verifier, endpoint, and artifact hashes in `public-artifacts/current.json`.

Raw witnesses, private note material, proof blobs, unredacted calldata, and operator authorization records are not public verification artifacts.

Public artifact verification does not prove private operator evidence, funding, signing controls, guarded-user rollout evidence, or production readiness from a local checkout.
