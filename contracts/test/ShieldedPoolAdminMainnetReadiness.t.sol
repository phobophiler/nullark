// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract ShieldedPoolAdminMainnetReadinessTest is Test {
    ShieldedPool private pool;
    MockVerifier private verifier;

    address private constant FEE_CONTROLLER = address(0xFEE1);
    address private constant EMERGENCY_GUARDIAN = address(0xEA61);
    address private constant OUTSIDER = address(0xBADC0DE);
    address payable private constant TREASURY = payable(address(0x7EA5));
    address payable private constant RECIPIENT = payable(address(0xBEEF));

    receive() external payable {}

    function setUp() public {
        verifier = new MockVerifier();
        pool = new ShieldedPool(
            address(verifier), FEE_CONTROLLER, EMERGENCY_GUARDIAN, LocalPoseidonMerkleFixtures.deployPoseidonT3()
        );
    }

    function testConstructorRejectsZeroAdminAndDependencyAddresses() public {
        address poseidon = LocalPoseidonMerkleFixtures.deployPoseidonT3();

        vm.expectRevert("invalid verifier");
        new ShieldedPool(address(0), FEE_CONTROLLER, EMERGENCY_GUARDIAN, poseidon);

        vm.expectRevert("invalid fee controller");
        new ShieldedPool(address(verifier), address(0), EMERGENCY_GUARDIAN, poseidon);

        vm.expectRevert("invalid emergency guardian");
        new ShieldedPool(address(verifier), FEE_CONTROLLER, address(0), poseidon);

        vm.expectRevert("invalid poseidon");
        new ShieldedPool(address(verifier), FEE_CONTROLLER, EMERGENCY_GUARDIAN, address(0));
    }

    function testOnlyFeeControllerCanSweepAndSweepCannotExceedUnsweptFees() public {
        _accrueFeeFromOneEthWithdrawal("funding", "withdraw-nullifier");
        uint256 accrued = pool.accruedProtocolFees();
        uint256 treasuryBefore = TREASURY.balance;

        vm.prank(OUTSIDER);
        vm.expectRevert("only fee controller");
        pool.sweepFees(TREASURY, accrued);

        vm.prank(EMERGENCY_GUARDIAN);
        vm.expectRevert("only fee controller");
        pool.sweepFees(TREASURY, accrued);

        vm.prank(FEE_CONTROLLER);
        pool.sweepFees(TREASURY, accrued - 1);

        assertEq(pool.feeSweptAccounting(), accrued - 1);
        assertEq(TREASURY.balance - treasuryBefore, accrued - 1);

        vm.prank(FEE_CONTROLLER);
        vm.expectRevert("sweep exceeds accrued fees");
        pool.sweepFees(TREASURY, 2);

        vm.prank(FEE_CONTROLLER);
        pool.sweepFees(TREASURY, 1);

        assertEq(pool.feeSweptAccounting(), accrued);
        assertEq(TREASURY.balance - treasuryBefore, accrued);
    }

    function testFeeSweepRejectsZeroDestinationZeroAmountAndPausedSweeps() public {
        _accrueFeeFromOneEthWithdrawal("funding", "withdraw-nullifier");
        uint256 accrued = pool.accruedProtocolFees();

        vm.prank(FEE_CONTROLLER);
        vm.expectRevert("invalid destination");
        pool.sweepFees(payable(address(0)), accrued);

        vm.prank(FEE_CONTROLLER);
        vm.expectRevert("sweep amount required");
        pool.sweepFees(TREASURY, 0);

        vm.prank(EMERGENCY_GUARDIAN);
        vm.expectRevert("only fee controller");
        pool.pauseFeeSweeps(true);

        vm.prank(FEE_CONTROLLER);
        pool.pauseFeeSweeps(true);

        vm.prank(FEE_CONTROLLER);
        vm.expectRevert("fee sweeps paused");
        pool.sweepFees(TREASURY, accrued);

        vm.prank(FEE_CONTROLLER);
        pool.pauseFeeSweeps(false);

        vm.prank(FEE_CONTROLLER);
        pool.sweepFees(TREASURY, accrued);

        assertEq(pool.feeSweptAccounting(), accrued);
    }

    function testEmergencyGuardianCannotUseFeeControllerPauseAuthority() public {
        vm.prank(EMERGENCY_GUARDIAN);
        vm.expectRevert("only fee controller");
        pool.pauseDeposits(true);

        vm.prank(EMERGENCY_GUARDIAN);
        vm.expectRevert("only fee controller");
        pool.pauseInternalSends(true);

        vm.prank(FEE_CONTROLLER);
        vm.expectRevert("only emergency guardian");
        pool.pauseWithdrawalsForEmergency(true);

        vm.prank(EMERGENCY_GUARDIAN);
        pool.pauseWithdrawalsForEmergency(true);

        assertTrue(pool.withdrawalsEmergencyPaused());
        assertFalse(pool.depositsPaused());
        assertFalse(pool.internalSendsPaused());
    }

    function testEmergencyWithdrawalPauseBlocksAndUnblocksWithdrawalPath() public {
        bytes32 spentCommitment = _fieldCommitment("paused-withdrawal-funding");
        bytes32 nullifier = keccak256("paused-withdrawal-nullifier");
        pool.deposit{value: 1 ether}(spentCommitment);

        vm.prank(EMERGENCY_GUARDIAN);
        pool.pauseWithdrawalsForEmergency(true);

        bytes32[] memory withdrawalInputs = _withdrawalInputs(nullifier, RECIPIENT, 1 ether, spentCommitment, 1 ether);
        vm.expectRevert("withdrawals emergency paused");
        pool.withdraw("", withdrawalInputs, nullifier, RECIPIENT, 1 ether);

        assertFalse(pool.nullifiers(nullifier));

        vm.prank(EMERGENCY_GUARDIAN);
        pool.pauseWithdrawalsForEmergency(false);

        pool.withdraw("", _withdrawalInputs(nullifier, RECIPIENT, 1 ether, spentCommitment, 1 ether), nullifier, RECIPIENT, 1 ether);

        assertTrue(pool.nullifiers(nullifier));
    }

    function testFeeControllerPauseAuthorityCoversDepositsAndInternalSendsOnly() public {
        bytes32 funding = _fieldCommitment("funding");

        vm.prank(FEE_CONTROLLER);
        pool.pauseDeposits(true);

        vm.expectRevert("deposits paused");
        pool.deposit{value: 1 ether}(funding);

        vm.prank(FEE_CONTROLLER);
        pool.pauseDeposits(false);

        pool.deposit{value: 1 ether}(funding);

        vm.prank(FEE_CONTROLLER);
        pool.pauseInternalSends(true);

        bytes32 nullifier = keccak256("send-nullifier");
        bytes32 newCommitment = _fieldCommitment("new-commitment");
        bytes32[] memory pausedInputs = _privateTransferInputs(nullifier, newCommitment, funding, 1 ether);
        vm.expectRevert("internal sends paused");
        pool.privateTransfer("", pausedInputs, nullifier, newCommitment);

        vm.prank(FEE_CONTROLLER);
        pool.pauseInternalSends(false);

        pool.privateTransfer(
            "", _privateTransferInputs(nullifier, newCommitment, funding, 1 ether), nullifier, newCommitment
        );

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(newCommitment));
    }

    function testFeeSolvencyAfterSweepKeepsPrincipalAccountingBounded() public {
        bytes32 funding = _fieldCommitment("funding");
        bytes32 remainingPrincipal = _fieldCommitment("remaining-principal");
        pool.deposit{value: 1 ether}(funding);
        pool.deposit{value: 1 ether}(remainingPrincipal);

        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("first-withdraw"), RECIPIENT, 1 ether, funding, 1 ether),
            keccak256("first-withdraw"),
            RECIPIENT,
            1 ether
        );

        uint256 accrued = pool.accruedProtocolFees();
        uint256 balanceBeforeSweep = address(pool).balance;
        vm.prank(FEE_CONTROLLER);
        pool.sweepFees(TREASURY, accrued);

        assertEq(address(pool).balance, balanceBeforeSweep - accrued);
        assertEq(pool.feeSweptAccounting(), accrued);
        assertEq(address(pool).balance, pool.totalDepositedAccounting() - pool.totalWithdrawnAccounting() - accrued);

        pool.withdraw(
            "",
            _withdrawalInputs(keccak256("second-withdraw"), RECIPIENT, 1 ether, remainingPrincipal, 1 ether),
            keccak256("second-withdraw"),
            RECIPIENT,
            1 ether
        );

        assertEq(pool.accruedProtocolFees() - pool.feeSweptAccounting(), accrued);
        assertEq(address(pool).balance, accrued);
    }

    function _accrueFeeFromOneEthWithdrawal(string memory commitmentLabel, string memory nullifierLabel) private {
        bytes32 spentCommitment = _fieldCommitment(commitmentLabel);
        bytes32 nullifier = keccak256(bytes(nullifierLabel));

        pool.deposit{value: 1 ether}(spentCommitment);
        pool.withdraw(
            "",
            _withdrawalInputs(nullifier, RECIPIENT, 1 ether, spentCommitment, 1 ether),
            nullifier,
            RECIPIENT,
            1 ether
        );

        assertEq(pool.accruedProtocolFees(), (1 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR());
    }

    function _privateTransferInputs(
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes32 spentCommitment,
        uint256 noteAmount
    ) private view returns (bytes32[] memory inputs) {
        inputs = new bytes32[](pool.PUBLIC_INPUTS_LENGTH());
        inputs[0] = pool.currentRoot();
        inputs[1] = nullifier;
        inputs[2] = newCommitment;
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        inputs[8] = spentCommitment;
        inputs[9] = bytes32(noteAmount);
    }

    function _withdrawalInputs(
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount
    ) private view returns (bytes32[] memory inputs) {
        inputs = new bytes32[](pool.PUBLIC_INPUTS_LENGTH());
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

    function _fieldCommitment(string memory label) private pure returns (bytes32) {
        return bytes32(uint256(uint160(uint256(keccak256(bytes(label))))));
    }
}
