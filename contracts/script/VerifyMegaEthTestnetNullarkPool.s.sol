// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";

contract VerifyMegaEthTestnetNullarkPool is Script {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;
    uint256 private constant EXPECTED_TREE_DEPTH = 20;
    uint256 private constant EXPECTED_TREE_CAPACITY = 2 ** EXPECTED_TREE_DEPTH;

    function run() external view {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");

        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address verifierAdapterAddress = vm.envAddress("MEGAETH_VERIFIER_ADAPTER");
        address poseidon2 = vm.envAddress("MEGAETH_POSEIDON2");
        address nullarkPoolAddress = vm.envAddress("MEGAETH_NULLARK_POOL");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");

        require(privateTransferVerifier != address(0), "invalid private verifier");
        require(withdrawVerifier != address(0), "invalid withdraw verifier");
        require(verifierAdapterAddress != address(0), "invalid verifier adapter");
        require(poseidon2 != address(0), "invalid poseidon");
        require(nullarkPoolAddress != address(0), "invalid nullark pool");
        require(feeController != address(0), "invalid fee controller");

        ActionRoutingGroth16Verifier verifierAdapter = ActionRoutingGroth16Verifier(verifierAdapterAddress);
        NullarkPool nullarkPool = NullarkPool(nullarkPoolAddress);

        require(
            address(verifierAdapter.privateTransferVerifier()) == privateTransferVerifier, "private verifier mismatch"
        );
        require(address(verifierAdapter.withdrawVerifier()) == withdrawVerifier, "withdraw verifier mismatch");
        require(address(nullarkPool.verifier()) == verifierAdapterAddress, "pool verifier mismatch");
        require(address(nullarkPool.poseidon2()) == poseidon2, "poseidon mismatch");
        require(nullarkPool.feeController() == feeController, "fee controller mismatch");
        require(nullarkPool.MERKLE_TREE_DEPTH() == EXPECTED_TREE_DEPTH, "tree depth mismatch");
        require(nullarkPool.MERKLE_TREE_CAPACITY() == EXPECTED_TREE_CAPACITY, "tree capacity mismatch");
        require(nullarkPool.nextLeafIndex() == 0, "replacement pool is no longer empty");
        require(nullarkPool.ROOT_HISTORY_SIZE() == 256, "root history mismatch");
        require(nullarkPool.initialRoot() != bytes32(0), "missing initial root");
        require(nullarkPool.currentRoot() == nullarkPool.initialRoot(), "current root mismatch");
        require(nullarkPool.isAcceptedRoot(nullarkPool.initialRoot()), "initial root not accepted");

        console2.log("MegaETH Nullark testnet replacement verification passed");
        console2.log("UNTRUSTED_LOCAL_GENERATED_VERIFIERS=true");
        console2.log("nullarkPool", nullarkPoolAddress);
        console2.log("merkleTreeDepth", nullarkPool.MERKLE_TREE_DEPTH());
        console2.log("merkleTreeCapacity", nullarkPool.MERKLE_TREE_CAPACITY());
        console2.logBytes32(nullarkPool.initialRoot());
    }
}
