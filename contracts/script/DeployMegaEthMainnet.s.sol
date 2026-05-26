// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {NullarkPool} from "../src/NullarkPool.sol";
import {MegaEthMainnetDeploymentGuards} from "./MegaEthMainnetDeploymentGuards.sol";

contract DeployMegaEthMainnet is MegaEthMainnetDeploymentGuards {
    uint256 private constant EXPECTED_MAINNET_TREE_DEPTH = 20;
    uint256 private constant EXPECTED_MAINNET_TREE_CAPACITY = 2 ** EXPECTED_MAINNET_TREE_DEPTH;

    function run() external returns (NullarkPool pool) {
        _requireMegaEthMainnet();
        _requireLegacyMainnetDeploymentGate();
        _requirePromotedVerifierAdapterApproval();
        _requireMainnetDeploymentApproval();

        address verifierAdapter = vm.envAddress("MEGAETH_MAINNET_VERIFIER_ADAPTER");
        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");
        address poseidon2 = vm.envAddress("MEGAETH_POSEIDON2");

        _requireMainnetPoolRoleConfig(verifierAdapter, feeController);
        _requireConcreteMainnetAddress(poseidon2, "invalid poseidon", "legacy poseidon", "placeholder poseidon");
        require(poseidon2 != verifierAdapter, "poseidon/verifier roles must be separate");
        require(poseidon2 != feeController, "poseidon/admin roles must be separate");
        _requirePromotedVerifierAdapterRuntime(verifierAdapter, privateTransferVerifier, withdrawVerifier);
        _requireMainnetContractCode(poseidon2, "poseidon code missing");

        vm.startBroadcast();
        pool = new NullarkPool(verifierAdapter, feeController, poseidon2);
        vm.stopBroadcast();

        require(pool.MERKLE_TREE_DEPTH() == EXPECTED_MAINNET_TREE_DEPTH, "unexpected mainnet tree depth");
        require(pool.MERKLE_TREE_CAPACITY() == EXPECTED_MAINNET_TREE_CAPACITY, "unexpected mainnet tree capacity");
    }
}
