// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

abstract contract MegaEthTestnetDeploymentGuards is Script {
    uint256 internal constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    string internal constant TESTNET_DEPLOYMENT_APPROVAL =
        "APPROVE_NULLARK_TESTNET_DEPLOYMENT_CHAIN_6343_WITH_PROMOTED_VERIFIERS";

    function _requireMegaEthTestnet() internal view {
        require(block.chainid == MEGAETH_TESTNET_CHAIN_ID, "wrong chain");
    }

    function _requireTestnetDeploymentGate() internal view {
        require(vm.envOr("ALLOW_TESTNET_DEPLOYMENT", false), "testnet deployment not approved");
    }

    function _requireTestnetDeploymentApproval() internal view {
        require(
            _envStringEquals("MEGAETH_TESTNET_DEPLOYMENT_APPROVAL", TESTNET_DEPLOYMENT_APPROVAL),
            "testnet deployment approval missing"
        );
    }

    function _requireConcreteTestnetAddress(address value, string memory zeroMessage, string memory placeholderMessage)
        internal
        pure
    {
        require(value != address(0), zeroMessage);
        require(!_isPlaceholderAddress(value), placeholderMessage);
    }

    function _requireTestnetPoolRoleConfig(address verifierAdapter, address feeController) internal pure {
        _requireConcreteTestnetAddress(verifierAdapter, "invalid verifier adapter", "placeholder verifier adapter");
        _requireConcreteTestnetAddress(feeController, "invalid fee controller", "placeholder fee controller");
        require(verifierAdapter != feeController, "verifier/admin roles must be separate");
    }

    function _envStringEquals(string memory name, string memory expected) private view returns (bool) {
        return keccak256(bytes(_envStringOrEmpty(name))) == keccak256(bytes(expected));
    }

    function _envStringOrEmpty(string memory name) private view returns (string memory) {
        try vm.envString(name) returns (string memory value) {
            return value;
        } catch {
            return "";
        }
    }

    function _isPlaceholderAddress(address value) internal pure returns (bool) {
        return value == address(1) || value == address(0x000000000000000000000000000000000000dEaD)
            || value == address(0x1111111111111111111111111111111111111111)
            || value == address(0x2222222222222222222222222222222222222222)
            || value == address(0x3333333333333333333333333333333333333333)
            || value == address(0x4444444444444444444444444444444444444444)
            || value == address(0x5555555555555555555555555555555555555555);
    }
}
