// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {DeployMegaEthMainnet} from "../script/DeployMegaEthMainnet.s.sol";
import {DeployMegaEthMainnetPoolOnly} from "../script/DeployMegaEthMainnetPoolOnly.s.sol";
import {DeployMegaEthMainnetSourceVerifiedPool} from "../script/DeployMegaEthMainnetSourceVerifiedPool.s.sol";
import {MegaEthMainnetDeploymentGuards} from "../script/MegaEthMainnetDeploymentGuards.sol";

contract MockVerifierRuntime {}

contract DifferentMockVerifierRuntime {
    function marker() external pure returns (uint256) {
        return 1;
    }
}

contract MockActionRoutingGroth16VerifierView {
    address private privateTransferVerifier_;
    address private withdrawVerifier_;

    constructor(address privateTransferVerifier__, address withdrawVerifier__) {
        privateTransferVerifier_ = privateTransferVerifier__;
        withdrawVerifier_ = withdrawVerifier__;
    }

    function privateTransferVerifier() external view returns (address) {
        return privateTransferVerifier_;
    }

    function withdrawVerifier() external view returns (address) {
        return withdrawVerifier_;
    }
}

contract DifferentMockActionRoutingGroth16VerifierView is MockActionRoutingGroth16VerifierView {
    constructor(address privateTransferVerifier__, address withdrawVerifier__)
        MockActionRoutingGroth16VerifierView(privateTransferVerifier__, withdrawVerifier__)
    {}

    function marker() external pure returns (uint256) {
        return 1;
    }
}

contract MegaEthMainnetDeploymentGuardsHarness is MegaEthMainnetDeploymentGuards {
    function requireMegaEthMainnet() external view {
        _requireMegaEthMainnet();
    }

    function deploymentApprovalMatches(string memory actual) external pure returns (bool) {
        return _approvalValueMatches(actual, MAINNET_DEPLOYMENT_APPROVAL);
    }

    function verifierSourceApprovalMatches(string memory actual) external pure returns (bool) {
        return _approvalValueMatches(actual, MAINNET_VERIFIER_SOURCE_APPROVAL);
    }

    function verifierAdapterApprovalMatches(string memory actual) external pure returns (bool) {
        return _approvalValueMatches(actual, MAINNET_VERIFIER_ADAPTER_APPROVAL);
    }

    function requireApprovedSignerOrSafeBinding(address approvedSignerOrSafe, address broadcaster, address safeAddress)
        external
        pure
    {
        _requireApprovedSignerOrSafeBindingValues(approvedSignerOrSafe, broadcaster, safeAddress);
    }

    function requireEvidenceRefAndHash(
        string memory evidenceRef,
        string memory artifactHash,
        string memory missingRefMessage,
        string memory missingHashMessage
    ) external pure {
        _requireEvidenceRefAndHashValues(evidenceRef, artifactHash, missingRefMessage, missingHashMessage);
    }

    function requirePromotedVerifierAdapterRuntime(
        address verifierAdapter,
        address privateTransferVerifier,
        address withdrawVerifier
    ) external view {
        _requirePromotedVerifierAdapterRuntime(verifierAdapter, privateTransferVerifier, withdrawVerifier);
    }
}

contract DeployMegaEthMainnetPoolOnlyHarness is DeployMegaEthMainnetPoolOnly {
    function requirePoolOnlyDeploymentConfig(address verifierAdapter, address feeController, address poseidon2)
        external
        pure
    {
        _requirePoolOnlyDeploymentConfig(verifierAdapter, feeController, poseidon2);
    }

    function requireMainnetDeploymentApproval() external view {
        _requireMainnetDeploymentApproval();
    }

    function requireMainnetDeploymentApprovalForBroadcast() external view {
        _requireMainnetDeploymentApproval(true);
    }

    function requireFreshFullStackMainnetDeploymentApprovalForBroadcast() external view {
        _requireFreshFullStackMainnetDeploymentApproval(true, false);
    }

    function requireFreshFullStackMainnetDeploymentApprovalForResume() external view {
        _requireFreshFullStackMainnetDeploymentApproval(false, true);
    }
}

