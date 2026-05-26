pragma circom 2.1.6;

include "include/poseidon_hashes.circom";
include "include/merkle_membership.circom";
include "comparators.circom";
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

template AmountInDenomsOrZero() {
    signal input amount;
    signal products[11];

    products[0] <== amount;
    products[1] <== products[0] * (amount - 5000000000000000);
    products[2] <== products[1] * (amount - 10000000000000000);
    products[3] <== products[2] * (amount - 20000000000000000);
    products[4] <== products[3] * (amount - 30000000000000000);
    products[5] <== products[4] * (amount - 50000000000000000);
    products[6] <== products[5] * (amount - 100000000000000000);
    products[7] <== products[6] * (amount - 200000000000000000);
    products[8] <== products[7] * (amount - 300000000000000000);
    products[9] <== products[8] * (amount - 500000000000000000);
    products[10] <== products[9] * (amount - 1000000000000000000);

    products[10] === 0;
}

template WithdrawCircuit(levels) {
    // Public inputs, ordered to match Solidity/TypeScript:
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
    signal input withdrawalDestination;
    signal input outputAmount;
    signal input outputOwnerCommitment;
    signal input outputNoteSecret;
    signal input pathElements[levels];
    signal input expectedProofContextHash;
    signal input expectedEncryptedOutputNoteHash;

    // Reviewed multichain binding: proofs are valid only for MegaETH testnet
    // 6343 or MegaETH mainnet 4326. The nullifier includes chainId and the
    // pool contract rechecks block.chainid, so proofs cannot replay across
    // chains.
    (chainId - 6343) * (chainId - 4326) === 0;
    destination === withdrawalDestination;
    proofContextHash === expectedProofContextHash;
    encryptedOutputNoteHash === expectedEncryptedOutputNoteHash;

    // Keep amounts in a practical ETH range so conservation cannot wrap the BN254 field.
    component oldAmountBits = Num2Bits(128);
    oldAmountBits.in <== oldAmount;
    component grossAmountBits = Num2Bits(128);
    grossAmountBits.in <== grossAmount;
    component outputAmountBits = Num2Bits(128);
    outputAmountBits.in <== outputAmount;
    component proofContextHashBits = Num2Bits(254);
    proofContextHashBits.in <== proofContextHash;
    component encryptedOutputNoteHashBits = Num2Bits(254);
    encryptedOutputNoteHashBits.in <== encryptedOutputNoteHash;
    component outputCommitmentIsZero = IsZero();
    outputCommitmentIsZero.in <== outputCommitment;
    outputCommitmentIsZero.out === 0;
    component encryptedOutputNoteHashIsZero = IsZero();
    encryptedOutputNoteHashIsZero.in <== encryptedOutputNoteHash;
    encryptedOutputNoteHashIsZero.out === 0;

    // v1.2 split graph: the old note principal is consumed into a public exit
    // amount and one hidden retained-output amount. Fee policy is contract-bound.
    oldAmount === grossAmount + outputAmount;
    component oldAmountDenom = AmountInDenoms();
    oldAmountDenom.amount <== oldAmount;
    component grossAmountDenom = AmountInDenoms();
    grossAmountDenom.amount <== grossAmount;
    component outputAmountDenom = AmountInDenomsOrZero();
    outputAmountDenom.amount <== outputAmount;
    component feeBits = Num2Bits(128);
    feeBits.in <== fee;

    component outputNote = PoseidonNoteCommitment();
    outputNote.domain <== 10001;
    outputNote.assetId <== assetId;
    outputNote.amount <== outputAmount;
    outputNote.ownerCommitment <== outputOwnerCommitment;
    outputNote.noteSecret <== outputNoteSecret;

    // v1.2 withdrawals are always-output. A zero-value dummy output still
    // commits to outputAmount=0 plus fresh output note material.
    outputCommitment === outputNote.commitment;

    component verifyingContractBits = Num2Bits(160);
    verifyingContractBits.in <== verifyingContract;

    component note = PoseidonNoteCommitment();
    note.domain <== 10001;
    note.assetId <== assetId;
    note.amount <== oldAmount;
    note.ownerCommitment <== ownerCommitment;
    note.noteSecret <== noteSecret;

    component computedNullifier = PoseidonNullifier();
    computedNullifier.domain <== 10002;
    computedNullifier.noteSecret <== noteSecret;
    computedNullifier.leafIndex <== leafIndex;
    computedNullifier.chainId <== chainId;
    computedNullifier.verifyingContract <== verifyingContract;
    nullifier === computedNullifier.nullifier;

    component computedRoot = PoseidonMerkleMembership(levels);
    computedRoot.leaf <== note.commitment;
    computedRoot.leafIndex <== leafIndex;
    for (var i = 0; i < levels; i++) {
        computedRoot.pathElements[i] <== pathElements[i];
    }
    root === computedRoot.root;

    // Destination is intentionally public and bound above.
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
]} = WithdrawCircuit(20);
