// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ActionRoutingGroth16V12Verifier} from "../src/verifiers/ActionRoutingGroth16V12Verifier.sol";

contract StubGroth16DepositV12ProofVerifier {
    bool private immutable shouldVerify;

    constructor(bool shouldVerify_) {
        shouldVerify = shouldVerify_;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata pubSignals
    ) external view returns (bool) {
        return shouldVerify && pubSignals[1] == 0.005 ether && (pubSignals[2] == 6343 || pubSignals[2] == 4326)
            && pubSignals[3] == uint160(address(0xBEEF));
    }
}

contract StubGroth16SpendV12ProofVerifier {
    bool private immutable shouldVerify;

    constructor(bool shouldVerify_) {
        shouldVerify = shouldVerify_;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[10] calldata pubSignals
    ) external view returns (bool) {
        return shouldVerify && pubSignals[0] == 1 && pubSignals[2] == 3;
    }
}

contract ActionRoutingGroth16V12VerifierTest is Test {
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant FIRST_NON_ADDRESS_VALUE = 1 << 160;

    uint256 private constant DEPOSIT_PUBLIC_INPUT_AMOUNT = 1;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_CHAIN_ID = 2;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT = 3;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH = 4;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 5;

    uint256 private constant SPEND_PUBLIC_INPUT_OUTPUT_COMMITMENT = 2;
    uint256 private constant SPEND_PUBLIC_INPUT_DESTINATION = 3;
    uint256 private constant SPEND_PUBLIC_INPUT_GROSS_AMOUNT = 4;
    uint256 private constant SPEND_PUBLIC_INPUT_FEE = 5;
    uint256 private constant SPEND_PUBLIC_INPUT_CHAIN_ID = 6;
    uint256 private constant SPEND_PUBLIC_INPUT_VERIFYING_CONTRACT = 7;
    uint256 private constant SPEND_PUBLIC_INPUT_PROOF_CONTEXT_HASH = 8;
    uint256 private constant SPEND_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 9;

    StubGroth16DepositV12ProofVerifier depositProofVerifier;
    StubGroth16SpendV12ProofVerifier privateTransferProofVerifier;
    StubGroth16SpendV12ProofVerifier withdrawProofVerifier;
    ActionRoutingGroth16V12Verifier verifier;

    function setUp() public {
        depositProofVerifier = new StubGroth16DepositV12ProofVerifier(true);
        privateTransferProofVerifier = new StubGroth16SpendV12ProofVerifier(true);
        withdrawProofVerifier = new StubGroth16SpendV12ProofVerifier(true);
        verifier = new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier), address(privateTransferProofVerifier), address(withdrawProofVerifier)
        );
    }

    function testDepositProofRoutesWithSixPublicInputs() public view {
        assertTrue(verifier.verify(_dummyProof(), _depositInputs()));
    }

    function testPrivateTransferProofRoutesWithTenPublicInputs() public {
        ActionRoutingGroth16V12Verifier privateOnlyVerifier = new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier),
            address(new StubGroth16SpendV12ProofVerifier(true)),
            address(new StubGroth16SpendV12ProofVerifier(false))
        );

        assertTrue(privateOnlyVerifier.verify(_dummyProof(), _privateTransferInputs()));
        assertFalse(privateOnlyVerifier.verify(_dummyProof(), _withdrawInputs()));
    }

    function testWithdrawProofRoutesWithTenPublicInputs() public {
        ActionRoutingGroth16V12Verifier withdrawOnlyVerifier = new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier),
            address(new StubGroth16SpendV12ProofVerifier(false)),
            address(new StubGroth16SpendV12ProofVerifier(true))
        );

        assertFalse(withdrawOnlyVerifier.verify(_dummyProof(), _privateTransferInputs()));
        assertTrue(withdrawOnlyVerifier.verify(_dummyProof(), _withdrawInputs()));
    }

    function testV11TwelvePublicInputShapeFailsBeforeVerifier() public view {
        bytes32[] memory publicInputs = new bytes32[](12);
        publicInputs[0] = bytes32(uint256(1));
        publicInputs[1] = bytes32(uint256(2));
        publicInputs[2] = bytes32(uint256(3));
        publicInputs[6] = bytes32(uint256(6343));
        publicInputs[7] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[10] = bytes32(uint256(11));
        publicInputs[11] = bytes32(uint256(12));

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testRejectedDepositVerifierResultFails() public {
        ActionRoutingGroth16V12Verifier rejectingVerifier = new ActionRoutingGroth16V12Verifier(
            address(new StubGroth16DepositV12ProofVerifier(false)),
            address(privateTransferProofVerifier),
            address(withdrawProofVerifier)
        );

        assertFalse(rejectingVerifier.verify(_dummyProof(), _depositInputs()));
    }

    function testRejectedPrivateTransferVerifierResultFails() public {
        ActionRoutingGroth16V12Verifier rejectingVerifier = new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier),
            address(new StubGroth16SpendV12ProofVerifier(false)),
            address(withdrawProofVerifier)
        );

        assertFalse(rejectingVerifier.verify(_dummyProof(), _privateTransferInputs()));
    }

    function testRejectedWithdrawVerifierResultFails() public {
        ActionRoutingGroth16V12Verifier rejectingVerifier = new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier),
            address(privateTransferProofVerifier),
            address(new StubGroth16SpendV12ProofVerifier(false))
        );

        assertFalse(rejectingVerifier.verify(_dummyProof(), _withdrawInputs()));
    }

    function testMalformedProofBytesFail() public view {
        assertFalse(verifier.verify(hex"1234", _depositInputs()));
        assertFalse(verifier.verify(hex"1234", _privateTransferInputs()));
    }

    function testPublicInputEqualToScalarFieldFailsBeforeVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[0] = bytes32(BN254_SCALAR_FIELD);
        assertFalse(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[0] = bytes32(BN254_SCALAR_FIELD);
        assertFalse(verifier.verify(_dummyProof(), spendInputs));
    }

    function testUnsupportedChainIdFailsBeforeVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[DEPOSIT_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(1));
        assertFalse(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[SPEND_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(1));
        assertFalse(verifier.verify(_dummyProof(), spendInputs));
    }

    function testMainnetChainIdRoutesToVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[DEPOSIT_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(4326));
        assertTrue(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[SPEND_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(4326));
        assertTrue(verifier.verify(_dummyProof(), spendInputs));
    }

    function testVerifyingContractWidthFailsBeforeVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(FIRST_NON_ADDRESS_VALUE);
        assertFalse(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[SPEND_PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(FIRST_NON_ADDRESS_VALUE);
        assertFalse(verifier.verify(_dummyProof(), spendInputs));
    }

    function testZeroContextHashesFailBeforeVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH] = bytes32(0);
        assertFalse(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[SPEND_PUBLIC_INPUT_PROOF_CONTEXT_HASH] = bytes32(0);
        assertFalse(verifier.verify(_dummyProof(), spendInputs));
    }

    function testZeroEncryptedNoteHashesFailBeforeVerifier() public view {
        bytes32[] memory depositInputs = _depositInputs();
        depositInputs[DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] = bytes32(0);
        assertFalse(verifier.verify(_dummyProof(), depositInputs));

        bytes32[] memory spendInputs = _privateTransferInputs();
        spendInputs[SPEND_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] = bytes32(0);
        assertFalse(verifier.verify(_dummyProof(), spendInputs));
    }

    function testZeroDepositAmountFailsBeforeVerifier() public view {
        bytes32[] memory publicInputs = _depositInputs();
        publicInputs[DEPOSIT_PUBLIC_INPUT_AMOUNT] = bytes32(0);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testAmbiguousSpendShapeFailsBeforeVerifier() public view {
        bytes32[] memory publicInputs = _privateTransferInputs();
        publicInputs[SPEND_PUBLIC_INPUT_OUTPUT_COMMITMENT] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_FEE] = bytes32(0);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testWithdrawDestinationWidthFailsBeforeVerifier() public view {
        bytes32[] memory publicInputs = _withdrawInputs();
        publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] = bytes32(FIRST_NON_ADDRESS_VALUE);

        assertFalse(verifier.verify(_dummyProof(), publicInputs));
    }

    function testZeroGeneratedVerifierAddressesRejected() public {
        vm.expectRevert("invalid deposit verifier");
        new ActionRoutingGroth16V12Verifier(
            address(0), address(privateTransferProofVerifier), address(withdrawProofVerifier)
        );

        vm.expectRevert("invalid private verifier");
        new ActionRoutingGroth16V12Verifier(address(depositProofVerifier), address(0), address(withdrawProofVerifier));

        vm.expectRevert("invalid withdraw verifier");
        new ActionRoutingGroth16V12Verifier(
            address(depositProofVerifier), address(privateTransferProofVerifier), address(0)
        );
    }

    function _dummyProof() private pure returns (bytes memory) {
        uint256[2] memory pA = [uint256(1), uint256(2)];
        uint256[2][2] memory pB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2] memory pC = [uint256(7), uint256(8)];
        return abi.encode(pA, pB, pC);
    }

    function _depositInputs() private pure returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](6);
        publicInputs[0] = bytes32(uint256(1));
        publicInputs[DEPOSIT_PUBLIC_INPUT_AMOUNT] = bytes32(uint256(0.005 ether));
        publicInputs[DEPOSIT_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(6343));
        publicInputs[DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH] = bytes32(uint256(5));
        publicInputs[DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] = bytes32(uint256(6));
    }

    function _privateTransferInputs() private pure returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](10);
        publicInputs[0] = bytes32(uint256(1));
        publicInputs[1] = bytes32(uint256(2));
        publicInputs[SPEND_PUBLIC_INPUT_OUTPUT_COMMITMENT] = bytes32(uint256(3));
        publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_FEE] = bytes32(0);
        publicInputs[SPEND_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(6343));
        publicInputs[SPEND_PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[SPEND_PUBLIC_INPUT_PROOF_CONTEXT_HASH] = bytes32(uint256(9));
        publicInputs[SPEND_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] = bytes32(uint256(10));
    }

    function _withdrawInputs() private pure returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](10);
        publicInputs[0] = bytes32(uint256(1));
        publicInputs[1] = bytes32(uint256(2));
        publicInputs[SPEND_PUBLIC_INPUT_OUTPUT_COMMITMENT] = bytes32(uint256(3));
        publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] = bytes32(uint256(uint160(address(0xCAFE))));
        publicInputs[SPEND_PUBLIC_INPUT_GROSS_AMOUNT] = bytes32(uint256(0.005 ether));
        publicInputs[SPEND_PUBLIC_INPUT_FEE] = bytes32(uint256(16_500_000_000_000));
        publicInputs[SPEND_PUBLIC_INPUT_CHAIN_ID] = bytes32(uint256(6343));
        publicInputs[SPEND_PUBLIC_INPUT_VERIFYING_CONTRACT] = bytes32(uint256(uint160(address(0xBEEF))));
        publicInputs[SPEND_PUBLIC_INPUT_PROOF_CONTEXT_HASH] = bytes32(uint256(9));
        publicInputs[SPEND_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] = bytes32(uint256(10));
    }
}
