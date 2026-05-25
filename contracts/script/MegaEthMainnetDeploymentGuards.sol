// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

interface IActionRoutingGroth16VerifierView {
    function privateTransferVerifier() external view returns (address);
    function withdrawVerifier() external view returns (address);
}

abstract contract MegaEthMainnetDeploymentGuards is Script {
    uint256 internal constant MEGAETH_MAINNET_CHAIN_ID = 4326;
    address internal constant LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL = 0x54af9d54b4edD062daD5581670E9E5f73048c87b;

    string internal constant MAINNET_DEPLOYMENT_APPROVAL =
        "APPROVE_NULLARK_MAINNET_DEPLOYMENT_CHAIN_4326_WITH_PROMOTED_VERIFIERS";
    string internal constant MAINNET_VERIFIER_SOURCE_APPROVAL =
        "APPROVE_PROMOTED_MAINNET_VERIFIER_SOURCE_CHAIN_4326_NOT_UNTRUSTED_LOCAL_CANDIDATE";
    string internal constant MAINNET_VERIFIER_ADAPTER_APPROVAL = "APPROVE_PROMOTED_MAINNET_VERIFIER_ADAPTER_CHAIN_4326";

    function _requireMegaEthMainnet() internal view {
        require(block.chainid == MEGAETH_MAINNET_CHAIN_ID, "wrong chain");
    }

    function _requireLegacyMainnetDeploymentGate() internal view {
        require(vm.envOr("ALLOW_MAINNET_DEPLOYMENT", false), "mainnet deployment not approved");
    }

    function _requireMainnetDeploymentApproval() internal view {
        _requireMainnetDeploymentApproval(_isMainnetBroadcastContext());
    }

    function _requireMainnetDeploymentApproval(bool requireFinalArtifacts) internal view {
        require(
            _envStringEquals("MEGAETH_MAINNET_DEPLOYMENT_APPROVAL", MAINNET_DEPLOYMENT_APPROVAL),
            "mainnet deployment approval missing"
        );
        if (requireFinalArtifacts) {
            _requireFinalArtifactBinding();
        }
        _requireApprovedSignerOrSafeBinding();
    }

    function _requireFreshFullStackMainnetDeploymentApproval() internal view {
        _requireFreshFullStackMainnetDeploymentApproval(_isMainnetBroadcastOnlyContext(), _isMainnetResumeContext());
    }

    function _requireFreshFullStackMainnetDeploymentApproval(bool isBroadcastOnlyContext, bool isResumeContext)
        internal
        view
    {
        require(
            _envStringEquals("MEGAETH_MAINNET_DEPLOYMENT_APPROVAL", MAINNET_DEPLOYMENT_APPROVAL),
            "mainnet deployment approval missing"
        );
        if (isResumeContext) {
            _requireFinalArtifactBinding();
        } else if (isBroadcastOnlyContext) {
            if (_hasDeploymentOnlyBroadcastPreflightGateBinding()) {
                _requireDeploymentOnlyBroadcastPreflightGateBinding();
            } else {
                _requireFinalArtifactBinding();
            }
        }
        _requireApprovedSignerOrSafeBinding();
    }

    function _isMainnetBroadcastContext() private view returns (bool) {
        return
            vmSafe.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vmSafe.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    function _isMainnetBroadcastOnlyContext() private view returns (bool) {
        return vmSafe.isContext(VmSafe.ForgeContext.ScriptBroadcast);
    }

    function _isMainnetResumeContext() private view returns (bool) {
        return vmSafe.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    function _requirePromotedVerifierSourceApproval() internal view {
        require(
            _envStringEquals("MEGAETH_MAINNET_VERIFIER_SOURCE_APPROVAL", MAINNET_VERIFIER_SOURCE_APPROVAL),
            "mainnet verifier source approval missing"
        );
    }

    function _requirePromotedVerifierAdapterApproval() internal view {
        require(
            _envStringEquals("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", MAINNET_VERIFIER_ADAPTER_APPROVAL),
            "mainnet verifier adapter approval missing"
        );
    }

    function _requireFinalArtifactBinding() private view {
        _requireEvidenceRefAndHash(
            "MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_REF",
            "MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_HASH",
            "final approval bundle ref missing",
            "final approval bundle hash missing"
        );
        _requireEvidenceRefAndHash(
            "MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_REF",
            "MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_HASH",
            "final validator bundle ref missing",
            "final validator bundle hash missing"
        );
        _requireEvidenceRefAndHash(
            "MEGAETH_MAINNET_FINAL_FUNDING_GATE_REF",
            "MEGAETH_MAINNET_FINAL_FUNDING_GATE_HASH",
            "final funding gate ref missing",
            "final funding gate hash missing"
        );
    }

    function _hasDeploymentOnlyBroadcastPreflightGateBinding() private view returns (bool) {
        return bytes(_envStringOrEmpty("MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_REF")).length != 0
            || bytes(_envStringOrEmpty("MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_HASH")).length != 0;
    }

    function _requireDeploymentOnlyBroadcastPreflightGateBinding() private view {
        _requireEvidenceRefAndHash(
            "MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_REF",
            "MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_HASH",
            "deployment-only preflight gate ref missing",
            "deployment-only preflight gate hash missing"
        );
    }

    function _requireApprovedSignerOrSafeBinding() private view {
        address approvedSignerOrSafe = vm.envOr("MEGAETH_MAINNET_APPROVED_SIGNER_OR_SAFE", address(0));
        address configuredBroadcaster = vm.envOr("MEGAETH_MAINNET_BROADCASTER", address(0));
        address configuredSafe = vm.envOr("MEGAETH_MAINNET_SAFE_ADDRESS", address(0));
        _requireApprovedSignerOrSafeBindingValues(approvedSignerOrSafe, configuredBroadcaster, configuredSafe);
    }

    function _requireApprovedSignerOrSafeBindingValues(
        address approvedSignerOrSafe,
        address configuredBroadcaster,
        address configuredSafe
    ) internal pure {
        require(approvedSignerOrSafe != address(0), "approved signer/Safe missing");
        require(!_isForbiddenMainnetAddress(approvedSignerOrSafe), "approved signer/Safe forbidden");
        require(!_isPlaceholderAddress(approvedSignerOrSafe), "approved signer/Safe placeholder");
        require(
            configuredBroadcaster != address(0) || configuredSafe != address(0), "configured broadcaster/Safe missing"
        );

        if (configuredBroadcaster != address(0)) {
            require(!_isForbiddenMainnetAddress(configuredBroadcaster), "configured broadcaster forbidden");
            require(!_isPlaceholderAddress(configuredBroadcaster), "configured broadcaster placeholder");
            require(configuredBroadcaster == approvedSignerOrSafe, "configured broadcaster mismatch");
        }
        if (configuredSafe != address(0)) {
            require(!_isForbiddenMainnetAddress(configuredSafe), "configured Safe forbidden");
            require(!_isPlaceholderAddress(configuredSafe), "configured Safe placeholder");
            require(configuredSafe == approvedSignerOrSafe, "configured Safe mismatch");
        }
    }

    function _requireConcreteMainnetAddress(
        address value,
        string memory zeroMessage,
        string memory forbiddenMessage,
        string memory placeholderMessage
    ) internal pure {
        require(value != address(0), zeroMessage);
        require(!_isForbiddenMainnetAddress(value), forbiddenMessage);
        require(!_isPlaceholderAddress(value), placeholderMessage);
    }

    function _requireMainnetContractCode(address value, string memory missingCodeMessage) internal view {
        require(value.code.length != 0, missingCodeMessage);
    }

    function _requirePromotedVerifierAdapterRuntime(
        address verifierAdapter,
        address privateTransferVerifier,
        address withdrawVerifier
    ) internal view {
        _requireConcreteMainnetAddress(
            privateTransferVerifier,
            "invalid private verifier",
            "legacy private verifier",
            "placeholder private verifier"
        );
        _requireConcreteMainnetAddress(
            withdrawVerifier, "invalid withdraw verifier", "legacy withdraw verifier", "placeholder withdraw verifier"
        );
        _requireMainnetContractCode(privateTransferVerifier, "private verifier code missing");
        _requireMainnetContractCode(withdrawVerifier, "withdraw verifier code missing");
        _requireMainnetContractCode(verifierAdapter, "verifier adapter code missing");
        require(privateTransferVerifier != withdrawVerifier, "verifier roles must be separate");
        _requireExpectedRuntimeCodehash(
            verifierAdapter,
            "MEGAETH_MAINNET_VERIFIER_ADAPTER_RUNTIME_HASH",
            "verifier adapter runtime hash missing",
            "verifier adapter runtime hash mismatch"
        );
        _requireExpectedRuntimeCodehash(
            privateTransferVerifier,
            "MEGAETH_PRIVATE_TRANSFER_VERIFIER_RUNTIME_HASH",
            "private verifier runtime hash missing",
            "private verifier runtime hash mismatch"
        );
        _requireExpectedRuntimeCodehash(
            withdrawVerifier,
            "MEGAETH_WITHDRAW_VERIFIER_RUNTIME_HASH",
            "withdraw verifier runtime hash missing",
            "withdraw verifier runtime hash mismatch"
        );

        IActionRoutingGroth16VerifierView adapter = IActionRoutingGroth16VerifierView(verifierAdapter);
        require(adapter.privateTransferVerifier() == privateTransferVerifier, "private verifier mismatch");
        require(adapter.withdrawVerifier() == withdrawVerifier, "withdraw verifier mismatch");
    }

    function _requireMainnetPoolRoleConfig(address verifierAdapter, address feeController) internal pure {
        _requireConcreteMainnetAddress(
            verifierAdapter, "invalid verifier adapter", "legacy verifier adapter", "placeholder verifier adapter"
        );
        _requireConcreteMainnetAddress(
            feeController, "invalid fee controller", "legacy fee controller", "placeholder fee controller"
        );
        require(verifierAdapter != feeController, "verifier/admin roles must be separate");
    }

    function _requireExpectedRuntimeCodehash(
        address target,
        string memory envName,
        string memory missingHashMessage,
        string memory mismatchMessage
    ) internal view {
        bytes32 expectedRuntimeHash = _envBytes32StringOrZero(envName);
        require(expectedRuntimeHash != bytes32(0), missingHashMessage);
        require(target.codehash == expectedRuntimeHash, mismatchMessage);
    }

    function _envBytes32StringOrZero(string memory name) private view returns (bytes32) {
        bytes memory raw = bytes(_envStringOrEmpty(name));
        if (raw.length != 66 || raw[0] != "0" || (raw[1] != "x" && raw[1] != "X")) {
            return bytes32(0);
        }

        uint256 value;
        for (uint256 index = 2; index < raw.length; index++) {
            uint8 parsed = _hexNibble(raw[index]);
            if (parsed > 15) {
                return bytes32(0);
            }
            value = (value << 4) | parsed;
        }
        return bytes32(value);
    }

    function _hexNibble(bytes1 char) private pure returns (uint8) {
        if (char >= 0x30 && char <= 0x39) {
            return uint8(char) - 0x30;
        }
        if (char >= 0x61 && char <= 0x66) {
            return uint8(char) - 0x57;
        }
        if (char >= 0x41 && char <= 0x46) {
            return uint8(char) - 0x37;
        }
        return type(uint8).max;
    }

    function _requireEvidenceRefAndHash(
        string memory refEnv,
        string memory hashEnv,
        string memory missingRefMessage,
        string memory missingHashMessage
    ) private view {
        _requireEvidenceRefAndHashValues(
            _envStringOrEmpty(refEnv), _envStringOrEmpty(hashEnv), missingRefMessage, missingHashMessage
        );
    }

    function _requireEvidenceRefAndHashValues(
        string memory evidenceRef,
        string memory artifactHash,
        string memory missingRefMessage,
        string memory missingHashMessage
    ) internal pure {
        require(_isConcreteEvidenceRef(evidenceRef), missingRefMessage);
        require(_isSha256Hash(artifactHash), missingHashMessage);
    }

    function _envStringEquals(string memory name, string memory expected) private view returns (bool) {
        return _approvalValueMatches(_envStringOrEmpty(name), expected);
    }

    function _envStringOrEmpty(string memory name) private view returns (string memory) {
        try vm.envString(name) returns (string memory value) {
            return value;
        } catch {
            return "";
        }
    }

    function _approvalValueMatches(string memory actual, string memory expected) internal pure returns (bool) {
        return keccak256(bytes(actual)) == keccak256(bytes(expected));
    }

    function _isConcreteEvidenceRef(string memory value) internal pure returns (bool) {
        bytes memory raw = bytes(value);
        if (raw.length == 0) {
            return false;
        }
        bytes memory publicArtifactsPrefix = bytes("public-artifacts/");
        if (!_startsWith(raw, publicArtifactsPrefix)) {
            return false;
        }
        return !_contains(raw, bytes("..")) && !_containsCaseInsensitive(raw, bytes("placeholder"))
            && !_containsCaseInsensitive(raw, bytes("pending")) && !_containsCaseInsensitive(raw, bytes("todo"))
            && !_containsCaseInsensitive(raw, bytes("tbd")) && !_containsCaseInsensitive(raw, bytes("draft"))
            && !_containsCaseInsensitive(raw, bytes("release-candidate"))
            && !_containsCaseInsensitive(raw, bytes("not-approved"));
    }

    function _isSha256Hash(string memory value) internal pure returns (bool) {
        bytes memory raw = bytes(value);
        if (raw.length != 71) {
            return false;
        }
        bytes memory prefix = bytes("sha256:");
        if (!_startsWith(raw, prefix)) {
            return false;
        }
        for (uint256 index = prefix.length; index < raw.length; index++) {
            bytes1 char = raw[index];
            bool digit = char >= 0x30 && char <= 0x39;
            bool lowerHex = char >= 0x61 && char <= 0x66;
            if (!digit && !lowerHex) {
                return false;
            }
        }
        return true;
    }

    function _isForbiddenMainnetAddress(address value) internal pure returns (bool) {
        return value == LEGACY_SHIELDED_POOL_DEPTH20_MAINNET_POOL;
    }

    function _isPlaceholderAddress(address value) internal pure returns (bool) {
        uint160 raw = uint160(value);
        return raw <= 0xFFFF || raw == type(uint160).max || value == 0x000000000000000000000000000000000000dEaD;
    }

    function _startsWith(bytes memory value, bytes memory prefix) private pure returns (bool) {
        if (value.length < prefix.length) {
            return false;
        }
        for (uint256 index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    function _contains(bytes memory value, bytes memory needle) private pure returns (bool) {
        if (needle.length == 0 || value.length < needle.length) {
            return false;
        }
        for (uint256 index = 0; index <= value.length - needle.length; index++) {
            bool matches = true;
            for (uint256 needleIndex = 0; needleIndex < needle.length; needleIndex++) {
                if (value[index + needleIndex] != needle[needleIndex]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return true;
            }
        }
        return false;
    }

    function _containsCaseInsensitive(bytes memory value, bytes memory lowercaseNeedle) private pure returns (bool) {
        if (lowercaseNeedle.length == 0 || value.length < lowercaseNeedle.length) {
            return false;
        }
        for (uint256 index = 0; index <= value.length - lowercaseNeedle.length; index++) {
            bool matches = true;
            for (uint256 needleIndex = 0; needleIndex < lowercaseNeedle.length; needleIndex++) {
                if (_toLower(value[index + needleIndex]) != lowercaseNeedle[needleIndex]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return true;
            }
        }
        return false;
    }

    function _toLower(bytes1 char) private pure returns (bytes1) {
        if (char >= 0x41 && char <= 0x5A) {
            return bytes1(uint8(char) + 32);
        }
        return char;
    }
}
