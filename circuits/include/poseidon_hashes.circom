pragma circom 2.1.6;

include "poseidon.circom";

template PoseidonNoteCommitment() {
    signal input domain;
    signal input assetId;
    signal input amount;
    signal input ownerCommitment;
    signal input noteSecret;
    signal output commitment;

    component hash = Poseidon(5);
    hash.inputs[0] <== domain;
    hash.inputs[1] <== assetId;
    hash.inputs[2] <== amount;
    hash.inputs[3] <== ownerCommitment;
    hash.inputs[4] <== noteSecret;

    commitment <== hash.out;
}

template PoseidonNullifier() {
    signal input domain;
    signal input noteSecret;
    signal input leafIndex;
    signal input chainId;
    signal input verifyingContract;
    signal output nullifier;

    component hash = Poseidon(5);
    hash.inputs[0] <== domain;
    hash.inputs[1] <== noteSecret;
    hash.inputs[2] <== leafIndex;
    hash.inputs[3] <== chainId;
    hash.inputs[4] <== verifyingContract;

    nullifier <== hash.out;
}
