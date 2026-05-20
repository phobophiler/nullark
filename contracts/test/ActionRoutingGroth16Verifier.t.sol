// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ActionRoutingGroth16Verifier} from "../src/verifiers/ActionRoutingGroth16Verifier.sol";

contract StubGroth16ProofVerifier {
    bool private immutable shouldVerify;

    constructor(bool shouldVerify_) {
        shouldVerify = shouldVerify_;
    }

    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[12] calldata)
        external
        view
        returns (bool)
    {
        return shouldVerify;
    }
}

contract ActionRoutingGroth16VerifierTest is Test {
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant FIRST_NON_ADDRESS_VALUE = 1 << 160;

    uint256 private constant PUBLIC_INPUT_ROOT = 0;
    uint256 private constant PUBLIC_INPUT_NEW_COMMITMENT = 2;
    uint256 private constant PUBLIC_INPUT_DESTINATION = 3;
    uint256 private constant PUBLIC_INPUT_GROSS_AMOUNT = 4;
    uint256 private constant PUBLIC_INPUT_FEE = 5;
    uint256 private constant PUBLIC_INPUT_CHAIN_ID = 6;
    uint256 private constant PUBLIC_INPUT_VERIFYING_CONTRACT = 7;

    ActionRoutingGroth16Verifier verifier;

    function setUp() public {
        verifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(true)), address(new StubGroth16ProofVerifier(true))
        );
    }

    function testValidPrivateTransferProofRoutesToPrivateVerifier() public view {
        assertTrue(verifier.verify(_dummyProof(), _privateTransferInputs()));
    }

    function testValidWithdrawProofRoutesToWithdrawVerifier() public view {
        assertTrue(verifier.verify(_dummyProof(), _withdrawInputs()));
    }

    function testWithdrawalShapeAllowsNonzeroChangeCommitment() public {
        ActionRoutingGroth16Verifier stubbedVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(false)), address(new StubGroth16ProofVerifier(true))
        );
        bytes32[] memory publicInputs = _withdrawInputs();
        publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] = bytes32(uint256(1234));

        assertTrue(stubbedVerifier.verify(_dummyProof(), publicInputs));
    }

    function testWithdrawalShapeAllowsZeroRoundedFee() public {
        ActionRoutingGroth16Verifier stubbedVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(false)), address(new StubGroth16ProofVerifier(true))
        );
        bytes32[] memory publicInputs = _withdrawInputs();
        publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(uint256(999));
        publicInputs[PUBLIC_INPUT_FEE] = bytes32(0);

        assertTrue(stubbedVerifier.verify(_dummyProof(), publicInputs));
    }

    function testPrivateTransferProofWithWithdrawalShapeFails() public {
        ActionRoutingGroth16Verifier privateOnlyVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(true)), address(new StubGroth16ProofVerifier(false))
        );

        assertFalse(privateOnlyVerifier.verify(_dummyProof(), _withdrawInputs()));
    }

    function testWithdrawProofWithPrivateTransferShapeFails() public {
        ActionRoutingGroth16Verifier withdrawOnlyVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(false)), address(new StubGroth16ProofVerifier(true))
        );

        assertFalse(withdrawOnlyVerifier.verify(_dummyProof(), _privateTransferInputs()));
    }

    function testWrongPublicInputLengthFails() public view {
        bytes32[] memory publicInputs = new bytes32[](7);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testPublicInputEqualToScalarFieldFails() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_ROOT] = bytes32(BN254_SCALAR_FIELD);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testVerifyingContractWidthFails() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(FIRST_NON_ADDRESS_VALUE);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testWithdrawDestinationWidthFails() public view {
        bytes32[] memory publicInputs = _withdrawInputs();
        publicInputs[PUBLIC_INPUT_DESTINATION] = bytes32(FIRST_NON_ADDRESS_VALUE);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testMalformedProofBytesFail() public view {
        assertFalse(verifier.verify(hex"1234", _privateTransferInputs()));
    }

    function testInvalidProofWithCorrectLengthFails() public {
        ActionRoutingGroth16Verifier rejectingVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(false)), address(new StubGroth16ProofVerifier(false))
        );

        assertFalse(rejectingVerifier.verify(new bytes(256), _privateTransferInputs()));
    }

    function testMutatedPublicInputFails() public {
        ActionRoutingGroth16Verifier rejectingVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(false)), address(new StubGroth16ProofVerifier(false))
        );
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_ROOT] = bytes32(uint256(publicInputs[PUBLIC_INPUT_ROOT]) + 1);

        assertFalse(rejectingVerifier.verify(_dummyProof(), publicInputs));
    }

    function testMainnetChainIdRoutesToGeneratedVerifier() public {
        ActionRoutingGroth16Verifier privateOnlyVerifier = new ActionRoutingGroth16Verifier(
            address(new StubGroth16ProofVerifier(true)), address(new StubGroth16ProofVerifier(false))
        );
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(4326));

        assertTrue(privateOnlyVerifier.verify(_dummyProof(), publicInputs));
    }

    function testEthMainnetChainIdRejectsBeforeGeneratedVerifier() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(1));

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testAmbiguousActionShapeFailsBeforeGeneratedVerifier() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] = bytes32(0);
        publicInputs[PUBLIC_INPUT_DESTINATION] = bytes32(0);
        publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(0);
        publicInputs[PUBLIC_INPUT_FEE] = bytes32(0);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testZeroStageBHashesFailBeforeGeneratedVerifier() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[10] = bytes32(0);
        publicInputs[11] = bytes32(0);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testZeroGeneratedVerifierAddressRejected() public {
        StubGroth16ProofVerifier privateTransferVerifier = new StubGroth16ProofVerifier(true);
        StubGroth16ProofVerifier withdrawVerifier = new StubGroth16ProofVerifier(true);

        vm.expectRevert("invalid private verifier");
        new ActionRoutingGroth16Verifier(address(0), address(withdrawVerifier));

        vm.expectRevert("invalid withdraw verifier");
        new ActionRoutingGroth16Verifier(address(privateTransferVerifier), address(0));
    }

    function _dummyProof() private pure returns (bytes memory) {
        uint256[2] memory pA = [uint256(1), uint256(2)];
        uint256[2][2] memory pB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2] memory pC = [uint256(7), uint256(8)];
        return abi.encode(pA, pB, pC);
    }

    function _privateTransferInputs() private pure returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](12);
        publicInputs[PUBLIC_INPUT_ROOT] = bytes32(uint256(1));
        publicInputs[1] = bytes32(uint256(2));
        publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] = bytes32(uint256(3));
        publicInputs[PUBLIC_INPUT_DESTINATION] = bytes32(0);
        publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(0);
        publicInputs[PUBLIC_INPUT_FEE] = bytes32(0);
        publicInputs[PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(6343));
        publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[8] = bytes32(uint256(8));
        publicInputs[9] = bytes32(uint256(10_000));
        publicInputs[10] = bytes32(uint256(11));
        publicInputs[11] = bytes32(uint256(12));
    }

    function _withdrawInputs() private pure returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](12);
        publicInputs[PUBLIC_INPUT_ROOT] = bytes32(uint256(1));
        publicInputs[1] = bytes32(uint256(2));
        publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] = bytes32(0);
        publicInputs[PUBLIC_INPUT_DESTINATION] = bytes32(uint256(uint160(address(0xCAFE))));
        publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(uint256(10_000));
        publicInputs[PUBLIC_INPUT_FEE] = bytes32(uint256(21));
        publicInputs[PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(6343));
        publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[8] = bytes32(uint256(8));
        publicInputs[9] = bytes32(uint256(10_000));
        publicInputs[10] = bytes32(uint256(11));
        publicInputs[11] = bytes32(uint256(12));
    }
}
