pragma circom 2.1.6;

include "include/poseidon_hashes.circom";
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

template DepositCircuit() {
    // Public inputs, ordered to match Solidity/TypeScript:
    // commitment, amount, chainId, verifyingContract, depositContextHash,
    // encryptedDepositNoteHash.
    signal input commitment;
    signal input amount;
    signal input chainId;
    signal input verifyingContract;
    signal input depositContextHash;
    signal input encryptedDepositNoteHash;

    // Private witness inputs.
    signal input assetId;
    signal input ownerCommitment;
    signal input noteSecret;
    signal input expectedChainId;
    signal input expectedVerifyingContract;
    signal input expectedDepositContextHash;
    signal input expectedEncryptedDepositNoteHash;

    // Reviewed multichain binding: proofs are valid only for MegaETH testnet
    // 6343 or MegaETH mainnet 4326. The pool contract rechecks block.chainid,
    // so proofs cannot replay across chains.
    (chainId - 6343) * (chainId - 4326) === 0;

    chainId === expectedChainId;
    verifyingContract === expectedVerifyingContract;
    depositContextHash === expectedDepositContextHash;
    encryptedDepositNoteHash === expectedEncryptedDepositNoteHash;

    component amountBits = Num2Bits(128);
    amountBits.in <== amount;
    component commitmentBits = Num2Bits(254);
    commitmentBits.in <== commitment;
    component verifyingContractBits = Num2Bits(160);
    verifyingContractBits.in <== verifyingContract;
    component depositContextHashBits = Num2Bits(254);
    depositContextHashBits.in <== depositContextHash;
    component encryptedDepositNoteHashBits = Num2Bits(254);
    encryptedDepositNoteHashBits.in <== encryptedDepositNoteHash;

    component amountDenom = AmountInDenoms();
    amountDenom.amount <== amount;

    component note = PoseidonNoteCommitment();
    note.domain <== 10001;
    note.assetId <== assetId;
    note.amount <== amount;
    note.ownerCommitment <== ownerCommitment;
    note.noteSecret <== noteSecret;
    commitment === note.commitment;
}

component main {public [
    commitment,
    amount,
    chainId,
    verifyingContract,
    depositContextHash,
    encryptedDepositNoteHash
]} = DepositCircuit();
