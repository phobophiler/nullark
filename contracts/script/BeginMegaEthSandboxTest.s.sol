// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {LocalPoseidonMerkleFixtures} from "../test/generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract BeginMegaEthSandboxTest is Script {
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    function run() external {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");
        require(vm.envBool("ALLOW_LOCAL_UNTRUSTED_TESTNET_DEPLOYMENT"), "local untrusted test not approved");

        ShieldedPool shieldedPool = ShieldedPool(vm.envAddress("MEGAETH_SHIELDED_POOL"));
        uint256 depositValue = vm.envOr("MEGAETH_SANDBOX_DEPOSIT_WEI", uint256(100000000000000));
        bytes32 commitment = LocalPoseidonMerkleFixtures.privateTransferSpentCommitment();

        require(depositValue > 0, "deposit required");
        require(!shieldedPool.commitments(commitment), "commitment already inserted");

        vm.startBroadcast();
        shieldedPool.deposit{value: depositValue}(commitment);
        vm.stopBroadcast();

        console2.log("MegaETH sandbox test deposit sent");
        console2.log("shieldedPool", address(shieldedPool));
        console2.log("depositWei", depositValue);
        console2.logBytes32(commitment);
    }
}
