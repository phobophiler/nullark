// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {SourceVerifiedPoseidon2} from "../src/vendor/SourceVerifiedPoseidon2.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";
import {Groth16PrivateTransferVerifier} from "../src/verifiers/generated/mainnet/Groth16PrivateTransferVerifier.sol";
import {Groth16WithdrawVerifier} from "../src/verifiers/generated/mainnet/Groth16WithdrawVerifier.sol";
import {MegaEthTestnetDeploymentGuards} from "./MegaEthTestnetDeploymentGuards.sol";

contract DeployMegaEthTestnetFullStack is MegaEthTestnetDeploymentGuards {
    uint256 private constant EXPECTED_TESTNET_TREE_DEPTH = 20;
    uint256 private constant EXPECTED_TESTNET_TREE_CAPACITY = 2 ** EXPECTED_TESTNET_TREE_DEPTH;

    function run()
        external
        returns (
            Groth16PrivateTransferVerifier privateTransferVerifier,
            Groth16WithdrawVerifier withdrawVerifier,
            ActionRoutingGroth16Verifier verifierAdapter,
            SourceVerifiedPoseidon2 poseidon2,
            NullarkPool pool
        )
    {
        _requireMegaEthTestnet();
        _requireTestnetDeploymentGate();
        _requireTestnetDeploymentApproval();

        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");
        _requireConcreteTestnetAddress(feeController, "invalid fee controller", "placeholder fee controller");

        vm.startBroadcast();
        privateTransferVerifier = new Groth16PrivateTransferVerifier();
        withdrawVerifier = new Groth16WithdrawVerifier();
        verifierAdapter = new ActionRoutingGroth16Verifier(address(privateTransferVerifier), address(withdrawVerifier));
        poseidon2 = new SourceVerifiedPoseidon2();
        pool = new NullarkPool(address(verifierAdapter), feeController, address(poseidon2));
        vm.stopBroadcast();

        _requireTestnetPoolRoleConfig(address(verifierAdapter), feeController);
        require(address(pool.verifier()) == address(verifierAdapter), "pool verifier mismatch");
        require(address(pool.poseidon2()) == address(poseidon2), "pool poseidon mismatch");
        require(
            address(verifierAdapter.privateTransferVerifier()) == address(privateTransferVerifier),
            "private verifier mismatch"
        );
        require(address(verifierAdapter.withdrawVerifier()) == address(withdrawVerifier), "withdraw verifier mismatch");
        require(pool.MERKLE_TREE_DEPTH() == EXPECTED_TESTNET_TREE_DEPTH, "unexpected testnet tree depth");
        require(pool.MERKLE_TREE_CAPACITY() == EXPECTED_TESTNET_TREE_CAPACITY, "unexpected testnet tree capacity");

        console2.log("NULLARK_TESTNET_FULL_STACK=true");
        console2.log("privateTransferVerifier", address(privateTransferVerifier));
        console2.log("withdrawVerifier", address(withdrawVerifier));
        console2.log("verifierAdapter", address(verifierAdapter));
        console2.log("poseidon2", address(poseidon2));
        console2.log("nullarkPool", address(pool));
        console2.log("feeController", feeController);
    }
}
