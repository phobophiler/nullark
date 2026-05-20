// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";

contract VerifyMegaEthMainnet is Script {
    uint256 private constant MEGAETH_MAINNET_CHAIN_ID = 4326;
    uint256 private constant EXPECTED_MAINNET_TREE_DEPTH = 20;
    uint256 private constant EXPECTED_MAINNET_TREE_CAPACITY = 2 ** EXPECTED_MAINNET_TREE_DEPTH;

    function run() external view {
        require(block.chainid == MEGAETH_MAINNET_CHAIN_ID, "wrong chain");

        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address verifierAdapterAddress = vm.envAddress("MEGAETH_VERIFIER_ADAPTER");
        address poseidon2 = vm.envAddress("MEGAETH_POSEIDON2");
        address shieldedPoolAddress = vm.envAddress("MEGAETH_SHIELDED_POOL");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");

        ActionRoutingGroth16Verifier verifierAdapter = ActionRoutingGroth16Verifier(verifierAdapterAddress);
        NullarkPool shieldedPool = NullarkPool(shieldedPoolAddress);

        require(address(verifierAdapter.privateTransferVerifier()) == privateTransferVerifier, "private verifier mismatch");
        require(address(verifierAdapter.withdrawVerifier()) == withdrawVerifier, "withdraw verifier mismatch");
        require(address(shieldedPool.verifier()) == verifierAdapterAddress, "pool verifier mismatch");
        require(address(shieldedPool.poseidon2()) == poseidon2, "poseidon mismatch");
        require(shieldedPool.feeController() == feeController, "fee controller mismatch");
        require(shieldedPool.MERKLE_TREE_DEPTH() == EXPECTED_MAINNET_TREE_DEPTH, "tree depth mismatch");
        require(shieldedPool.MERKLE_TREE_CAPACITY() == EXPECTED_MAINNET_TREE_CAPACITY, "tree capacity mismatch");
        require(shieldedPool.ROOT_HISTORY_SIZE() == 256, "root history mismatch");
        require(shieldedPool.initialRoot() != bytes32(0), "missing initial root");
        require(shieldedPool.isAcceptedRoot(shieldedPool.initialRoot()), "initial root not accepted");

        console2.log("MegaETH mainnet deployment read-only verification passed");
        console2.log("shieldedPool", shieldedPoolAddress);
        console2.logBytes32(shieldedPool.initialRoot());
    }
}
