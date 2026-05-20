// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {NullarkPool} from "../src/NullarkPool.sol";
import {MegaEthMainnetDeploymentGuards} from "./MegaEthMainnetDeploymentGuards.sol";

contract DeployMegaEthMainnetPoolOnly is MegaEthMainnetDeploymentGuards {
    address internal constant STALE_FEE_CONTROLLER_SAFE = 0xcC9af5C2Ce347544032796B274b903681e5a1735;

    function run() external returns (NullarkPool pool) {
        _requireMegaEthMainnet();
        _requireLegacyMainnetDeploymentGate();
        _requirePromotedVerifierAdapterApproval();
        _requireFreshFullStackMainnetDeploymentApproval();

        address verifierAdapter = vm.envAddress("MEGAETH_MAINNET_VERIFIER_ADAPTER");
        address privateTransferVerifier = vm.envAddress("MEGAETH_PRIVATE_TRANSFER_VERIFIER");
        address withdrawVerifier = vm.envAddress("MEGAETH_WITHDRAW_VERIFIER");
        address feeController = vm.envAddress("MEGAETH_FEE_CONTROLLER");
        address poseidon2 = vm.envAddress("MEGAETH_POSEIDON2");

        _requirePoolOnlyDeploymentConfig(verifierAdapter, feeController, poseidon2);
        _requirePromotedVerifierAdapterRuntime(verifierAdapter, privateTransferVerifier, withdrawVerifier);
        _requireMainnetContractCode(poseidon2, "poseidon code missing");
        _requireMainnetContractCode(feeController, "fee controller Safe code missing");

        vm.startBroadcast();
        pool = new NullarkPool(verifierAdapter, feeController, poseidon2);
        vm.stopBroadcast();
    }

    function _requirePoolOnlyDeploymentConfig(address verifierAdapter, address feeController, address poseidon2)
        internal
        pure
    {
        _requireMainnetPoolRoleConfig(verifierAdapter, feeController);
        require(feeController != STALE_FEE_CONTROLLER_SAFE, "fee controller must be fresh Safe");
        _requireConcreteMainnetAddress(poseidon2, "invalid poseidon", "legacy poseidon", "placeholder poseidon");
        require(poseidon2 != verifierAdapter, "poseidon/verifier roles must be separate");
        require(poseidon2 != feeController, "poseidon/admin roles must be separate");
    }
}
