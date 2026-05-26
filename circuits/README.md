# Circuit Proving Artifacts

Status: Nullark v1.2 circuit sources and local regeneration/test harness for the current 10-input unlinkable withdrawal statement. The current served v1.2 proving artifacts are hash-bound by `apps/web/public/proving/` and `public-artifacts/current.json`; freshly regenerated local outputs under `circuits/build/` are not source of truth by directory name.

The current mainnet web app serves the withdrawal WASM and final zkey from `apps/web/public/proving/`, hash-bound through `apps/web/public/proving/withdraw-artifacts.manifest.json` and `apps/web/public/proving/trusted-setup-record.json`. The `circuits/` directory remains the source and local regeneration/test harness. Generated local outputs under `circuits/build/` are ignored in the clean GitHub repo and are not source of truth by directory name.

The current public release does not support production anonymity, unlinkability, receiver privacy, amount privacy, sender privacy, MEV protection, or chain-level transaction privacy claims.

## Hard Boundary

- MegaETH chain binding: chain ID `6343` testnet or `4326` mainnet. Contract-side public input rechecks still prevent cross-chain proof replay.
- Current mainnet runtime is chain ID `4326`, pool `0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8`, and withdraw verifier `0x608631548f3ab9da82B5C9a2c4Fb3d76Ef8beE92`.
- No private keys, signing, deployment, or real fund movement.
- `MockVerifier` remains local-only.
- Guarded-user cohorts and production privacy claims are outside the current public state.
- Files under `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/` are generated for local review only and are not source of truth for mainnet. Current checked-in mainnet verifier sources live under `contracts/src/verifiers/generated/mainnet/`.

## Public Input Orders

`private_transfer.circom` and the v1.1 `withdraw.circom` expose public inputs in this exact 12-input order:

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

This order mirrors the current v1.1 Solidity and TypeScript proof-input boundary. It is linkable by design because `spentCommitment` and `noteAmount` are public inputs.

The current v1.2 `withdraw_v1_2.circom` exposes public inputs in this exact frozen 10-input order:

1. `root`
2. `nullifier`
3. `outputCommitment`
4. `destination`
5. `grossAmount`
6. `fee`
7. `chainId`
8. `verifyingContract`
9. `proofContextHash`
10. `encryptedOutputNoteHash`

The v1.2 public statement does not expose public `spentCommitment` or `noteAmount`. The consumed note amount and retained output amount are hidden witness values named `oldAmount` and `outputAmount`.

## Files

- `private_transfer.circom`: full-note private-transfer compile target.
- `withdraw.circom`: v1.1 withdrawal compile target with the approved 33 bps fee formula.
- `withdraw_v1_2.circom`: current v1.2 withdrawal compile target with the frozen 10-input public order.
- `include/poseidon_hashes.circom`: Poseidon note-commitment and nullifier templates.
- `include/merkle_membership.circom`: wrapper around `@zk-kit/binary-merkle-root.circom`.
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
- `fixtures/withdraw.bad_fee.json`: v1.1 negative fixture for fee mismatch against the 33 bps circuit formula.
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
- `fixtures/withdraw.v1_2.governed_fee.valid.json`: v1.2-only valid withdrawal fixture where public `fee` is intentionally not derived from the v1.1 33 bps circuit formula; the contract/runtime feeBps check is the fee-rate authority.
- `fixtures/withdraw.v1_2.split.valid.json`: v1.2-only valid split withdrawal fixture using output-note witness fields.
- `fixtures/withdraw.v1_2.bad_chain_id.json`: v1.2-only negative fixture for unsupported chain ID `1`.
- `fixtures/withdraw.v1_2.bad_destination.json`: v1.2-only negative fixture for mismatched withdrawal destination.
- `fixtures/withdraw.v1_2.bad_gross_amount.json`: v1.2-only negative fixture for mismatched gross amount.
- `fixtures/withdraw.v1_2.bad_proof_context_hash.json`: v1.2-only negative fixture for mismatched proof-context hash.
- `fixtures/withdraw.v1_2.bad_encrypted_output_note_hash.json`: v1.2-only negative fixture for mismatched encrypted output-note hash.
- `fixtures/withdraw.v1_2.bad_output_commitment.json`: v1.2-only negative fixture for mismatched always-output commitment.
- `fixtures/withdraw.v1_2.bad_leaf_index.json`: v1.2-only negative fixture for out-of-range `leafIndex`.
- `fixtures/withdraw.v1_2.bad_nullifier.json`: v1.2-only negative fixture for mismatched nullifier.
- `fixtures/withdraw.v1_2.bad_path_element.json`: v1.2-only negative fixture for mutated Merkle sibling data.
- `fixtures/withdraw.v1_2.bad_root.json`: v1.2-only negative fixture for mismatched root.
- `fixtures/withdraw.v1_2.bad_verifying_contract.json`: v1.2-only negative fixture for mismatched verifier binding.
- `fixtures/withdraw.v1_2.bad_verifying_contract_width.json`: v1.2-only negative fixture for an out-of-range verifier address.

## Current Circuit Model

