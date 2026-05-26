// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {NullarkPool} from "../../src/v1_2/NullarkPool.sol";
import {MockVerifier} from "../../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "../generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract NullarkPoolUnlinkableSchemaTest is Test {
    bytes32 private constant PRIVATE_TRANSFER_CONTEXT_SHAPE = keccak256("private_transfer_context_v1_2_fee_governance");
    bytes32 private constant WITHDRAW_CONTEXT_SHAPE = keccak256("withdraw_context_v1_2_fee_governance");
    bytes32 private constant WITHDRAWAL_CHANGE_COMMITMENT_TOPIC =
        keccak256("WithdrawalChangeCommitmentInserted(bytes32,bytes32,uint256)");
    bytes32 private constant WITHDRAWAL_CHANGE_NOTE_TOPIC =
        keccak256("WithdrawalChangeNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)");
    bytes4 private constant DEPOSIT_PROOF_SELECTOR = bytes4(keccak256("deposit(bytes,bytes32[],bytes)"));
    bytes4 private constant PRIVATE_TRANSFER_SELECTOR =
        bytes4(keccak256("privateTransfer(bytes,bytes32[],bytes32,bytes32,bytes)"));
    bytes4 private constant WITHDRAW_CHANGE_BOUNDED_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,bytes,uint256,uint256)"));

    NullarkPool private pool;
    MockVerifier private verifier;

    struct WithdrawInputArgs {
        bytes32 root;
        bytes32 nullifier;
        bytes32 outputCommitment;
        address destination;
        uint256 grossAmount;
        bytes encryptedOutputNote;
        uint256 minNetAmount;
        uint256 maxFeeAmount;
    }

    function setUp() public {
        verifier = new MockVerifier();
        verifier.setExpectedPublicInputsLength(10);
        address poseidon2 = LocalPoseidonMerkleFixtures.deployPoseidonT3();
        pool = new NullarkPool(address(verifier), address(this), poseidon2);
    }

    function testV12SpendPublicInputsLengthMustBeTen() public view {
        assertEq(
            pool.PUBLIC_INPUTS_LENGTH(),
            10,
            "v1.2 unlinkable spend statement must be root,nullifier,output,destination,gross,fee,chain,pool,context,noteHash"
        );
    }

    function testV12CurrentScaffoldStillExposesLinkableBoundary() public {
        bytes32 commitment = _fieldCommitment("schema-linkability-commitment");

        _depositWithProof(commitment, 0.01 ether);

        (bool exposesAmountGetter,) =
            address(pool).staticcall(abi.encodeWithSignature("commitmentAmounts(bytes32)", commitment));
        assertFalse(
            exposesAmountGetter,
            "current v1.2 scaffold exposes commitmentAmounts(bytes32); this is a linkable boundary and is not approved"
        );

        (bool exposesAmountBearingNoteHash,) = address(pool)
            .staticcall(
                abi.encodeWithSignature(
                    "computeWithdrawPublicExitEncryptedNoteHash(bytes4,bytes32,uint256)",
                    WITHDRAW_CHANGE_BOUNDED_SELECTOR,
                    _fieldCommitment("schema-linkability-nullifier"),
                    0.01 ether
                )
            );
        assertFalse(
            exposesAmountBearingNoteHash,
            "current v1.2 scaffold exposes amount-bearing encrypted-note hash helpers; this is not approved"
        );
    }

    function testV12WithdrawalShapeMustUseOutputNotChangeSemantics() public {
        bytes32 spentCommitment = _fieldCommitment("output-shape-note");
        bytes32 nullifier = _fieldCommitment("output-shape-nullifier");
        bytes32 outputCommitment = _fieldCommitment("output-shape-output");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedOutputNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);
        uint256 minNetAmount = grossAmount - fee;

        _depositWithProof(spentCommitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs(
            WithdrawInputArgs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: minNetAmount,
                maxFeeAmount: fee
            })
        );

        vm.recordLogs();
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedOutputNote, minNetAmount, fee
        );

        assertFalse(
            _recordedChangeLabeledWithdrawalEvent(),
            "v1.2 withdrawal boundary must use output-note semantics and must not emit change-labeled events"
        );
    }

    function testV12RejectsLegacyPrivateTransferAbiWithV1EncryptedNoteHash() public {
        bytes32 spentCommitment = _fieldCommitment("legacy-private-transfer-note");
        bytes32 nullifier = _fieldCommitment("legacy-private-transfer-nullifier");
        bytes32 outputCommitment = _fieldCommitment("legacy-private-transfer-output");
        bytes memory encryptedNoteV1 = hex"12345678";

        _depositWithProof(spentCommitment, 0.01 ether);
        bytes32[] memory publicInputs =
            _legacyPrivateTransferPublicInputs(pool.currentRoot(), nullifier, outputCommitment, encryptedNoteV1);

        (bool ok,) = address(pool)
            .call(
                abi.encodeWithSignature(
                    "privateTransfer(bytes,bytes32[],bytes32,bytes32,bytes)",
                    hex"1234",
                    publicInputs,
                    nullifier,
                    outputCommitment,
                    encryptedNoteV1
                )
            );

        assertFalse(
            ok,
            "v1.2 must reject the old privateTransfer ABI with V1 encrypted-note hash semantics instead of treating it as baseline"
        );
    }

    function testV12WithdrawRejectsLegacyAndTruncatedPublicInputLengths() public {
        bytes32 spentCommitment = _fieldCommitment("withdraw-length-note");
        bytes32 nullifier = _fieldCommitment("withdraw-length-nullifier");
        bytes32 outputCommitment = _fieldCommitment("withdraw-length-output");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedOutputNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);
        uint256 minNetAmount = grossAmount - fee;

        _depositWithProof(spentCommitment, 0.01 ether);
        bytes32[] memory validPublicInputs = _withdrawPublicInputs(
            WithdrawInputArgs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: minNetAmount,
                maxFeeAmount: fee
            })
        );

        _expectWithdrawInvalidPublicInputLength(
            _copyPublicInputs(validPublicInputs, 8),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            minNetAmount,
            fee
        );
        _expectWithdrawInvalidPublicInputLength(
            _copyPublicInputs(validPublicInputs, 9),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            minNetAmount,
            fee
        );
        _expectWithdrawInvalidPublicInputLength(
            _copyPublicInputs(validPublicInputs, 12),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            minNetAmount,
            fee
        );
    }

    function testV12WithdrawRejectsSwappedProofContextAndEncryptedNoteHashInputs() public {
        bytes32 spentCommitment = _fieldCommitment("withdraw-swapped-note");
        bytes32 nullifier = _fieldCommitment("withdraw-swapped-nullifier");
        bytes32 outputCommitment = _fieldCommitment("withdraw-swapped-output");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedOutputNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);
        uint256 minNetAmount = grossAmount - fee;

        _depositWithProof(spentCommitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs(
            WithdrawInputArgs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: minNetAmount,
                maxFeeAmount: fee
            })
        );
        (publicInputs[8], publicInputs[9]) = (publicInputs[9], publicInputs[8]);

        vm.expectRevert("invalid encrypted note hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedOutputNote, minNetAmount, fee
        );
    }

    function _withdrawPublicInputs(WithdrawInputArgs memory args) private view returns (bytes32[] memory publicInputs) {
        uint256 fee = _expectedFee(args.grossAmount);
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: args.minNetAmount, maxFeeAmount: args.maxFeeAmount, deadlineOrZero: 0
        });

        publicInputs = new bytes32[](10);
        publicInputs[0] = args.root;
        publicInputs[1] = args.nullifier;
        publicInputs[2] = args.outputCommitment;
        publicInputs[3] = bytes32(uint256(uint160(args.destination)));
        publicInputs[4] = bytes32(args.grossAmount);
        publicInputs[5] = bytes32(fee);
        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(pool))));
        publicInputs[9] = pool.computeOutputEncryptedNoteHash(
            WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            args.nullifier,
            args.outputCommitment,
            args.encryptedOutputNote
        );
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            args.destination,
            args.grossAmount,
            fee,
            publicInputs[9],
            relayerPolicy
        );
    }

    function _expectWithdrawInvalidPublicInputLength(
        bytes32[] memory publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes memory encryptedOutputNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private {
        vm.expectRevert("invalid public inputs");
        pool.withdraw(
            hex"1234",
            publicInputs,
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            minNetAmount,
            maxFeeAmount
        );
    }

    function _copyPublicInputs(bytes32[] memory source, uint256 length)
        private
        pure
        returns (bytes32[] memory publicInputs)
    {
        publicInputs = new bytes32[](length);
        uint256 copyLength = source.length < length ? source.length : length;
        for (uint256 i; i < copyLength; i++) {
            publicInputs[i] = source[i];
        }
    }

    function _legacyPrivateTransferPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes memory encryptedNoteV1
    ) private view returns (bytes32[] memory publicInputs) {
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 0
        });
        NullarkPool.EncryptedNoteV1 memory note = NullarkPool.EncryptedNoteV1({
            shape: PRIVATE_TRANSFER_CONTEXT_SHAPE,
            selector: PRIVATE_TRANSFER_SELECTOR,
            nullifier: nullifier,
            commitment: outputCommitment,
            encryptedNote: encryptedNoteV1
        });

        publicInputs = new bytes32[](10);
        publicInputs[0] = root;
        publicInputs[1] = nullifier;
        publicInputs[2] = outputCommitment;
        publicInputs[3] = bytes32(0);
        publicInputs[4] = bytes32(0);
        publicInputs[5] = bytes32(0);
        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(pool))));
        publicInputs[9] = pool.computeEncryptedNoteHash(note);
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            PRIVATE_TRANSFER_CONTEXT_SHAPE,
            PRIVATE_TRANSFER_SELECTOR,
            address(0),
            0,
            0,
            publicInputs[9],
            relayerPolicy
        );
    }

    function _recordedChangeLabeledWithdrawalEvent() private view returns (bool sawChangeEvent) {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        for (uint256 i; i < entries.length; i++) {
            bytes32 topic = entries[i].topics[0];
            if (topic == WITHDRAWAL_CHANGE_COMMITMENT_TOPIC || topic == WITHDRAWAL_CHANGE_NOTE_TOPIC) {
                return true;
            }
        }
    }

    function _depositWithProof(bytes32 commitment, uint256 amount) private {
        bytes memory encryptedNote = _depositEncryptedNote(commitment);
        bytes32[] memory publicInputs = new bytes32[](6);
        publicInputs[0] = commitment;
        publicInputs[1] = bytes32(amount);
        publicInputs[2] = bytes32(block.chainid);
        publicInputs[3] = bytes32(uint256(uint160(address(pool))));
        publicInputs[5] = pool.computeDepositEncryptedNoteHash(DEPOSIT_PROOF_SELECTOR, commitment, encryptedNote);
        publicInputs[4] = pool.computeDepositContextHash(DEPOSIT_PROOF_SELECTOR, commitment, amount, publicInputs[5]);

        verifier.setExpectedPublicInputsLength(6);
        pool.deposit{value: amount}(hex"1234", publicInputs, encryptedNote);
        verifier.setExpectedPublicInputsLength(10);
    }

    function _depositEncryptedNote(bytes32 commitment) private pure returns (bytes memory) {
        return abi.encodePacked("deposit-note-v1.2", commitment);
    }

    function _fieldCommitment(string memory seed) private pure returns (bytes32) {
        uint256 value = uint256(keccak256(bytes(seed)))
            % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        if (value == 0) {
            value = 1;
        }
        return bytes32(value);
    }

    function _expectedFee(uint256 grossAmount) private view returns (uint256) {
        return (grossAmount * uint256(pool.feeBps())) / pool.BPS_DENOMINATOR();
    }
}
