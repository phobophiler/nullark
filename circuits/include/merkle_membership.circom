pragma circom 2.1.6;

include "binary-merkle-root.circom";

template PoseidonMerkleMembership(levels) {
    signal input leaf;
    signal input leafIndex;
    signal input pathElements[levels];
    signal output root;

    component membership = BinaryMerkleRoot(levels);
    membership.leaf <== leaf;
    membership.depth <== levels;
    membership.index <== leafIndex;

    for (var i = 0; i < levels; i++) {
        membership.siblings[i] <== pathElements[i];
    }

    root <== membership.out;
}
