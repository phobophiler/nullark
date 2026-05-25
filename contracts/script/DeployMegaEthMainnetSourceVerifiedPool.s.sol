// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Script.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {SourceVerifiedPoseidon2} from "../src/vendor/SourceVerifiedPoseidon2.sol";
import {MegaEthMainnetDeploymentGuards} from "./MegaEthMainnetDeploymentGuards.sol";

contract DeployMegaEthMainnetSourceVerifiedPool is MegaEthMainnetDeploymentGuards {
    function run() external returns (SourceVerifiedPoseidon2 poseidon2, NullarkPool pool) {
        _requireMegaEthMainnet();
        _requireLegacyMainnetDeploymentGate();
        _requirePromotedVerifierAdapterApproval();
        _requireMainnetDeploymentApproval();

        address verifierAdapter = vm.envAddress("MEGAETH_MAINNET_VERIFIER_ADAPTER");
        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");

        _requireMainnetPoolRoleConfig(verifierAdapter, feeController);
        _requirePromotedVerifierAdapterRuntime(verifierAdapter, privateTransferVerifier, withdrawVerifier);

        vm.startBroadcast();
        poseidon2 = new SourceVerifiedPoseidon2();
        pool = new NullarkPool(verifierAdapter, feeController, address(poseidon2));
        vm.stopBroadcast();

        require(address(pool.poseidon2()) == address(poseidon2), "poseidon mismatch");

        console2.log("sourceVerifiedPoseidon2", address(poseidon2));
        console2.log("shieldedPool", address(pool));
        console2.log("verifierAdapter", verifierAdapter);
        console2.log("feeController", feeController);
    }
}
