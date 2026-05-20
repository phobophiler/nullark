pragma circom 2.1.6;

include "include/poseidon_hashes.circom";
include "include/merkle_membership.circom";
include "bitify.circom";

// Nullark v1.1 private-transfer circuit source.
// Production use requires a promoted trusted-setup record, generated-verifier
// hash binding, and deployment/runtime approval for the exact public inputs.
template PrivateTransferCircuit(levels) {
    // Public inputs, ordered to match Solidity/TypeScript:
    // root, nullifier, newCommitment, destination, grossAmount, fee, chainId,
    // verifyingContract, spentCommitment, noteAmount, proofContextHash,
    // encryptedNoteHash.
    signal input root;
    signal input nullifier;
    signal input newCommitment;
    signal input destination;
    signal input grossAmount;
    signal input fee;
    signal input chainId;
    signal input verifyingContract;
    signal input spentCommitment;
    signal input noteAmount;
    signal input proofContextHash;
    signal input encryptedNoteHash;

    // Private witness inputs.
    signal input assetId;
    signal input ownerCommitment;
    signal input noteSecret;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input recipientOwnerCommitment;
    signal input recipientNoteSecret;
    signal input expectedProofContextHash;
    signal input expectedEncryptedNoteHash;

    // Reviewed multichain binding: proofs are valid only for MegaETH testnet
    // 6343 or MegaETH mainnet 4326. The nullifier includes chainId and the
    // pool contract rechecks block.chainid, so proofs cannot replay across
    // chains.
    (chainId - 6343) * (chainId - 4326) === 0;
    destination === 0;
    grossAmount === 0;
    fee === 0;
    proofContextHash === expectedProofContextHash;
    encryptedNoteHash === expectedEncryptedNoteHash;

    component verifyingContractBits = Num2Bits(160);
    verifyingContractBits.in <== verifyingContract;
    component newCommitmentBits = Num2Bits(254);
    newCommitmentBits.in <== newCommitment;
    component noteAmountBits = Num2Bits(128);
    noteAmountBits.in <== noteAmount;
    component proofContextHashBits = Num2Bits(254);
    proofContextHashBits.in <== proofContextHash;
    component encryptedNoteHashBits = Num2Bits(254);
    encryptedNoteHashBits.in <== encryptedNoteHash;

    component oldNote = PoseidonNoteCommitment();
    oldNote.domain <== 10001;
    oldNote.assetId <== assetId;
    oldNote.amount <== noteAmount;
    oldNote.ownerCommitment <== ownerCommitment;
    oldNote.noteSecret <== noteSecret;
    spentCommitment === oldNote.commitment;

    component outputNote = PoseidonNoteCommitment();
    outputNote.domain <== 10001;
    outputNote.assetId <== assetId;
    outputNote.amount <== noteAmount;
    outputNote.ownerCommitment <== recipientOwnerCommitment;
    outputNote.noteSecret <== recipientNoteSecret;
    newCommitment === outputNote.commitment;

    component computedNullifier = PoseidonNullifier();
    computedNullifier.domain <== 10002;
    computedNullifier.noteSecret <== noteSecret;
    computedNullifier.leafIndex <== leafIndex;
    computedNullifier.chainId <== chainId;
    computedNullifier.verifyingContract <== verifyingContract;
    nullifier === computedNullifier.nullifier;

    component computedRoot = PoseidonMerkleMembership(levels);
    computedRoot.leaf <== spentCommitment;
    computedRoot.leafIndex <== leafIndex;
    for (var i = 0; i < levels; i++) {
        computedRoot.pathElements[i] <== pathElements[i];
    }
    root === computedRoot.root;

    // Guarded testnet compromise: the prover sees the output preimage so the
    // circuit can prove the new note preserves the spent note amount.
}

component main {public [
    root,
    nullifier,
    newCommitment,
    destination,
    grossAmount,
    fee,
    chainId,
    verifyingContract,
    spentCommitment,
    noteAmount,
    proofContextHash,
    encryptedNoteHash
]} = PrivateTransferCircuit(20);