- note commitment: `Poseidon(10001, assetId, amount, ownerCommitment, noteSecret)`
- nullifier: `Poseidon(10002, noteSecret, leafIndex, chainId, verifyingContract)`
- Merkle membership: `BinaryMerkleRoot(20)` from `@zk-kit/binary-merkle-root.circom`, using `leafIndex` as the only path-direction source. The local Solidity root policy uses the same depth and PoseidonT3 parameters for append-only insertion tests.
- chain boundary: public `chainId` must equal MegaETH testnet chain ID `6343` or MegaETH mainnet chain ID `4326`.
- verifier binding: public `verifyingContract` must be less than `2^160`.
- private-transfer shape: public `destination`, `grossAmount`, and `fee` must be zero; old and new note amounts are equal.
- v1.1 withdrawal shape: public `newCommitment` is zero for full-note exits or the Poseidon commitment for retained shielded change, destination is public and bound to the witness destination, and `fee` must equal Solidity-style floor division `(grossAmount * 33) / 10000`.
- v1.2 withdrawal shape: `withdraw_v1_2.circom` uses the frozen 10-input unlinkable public order. Public `outputCommitment` is always bound to the computed output note commitment, including zero-value dummy outputs; `spentCommitment`, `noteAmount`, `oldAmount`, and `outputAmount` are not public inputs.
- v1.2 split graph: hidden `oldAmount` must equal public `grossAmount` plus hidden `outputAmount`; `oldAmount` and `grossAmount` must be in the supported `DENOMS` set, and `outputAmount` must be either zero or in `DENOMS`. Public `fee` is a 128-bit input so governed-fee tests can run without reusing the v1.1 33 bps formula.
- proof context: public `proofContextHash` binds the action context used by the TypeScript/Solidity boundary.
- encrypted note binding: v1.1 public `encryptedNoteHash` binds the encrypted note or private-change encrypted note expected by the runtime; v1.2 public `encryptedOutputNoteHash` binds the always-output encrypted note expected by the runtime.

The circuit interface has no `pathIndices` witness input. `BinaryMerkleRoot(20)` decomposes `leafIndex`, so `leafIndex < 1048576` is enforced and there is only one source of Merkle path direction.

## Tool Versions

- `circom`: `2.2.3`
- `snarkjs`: `0.7.5`
- `circomlib`: `2.0.5`
- `@zk-kit/binary-merkle-root.circom`: `2.0.0`

## Local Compile Commands

From `circuits/`:

```bash
npm test
```

Running `npm test` deletes `build/`, regenerates fixtures, compiles the v1.1 production circuits and the separate v1.2 local-only withdrawal circuit, runs witness checks, generates local untrusted Groth16 artifacts for the v1.1 circuit set and local-only `withdraw_v1_2`, verifies valid proofs, checks mutated public-signal rejection, and writes `build/provenance/manifest.json`. Valid v1.1 fixtures must pass. Mainnet-chain, root, Merkle sibling, nullifier, verifier, verifier-width, destination, gross amount, fee, leaf-index, and output-commitment mutations must fail for v1.1 witness generation. The non-33-bps v1.2 governed-fee fixture must be named `withdraw.v1_2.governed_fee.valid.json` and pass only against `withdraw_v1_2.circom`.

To run the steps manually:

```bash
npm run fixtures
npm run compile
npm run witness
npm run groth16
npm run manifest
```

For the v1.2 local-only compile target:

```bash
npm run compile:withdraw:v1.2
```

To inspect circuit metadata:

```bash
npx snarkjs r1cs info build/private_transfer/private_transfer.r1cs
npx snarkjs r1cs info build/withdraw/withdraw.r1cs
npx snarkjs r1cs info build/withdraw_v1_2/withdraw_v1_2.r1cs
```

Current local metadata:

- `private_transfer`: metadata is recorded in `build/provenance/manifest.json`.
- `withdraw`: metadata is recorded in `build/provenance/manifest.json`.
- `withdraw_v1_2`: local Groth16 outputs are discoverable through `build/provenance/manifest.json`, but the manifest writer is not a final v1.2 promotion record and must not be used as mainnet artifact evidence without a later hash-bound promotion packet.

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
- `build/groth16/withdraw_v1_2/withdraw_v1_2_final.zkey`
- `build/groth16/withdraw_v1_2/verification_key.json`
- `build/groth16/withdraw_v1_2/proof.json`
- `build/groth16/withdraw_v1_2/public.json`
- `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16PrivateTransferVerifier.sol`
- `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16WithdrawVerifier.sol`
- `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16WithdrawV12Verifier.sol`

The Powers of Tau and zkey contributions generated by this local command are local development artifacts unless they are separately selected and hash-bound by the current trusted setup record. The current public v1.1 app uses the artifacts published under `apps/web/public/proving/` and bound by the public manifest; those c525/d82e records remain v1.1-only and are not promoted by `withdraw_v1_2.circom`.

## Remaining Gates

Current mainnet value-moving is limited to the current runtime and current public prover artifact hashes. These areas remain separate:

- guarded-user cohorts
- production privacy claims
- new deployments
- funding or key rotation
- broader relayer selectors, pools, verifiers, or endpoints
