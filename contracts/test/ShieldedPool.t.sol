// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract ReentrantReceiver {
    ShieldedPool private immutable pool;
    bool public attempted;

    constructor(ShieldedPool pool_) {
        pool = pool_;
    }

    receive() external payable {
        if (attempted) {
            return;
        }

        attempted = true;
        bytes32 nullifier = keccak256("reentrant-nullifier");
        bytes32[] memory inputs = new bytes32[](8);
        inputs[0] = keccak256("root");
        inputs[1] = nullifier;
        inputs[3] = bytes32(uint256(uint160(address(this))));
        inputs[4] = bytes32(uint256(1 ether));
        inputs[5] = bytes32(uint256(0.001 ether));
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        try pool.withdraw("", inputs, keccak256("reentrant-nullifier"), payable(address(this)), 1 ether) {
            revert("reentrant withdraw succeeded");
        } catch {}
    }
}

contract RevertingVerifier is IVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        revert("verifier should not be called");
    }
}

contract ForceEth {
    constructor() payable {}

    function forceSend(address payable target) external {
        selfdestruct(target);
    }
}

contract ShieldedPoolTest is Test {
    // LocalPoseidonMerkleFixtures follows generated circuit depth; ShieldedPool remains depth 12.
    bytes32 private constant DEPTH_12_ZERO_ROOT =
        0x2c5d82f66c914bafb9701589ba8cfcfb6162b0a12acf88a8d0879a0471b5f85a;
    bytes32 private constant DEPTH_12_PRIVATE_TRANSFER_ROOT =
        0x0794cbec6193f8fff5a6cb6f8dab62214f5f7a9b2fde29e1b1451fef0209439c;
    bytes32 private constant DEPTH_12_PRIVATE_TRANSFER_ROOT_AFTER_NEW_COMMITMENT =
        0x2ae1d2320b9f09eb58732c6a27656d4d0fb71f79c4b278c1ee83c918e676b961;

    ShieldedPool pool;
    MockVerifier verifier;
    address poseidon2;
    address emergencyGuardian = address(0xCAFE);
    event WithdrawalChangeCommitmentInserted(bytes32 indexed commitment, bytes32 indexed nullifier, uint256 grossAmount);
    event DepositNoteCreated(bytes32 indexed commitment, uint256 indexed leafIndex, bytes encryptedNote, uint16 encryptionVersion);
    event PrivateTransferNoteCreated(
        bytes32 indexed commitment,
        bytes32 indexed nullifier,
        uint256 indexed leafIndex,
        bytes encryptedNote,
        uint16 encryptionVersion
    );
    event WithdrawalChangeNoteCreated(
        bytes32 indexed commitment,
        bytes32 indexed nullifier,
        uint256 indexed leafIndex,
        uint256 grossAmount,
        bytes encryptedNote,
        uint16 encryptionVersion
    );

    receive() external payable {}

    function setUp() public {
        verifier = new MockVerifier();
        poseidon2 = LocalPoseidonMerkleFixtures.deployPoseidonT3();
        pool = new ShieldedPool(address(verifier), address(this), emergencyGuardian, poseidon2);
    }

    function testDepositInsertsCommitment() public {
        bytes32 commitment = LocalPoseidonMerkleFixtures.privateTransferSpentCommitment();
        bytes32 previousRoot = pool.currentRoot();

        pool.deposit{value: 1 ether}(commitment);

        assertTrue(pool.commitments(commitment));
        assertEq(pool.totalDepositedAccounting(), 1 ether);
        assertTrue(pool.isAcceptedRoot(previousRoot));
        assertEq(previousRoot, DEPTH_12_ZERO_ROOT);
        assertEq(pool.currentRoot(), DEPTH_12_PRIVATE_TRANSFER_ROOT);
        assertTrue(pool.isAcceptedRoot(pool.currentRoot()));
    }

    function testDepositEmitsEncryptedNoteEvent() public {
        bytes32 commitment = bytes32(uint256(1234));
        bytes memory encryptedNote = hex"01020304";

        vm.expectEmit(true, true, false, true);
        emit DepositNoteCreated(commitment, 0, encryptedNote, 1);
        pool.deposit{value: 1 ether}(commitment, encryptedNote);

        assertTrue(pool.commitments(commitment));
    }

    function testDepositRejectsOversizedEncryptedNote() public {
        bytes memory encryptedNote = new bytes(pool.MAX_ENCRYPTED_NOTE_BYTES() + 1);

        vm.expectRevert("encrypted note too large");
        pool.deposit{value: 1 ether}(bytes32(uint256(1234)), encryptedNote);
    }

    function testInitialRootSeededAsAccepted() public view {
        assertEq(pool.currentRoot(), DEPTH_12_ZERO_ROOT);
        assertEq(pool.initialRoot(), DEPTH_12_ZERO_ROOT);
        assertTrue(pool.isAcceptedRoot(pool.initialRoot()));
        assertEq(pool.rootHistory(0), pool.initialRoot());
    }

    function testRootHistoryExpiresOldRootsAtFixedCapacity() public {
        bytes32 initialRoot = pool.initialRoot();

        for (uint256 i; i < pool.ROOT_HISTORY_SIZE(); i++) {
            pool.deposit{value: 1 wei}(_fieldCommitment(i + 1));
        }

        assertFalse(pool.isAcceptedRoot(initialRoot));
        assertTrue(pool.isAcceptedRoot(pool.currentRoot()));
    }

    function testMerkleTreeAcceptsMoreThanSixteenCommitments() public {
        assertGt(pool.MERKLE_TREE_CAPACITY(), 16);

        for (uint256 i; i < 17; i++) {
            pool.deposit{value: 1 wei}(_fieldCommitment(i + 1));
        }

        assertEq(pool.nextLeafIndex(), 17);
        assertTrue(pool.commitments(_fieldCommitment(17)));
    }

    function testDepositRejectsZeroCommitment() public {
        vm.expectRevert("invalid commitment");
        pool.deposit{value: 1 ether}(bytes32(0));
    }

    function testDepositRejectsOutOfRangeCommitment() public {
        vm.expectRevert("commitment out of range");
        pool.deposit{value: 1 ether}(
            bytes32(uint256(21888242871839275222246405745257275088548364400416034343698204186575808495617))
        );
    }

    function testCannotSpendNullifierTwice() public {
        pool.deposit{value: 1 ether}(LocalPoseidonMerkleFixtures.privateTransferSpentCommitment());
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(nullifier, newCommitment);

        pool.privateTransfer("", inputs, nullifier, newCommitment);
        bytes32[] memory secondInputs = _privateTransferInputs(nullifier, _fieldCommitment("commitment-c"));
        vm.expectRevert("nullifier already spent");
        pool.privateTransfer("", secondInputs, nullifier, _fieldCommitment("commitment-c"));
    }

    function testPrivateTransferRejectsMismatchedNullifierPublicInput() public {
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(keccak256("different-nullifier"), newCommitment);

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer("", inputs, nullifier, newCommitment);
        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(newCommitment));
    }

    function testPrivateTransferRejectsMismatchedCommitmentPublicInput() public {
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(nullifier, _fieldCommitment("different-commitment"));

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer("", inputs, nullifier, newCommitment);
        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(newCommitment));
    }

    function testPrivateTransferRejectsWithdrawalFieldsPublicInputs() public {
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(nullifier, newCommitment);
        inputs[3] = bytes32(uint256(uint160(address(0xBEEF))));
        inputs[4] = bytes32(uint256(1 ether));
        inputs[5] = bytes32(uint256(0.001 ether));

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer("", inputs, nullifier, newCommitment);
        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(newCommitment));
    }

    function testPrivateTransferRejectsWrongLengthPublicInputs() public {
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = new bytes32[](7);

        vm.expectRevert("invalid public inputs");
        pool.privateTransfer("", inputs, nullifier, newCommitment);
    }

    function testVerifierRejectionBlocksPrivateTransfer() public {
        verifier.setShouldVerify(false);
        pool.deposit{value: 1 ether}(LocalPoseidonMerkleFixtures.privateTransferSpentCommitment());
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(nullifier, newCommitment);

        vm.expectRevert("invalid proof");
        pool.privateTransfer("", inputs, nullifier, newCommitment);
        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(newCommitment));
    }

    function testUnknownRootBlocksPrivateTransferBeforeVerifierAndStateMutation() public {
        RevertingVerifier revertingVerifier = new RevertingVerifier();
        ShieldedPool poolWithRevertingVerifier = new ShieldedPool(address(revertingVerifier), address(this), emergencyGuardian, poseidon2);
        bytes32 nullifier = keccak256("nullifier-a");
        bytes32 newCommitment = _fieldCommitment("commitment-b");
        bytes32[] memory inputs = _privateTransferInputs(poolWithRevertingVerifier, nullifier, newCommitment);
        inputs[0] = keccak256("unknown-root");

        vm.expectRevert("unaccepted root");
        poolWithRevertingVerifier.privateTransfer("", inputs, nullifier, newCommitment);
        assertFalse(poolWithRevertingVerifier.nullifiers(nullifier));
        assertFalse(poolWithRevertingVerifier.commitments(newCommitment));
    }

    function testPrivateTransferUpdatesPoseidonMerkleRoot() public {
        bytes32 spentCommitment = LocalPoseidonMerkleFixtures.privateTransferSpentCommitment();
        bytes32 newCommitment = LocalPoseidonMerkleFixtures.privateTransferNewCommitment();
        bytes32 nullifier = keccak256("nullifier-a");

        pool.deposit{value: 1 ether}(spentCommitment);
        assertEq(pool.currentRoot(), DEPTH_12_PRIVATE_TRANSFER_ROOT);

        pool.privateTransfer("", _privateTransferInputs(nullifier, newCommitment), nullifier, newCommitment);

        assertEq(pool.currentRoot(), DEPTH_12_PRIVATE_TRANSFER_ROOT_AFTER_NEW_COMMITMENT);
        assertTrue(pool.commitments(newCommitment));
    }

    function testPrivateTransferEmitsEncryptedNoteEvent() public {
        pool.deposit{value: 1 ether}(LocalPoseidonMerkleFixtures.privateTransferSpentCommitment());
        bytes32 nullifier = bytes32(uint256(777));
        bytes32 newCommitment = bytes32(uint256(888));
        bytes32[] memory publicInputs = _privateTransferInputs(nullifier, newCommitment);
        bytes memory encryptedNote = hex"feedbeef";

        verifier.setShouldVerify(true);

        vm.expectEmit(true, true, true, true);
        emit PrivateTransferNoteCreated(newCommitment, nullifier, 1, encryptedNote, 1);
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testPrivateTransferRejectsOversizedEncryptedNote() public {
        bytes32 nullifier = bytes32(uint256(777));
        bytes32 newCommitment = bytes32(uint256(888));
        bytes32[] memory publicInputs = _privateTransferInputs(nullifier, newCommitment);
        bytes memory encryptedNote = new bytes(pool.MAX_ENCRYPTED_NOTE_BYTES() + 1);

        verifier.setShouldVerify(true);

        vm.expectRevert("encrypted note too large");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testWithdrawalRetainsConfiguredBpsFeeInPool() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 1 ether;
        uint256 fee = _fee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount);

        pool.deposit{value: grossAmount}(_fieldCommitment("funding"));
        uint256 beforeBalance = receiver.balance;
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount);

        assertEq(receiver.balance - beforeBalance, netAmount);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), netAmount);
    }

    function testWithdrawalAllowsTinyAnyAmountWithZeroRoundedFee() public {
        bytes32 nullifier = keccak256("withdraw-tiny-nullifier");
        address receiver = address(0xBEEF);
        bytes32 spentCommitment = _fieldCommitment("funding");
        bytes32[] memory inputs = _withdrawalConservationInputs(nullifier, receiver, 1 wei, spentCommitment, 1 wei);

        pool.deposit{value: 1 wei}(spentCommitment);
        uint256 beforeBalance = receiver.balance;
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 wei, 1 wei, 0);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(receiver.balance - beforeBalance, 1 wei);
        assertEq(pool.accruedProtocolFees(), 0);
        assertEq(pool.totalWithdrawnAccounting(), 1 wei);
    }

    function testWithdrawalRejectsFeeAboveUserBound() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 1 ether;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("fee exceeds user bound");
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount, 0.999 ether, 0);
    }

    function testWithdrawalRejectsNetAmountBelowUserMinimum() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 1 ether;
        uint256 fee = _fee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("net amount below user minimum");
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount, netAmount + 1, fee);
    }

    function testWithdrawalAcceptsExactUserEconomicBounds() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 1 ether;
        uint256 fee = _fee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount, netAmount, fee);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(pool.accruedProtocolFees(), fee);
    }

    function testForcedEthDoesNotInflateWithdrawableAccounting() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        ForceEth force = new ForceEth{value: 1 ether}();
        force.forceSend(payable(address(pool)));

        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1.5 ether);

        vm.expectRevert("withdrawal exceeds note amount");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1.5 ether, 0, type(uint256).max);
    }

    function testWithdrawalCanInsertShieldedChangeCommitment() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment = _fieldCommitment("withdraw-change");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 0.2 ether;
        uint256 fee = _fee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount, changeCommitment);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        bytes32 rootBefore = pool.currentRoot();
        uint256 receiverBalanceBefore = receiver.balance;

        vm.recordLogs();
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
        assertEq(pool.nextLeafIndex(), 2);
        assertNotEq(pool.currentRoot(), rootBefore);
        assertEq(receiver.balance - receiverBalanceBefore, netAmount);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), netAmount);
        assertTrue(_hasWithdrawalChangeLog(logs, changeCommitment, nullifier));
    }

    function testPartialWithdrawalRequiresChangeCommitment() public {
        bytes32 spentCommitment = _fieldCommitment("funding");
        bytes32 nullifier = keccak256("partial-withdraw-no-change");
        address receiver = address(0xBEEF);

        pool.deposit{value: 1 ether}(spentCommitment);
        bytes32[] memory inputs =
            _withdrawalConservationInputs(nullifier, receiver, 0.2 ether, spentCommitment, 1 ether);

        vm.expectRevert("change commitment required");
        pool.withdraw("", inputs, nullifier, payable(receiver), 0.2 ether);

        assertFalse(pool.nullifiers(nullifier));
        assertEq(pool.totalWithdrawnAccounting(), 0);
        assertEq(pool.accruedProtocolFees(), 0);
    }

    function testFullWithdrawalRejectsZeroValueChangeCommitment() public {
        bytes32 spentCommitment = _fieldCommitment("funding");
        bytes32 nullifier = keccak256("full-withdraw-zero-change");
        bytes32 changeCommitment = _fieldCommitment("zero-value-change");
        address receiver = address(0xBEEF);

        pool.deposit{value: 1 ether}(spentCommitment);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1 ether, changeCommitment);

        vm.expectRevert("invalid change amount");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);

        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(changeCommitment));
    }

    function testWithdrawalChangeEmitsEncryptedNoteEvent() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment = _fieldCommitment("withdraw-change");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 0.2 ether;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount, changeCommitment);
        bytes memory encryptedChangeNote = hex"cafebabe";

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectEmit(true, true, true, true);
        emit WithdrawalChangeNoteCreated(changeCommitment, nullifier, 1, grossAmount, encryptedChangeNote, 1);
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount, encryptedChangeNote);
    }

    function testWithdrawalRejectsOversizedEncryptedChangeNote() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment = _fieldCommitment("withdraw-change");
        address receiver = address(0xBEEF);
        uint256 grossAmount = 0.2 ether;
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, grossAmount, changeCommitment);
        bytes memory encryptedChangeNote = new bytes(pool.MAX_ENCRYPTED_NOTE_BYTES() + 1);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("encrypted note too large");
        pool.withdraw("", inputs, nullifier, payable(receiver), grossAmount, encryptedChangeNote);
    }

    function testWithdrawalRejectsDuplicateChangeCommitment() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment = _fieldCommitment("withdraw-change");
        address receiver = address(0xBEEF);
        pool.deposit{value: 0.8 ether}(changeCommitment);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 0.2 ether, changeCommitment);

        vm.expectRevert("commitment exists");
        pool.withdraw("", inputs, nullifier, payable(receiver), 0.2 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsOutOfRangeChangeCommitment() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment =
            bytes32(uint256(21888242871839275222246405745257275088548364400416034343698204186575808495617));
        address receiver = address(0xBEEF);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 0.2 ether, changeCommitment);

        vm.expectRevert("commitment out of range");
        pool.withdraw("", inputs, nullifier, payable(receiver), 0.2 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsZeroDestination() public {
        bytes32[] memory inputs = _withdrawalInputs(keccak256("withdraw-nullifier"), address(0), 1 ether);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid destination");
        pool.withdraw("", inputs, keccak256("withdraw-nullifier"), payable(address(0)), 1 ether);
    }

    function testWithdrawalCannotUseUnsweptFeesAsPrincipal() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );

        bytes32[] memory secondInputs = _withdrawalInputs(keccak256("second-withdraw"), address(0xBEEF), 0.001 ether);
        secondInputs[2] = _fieldCommitment("second-withdraw-change");
        vm.expectRevert("insufficient accounting liquidity");
        pool.withdraw("", secondInputs, keccak256("second-withdraw"), payable(address(0xBEEF)), 0.001 ether);
    }

    function testFeeSweepCannotExceedAccruedFees() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );

        uint256 accruedFees = pool.accruedProtocolFees();
        vm.expectRevert("sweep exceeds accrued fees");
        pool.sweepFees(payable(address(this)), accruedFees + 1);
    }

    function testOnlyFeeControllerCanSweepFees() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );

        vm.prank(address(0xCAFE));
        vm.expectRevert("only fee controller");
        pool.sweepFees(payable(address(0xCAFE)), 0.001 ether);
    }

    function testReentrancyCannotWithdrawTwice() public {
        ReentrantReceiver receiver = new ReentrantReceiver(pool);

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-nullifier"), address(receiver), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(receiver)),
            1 ether
        );

        assertTrue(receiver.attempted());
        assertFalse(pool.nullifiers(keccak256("reentrant-nullifier")));
    }

    function testPauseDepositsDoesNotPauseWithdrawals() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.pauseDeposits(true);

        vm.expectRevert("deposits paused");
        pool.deposit{value: 1 ether}(_fieldCommitment("blocked"));

        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-while-deposits-paused"), address(0xBEEF), 1 ether),
            keccak256("withdraw-while-deposits-paused"),
            payable(address(0xBEEF)),
            1 ether
        );
    }

    function testWithdrawalCanBeSubmittedByThirdPartyRelayer() public {
        bytes32 nullifier = keccak256("relayed-withdraw-nullifier");
        address relayer = address(0xA11CE);
        address destination = address(0xBEEF);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.prank(relayer);
        pool.withdraw("", _withdrawalInputs(nullifier, destination, 1 ether), nullifier, payable(destination), 1 ether);

        assertTrue(pool.nullifiers(nullifier));
        assertEq(destination.balance, 1 ether - _fee(1 ether));
    }

    function testEmergencyWithdrawalPauseRequiresGuardian() public {
        vm.prank(address(0xBADC0DE));
        vm.expectRevert("only emergency guardian");
        pool.pauseWithdrawalsForEmergency(true);
    }

    function testEmergencyGuardianCanPauseWithdrawals() public {
        vm.prank(emergencyGuardian);
        pool.pauseWithdrawalsForEmergency(true);
        assertTrue(pool.withdrawalsEmergencyPaused());
    }

    function testFeeSweepPauseBlocksSweeps() public {
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );
        pool.pauseFeeSweeps(true);
        assertTrue(pool.feeSweepsPaused());
        uint256 accruedFees = pool.accruedProtocolFees();

        vm.expectRevert("fee sweeps paused");
        pool.sweepFees(payable(address(this)), accruedFees);
    }

    function testWithdrawalRejectsMismatchedNullifierPublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(keccak256("different-nullifier"), receiver, 1 ether);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsMismatchedDestinationPublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, address(0xCAFE), 1 ether);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsMismatchedAmountPublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 2 ether);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalCannotOverstateDepositedCommitmentAmount() public {
        bytes32 spentCommitment = _fieldCommitment("small-note");
        bytes32 nullifier = keccak256("withdraw-overstated-note");
        address receiver = address(0xBEEF);
        pool.deposit{value: 1 ether}(spentCommitment);
        pool.deposit{value: 1 ether}(_fieldCommitment("extra-liquidity"));
        bytes32[] memory inputs = _withdrawalConservationInputs(nullifier, receiver, 2 ether, spentCommitment, 2 ether);

        vm.expectRevert("spent commitment amount mismatch");
        pool.withdraw("", inputs, nullifier, payable(receiver), 2 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsMismatchedFeePublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1 ether);
        inputs[5] = bytes32(uint256(0.002 ether));
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsMismatchedChainIdPublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1 ether);
        inputs[6] = bytes32(uint256(block.chainid + 1));
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testWithdrawalRejectsMismatchedVerifyingContractPublicInput() public {
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1 ether);
        inputs[7] = bytes32(uint256(uint160(address(0xCAFE))));
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        vm.expectRevert("invalid public inputs");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testUnknownRootBlocksWithdrawalBeforeVerifierAndStateMutation() public {
        RevertingVerifier revertingVerifier = new RevertingVerifier();
        ShieldedPool poolWithRevertingVerifier = new ShieldedPool(address(revertingVerifier), address(this), emergencyGuardian, poseidon2);
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        poolWithRevertingVerifier.deposit{value: 1 ether}(_fieldCommitment("funding"));
        bytes32[] memory inputs = _withdrawalInputs(poolWithRevertingVerifier, nullifier, receiver, 1 ether);
        inputs[0] = keccak256("unknown-root");

        vm.expectRevert("unaccepted root");
        poolWithRevertingVerifier.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(poolWithRevertingVerifier.nullifiers(nullifier));
        assertEq(poolWithRevertingVerifier.accruedProtocolFees(), 0);
        assertEq(poolWithRevertingVerifier.totalWithdrawnAccounting(), 0);
    }

    function testVerifierRejectionBlocksWithdrawal() public {
        verifier.setShouldVerify(false);
        bytes32 nullifier = keccak256("withdraw-nullifier");
        address receiver = address(0xBEEF);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 1 ether);
        vm.expectRevert("invalid proof");
        pool.withdraw("", inputs, nullifier, payable(receiver), 1 ether);
        assertFalse(pool.nullifiers(nullifier));
    }

    function testVerifierRejectionBlocksWithdrawalChangeInsertion() public {
        verifier.setShouldVerify(false);
        bytes32 nullifier = keccak256("withdraw-nullifier");
        bytes32 changeCommitment = _fieldCommitment("withdraw-change");
        address receiver = address(0xBEEF);
        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));

        bytes32[] memory inputs = _withdrawalInputs(nullifier, receiver, 0.2 ether, changeCommitment);
        vm.expectRevert("invalid proof");
        pool.withdraw("", inputs, nullifier, payable(receiver), 0.2 ether);
        assertFalse(pool.nullifiers(nullifier));
        assertFalse(pool.commitments(changeCommitment));
    }

    function _privateTransferInputs(bytes32 nullifier, bytes32 newCommitment)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = _privateTransferInputs(pool, nullifier, newCommitment);
    }

    function _privateTransferInputs(ShieldedPool targetPool, bytes32 nullifier, bytes32 newCommitment)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = _baseInputs(targetPool, nullifier);
        inputs[2] = newCommitment;
        inputs[8] = LocalPoseidonMerkleFixtures.privateTransferSpentCommitment();
        inputs[9] = bytes32(uint256(1 ether));
    }

    function _withdrawalInputs(bytes32 nullifier, address destination, uint256 grossAmount)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = _withdrawalInputs(pool, nullifier, destination, grossAmount, bytes32(0));
    }

    function _withdrawalInputs(bytes32 nullifier, address destination, uint256 grossAmount, bytes32 changeCommitment)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = _withdrawalInputs(pool, nullifier, destination, grossAmount, changeCommitment);
    }

    function _withdrawalInputs(ShieldedPool targetPool, bytes32 nullifier, address destination, uint256 grossAmount)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = _withdrawalInputs(targetPool, nullifier, destination, grossAmount, bytes32(0));
    }

    function _withdrawalInputs(
        ShieldedPool targetPool,
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        bytes32 changeCommitment
    ) private view returns (bytes32[] memory inputs) {
        inputs = _baseInputs(targetPool, nullifier);
        inputs[2] = changeCommitment;
        inputs[3] = bytes32(uint256(uint160(destination)));
        inputs[4] = bytes32(grossAmount);
        inputs[5] = bytes32((grossAmount * targetPool.WITHDRAWAL_FEE_BPS()) / targetPool.BPS_DENOMINATOR());
    }

    function _fee(uint256 grossAmount) private view returns (uint256) {
        return (grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
    }

    function _withdrawalConservationInputs(
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount
    ) private view returns (bytes32[] memory inputs) {
        inputs = new bytes32[](10);
        inputs[0] = pool.currentRoot();
        inputs[1] = nullifier;
        inputs[3] = bytes32(uint256(uint160(destination)));
        inputs[4] = bytes32(grossAmount);
        inputs[5] = bytes32((grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR());
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        inputs[8] = spentCommitment;
        inputs[9] = bytes32(noteAmount);
    }

    function _baseInputs(bytes32 nullifier) private view returns (bytes32[] memory inputs) {
        inputs = _baseInputs(pool, nullifier);
    }

    function _baseInputs(ShieldedPool targetPool, bytes32 nullifier) private view returns (bytes32[] memory inputs) {
        inputs = new bytes32[](targetPool.PUBLIC_INPUTS_LENGTH());
        inputs[0] = targetPool.currentRoot();
        inputs[1] = nullifier;
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(targetPool))));
        inputs[8] = _fieldCommitment("funding");
        inputs[9] = bytes32(uint256(1 ether));
    }

    function _fieldCommitment(string memory label) private pure returns (bytes32) {
        return bytes32(uint256(uint160(uint256(keccak256(bytes(label))))));
    }

    function _fieldCommitment(uint256 value) private pure returns (bytes32) {
        return bytes32(value);
    }

    function _hasWithdrawalChangeLog(Vm.Log[] memory logs, bytes32 commitment, bytes32 nullifier)
        private
        pure
        returns (bool)
    {
        bytes32 signature = keccak256("WithdrawalChangeCommitmentInserted(bytes32,bytes32,uint256)");
        for (uint256 i; i < logs.length; i++) {
            if (
                logs[i].topics.length == 3 && logs[i].topics[0] == signature && logs[i].topics[1] == commitment
                    && logs[i].topics[2] == nullifier
            ) {
                return true;
            }
        }
        return false;
    }
}
