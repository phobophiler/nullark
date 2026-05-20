// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";
import {LocalPoseidonMerkleFixtures} from "../test/generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";
import {
    UntrustedLocalGroth16PrivateTransferVerifier
} from "../test/generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16PrivateTransferVerifier.sol";
import {
    UntrustedLocalGroth16WithdrawVerifier
} from "../test/generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16WithdrawVerifier.sol";

contract DeployMegaEthTestnetNullarkPool is Script {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;
    uint256 private constant EXPECTED_TREE_DEPTH = 20;
    uint256 private constant EXPECTED_TREE_CAPACITY = 2 ** EXPECTED_TREE_DEPTH;

    function run() external {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");
        require(vm.envBool("ALLOW_LOCAL_UNTRUSTED_TESTNET_DEPLOYMENT"), "local untrusted deploy not approved");

        address deployer = vm.envAddress("MEGAETH_DEPLOYER_ADDRESS");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");

        require(deployer != address(0), "invalid deployer");
        require(feeController != address(0), "invalid fee controller");

        vm.startBroadcast();

        UntrustedLocalGroth16PrivateTransferVerifier privateTransferVerifier =
            new UntrustedLocalGroth16PrivateTransferVerifier();
        UntrustedLocalGroth16WithdrawVerifier withdrawVerifier = new UntrustedLocalGroth16WithdrawVerifier();
        ActionRoutingGroth16Verifier verifierAdapter =
            new ActionRoutingGroth16Verifier(address(privateTransferVerifier), address(withdrawVerifier));
        address poseidon2 = LocalPoseidonMerkleFixtures.deployPoseidonT3();
        NullarkPool nullarkPool = new NullarkPool(address(verifierAdapter), feeController, poseidon2);

        vm.stopBroadcast();

        require(nullarkPool.MERKLE_TREE_DEPTH() == EXPECTED_TREE_DEPTH, "tree depth mismatch");
        require(nullarkPool.MERKLE_TREE_CAPACITY() == EXPECTED_TREE_CAPACITY, "tree capacity mismatch");

        console2.log("SANDBOX_ONLY_LOCAL_UNTRUSTED=true");
        console2.log("NULLARK_TESTNET_REPLACEMENT_CANDIDATE=true");
        console2.log("WITHDRAWALS_REQUIRE_NULLARK_VERIFIER_ARTIFACTS=true");
        console2.log("UNTRUSTED_LOCAL_GENERATED_VERIFIERS=true");
        console2.log("privateTransferVerifier", address(privateTransferVerifier));
        console2.log("withdrawVerifier", address(withdrawVerifier));
        console2.log("verifierAdapter", address(verifierAdapter));
        console2.log("poseidon2", poseidon2);
        console2.log("nullarkPool", address(nullarkPool));
        console2.log("merkleTreeDepth", nullarkPool.MERKLE_TREE_DEPTH());
        console2.log("merkleTreeCapacity", nullarkPool.MERKLE_TREE_CAPACITY());
        console2.log("feeController", feeController);
    }
}
