// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";

contract CheapPoseidon2 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(input[0], input[1]))) >> 8;
    }
}

contract ShieldedPoolCapacityLivenessTest is Test {
    ShieldedPool pool;

    receive() external payable {}

    function setUp() public {
        MockVerifier verifier = new MockVerifier();
        CheapPoseidon2 poseidon2 = new CheapPoseidon2();
        pool = new ShieldedPool(address(verifier), address(this), address(0xCAFE), address(poseidon2));
    }

    function testFullTreeRejectsFurtherCommitmentInsertions() public {
        _fillTreeWithFundingNote();

        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
        vm.expectRevert("merkle tree full");
        pool.deposit{value: 1 wei}(_fieldCommitment("overflow"));
    }

    function testFullWithdrawalStillWorksWhenTreeIsFullAndNoChangeIsInserted() public {
        _fillTreeWithFundingNote();

        bytes32 nullifier = keccak256("full-tree-full-withdraw");
        address receiver = address(0xBEEF);
        uint256 receiverBalanceBefore = receiver.balance;

        pool.withdraw("", _withdrawalInputs(nullifier, receiver, 1 ether, bytes32(0)), nullifier, payable(receiver), 1 ether);

        assertTrue(pool.nullifiers(nullifier));
        uint256 fee = (1 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        assertEq(receiver.balance - receiverBalanceBefore, 1 ether - fee);
        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
    }

    function testPrivateTransferRevertsWithoutSpendingNullifierWhenTreeIsFull() public {
        _fillTreeWithFundingNote();

        bytes32 nullifier = keccak256("full-tree-private-transfer");
        bytes32 newCommitment = _fieldCommitment("full-tree-private-transfer-new-note");
        bytes32[] memory inputs = _privateTransferInputs(nullifier, newCommitment);

        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
        vm.expectRevert("merkle tree full");
        pool.privateTransfer("", inputs, nullifier, newCommitment);

        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(newCommitment));
        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
    }

    function testSplitWithdrawalRevertsWithoutSpendingNullifierWhenTreeIsFull() public {
        _fillTreeWithFundingNote();

        bytes32 nullifier = keccak256("full-tree-split-withdraw");
        bytes32 changeCommitment = _fieldCommitment("full-tree-change");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 0.5 ether, changeCommitment);

        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
        vm.expectRevert("merkle tree full");
        pool.withdraw("", inputs, nullifier, payable(receiver), 0.5 ether);

        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(changeCommitment));
        assertEq(pool.nextLeafIndex(), pool.MERKLE_TREE_CAPACITY());
    }

    function _privateTransferInputs(bytes32 nullifier, bytes32 newCommitment)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = new bytes32[](pool.PUBLIC_INPUTS_LENGTH());
        inputs[0] = pool.currentRoot();
        inputs[1] = nullifier;
        inputs[2] = newCommitment;
        inputs[3] = bytes32(0);
        inputs[4] = bytes32(0);
        inputs[5] = bytes32(0);
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        inputs[8] = _fieldCommitment("funding");
        inputs[9] = bytes32(uint256(1 ether));
    }

    function _fillTreeWithFundingNote() private {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        for (uint256 i = 1; i < pool.MERKLE_TREE_CAPACITY(); i++) {
            pool.deposit{value: 1 wei}(_fieldCommitment(i));
        }
    }

    function _withdrawalInputs(bytes32 nullifier, address destination, uint256 grossAmount, bytes32 changeCommitment)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = new bytes32[](pool.PUBLIC_INPUTS_LENGTH());
        inputs[0] = pool.currentRoot();
        inputs[1] = nullifier;
        inputs[2] = changeCommitment;
        inputs[3] = bytes32(uint256(uint160(destination)));
        inputs[4] = bytes32(grossAmount);
        inputs[5] = bytes32((grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR());
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        inputs[8] = _fieldCommitment("funding");
        inputs[9] = bytes32(uint256(1 ether));
    }

    function _fieldCommitment(string memory label) private pure returns (bytes32) {
        return bytes32(uint256(uint160(uint256(keccak256(bytes(label))))));
    }

    function _fieldCommitment(uint256 value) private pure returns (bytes32) {
        return bytes32(value + 1);
    }
}
