# Circuit Proving Artifacts

Status: Nullark v1.1 circuit sources and local generation harness.

The current mainnet web app serves the withdrawal WASM and final zkey from `apps/web/public/proving/`, hash-bound through `apps/web/public/proving/withdraw-artifacts.manifest.json` and `apps/web/public/proving/trusted-setup-record.json`. The `circuits/` directory remains the source and local regeneration/test harness. Generated local outputs under `circuits/build/` are ignored in the clean GitHub repo and are not source of truth by directory name.

The current public release does not support production anonymity, unlinkability, receiver privacy, amount privacy, sender privacy, MEV protection, or chain-level transaction privacy claims.

## Hard Boundary

- MegaETH chain binding: chain ID `6343` testnet or `4326` mainnet. Contract-side public input rechecks still prevent cross-chain proof replay.
- Current mainnet runtime is chain ID `4326`, pool `0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15`, and withdraw verifier `0x9023FAfB13320D4A34AAD6C25E0411862b0E3397`.
- No private keys, signing, deployment, or real fund movement.
- `MockVerifier` remains local-only.
- Guarded-user cohorts and production privacy claims are outside the current public state.
- Files under `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/` are generated for local review only and are not source of truth for mainnet. Current checked-in mainnet verifier sources live under `contracts/src/verifiers/generated/mainnet/`.

## Public Input Order

Both `private_transfer.circom` and `withdraw.circom` expose public inputs in this exact order:

1. `root`
2. `nullifier`
3. `newCommitment`
4. `destination`
5. `grossAmount`
6. `fee`
7. `chainId`
8. `verifyingContract`
9. `spentCommitment`
10. `noteAmount`
11. `proofContextHash`
12. `encryptedNoteHash`

This order mirrors the current Solidity and TypeScript proof-input boundary.

## Files

- `private_transfer.circom`: full-note private-transfer compile target.
- `withdraw.circom`: withdrawal compile target with fee binding.
- `include/poseidon_hashes.circom`: Poseidon note-commitment and nullifier templates.
- `include/merkle_membership.circom`: wrapper around `@zk-kit/binary-merkle-root.circom`.
- `scripts/generate-fixtures.mjs`: TypeScript/JavaScript Poseidon model used to regenerate circuit fixtures.
- `scripts/witness-check.mjs`: valid and negative witness-generation harness.
- `scripts/generate-groth16-artifacts.mjs`: local untrusted pot13, zkey, proof, verification-key, public-signal, and Solidity-verifier generation.
- `scripts/write-provenance-manifest.mjs`: artifact hash and command manifest writer.
- `fixtures/private_transfer.valid.json`: valid private-transfer circuit input.
- `fixtures/private_transfer.mainnet_valid.json`: valid private-transfer circuit input for MegaETH mainnet chain ID `4326`.
- `fixtures/private_transfer.bad_chain_id.json`: negative fixture for unsupported chain ID `1`.
- `fixtures/private_transfer.bad_encrypted_note_hash.json`: negative fixture for mismatched encrypted-note hash.
- `fixtures/private_transfer.bad_leaf_index.json`: negative fixture for out-of-range `leafIndex`.
- `fixtures/private_transfer.bad_new_commitment.json`: negative fixture for mismatched output commitment.
- `fixtures/private_transfer.bad_nullifier.json`: negative fixture for mismatched nullifier.
- `fixtures/private_transfer.bad_path_element.json`: negative fixture for mutated Merkle sibling data.
- `fixtures/private_transfer.bad_proof_context_hash.json`: negative fixture for mismatched proof-context hash.
- `fixtures/private_transfer.bad_root.json`: negative fixture for mismatched root.
- `fixtures/private_transfer.bad_verifying_contract.json`: negative fixture for mismatched verifier binding.
- `fixtures/private_transfer.bad_verifying_contract_width.json`: negative fixture for an out-of-range verifier address.
- `fixtures/withdraw.valid.json`: valid withdrawal circuit input.
- `fixtures/withdraw.mainnet_valid.json`: valid withdrawal circuit input for MegaETH mainnet chain ID `4326`.
- `fixtures/withdraw.bad_chain_id.json`: negative fixture for unsupported chain ID `1`.
- `fixtures/withdraw.bad_destination.json`: negative fixture for mismatched withdrawal destination.
- `fixtures/withdraw.bad_encrypted_note_hash.json`: negative fixture for mismatched encrypted-note hash.
- `fixtures/withdraw.bad_fee.json`: negative fixture for fee mismatch.
- `fixtures/withdraw.bad_gross_amount.json`: negative fixture for mismatched gross amount.
- `fixtures/withdraw.bad_leaf_index.json`: negative fixture for out-of-range `leafIndex`.
- `fixtures/withdraw.bad_nonzero_commitment_without_change.json`: negative fixture for a nonzero output commitment without private change.
- `fixtures/withdraw.bad_nullifier.json`: negative fixture for mismatched nullifier.
- `fixtures/withdraw.bad_path_element.json`: negative fixture for mutated Merkle sibling data.
- `fixtures/withdraw.bad_proof_context_hash.json`: negative fixture for mismatched proof-context hash.
- `fixtures/withdraw.bad_root.json`: negative fixture for mismatched root.
- `fixtures/withdraw.bad_verifying_contract.json`: negative fixture for mismatched verifier binding.
- `fixtures/withdraw.bad_verifying_contract_width.json`: negative fixture for an out-of-range verifier address.
- `fixtures/withdraw.zero_fee.valid.json`: valid tiny withdrawal fixture where the 33 bps fee rounds to zero.
- `fixtures/withdraw_split.valid.json`: valid private-change withdrawal fixture.
- `fixtures/withdraw_split.dust_change.valid.json`: valid private-change withdrawal fixture where retained change is a supported dust-sized denomination.
- `fixtures/withdraw_split.bad_change_amount.json`: negative fixture for mismatched change amount.
- `fixtures/withdraw_split.bad_encrypted_note_hash.json`: negative fixture for mismatched private-change encrypted-note hash.
- `fixtures/withdraw_split.bad_new_commitment.json`: negative fixture for mismatched private-change commitment.
- `fixtures/withdraw_split.bad_proof_context_hash.json`: negative fixture for mismatched private-change proof-context hash.
- `fixtures/withdraw_split.bad_zero_change_commitment.json`: negative fixture for missing private-change commitment.