contract DeployMegaEthMainnetGuardsTest is Test {
    string private constant PROMOTED_SOURCE_APPROVAL =
        "APPROVE_PROMOTED_MAINNET_VERIFIER_SOURCE_CHAIN_4326_NOT_UNTRUSTED_LOCAL_CANDIDATE";
    string private constant PROMOTED_ADAPTER_APPROVAL = "APPROVE_PROMOTED_MAINNET_VERIFIER_ADAPTER_CHAIN_4326";
    string private constant PROMOTED_DEPLOYMENT_APPROVAL =
        "APPROVE_NULLARK_MAINNET_DEPLOYMENT_CHAIN_4326_WITH_PROMOTED_VERIFIERS";
    string private constant FINAL_APPROVAL_BUNDLE_REF =
        "public-artifacts/contracts/nullark-v1-1-mainnet-deployment-confirmation.json";
    string private constant FINAL_APPROVAL_BUNDLE_HASH =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    string private constant FINAL_VALIDATOR_BUNDLE_REF =
        "public-artifacts/contracts/nullark-v1-1-mainnet-validator-bundle.json";
    string private constant FINAL_VALIDATOR_BUNDLE_HASH =
        "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    string private constant FINAL_FUNDING_GATE_REF =
        "public-artifacts/contracts/nullark-v1-1-mainnet-funding-policy.json";
    string private constant FINAL_FUNDING_GATE_HASH =
        "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    string private constant DEPLOYMENT_ONLY_GATE_REF =
        "public-artifacts/contracts/nullark-v1-1-mainnet-broadcast-preflight.json";
    string private constant DEPLOYMENT_ONLY_GATE_HASH =
        "sha256:3333333333333333333333333333333333333333333333333333333333333333";
    address private constant APPROVED_SIGNER_OR_SAFE = 0xBbBBBbBBbbbbBbbbBbBBbbBbbBbBbBbbbbbbbB11;
    address private constant WRONG_SIGNER = 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC;
    address private constant LEGACY_DEPTH20_POOL = 0x54af9d54b4edD062daD5581670E9E5f73048c87b;
    address private constant STALE_FEE_CONTROLLER_SAFE = 0xcC9af5C2Ce347544032796B274b903681e5a1735;
    address private constant PLACEHOLDER_ADDRESS = address(0x1000);
    address private constant VALID_VERIFIER_ADAPTER = 0x1111111111111111111111111111111111111111;
    address private constant VALID_FEE_CONTROLLER = 0x2222222222222222222222222222222222222222;
    address private constant VALID_POSEIDON = 0x4444444444444444444444444444444444444444;

    function setUp() public {
        vm.chainId(4326);
        vm.setEnv("ALLOW_MAINNET_DEPLOYMENT", "1");
        vm.setEnv("MEGAETH_MAINNET_DEPLOYMENT_APPROVAL", "UNAPPROVED");
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_SOURCE_APPROVAL", "UNAPPROVED");
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", "UNAPPROVED");
        _setDefaultFinalBroadcastBinding();
    }

    function testFullMainnetDeploymentRejectsLegacyGateWithoutPromotedVerifierAdapterApproval() public {
        _setLegacyApprovals();
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", "UNAPPROVED");
        DeployMegaEthMainnet script = new DeployMegaEthMainnet();

        vm.expectRevert();
        script.run();
    }

    function testFullMainnetDeploymentRejectsReleaseCandidateVerifierAdapterApproval() public {
        _setLegacyApprovals();
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", "UNTRUSTED_LOCAL_CANDIDATE");
        DeployMegaEthMainnet script = new DeployMegaEthMainnet();

        vm.expectRevert();
        script.run();
    }

    function testMainnetDeploymentRejectsWrongChainBeforeApprovalInputs() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();
        vm.chainId(6343);

        vm.expectRevert("wrong chain");
        harness.requireMegaEthMainnet();
    }

    function testPoolOnlyMainnetDeploymentRejectsLegacyGateWithoutPromotedVerifierAdapterApproval() public {
        _setLegacyApprovals();
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", "UNAPPROVED");
        DeployMegaEthMainnetPoolOnly script = new DeployMegaEthMainnetPoolOnly();

        vm.expectRevert();
        script.run();
    }

    function testPoolOnlyMainnetDeploymentRejectsMissingDeploymentApproval() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        assertFalse(harness.deploymentApprovalMatches("UNAPPROVED"));
        assertFalse(harness.deploymentApprovalMatches(""));
    }

    function testMainnetDeploymentRejectsMissingFinalApprovalBundleRef() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("final approval bundle ref missing");
        harness.requireEvidenceRefAndHash(
            "not-approved",
            FINAL_APPROVAL_BUNDLE_HASH,
            "final approval bundle ref missing",
            "final approval bundle hash missing"
        );
    }

    function testMainnetDeploymentRejectsMissingFinalApprovalBundleHash() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("final approval bundle hash missing");
        harness.requireEvidenceRefAndHash(
            FINAL_APPROVAL_BUNDLE_REF, "", "final approval bundle ref missing", "final approval bundle hash missing"
        );
    }

    function testMainnetDeploymentDryRunApprovalDoesNotRequireFinalBundles() public {
        _setLegacyApprovals();
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_HASH", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_HASH", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_HASH", "");
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        script.requireMainnetDeploymentApproval();
    }

    function testFreshFullStackBroadcastAcceptsDeploymentOnlyGateWithoutFinalBundles() public {
        _setLegacyApprovals();
        _clearFinalArtifactApprovals();
        _setDeploymentOnlyBroadcastPreflightGate();
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        script.requireFreshFullStackMainnetDeploymentApprovalForBroadcast();
    }

    function testFreshFullStackBroadcastRejectsMalformedDeploymentOnlyGateHash() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("deployment-only preflight gate hash missing");
        harness.requireEvidenceRefAndHash(
            DEPLOYMENT_ONLY_GATE_REF,
            "",
            "deployment-only preflight gate ref missing",
            "deployment-only preflight gate hash missing"
        );
    }

    function testPoolOnlyBroadcastStillRequiresFinalBundlesEvenWithDeploymentOnlyGate() public {
        _setLegacyApprovals();
        _clearFinalArtifactApprovals();
        _setDeploymentOnlyBroadcastPreflightGate();
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("final approval bundle ref missing");
        script.requireMainnetDeploymentApprovalForBroadcast();
    }

    function testFreshFullStackResumeStillRequiresFinalBundlesEvenWithDeploymentOnlyGate() public {
        _setLegacyApprovals();
        _clearFinalArtifactApprovals();
        _setDeploymentOnlyBroadcastPreflightGate();
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("final approval bundle ref missing");
        script.requireFreshFullStackMainnetDeploymentApprovalForResume();
    }

    function testMainnetDeploymentRejectsLegacyApprovalStringsWithWrongBroadcaster() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        assertTrue(harness.deploymentApprovalMatches(PROMOTED_DEPLOYMENT_APPROVAL));
        vm.expectRevert("configured broadcaster mismatch");
        harness.requireApprovedSignerOrSafeBinding(APPROVED_SIGNER_OR_SAFE, WRONG_SIGNER, address(0));
    }

    function testMainnetDeploymentRejectsLegacyApprovalStringsWithWrongSafe() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        assertTrue(harness.deploymentApprovalMatches(PROMOTED_DEPLOYMENT_APPROVAL));
        vm.expectRevert("configured Safe mismatch");
        harness.requireApprovedSignerOrSafeBinding(APPROVED_SIGNER_OR_SAFE, address(0), WRONG_SIGNER);
    }

    function testMainnetDeploymentRejectsPlaceholderApprovedSigner() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("approved signer/Safe placeholder");
        harness.requireApprovedSignerOrSafeBinding(PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, address(0));
    }

    function testMainnetDeploymentRejectsLegacyApprovedSafeBinding() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("approved signer/Safe forbidden");
        harness.requireApprovedSignerOrSafeBinding(LEGACY_DEPTH20_POOL, address(0), LEGACY_DEPTH20_POOL);
    }

    function testMainnetDeploymentRejectsLegacyApprovalStringsWithoutFinalFundingGateHash() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        assertTrue(harness.deploymentApprovalMatches(PROMOTED_DEPLOYMENT_APPROVAL));
        vm.expectRevert("final funding gate hash missing");
        harness.requireEvidenceRefAndHash(
            FINAL_FUNDING_GATE_REF, "", "final funding gate ref missing", "final funding gate hash missing"
        );
    }

    function testPoolOnlyMainnetDeploymentRejectsZeroVerifierAdapterConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("invalid verifier adapter");
        script.requirePoolOnlyDeploymentConfig(address(0), VALID_FEE_CONTROLLER, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsZeroFeeControllerConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("invalid fee controller");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, address(0), VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsZeroPoseidonConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("invalid poseidon");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, VALID_FEE_CONTROLLER, address(0));
    }

    function testPoolOnlyMainnetDeploymentRejectsPlaceholderVerifierAdapterConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("placeholder verifier adapter");
        script.requirePoolOnlyDeploymentConfig(PLACEHOLDER_ADDRESS, VALID_FEE_CONTROLLER, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsLegacyVerifierAdapterConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("legacy verifier adapter");
        script.requirePoolOnlyDeploymentConfig(LEGACY_DEPTH20_POOL, VALID_FEE_CONTROLLER, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsPlaceholderPoseidonConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("placeholder poseidon");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, VALID_FEE_CONTROLLER, PLACEHOLDER_ADDRESS);
    }

    function testPoolOnlyMainnetDeploymentRejectsLegacyAdminConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("legacy fee controller");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, LEGACY_DEPTH20_POOL, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsStaleFeeControllerSafe() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("fee controller must be fresh Safe");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, STALE_FEE_CONTROLLER_SAFE, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentAcceptsFreshFeeControllerSafeConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, VALID_FEE_CONTROLLER, VALID_POSEIDON);
    }

    function testPoolOnlyMainnetDeploymentRejectsOverlappingInfrastructureRolesConfig() public {
        DeployMegaEthMainnetPoolOnlyHarness script = new DeployMegaEthMainnetPoolOnlyHarness();

        vm.expectRevert("poseidon/verifier roles must be separate");
        script.requirePoolOnlyDeploymentConfig(VALID_VERIFIER_ADAPTER, VALID_FEE_CONTROLLER, VALID_VERIFIER_ADAPTER);
    }

    function testSourceVerifiedPoolMainnetDeploymentRejectsLegacyGateWithoutPromotedVerifierAdapterApproval() public {
        _setLegacyApprovals();
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", "UNAPPROVED");
        DeployMegaEthMainnetSourceVerifiedPool script = new DeployMegaEthMainnetSourceVerifiedPool();

        vm.expectRevert();
        script.run();
    }

    function testPromotedVerifierAdapterRuntimeAcceptsExpectedCodeHashesAndGetterRoutes() public {
        (
            MockActionRoutingGroth16VerifierView adapter,
            MockVerifierRuntime privateVerifier,
            MockVerifierRuntime withdrawVerifier
        ) = _deployVerifierRuntimeSet();
        _setVerifierRuntimeHashes(address(adapter), address(privateVerifier), address(withdrawVerifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), address(privateVerifier), address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsPrivateGetterMismatch() public {
        (, MockVerifierRuntime privateVerifier, MockVerifierRuntime withdrawVerifier) = _deployVerifierRuntimeSet();
        MockVerifierRuntime wrongPrivateVerifier = new MockVerifierRuntime();
        MockActionRoutingGroth16VerifierView adapter =
            new MockActionRoutingGroth16VerifierView(address(wrongPrivateVerifier), address(withdrawVerifier));
        _setVerifierRuntimeHashes(address(adapter), address(privateVerifier), address(withdrawVerifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("private verifier mismatch");
        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), address(privateVerifier), address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsWithdrawGetterMismatch() public {
        (, MockVerifierRuntime privateVerifier, MockVerifierRuntime withdrawVerifier) = _deployVerifierRuntimeSet();
        MockVerifierRuntime wrongWithdrawVerifier = new MockVerifierRuntime();
        MockActionRoutingGroth16VerifierView adapter =
            new MockActionRoutingGroth16VerifierView(address(privateVerifier), address(wrongWithdrawVerifier));
        _setVerifierRuntimeHashes(address(adapter), address(privateVerifier), address(withdrawVerifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("withdraw verifier mismatch");
        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), address(privateVerifier), address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsMissingPrivateVerifierCode() public {
        (, MockVerifierRuntime privateVerifier, MockVerifierRuntime withdrawVerifier) = _deployVerifierRuntimeSet();
        address missingPrivateVerifier = 0x1111111111111111111111111111111111111234;
        MockActionRoutingGroth16VerifierView adapter =
            new MockActionRoutingGroth16VerifierView(missingPrivateVerifier, address(withdrawVerifier));
        _setVerifierRuntimeHashes(address(adapter), address(privateVerifier), address(withdrawVerifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("private verifier code missing");
        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), missingPrivateVerifier, address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsSameVerifierRoles() public {
        MockVerifierRuntime verifier = new MockVerifierRuntime();
        MockActionRoutingGroth16VerifierView adapter =
            new MockActionRoutingGroth16VerifierView(address(verifier), address(verifier));
        _setVerifierRuntimeHashes(address(adapter), address(verifier), address(verifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("verifier roles must be separate");
        harness.requirePromotedVerifierAdapterRuntime(address(adapter), address(verifier), address(verifier));
    }

    function testPromotedVerifierAdapterRuntimeRejectsWrongAdapterCodehash() public {
        (
            MockActionRoutingGroth16VerifierView adapter,
            MockVerifierRuntime privateVerifier,
            MockVerifierRuntime withdrawVerifier
        ) = _deployVerifierRuntimeSet();
        DifferentMockActionRoutingGroth16VerifierView wrongAdapter =
            new DifferentMockActionRoutingGroth16VerifierView(address(privateVerifier), address(withdrawVerifier));
        _setVerifierRuntimeHashes(address(adapter), address(privateVerifier), address(withdrawVerifier));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("verifier adapter runtime hash mismatch");
        harness.requirePromotedVerifierAdapterRuntime(
            address(wrongAdapter), address(privateVerifier), address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsWrongPrivateVerifierCodehash() public {
        (
            MockActionRoutingGroth16VerifierView adapter,
            MockVerifierRuntime privateVerifier,
            MockVerifierRuntime withdrawVerifier
        ) = _deployVerifierRuntimeSet();
        DifferentMockVerifierRuntime wrongPrivateVerifier = new DifferentMockVerifierRuntime();
        adapter = new MockActionRoutingGroth16VerifierView(address(wrongPrivateVerifier), address(withdrawVerifier));
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_RUNTIME_HASH", vm.toString(address(adapter).codehash));
        vm.setEnv("MEGAETH_PRIVATE_TRANSFER_VERIFIER_RUNTIME_HASH", vm.toString(address(privateVerifier).codehash));
        vm.setEnv("MEGAETH_WITHDRAW_VERIFIER_RUNTIME_HASH", vm.toString(address(withdrawVerifier).codehash));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("private verifier runtime hash mismatch");
        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), address(wrongPrivateVerifier), address(withdrawVerifier)
        );
    }

    function testPromotedVerifierAdapterRuntimeRejectsWrongWithdrawVerifierCodehash() public {
        (
            MockActionRoutingGroth16VerifierView adapter,
            MockVerifierRuntime privateVerifier,
            MockVerifierRuntime withdrawVerifier
        ) = _deployVerifierRuntimeSet();
        DifferentMockVerifierRuntime wrongWithdrawVerifier = new DifferentMockVerifierRuntime();
        adapter = new MockActionRoutingGroth16VerifierView(address(privateVerifier), address(wrongWithdrawVerifier));
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_RUNTIME_HASH", vm.toString(address(adapter).codehash));
        vm.setEnv("MEGAETH_PRIVATE_TRANSFER_VERIFIER_RUNTIME_HASH", vm.toString(address(privateVerifier).codehash));
        vm.setEnv("MEGAETH_WITHDRAW_VERIFIER_RUNTIME_HASH", vm.toString(address(withdrawVerifier).codehash));
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        vm.expectRevert("withdraw verifier runtime hash mismatch");
        harness.requirePromotedVerifierAdapterRuntime(
            address(adapter), address(privateVerifier), address(wrongWithdrawVerifier)
        );
    }

    function testApprovalValuesRejectReleaseCandidateAndUntrustedLabels() public {
        MegaEthMainnetDeploymentGuardsHarness harness = new MegaEthMainnetDeploymentGuardsHarness();

        assertFalse(harness.deploymentApprovalMatches("release-candidate"));
        assertFalse(harness.deploymentApprovalMatches("UNTRUSTED_LOCAL_CANDIDATE"));
        assertTrue(harness.deploymentApprovalMatches(PROMOTED_DEPLOYMENT_APPROVAL));

        assertFalse(harness.verifierSourceApprovalMatches("release-candidate"));
        assertFalse(harness.verifierSourceApprovalMatches("UNTRUSTED_LOCAL_CANDIDATE"));
        assertTrue(harness.verifierSourceApprovalMatches(PROMOTED_SOURCE_APPROVAL));

        assertFalse(harness.verifierAdapterApprovalMatches("release-candidate"));
        assertFalse(harness.verifierAdapterApprovalMatches("UNTRUSTED_LOCAL_CANDIDATE"));
        assertTrue(harness.verifierAdapterApprovalMatches(PROMOTED_ADAPTER_APPROVAL));
    }

    function _setLegacyApprovals() private {
        vm.setEnv("MEGAETH_MAINNET_DEPLOYMENT_APPROVAL", PROMOTED_DEPLOYMENT_APPROVAL);
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_SOURCE_APPROVAL", PROMOTED_SOURCE_APPROVAL);
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_APPROVAL", PROMOTED_ADAPTER_APPROVAL);
    }

    function _setFinalArtifactApprovals() private {
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_REF", FINAL_APPROVAL_BUNDLE_REF);
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_HASH", FINAL_APPROVAL_BUNDLE_HASH);
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_REF", FINAL_VALIDATOR_BUNDLE_REF);
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_HASH", FINAL_VALIDATOR_BUNDLE_HASH);
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_REF", FINAL_FUNDING_GATE_REF);
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_HASH", FINAL_FUNDING_GATE_HASH);
    }

    function _clearFinalArtifactApprovals() private {
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_APPROVAL_BUNDLE_HASH", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_VALIDATOR_BUNDLE_HASH", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_REF", "");
        vm.setEnv("MEGAETH_MAINNET_FINAL_FUNDING_GATE_HASH", "");
    }

    function _setDeploymentOnlyBroadcastPreflightGate() private {
        vm.setEnv("MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_REF", DEPLOYMENT_ONLY_GATE_REF);
        vm.setEnv("MEGAETH_MAINNET_BROADCAST_PREFLIGHT_GATE_HASH", DEPLOYMENT_ONLY_GATE_HASH);
    }

    function _setDefaultFinalBroadcastBinding() private {
        _setFinalArtifactApprovals();
        vm.setEnv("MEGAETH_MAINNET_APPROVED_SIGNER_OR_SAFE", vm.toString(APPROVED_SIGNER_OR_SAFE));
        vm.setEnv("MEGAETH_MAINNET_BROADCASTER", vm.toString(APPROVED_SIGNER_OR_SAFE));
        vm.setEnv("MEGAETH_MAINNET_SAFE_ADDRESS", "0x0000000000000000000000000000000000000000");
    }

    function _deployVerifierRuntimeSet()
        private
        returns (
            MockActionRoutingGroth16VerifierView adapter,
            MockVerifierRuntime privateVerifier,
            MockVerifierRuntime withdrawVerifier
        )
    {
        privateVerifier = new MockVerifierRuntime();
        withdrawVerifier = new MockVerifierRuntime();
        adapter = new MockActionRoutingGroth16VerifierView(address(privateVerifier), address(withdrawVerifier));
    }

    function _setVerifierRuntimeHashes(address adapter, address privateVerifier, address withdrawVerifier) private {
        vm.setEnv("MEGAETH_MAINNET_VERIFIER_ADAPTER_RUNTIME_HASH", vm.toString(address(adapter).codehash));
        vm.setEnv("MEGAETH_PRIVATE_TRANSFER_VERIFIER_RUNTIME_HASH", vm.toString(address(privateVerifier).codehash));
        vm.setEnv("MEGAETH_WITHDRAW_VERIFIER_RUNTIME_HASH", vm.toString(address(withdrawVerifier).codehash));
    }
}
