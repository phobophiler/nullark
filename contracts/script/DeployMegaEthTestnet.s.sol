// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";
import {LocalPoseidonMerkleFixtures} from "../test/generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";
import {UntrustedLocalGroth16PrivateTransferVerifier} from
    "../test/generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16PrivateTransferVerifier.sol";
import {UntrustedLocalGroth16WithdrawVerifier} from
    "../test/generated/UNTRUSTED_LOCAL/UntrustedLocalGroth16WithdrawVerifier.sol";

contract DeployMegaEthTestnet is Script {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    function run() external {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");
        require(
            vm.envOr("ALLOW_LEGACY_SHIELDED_POOL_TESTNET_SCRIPT", false),
            "legacy ShieldedPool testnet script disabled"
        );
        require(vm.envBool("ALLOW_LOCAL_UNTRUSTED_TESTNET_DEPLOYMENT"), "local untrusted deploy not approved");

        address deployer = vm.envAddress("MEGAETH_DEPLOYER_ADDRESS");
        address feeController = vm.envOr("MEGAETH_FEE_CONTROLLER", deployer);
        address emergencyGuardian = vm.envOr("MEGAETH_EMERGENCY_GUARDIAN", deployer);

        require(feeController != address(0), "invalid fee controller");
        require(emergencyGuardian != address(0), "invalid emergency guardian");

        vm.startBroadcast();

        UntrustedLocalGroth16PrivateTransferVerifier privateTransferVerifier =
            new UntrustedLocalGroth16PrivateTransferVerifier();
        UntrustedLocalGroth16WithdrawVerifier withdrawVerifier = new UntrustedLocalGroth16WithdrawVerifier();
        ActionRoutingGroth16Verifier verifierAdapter =
            new ActionRoutingGroth16Verifier(address(privateTransferVerifier), address(withdrawVerifier));
        address poseidon2 = LocalPoseidonMerkleFixtures.deployPoseidonT3();
        ShieldedPool shieldedPool = new ShieldedPool(address(verifierAdapter), feeController, emergencyGuardian, poseidon2);

        vm.stopBroadcast();

        console2.log("LEGACY_SHIELDED_POOL_TESTNET_SCRIPT=true");
        console2.log("SUPERSEDED_BY=DeployMegaEthTestnetNullarkPool");
        console2.log("NOT_NULLARK_V1_1_EVIDENCE=true");
        console2.log("SANDBOX_ONLY_LOCAL_UNTRUSTED=true");
        console2.log("privateTransferVerifier", address(privateTransferVerifier));
        console2.log("withdrawVerifier", address(withdrawVerifier));
        console2.log("verifierAdapter", address(verifierAdapter));
        console2.log("poseidon2", poseidon2);
        console2.log("shieldedPool", address(shieldedPool));
        console2.log("feeController", feeController);
        console2.log("emergencyGuardian", emergencyGuardian);
    }
}
