// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";

contract VerifyMegaEthTestnet is Script {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    function run() external view {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");
        require(
            vm.envOr("ALLOW_LEGACY_SHIELDED_POOL_TESTNET_SCRIPT", false),
            "legacy ShieldedPool testnet script disabled"
        );

        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address verifierAdapterAddress = vm.envAddress("MEGAETH_VERIFIER_ADAPTER");
        address poseidon2 = vm.envAddress("MEGAETH_POSEIDON2");
        address shieldedPoolAddress = vm.envAddress("MEGAETH_SHIELDED_POOL");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");
        address emergencyGuardian = vm.envAddress("MEGAETH_EMERGENCY_GUARDIAN");

        ActionRoutingGroth16Verifier verifierAdapter = ActionRoutingGroth16Verifier(verifierAdapterAddress);
        ShieldedPool shieldedPool = ShieldedPool(shieldedPoolAddress);

        require(address(verifierAdapter.privateTransferVerifier()) == privateTransferVerifier, "private verifier mismatch");
        require(address(verifierAdapter.withdrawVerifier()) == withdrawVerifier, "withdraw verifier mismatch");
        require(address(shieldedPool.verifier()) == verifierAdapterAddress, "pool verifier mismatch");
        require(address(shieldedPool.poseidon2()) == poseidon2, "poseidon mismatch");
        require(shieldedPool.feeController() == feeController, "fee controller mismatch");
        require(shieldedPool.emergencyGuardian() == emergencyGuardian, "emergency guardian mismatch");
        require(shieldedPool.MERKLE_TREE_DEPTH() == 12, "tree depth mismatch");
        require(shieldedPool.MERKLE_TREE_CAPACITY() == 4096, "tree capacity mismatch");
        require(shieldedPool.ROOT_HISTORY_SIZE() == 256, "root history mismatch");
        require(shieldedPool.initialRoot() != bytes32(0), "missing initial root");
        require(shieldedPool.isAcceptedRoot(shieldedPool.initialRoot()), "initial root not accepted");

        console2.log("Legacy MegaETH ShieldedPool sandbox read-only verification passed");
        console2.log("LEGACY_SHIELDED_POOL_TESTNET_SCRIPT=true");
        console2.log("SUPERSEDED_BY=VerifyMegaEthTestnetNullarkPool");
        console2.log("NOT_NULLARK_V1_1_EVIDENCE=true");
        console2.log("shieldedPool", shieldedPoolAddress);
        console2.logBytes32(shieldedPool.initialRoot());
    }
}