## Current Circuit Model

- note commitment: `Poseidon(10001, assetId, amount, ownerCommitment, noteSecret)`
- nullifier: `Poseidon(10002, noteSecret, leafIndex, chainId, verifyingContract)`
- Merkle membership: `BinaryMerkleRoot(20)` from `@zk-kit/binary-merkle-root.circom`, using `leafIndex` as the only path-direction source. The local Solidity root policy uses the same depth and circomlibjs PoseidonT3 parameters for append-only insertion tests.
- chain boundary: public `chainId` must equal MegaETH testnet chain ID `6343` or MegaETH mainnet chain ID `4326`.
- verifier binding: public `verifyingContract` must be less than `2^160`.
- private-transfer shape: public `destination`, `grossAmount`, and `fee` must be zero; old and new note amounts are equal.
- withdrawal shape: public `newCommitment` is zero for full-note exits or the Poseidon commitment for retained shielded change, destination is public and bound to the witness destination, and `fee` must equal Solidity-style floor division `(grossAmount * 33) / 10000`.
- proof context: public `proofContextHash` binds the action context used by the TypeScript/Solidity boundary.
- encrypted note binding: public `encryptedNoteHash` binds the encrypted note or private-change encrypted note expected by the runtime.

The circuit interface has no `pathIndices` witness input. `BinaryMerkleRoot(20)` decomposes `leafIndex`, so `leafIndex < 1048576` is enforced and there is only one source of Merkle path direction.

## Tool Versions

- `circom`: `2.2.3`
- `snarkjs`: `0.7.5`
- `circomlib`: `2.0.5`
- `circomlibjs`: `0.1.7`
- `@zk-kit/binary-merkle-root.circom`: `2.0.0`

## Local Compile Commands

From `circuits/`:

```bash
npm test
```

Running `npm test` deletes `build/`, regenerates fixtures, compiles both circuits, runs witness checks, generates local untrusted Groth16 artifacts, verifies valid proofs, checks mutated public-signal rejection, and writes `build/provenance/manifest.json`. Valid fixtures must pass. Mainnet-chain, root, Merkle sibling, nullifier, verifier, verifier-width, destination, gross amount, fee, leaf-index, and output-commitment mutations must fail; zero-fee tiny withdrawals must pass.

To run the steps manually:

```bash
npm run fixtures
npm run compile
npm run witness
npm run groth16
npm run manifest
```

To inspect circuit metadata:

```bash
npx snarkjs r1cs info build/private_transfer/private_transfer.r1cs
npx snarkjs r1cs info build/withdraw/withdraw.r1cs
```

Current metadata:

- `private_transfer`: metadata is recorded in `build/provenance/manifest.json`.
- `withdraw`: metadata is recorded in `build/provenance/manifest.json`.

## Local Groth16 Artifacts

The local build generates:

- `build/groth16/powersoftau/pot13_final.ptau`
- `build/groth16/private_transfer/private_transfer_final.zkey`
- `build/groth16/private_transfer/verification_key.json`
- `build/groth16/private_transfer/proof.json`
- `build/groth16/private_transfer/public.json`
- `build/groth16/withdraw/withdraw_final.zkey`
- `build/groth16/withdraw/verification_key.json`
- `build/groth16/withdraw/proof.json`
- `build/groth16/withdraw/public.json`
- `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16PrivateTransferVerifier.sol`
- `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16WithdrawVerifier.sol`

The Powers of Tau and zkey contributions generated by this local command are local development artifacts unless they are separately selected and hash-bound by the current trusted setup record. The current public app uses the artifacts published under `apps/web/public/proving/` and bound by the public manifest.

## Remaining Gates

Current mainnet value-moving is limited to the current runtime and current public prover artifact hashes. These areas remain separate:

- guarded-user cohorts
- production privacy claims
- new deployments
- funding or key rotation
- broader relayer selectors, pools, verifiers, or endpoints
