pragma circom 2.1.6;

include "include/poseidon_hashes.circom";
include "include/merkle_membership.circom";
include "comparators.circom";
include "bitify.circom";

// Nullark v1.1 withdrawal circuit source.
// Production use requires a promoted trusted-setup record, generated-verifier
// hash binding, and deployment/runtime approval for the exact public inputs.
template WithdrawCircuit(levels) {
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
    signal input withdrawalDestination;
    signal input changeAmount;
    signal input changeOwnerCommitment;
    signal input changeNoteSecret;
    signal input pathElements[levels];
    signal input expectedProofContextHash;
    signal input expectedEncryptedNoteHash;

    // Reviewed multichain binding: proofs are valid only for MegaETH testnet
    // 6343 or MegaETH mainnet 4326. The nullifier includes chainId and the
    // pool contract rechecks block.chainid, so proofs cannot replay across
    // chains.
    (chainId - 6343) * (chainId - 4326) === 0;
    destination === withdrawalDestination;
    proofContextHash === expectedProofContextHash;
    encryptedNoteHash === expectedEncryptedNoteHash;

    // Keep amounts in a practical ETH range so conservation cannot wrap the BN254 field.
    component noteAmountBits = Num2Bits(128);
    noteAmountBits.in <== noteAmount;
    component grossAmountBits = Num2Bits(128);
    grossAmountBits.in <== grossAmount;
    component changeAmountBits = Num2Bits(128);
    changeAmountBits.in <== changeAmount;
    component proofContextHashBits = Num2Bits(254);
    proofContextHashBits.in <== proofContextHash;
    component encryptedNoteHashBits = Num2Bits(254);
    encryptedNoteHashBits.in <== encryptedNoteHash;

    // Existing Solidity semantics: grossAmount is removed from old note principal,
    // fee is derived from grossAmount, and destination receives grossAmount - fee.
    noteAmount === grossAmount + changeAmount;

    signal feeRemainder;
    feeRemainder <== grossAmount * 33 - fee * 10000;

    component feeRemainderBound = LessThan(14);
    feeRemainderBound.in[0] <== feeRemainder;
    feeRemainderBound.in[1] <== 10000;
    feeRemainderBound.out === 1;

    component changeIsZero = IsZero();
    changeIsZero.in <== changeAmount;
    signal hasChange;
    hasChange <== 1 - changeIsZero.out;

    component outputNote = PoseidonNoteCommitment();
    outputNote.domain <== 10001;
    outputNote.assetId <== assetId;
    outputNote.amount <== changeAmount;
    outputNote.ownerCommitment <== changeOwnerCommitment;
    outputNote.noteSecret <== changeNoteSecret;

    // Full-note withdrawal: changeAmount=0 and public newCommitment must be zero.
    // Split-note withdrawal: changeAmount>0 and public newCommitment must match the
    // Poseidon commitment for the retained shielded change note.
    newCommitment * changeIsZero.out === 0;
    (newCommitment - outputNote.commitment) * hasChange === 0;
    component newCommitmentIsZero = IsZero();
    newCommitmentIsZero.in <== newCommitment;
    newCommitmentIsZero.out + hasChange === 1;

    component verifyingContractBits = Num2Bits(160);
    verifyingContractBits.in <== verifyingContract;

    component note = PoseidonNoteCommitment();
    note.domain <== 10001;
    note.assetId <== assetId;
    note.amount <== noteAmount;
    note.ownerCommitment <== ownerCommitment;
    note.noteSecret <== noteSecret;
    spentCommitment === note.commitment;

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

    // Destination is intentionally public and bound above.
    // Non-zero enforcement stays in Solidity/TS.
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
]} = WithdrawCircuit(20);
