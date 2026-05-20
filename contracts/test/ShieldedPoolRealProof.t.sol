// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";
import {UntrustedLocalGroth16PrivateTransferVerifier} from
    "./generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16PrivateTransferVerifier.sol";
import {UntrustedLocalGroth16WithdrawVerifier} from
    "./generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16WithdrawVerifier.sol";

contract ShieldedPoolRealProofTest is Test {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    function testRealPrivateTransferProofThroughShieldedPoolLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        bytes32 nullifier = publicInputs[1];
        bytes32 newCommitment = publicInputs[2];

        pool.privateTransfer(proof, publicInputs, nullifier, newCommitment);

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(newCommitment));
        assertEq(pool.currentRoot(), LocalPoseidonMerkleFixtures.privateTransferRootAfterNewCommitment());
    }

    function testRealWithdrawalProofThroughShieldedPoolLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        bytes32 nullifier = publicInputs[1];
        address payable destination = payable(address(uint160(uint256(publicInputs[3]))));
        uint256 grossAmount = uint256(publicInputs[4]);
        uint256 fee = uint256(publicInputs[5]);
        uint256 destinationBalanceBefore = destination.balance;

        pool.withdraw(proof, publicInputs, nullifier, destination, grossAmount);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(destination.balance - destinationBalanceBefore, grossAmount - fee);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), grossAmount - fee);
    }

    function testRealZeroFeeWithdrawalProofThroughShieldedPoolLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithZeroFeeWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundZeroFeeWithdrawProof(pool);
        bytes32 nullifier = publicInputs[1];
        address payable destination = payable(address(uint160(uint256(publicInputs[3]))));
        uint256 grossAmount = uint256(publicInputs[4]);
        uint256 fee = uint256(publicInputs[5]);
        uint256 destinationBalanceBefore = destination.balance;

        pool.withdraw(proof, publicInputs, nullifier, destination, grossAmount);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(grossAmount, 476 wei);
        assertEq(fee, 0);
        assertEq(destination.balance - destinationBalanceBefore, 476 wei);
        assertEq(pool.accruedProtocolFees(), 0);
        assertEq(pool.totalWithdrawnAccounting(), 476 wei);
    }

    function testRealFeeBoundaryWithdrawalProofThroughShieldedPoolLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithFeeBoundaryWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundFeeBoundaryWithdrawProof(pool);
        bytes32 nullifier = publicInputs[1];
        address payable destination = payable(address(uint160(uint256(publicInputs[3]))));
        uint256 grossAmount = uint256(publicInputs[4]);
        uint256 fee = uint256(publicInputs[5]);
        uint256 destinationBalanceBefore = destination.balance;

        pool.withdraw(proof, publicInputs, nullifier, destination, grossAmount);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(grossAmount, 10000 wei);
        assertEq(fee, 21 wei);
        assertEq(destination.balance - destinationBalanceBefore, 9979 wei);
        assertEq(pool.accruedProtocolFees(), 21 wei);
        assertEq(pool.totalWithdrawnAccounting(), 9979 wei);
    }

    function testRealDustChangeWithdrawalProofThroughShieldedPoolLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundDustChangeWithdrawProof(pool);
        bytes32 nullifier = publicInputs[1];
        bytes32 changeCommitment = publicInputs[2];
        address payable destination = payable(address(uint160(uint256(publicInputs[3]))));
        uint256 grossAmount = uint256(publicInputs[4]);
        uint256 fee = uint256(publicInputs[5]);
        uint256 destinationBalanceBefore = destination.balance;

        pool.withdraw(proof, publicInputs, nullifier, destination, grossAmount);

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
        assertEq(grossAmount, 10000 wei);
        assertEq(fee, 21 wei);
        assertEq(pool.commitmentAmounts(changeCommitment), 1 wei);
        assertEq(destination.balance - destinationBalanceBefore, 9979 wei);
        assertEq(pool.accruedProtocolFees(), 21 wei);
        assertEq(pool.totalWithdrawnAccounting(), 9979 wei);
    }

    function testRealSplitWithdrawalProofInsertsChangeCommitmentLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundSplitWithdrawProof(pool);
        bytes32 nullifier = publicInputs[1];
        bytes32 changeCommitment = publicInputs[2];
        address payable destination = payable(address(uint160(uint256(publicInputs[3]))));
        uint256 grossAmount = uint256(publicInputs[4]);
        uint256 fee = uint256(publicInputs[5]);
        uint256 destinationBalanceBefore = destination.balance;

        pool.withdraw(proof, publicInputs, nullifier, destination, grossAmount);

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
        assertEq(destination.balance - destinationBalanceBefore, grossAmount - fee);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), grossAmount - fee);
    }

    function testRealWithdrawalProofCannotSpendNullifierTwiceLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);

        _withdrawWithPublicInputs(pool, proof, publicInputs);

        vm.expectRevert("nullifier already spent");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function testPoolBoundProofRejectsAcceptedWrongRootLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        publicInputs[0] = pool.initialRoot();

        vm.expectRevert("invalid proof");
        pool.privateTransfer(proof, publicInputs, publicInputs[1], publicInputs[2]);
    }

    function testPoolBoundProofRejectsWrongChainLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        publicInputs[6] = bytes32(uint256(4326));

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer(proof, publicInputs, publicInputs[1], publicInputs[2]);
    }

    function testPoolBoundProofRejectsWrongVerifyingContractLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        publicInputs[7] = bytes32(uint256(uint160(address(this))));

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer(proof, publicInputs, publicInputs[1], publicInputs[2]);
    }

    function testPoolBoundProofRejectsMutatedPublicSignalLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        publicInputs[2] = bytes32(uint256(publicInputs[2]) + 1);

        vm.expectRevert("invalid proof");
        pool.privateTransfer(proof, publicInputs, publicInputs[1], publicInputs[2]);
    }

    function testPoolBoundProofRejectsMutatedProofLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundPrivateTransferProof(pool);
        proof[proof.length - 1] = bytes1(uint8(proof[proof.length - 1]) ^ 0x01);

        vm.expectRevert("invalid proof");
        pool.privateTransfer(proof, publicInputs, publicInputs[1], publicInputs[2]);
    }

    function testPoolBoundWithdrawProofRejectsAcceptedWrongRootLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        publicInputs[0] = pool.initialRoot();

        vm.expectRevert("invalid proof");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function testPoolBoundWithdrawProofRejectsWrongChainLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        publicInputs[6] = bytes32(uint256(4326));

        vm.expectRevert("invalid public inputs");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function testPoolBoundWithdrawProofRejectsWrongVerifyingContractLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        publicInputs[7] = bytes32(uint256(uint160(address(this))));

        vm.expectRevert("invalid public inputs");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function testPoolBoundWithdrawProofRejectsMutatedPublicSignalLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        publicInputs[1] = bytes32(uint256(publicInputs[1]) + 1);

        vm.expectRevert("invalid proof");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function testPoolBoundWithdrawProofRejectsMutatedProofLocal() public {
        if (!vm.envOr("REAL_PROOF_INTEGRATION", false)) {
            return;
        }

        ShieldedPool pool = _poolWithWithdrawDeposit();
        (bytes memory proof, bytes32[] memory publicInputs) = _generatePoolBoundWithdrawProof(pool);
        proof[proof.length - 1] = bytes1(uint8(proof[proof.length - 1]) ^ 0x01);

        vm.expectRevert("invalid proof");
        _withdrawWithPublicInputs(pool, proof, publicInputs);
    }

    function _poolWithDeposit() private returns (ShieldedPool pool) {
        vm.chainId(MEGAETH_TESTNET_CHAIN_ID);

        ActionRoutingGroth16Verifier verifier = new ActionRoutingGroth16Verifier(
            address(new UntrustedLocalGroth16PrivateTransferVerifier()),
            address(new UntrustedLocalGroth16WithdrawVerifier())
        );
        pool = new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());
        bytes32 spentCommitment = LocalPoseidonMerkleFixtures.privateTransferSpentCommitment();

        pool.deposit{value: 1000 wei}(spentCommitment);
        assertEq(pool.currentRoot(), LocalPoseidonMerkleFixtures.privateTransferRoot());
    }

    function _poolWithWithdrawDeposit() private returns (ShieldedPool pool) {
        vm.chainId(MEGAETH_TESTNET_CHAIN_ID);

        ActionRoutingGroth16Verifier verifier = new ActionRoutingGroth16Verifier(
            address(new UntrustedLocalGroth16PrivateTransferVerifier()),
            address(new UntrustedLocalGroth16WithdrawVerifier())
        );
        pool = new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());
        bytes32 spentCommitment = LocalPoseidonMerkleFixtures.withdrawSpentCommitment();

        pool.deposit{value: 10001 wei}(spentCommitment);
        assertEq(pool.currentRoot(), LocalPoseidonMerkleFixtures.withdrawRoot());
    }

    function _poolWithZeroFeeWithdrawDeposit() private returns (ShieldedPool pool) {
        vm.chainId(MEGAETH_TESTNET_CHAIN_ID);

        ActionRoutingGroth16Verifier verifier = new ActionRoutingGroth16Verifier(
            address(new UntrustedLocalGroth16PrivateTransferVerifier()),
            address(new UntrustedLocalGroth16WithdrawVerifier())
        );
        pool = new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());
        bytes32 spentCommitment = bytes32(uint256(1774907890155419640451684832103883272403114687332875796048823424540700560900));

        pool.deposit{value: 476 wei}(spentCommitment);
        assertEq(pool.currentRoot(), bytes32(uint256(2093563711006605957003035577151333687619074676223656054819852627147683314536)));
    }

    function _poolWithFeeBoundaryWithdrawDeposit() private returns (ShieldedPool pool) {
        vm.chainId(MEGAETH_TESTNET_CHAIN_ID);

        ActionRoutingGroth16Verifier verifier = new ActionRoutingGroth16Verifier(
            address(new UntrustedLocalGroth16PrivateTransferVerifier()),
            address(new UntrustedLocalGroth16WithdrawVerifier())
        );
        pool = new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());
        bytes32 spentCommitment = bytes32(uint256(8427211181477013689248619938937986436994999378688094849875471957535035457340));

        pool.deposit{value: 10000 wei}(spentCommitment);
        assertEq(pool.currentRoot(), bytes32(uint256(11631972872311716130862470694846623657814752596855014637635502253002487056478)));
    }

    function _generatePoolBoundPrivateTransferProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "private-transfer";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _generatePoolBoundWithdrawProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "withdraw";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _generatePoolBoundZeroFeeWithdrawProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "withdraw-zero-fee";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _generatePoolBoundFeeBoundaryWithdrawProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "withdraw-fee-boundary";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _generatePoolBoundDustChangeWithdrawProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "withdraw-dust-change";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _generatePoolBoundSplitWithdrawProof(ShieldedPool pool)
        private
        returns (bytes memory proof, bytes32[] memory publicInputs)
    {
        string[] memory command = new string[](5);
        command[0] = vm.envOr("NODE_BIN", string("/Users/ahmadfitrahamdani/.nvm/versions/node/v22.19.0/bin/node"));
        command[1] = "../scripts/generate-pool-bound-proof.mjs";
        command[2] = "withdraw-split";
        command[3] = vm.toString(uint256(uint160(address(pool))));
        command[4] = vm.toString(uint256(pool.currentRoot()));

        return abi.decode(vm.ffi(command), (bytes, bytes32[]));
    }

    function _withdrawWithPublicInputs(ShieldedPool pool, bytes memory proof, bytes32[] memory publicInputs) private {
        pool.withdraw(
            proof,
            publicInputs,
            publicInputs[1],
            payable(address(uint160(uint256(publicInputs[3])))),
            uint256(publicInputs[4])
        );
    }
}
