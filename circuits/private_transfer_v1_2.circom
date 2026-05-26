pragma circom 2.1.6;

include "include/poseidon_hashes.circom";
include "include/merkle_membership.circom";
include "bitify.circom";

template AmountInDenoms() {
    signal input amount;
    signal products[10];

    products[0] <== amount - 5000000000000000;
    products[1] <== products[0] * (amount - 10000000000000000);
    products[2] <== products[1] * (amount - 20000000000000000);
    products[3] <== products[2] * (amount - 30000000000000000);
    products[4] <== products[3] * (amount - 50000000000000000);
    products[5] <== products[4] * (amount - 100000000000000000);
    products[6] <== products[5] * (amount - 200000000000000000);
    products[7] <== products[6] * (amount - 300000000000000000);
    products[8] <== products[7] * (amount - 500000000000000000);
    products[9] <== products[8] * (amount - 1000000000000000000);

    products[9] === 0;
}

template PrivateTransferCircuit(levels) {
    // Public inputs, ordered to match the unlinkable v1.2 spend statement:
    // root, nullifier, outputCommitment, destination, grossAmount, fee, chainId,
    // verifyingContract, proofContextHash, encryptedOutputNoteHash.
    signal input root;
    signal input nullifier;
    signal input outputCommitment;
    signal input destination;
    signal input grossAmount;
    signal input fee;
    signal input chainId;
    signal input verifyingContract;
    signal input proofContextHash;
    signal input encryptedOutputNoteHash;

    // Private witness inputs.
    signal input assetId;
    signal input oldAmount;
    signal input ownerCommitment;
    signal input noteSecret;
    signal input leafIndex;
    signal input pathElements[levels];
    signal input outputAmount;
    signal input outputOwnerCommitment;
    signal input outputNoteSecret;
    signal input expectedProofContextHash;
    signal input expectedEncryptedOutputNoteHash;

    // Reviewed multichain binding: proofs are valid only for MegaETH testnet
    // 6343 or MegaETH mainnet 4326. The nullifier includes chainId and the
    // pool contract rechecks block.chainid, so proofs cannot replay across
    // chains.
    (chainId - 6343) * (chainId - 4326) === 0;
    destination === 0;
    grossAmount === 0;
    fee === 0;
    proofContextHash === expectedProofContextHash;
    encryptedOutputNoteHash === expectedEncryptedOutputNoteHash;

    component verifyingContractBits = Num2Bits(160);
    verifyingContractBits.in <== verifyingContract;
    component outputCommitmentBits = Num2Bits(254);
    outputCommitmentBits.in <== outputCommitment;
    component oldAmountBits = Num2Bits(128);
    oldAmountBits.in <== oldAmount;
    component outputAmountBits = Num2Bits(128);
    outputAmountBits.in <== outputAmount;
    component proofContextHashBits = Num2Bits(254);
    proofContextHashBits.in <== proofContextHash;
    component encryptedOutputNoteHashBits = Num2Bits(254);
    encryptedOutputNoteHashBits.in <== encryptedOutputNoteHash;

    oldAmount === outputAmount;
    component oldAmountDenom = AmountInDenoms();
    oldAmountDenom.amount <== oldAmount;
    component outputAmountDenom = AmountInDenoms();
    outputAmountDenom.amount <== outputAmount;

    component oldNote = PoseidonNoteCommitment();
    oldNote.domain <== 10001;
    oldNote.assetId <== assetId;
    oldNote.amount <== oldAmount;
    oldNote.ownerCommitment <== ownerCommitment;
    oldNote.noteSecret <== noteSecret;

    component outputNote = PoseidonNoteCommitment();
    outputNote.domain <== 10001;
    outputNote.assetId <== assetId;
    outputNote.amount <== outputAmount;
    outputNote.ownerCommitment <== outputOwnerCommitment;
    outputNote.noteSecret <== outputNoteSecret;
    outputCommitment === outputNote.commitment;

    component computedNullifier = PoseidonNullifier();
    computedNullifier.domain <== 10002;
    computedNullifier.noteSecret <== noteSecret;
    computedNullifier.leafIndex <== leafIndex;
    computedNullifier.chainId <== chainId;
    computedNullifier.verifyingContract <== verifyingContract;
    nullifier === computedNullifier.nullifier;

    component computedRoot = PoseidonMerkleMembership(levels);
    computedRoot.leaf <== oldNote.commitment;
    computedRoot.leafIndex <== leafIndex;
    for (var i = 0; i < levels; i++) {
        computedRoot.pathElements[i] <== pathElements[i];
    }
    root === computedRoot.root;
}

component main {public [
    root,
    nullifier,
    outputCommitment,
    destination,
    grossAmount,
    fee,
    chainId,
    verifyingContract,
    proofContextHash,
    encryptedOutputNoteHash
]} = PrivateTransferCircuit(20);
