// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {NullarkPool} from "../src/NullarkPool.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract NullarkPoolHarness is NullarkPool {
    constructor(address verifier_, address feeController_, address poseidon2_) NullarkPool(verifier_, feeController_, poseidon2_)
    {}

    function clearCurrentRootHistorySlotForTest() external {
        rootHistory[rootHistoryIndex] = bytes32(0);
    }
}

contract NullarkPoolTest is Test {
    bytes32 private constant PRIVATE_TRANSFER_CONTEXT_SHAPE = keccak256("private_transfer_context_v1_1");
    bytes32 private constant WITHDRAW_CONTEXT_SHAPE = keccak256("withdraw_context_v1_1");
    bytes4 private constant PRIVATE_TRANSFER_SELECTOR =
        bytes4(keccak256("privateTransfer(bytes,bytes32[],bytes32,bytes32,bytes)"));
    bytes4 private constant WITHDRAW_SELECTOR = bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256)"));
    bytes4 private constant WITHDRAW_BOUNDED_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,uint256,uint256)"));
    bytes4 private constant WITHDRAW_CHANGE_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,bytes)"));
    bytes4 private constant WITHDRAW_CHANGE_BOUNDED_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,bytes,uint256,uint256)"));
    bytes4 private constant WITHDRAW_RELAYER_POLICY_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,(address,uint256,uint256,uint256))"));
    bytes4 private constant WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR =
        bytes4(keccak256("withdraw(bytes,bytes32[],bytes32,address,uint256,bytes,(address,uint256,uint256,uint256))"));

    event WithdrawalChangeCommitmentInserted(
        bytes32 indexed commitment, bytes32 indexed nullifier, uint256 grossAmount
    );
    event WithdrawalChangeNoteCreated(
        bytes32 indexed commitment,
        bytes32 indexed nullifier,
        uint256 indexed leafIndex,
        uint256 grossAmount,
        bytes encryptedNote,
        uint16 encryptionVersion
    );
    event WithdrawalExecuted(address indexed destination, uint256 grossAmount, uint256 netAmount, uint256 fee);
    event ExcessBalanceRecovered(address indexed destination, uint256 amount);
    event DepositsPaused(bool paused);
    event InternalSendsPaused(bool paused);
    event FeeSweepsPaused(bool paused);

    NullarkPoolHarness pool;
    MockVerifier verifier;

    struct WithdrawInputArgs {
        bytes32 root;
        bytes32 nullifier;
        bytes32 changeCommitment;
        address destination;
        uint256 grossAmount;
        bytes32 spentCommitment;
        uint256 noteAmount;
        bytes encryptedChangeNote;
        bytes4 selector;
        NullarkPool.RelayerPolicy relayerPolicy;
    }

    function setUp() public {
        verifier = new MockVerifier();
        verifier.setExpectedPublicInputsLength(12);
        address poseidon2 = LocalPoseidonMerkleFixtures.deployPoseidonT3();
        pool = new NullarkPoolHarness(address(verifier), address(this), poseidon2);
    }

    function testNullarkPoolCapacityAndInitialRoot() public view {
        assertEq(pool.MERKLE_TREE_DEPTH(), 20);
        assertEq(pool.MERKLE_TREE_CAPACITY(), 1_048_576);
        assertEq(pool.nextLeafIndex(), 0);
        assertTrue(pool.initialRoot() != bytes32(0));
        assertEq(pool.currentRoot(), pool.initialRoot());
        assertTrue(pool.isAcceptedRoot(pool.initialRoot()));
    }

    function testStageAContractIdentityPreservesProofBoundaryConstants() public view {
        assertEq(pool.PUBLIC_INPUTS_LENGTH(), 12);
        assertEq(pool.MERKLE_TREE_DEPTH(), 20);
        assertEq(pool.ROOT_HISTORY_SIZE(), 256);
    }

    function testSupportedDenominationApiUsesTieredValuesUpToOneEth() public view {
        uint256[] memory values = pool.supportedDenominations();
        uint256[] memory expectedValues = _expectedSupportedDenominationsWei();

        assertEq(pool.MIN_DENOMINATION(), 0.005 ether);
        assertEq(pool.MAX_DENOMINATION(), 1 ether);
        assertEq(pool.DENOMINATION_COUNT(), 10);
        assertEq(
            pool.CONFIGURATION_HASH(),
            keccak256("nullark.v1.1.megaeth-mainnet.fee33.min0.005.max1.denominations10")
        );
        assertEq(values.length, expectedValues.length);
        for (uint256 i; i < expectedValues.length; i++) {
            assertEq(values[i], expectedValues[i]);
        }
        assertTrue(pool.isSupportedDenomination(0.005 ether));
        assertTrue(pool.isSupportedDenomination(0.03 ether));
        assertTrue(pool.isSupportedDenomination(1 ether));
        assertFalse(pool.isSupportedDenomination(0.0001 ether));
        assertFalse(pool.isSupportedDenomination(0.00001 ether));
        assertFalse(pool.isSupportedDenomination(0.0009 ether));
        assertFalse(pool.isSupportedDenomination(0.04 ether));
    }

    function testDepositUsesConfiguredTreeDepth() public {
        bytes32 commitment = _fieldCommitment("nullark-testnet-commitment");

        pool.deposit{value: 0.01 ether}(commitment);

        assertEq(pool.nextLeafIndex(), 1);
        assertTrue(pool.commitments(commitment));
        assertEq(pool.commitmentAmounts(commitment), 0.01 ether);
        assertEq(pool.totalDepositedAccounting(), 0.01 ether);
        assertTrue(pool.isAcceptedRoot(pool.currentRoot()));
    }

    function testCurrentRootFastPathDoesNotDependOnHistorySlotScan() public {
        bytes32 commitment = _fieldCommitment("current-root-fast-path");
        pool.deposit{value: 0.01 ether}(commitment);
        bytes32 currentRoot = pool.currentRoot();

        pool.clearCurrentRootHistorySlotForTest();

        assertTrue(pool.isAcceptedRoot(currentRoot));
    }

    function testAcceptedRootLookupKeepsRecentRingAndExpiresOldRoots() public {
        bytes32 initialRoot = pool.initialRoot();
        bytes32[] memory recentRoots = new bytes32[](pool.ROOT_HISTORY_SIZE());

        for (uint256 i; i < pool.ROOT_HISTORY_SIZE(); i++) {
            pool.deposit{value: 0.005 ether}(_fieldCommitment(string.concat("recent-root-", vm.toString(i))));
            recentRoots[i] = pool.currentRoot();
        }

        assertFalse(pool.isAcceptedRoot(initialRoot));
        for (uint256 i; i < recentRoots.length; i++) {
            assertTrue(pool.isAcceptedRoot(recentRoots[i]));
        }
    }

    function testRejectsUnsupportedDepositDenomination() public {
        bytes32 commitment = _fieldCommitment("unsupported-denomination");

        vm.expectRevert("unsupported fixed denomination");
        pool.deposit{value: 0.037 ether}(commitment);
    }

    function testFullNotePublicExitAllowedForFixedDenomination() public {
        bytes32 commitment = _fieldCommitment("full-note-withdraw");
        address payable destination = payable(address(0xBEEF));

        pool.deposit{value: 0.01 ether}(commitment);
        uint256 nextLeafIndexBefore = pool.nextLeafIndex();
        bytes32 rootBefore = pool.currentRoot();
        uint256 destinationBefore = destination.balance;
        uint256 fee = (0.01 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        uint256 minNetAmount = 0.01 ether - fee;
        uint256 maxFeeAmount = fee;

        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: _fieldCommitment("full-note-nullifier"),
                changeCommitment: bytes32(0),
                destination: destination,
                grossAmount: 0.01 ether,
                spentCommitment: commitment,
                noteAmount: 0.01 ether,
                minNetAmount: minNetAmount,
                maxFeeAmount: maxFeeAmount
            }),
            _fieldCommitment("full-note-nullifier"),
            destination,
            0.01 ether,
            minNetAmount,
            maxFeeAmount
        );

        assertEq(destination.balance - destinationBefore, minNetAmount);
        assertEq(pool.nextLeafIndex(), nextLeafIndexBefore);
        assertEq(pool.currentRoot(), rootBefore);
        assertEq(pool.totalWithdrawnAccounting(), minNetAmount);
        assertEq(pool.accruedProtocolFees(), fee);
    }

    function testFeeControllerCanRecoverOnlyForcedExcessEth() public {
        bytes32 commitment = _fieldCommitment("forced-excess-note");
        address payable destination = payable(address(0xCAFE));

        pool.deposit{value: 0.01 ether}(commitment);
        vm.deal(address(pool), address(pool).balance + 0.001 ether);

        vm.expectRevert("recovery exceeds excess");
        pool.recoverExcessBalance(destination, 0.001 ether + 1);

        uint256 destinationBefore = destination.balance;
        vm.expectEmit(true, false, false, true, address(pool));
        emit ExcessBalanceRecovered(destination, 0.001 ether);
        pool.recoverExcessBalance(destination, 0.001 ether);

        assertEq(destination.balance - destinationBefore, 0.001 ether);
        assertEq(address(pool).balance, pool.totalDepositedAccounting());
    }

    function testFeeControllerPausePowersExcludeWithdrawalEmergencyPause() public {
        vm.expectEmit(false, false, false, true, address(pool));
        emit DepositsPaused(true);
        pool.pauseDeposits(true);
        assertTrue(pool.depositsPaused());

        vm.expectEmit(false, false, false, true, address(pool));
        emit InternalSendsPaused(true);
        pool.pauseInternalSends(true);
        assertTrue(pool.internalSendsPaused());

        vm.expectEmit(false, false, false, true, address(pool));
        emit FeeSweepsPaused(true);
        pool.pauseFeeSweeps(true);
        assertTrue(pool.feeSweepsPaused());

        (bool ok,) = address(pool).call(abi.encodeWithSignature("pauseWithdrawalsForEmergency(bool)", true));
        assertFalse(ok);
    }

    function testNonFeeControllerCannotUseOperationalPauseOrRecoveryPowers() public {
        address attacker = address(0xA11CE);
        address payable destination = payable(address(0xCAFE));

        vm.startPrank(attacker);
        vm.expectRevert("only fee controller");
        pool.pauseDeposits(true);
        vm.expectRevert("only fee controller");
        pool.pauseInternalSends(true);
        vm.expectRevert("only fee controller");
        pool.pauseFeeSweeps(true);
        vm.expectRevert("only fee controller");
        pool.recoverExcessBalance(destination, 1);
        vm.stopPrank();
    }

    function testBatchNullifierPreflightReportsSpentValuesWithoutMutation() public {
        bytes32 commitment = _fieldCommitment("batch-nullifier-preflight-note");
        bytes32 spentNullifier = _fieldCommitment("batch-spent-nullifier");
        bytes32 freshNullifier = _fieldCommitment("batch-fresh-nullifier");
        bytes32 newCommitment = _fieldCommitment("batch-new-commitment");

        pool.deposit{value: 0.01 ether}(commitment);

        bytes32[] memory beforeValues = new bytes32[](2);
        beforeValues[0] = spentNullifier;
        beforeValues[1] = freshNullifier;
        bool[] memory beforeSpent = pool.isSpentArray(beforeValues);
        assertEq(beforeSpent.length, 2);
        assertFalse(beforeSpent[0]);
        assertFalse(beforeSpent[1]);

        pool.privateTransfer(
            hex"1234",
            _privateTransferPublicInputs({
                root: pool.currentRoot(),
                nullifier: spentNullifier,
                newCommitment: newCommitment,
                spentCommitment: commitment,
                noteAmount: 0.01 ether,
                encryptedNote: _privateTransferEncryptedNote()
            }),
            spentNullifier,
            newCommitment,
            _privateTransferEncryptedNote()
        );

        bool[] memory afterSpent = pool.isSpentArray(beforeValues);
        assertEq(afterSpent.length, 2);
        assertTrue(afterSpent[0]);
        assertFalse(afterSpent[1]);
        assertFalse(pool.nullifiers(freshNullifier));
    }

    function testStageCAllowsPartialPublicExitWithOneChangeNote() public {
        bytes32 commitment = _fieldCommitment("partial-withdraw");
        bytes32 nullifier = _fieldCommitment("partial-nullifier");
        bytes32 changeCommitment = _fieldCommitment("partial-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        uint256 destinationBefore = destination.balance;
        uint256 fee = (0.005 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        uint256 minNetAmount = 0.005 ether - fee;
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, minNetAmount, fee
        );

        assertEq(destination.balance - destinationBefore, minNetAmount);
        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
        assertEq(pool.commitmentAmounts(changeCommitment), 0.005 ether);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), minNetAmount);
    }

    function testStageCPartialPublicExitEmitsBoundChangeEvents() public {
        bytes32 commitment = _fieldCommitment("partial-event-note");
        bytes32 nullifier = _fieldCommitment("partial-event-nullifier");
        bytes32 changeCommitment = _fieldCommitment("partial-event-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = (grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        uint256 netAmount = grossAmount - fee;

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: grossAmount,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: netAmount,
            maxFeeAmount: fee
        });

        vm.expectEmit(true, true, false, true, address(pool));
        emit WithdrawalChangeCommitmentInserted(changeCommitment, nullifier, grossAmount);
        vm.expectEmit(true, true, true, true, address(pool));
        emit WithdrawalChangeNoteCreated(changeCommitment, nullifier, 1, grossAmount, encryptedChangeNote, 1);
        vm.expectEmit(true, false, false, true, address(pool));
        emit WithdrawalExecuted(destination, grossAmount, netAmount, fee);

        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, netAmount, fee);
    }

    function testRejectsNoBoundsFullExitSelector() public {
        bytes32 commitment = _fieldCommitment("unbounded-full-exit-note");
        bytes32 nullifier = _fieldCommitment("unbounded-full-exit-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;

        pool.deposit{value: grossAmount}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: bytes32(0),
            destination: destination,
            grossAmount: grossAmount,
            spentCommitment: commitment,
            noteAmount: grossAmount,
            selector: WITHDRAW_SELECTOR,
            relayerPolicy: _defaultWithdrawPolicy(0, type(uint256).max)
        });

        vm.expectRevert("bounded withdrawal required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount);
    }

    function testRejectsNoBoundsPrivateChangeSelector() public {
        bytes32 commitment = _fieldCommitment("unbounded-partial-note");
        bytes32 nullifier = _fieldCommitment("unbounded-partial-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unbounded-partial-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: grossAmount,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_SELECTOR,
            relayerPolicy: _defaultWithdrawPolicy(0, type(uint256).max)
        });

        vm.expectRevert("bounded withdrawal required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedChangeNote);
    }

    function testStageCPartialThenChangeFullExitConservesValueAndDoesNotInflate() public {
        bytes32 commitment = _fieldCommitment("conservation-note");
        bytes32 firstNullifier = _fieldCommitment("conservation-first-nullifier");
        bytes32 changeCommitment = _fieldCommitment("conservation-change");
        bytes32 secondNullifier = _fieldCommitment("conservation-second-nullifier");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = (grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();

        pool.deposit{value: 0.01 ether}(commitment);
        uint256 poolBalanceAfterDeposit = address(pool).balance;
        uint256 destinationBefore = destination.balance;

        _withdrawPartialChange(commitment, firstNullifier, changeCommitment, destination, encryptedChangeNote);
        _withdrawFullChangeNote(changeCommitment, secondNullifier, destination);

        uint256 totalFees = fee * 2;
        uint256 totalNetWithdrawn = (grossAmount * 2) - totalFees;
        assertEq(destination.balance - destinationBefore, totalNetWithdrawn);
        assertEq(pool.accruedProtocolFees(), totalFees);
        assertEq(pool.totalWithdrawnAccounting(), totalNetWithdrawn);
        assertEq(address(pool).balance, poolBalanceAfterDeposit - totalNetWithdrawn);
        assertEq(address(pool).balance, pool.accruedProtocolFees());
        assertTrue(pool.nullifiers(firstNullifier));
        assertTrue(pool.nullifiers(secondNullifier));
    }

    function testStageCRejectsMissingEncryptedChangeNote() public {
        bytes32 commitment = _fieldCommitment("missing-change-note");
        bytes32 nullifier = _fieldCommitment("missing-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("missing-change-commitment");
        address payable destination = payable(address(0xBEEF));

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: "",
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("encrypted change note required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, "", 0, type(uint256).max);
    }

    function testStageCRejectsUnsupportedExitDenomination() public {
        bytes32 commitment = _fieldCommitment("unsupported-exit-note");
        bytes32 nullifier = _fieldCommitment("unsupported-exit-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unsupported-exit-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.001 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("unsupported exit denomination");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.001 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsUnsupportedPrivateChangeDenomination() public {
        bytes32 commitment = _fieldCommitment("unsupported-change-note");
        bytes32 nullifier = _fieldCommitment("unsupported-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unsupported-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.1 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.03 ether,
            spentCommitment: commitment,
            noteAmount: 0.1 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("unsupported change denomination");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.03 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCAllowsTieredPartialExitWithSupportedPrivateChange() public {
        bytes32 commitment = _fieldCommitment("supported-tiered-change-note");
        bytes32 nullifier = _fieldCommitment("supported-tiered-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("supported-tiered-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.05 ether}(commitment);
        uint256 fee = (0.02 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        uint256 minNetAmount = 0.02 ether - fee;
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.02 ether,
            spentCommitment: commitment,
            noteAmount: 0.05 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.02 ether, encryptedChangeNote, minNetAmount, fee
        );

        assertTrue(pool.commitments(changeCommitment));
        assertEq(pool.commitmentAmounts(changeCommitment), 0.03 ether);
    }

    function testStageCRejectsPartialWithoutChangeCommitment() public {
        bytes32 commitment = _fieldCommitment("partial-zero-change-note");
        bytes32 nullifier = _fieldCommitment("partial-zero-change-nullifier");
        address payable destination = payable(address(0xBEEF));

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: bytes32(0),
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: "",
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("fixed public exit requires full note");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, 0, type(uint256).max);
    }

    function testStageCRejectsFullExitWithNonzeroChangeCommitment() public {
        bytes32 commitment = _fieldCommitment("full-nonzero-change-note");
        bytes32 nullifier = _fieldCommitment("full-nonzero-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("full-nonzero-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("invalid change amount");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsWrongChangeEncryptedNoteHash() public {
        bytes32 commitment = _fieldCommitment("wrong-change-note-hash-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-note-hash-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-note-hash-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[11] = bytes32(uint256(publicInputs[11]) + 1);

        vm.expectRevert("invalid encrypted note hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsWrongChangeProofContextHash() public {
        bytes32 commitment = _fieldCommitment("wrong-change-context-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-context-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-context-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[10] = bytes32(uint256(publicInputs[10]) + 1);

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsWrongRelayerPolicyBindingForChange() public {
        bytes32 commitment = _fieldCommitment("wrong-change-policy-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-policy-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-policy-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 fee = (0.005 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        NullarkPool.RelayerPolicy memory boundPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0),
            minNetAmount: 0.005 ether - fee,
            maxFeeAmount: fee,
            deadlineOrZero: block.timestamp + 100
        });
        NullarkPool.RelayerPolicy memory submittedPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: fee, deadlineOrZero: block.timestamp + 100
        });

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR,
            relayerPolicy: boundPolicy
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, submittedPolicy
        );
    }

    function testStageCRejectsExpiredRelayerPolicyForChange() public {
        bytes32 commitment = _fieldCommitment("expired-change-policy-note");
        bytes32 nullifier = _fieldCommitment("expired-change-policy-nullifier");
        bytes32 changeCommitment = _fieldCommitment("expired-change-policy-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 1
        });

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR,
            relayerPolicy: relayerPolicy
        });

        vm.warp(2);
        vm.expectRevert("expired relayer policy");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, relayerPolicy);
    }

    function testStageCRejectsDuplicateChangeCommitment() public {
        bytes32 commitment = _fieldCommitment("duplicate-change-note");
        bytes32 nullifier = _fieldCommitment("duplicate-change-nullifier");
        bytes32 duplicateCommitment = _fieldCommitment("duplicate-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        pool.deposit{value: 0.005 ether}(duplicateCommitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: duplicateCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("commitment exists");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsDoubleSpendAfterPartialWithdrawal() public {
        bytes32 commitment = _fieldCommitment("double-spend-change-note");
        bytes32 nullifier = _fieldCommitment("double-spend-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("double-spend-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );

        vm.expectRevert("nullifier already spent");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsUnboundSecondOutputClaim() public {
        bytes32 commitment = _fieldCommitment("second-output-note");
        bytes32 nullifier = _fieldCommitment("second-output-nullifier");
        bytes32 changeCommitment = _fieldCommitment("second-output-change");
        bytes32 unboundSecondOutput = _fieldCommitment("second-output-unbound");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedChangeNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[11] = pool.computeWithdrawChangeEncryptedNoteHash(
            WITHDRAW_CHANGE_BOUNDED_SELECTOR, nullifier, unboundSecondOutput, 0.005 ether, encryptedChangeNote
        );

        vm.expectRevert("invalid encrypted note hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageBPrivateTransferBindsProofContextAndEncryptedNoteHash() public {
        bytes32 commitment = _fieldCommitment("stage-b-private-transfer-note");
        bytes32 nullifier = _fieldCommitment("stage-b-private-transfer-nullifier");
        bytes32 newCommitment = _fieldCommitment("stage-b-private-transfer-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });

        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(newCommitment));
    }

    function testStageBRejectsWrongProofContextHash() public {
        bytes32 commitment = _fieldCommitment("wrong-context-note");
        bytes32 nullifier = _fieldCommitment("wrong-context-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-context-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });
        publicInputs[10] = bytes32(uint256(publicInputs[10]) + 1);

        vm.expectRevert("invalid proof context hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsWrongEncryptedNoteHash() public {
        bytes32 commitment = _fieldCommitment("wrong-note-hash-note");
        bytes32 nullifier = _fieldCommitment("wrong-note-hash-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-note-hash-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });
        publicInputs[11] = bytes32(uint256(publicInputs[11]) + 1);

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsZeroAppendedHashes() public {
        bytes32 commitment = _fieldCommitment("zero-stage-b-note");
        bytes32 nullifier = _fieldCommitment("zero-stage-b-nullifier");
        bytes32 newCommitment = _fieldCommitment("zero-stage-b-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });
        publicInputs[10] = bytes32(0);
        publicInputs[11] = bytes32(0);

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsWrongEncryptedNotePayload() public {
        bytes32 commitment = _fieldCommitment("wrong-action-note");
        bytes32 nullifier = _fieldCommitment("wrong-action-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-action-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, hex"9999");
    }

    function testStageBRejectsWrongSelectorBinding() public {
        bytes32 commitment = _fieldCommitment("wrong-selector-note");
        bytes32 nullifier = _fieldCommitment("wrong-selector-nullifier");
        address payable destination = payable(address(0xBEEF));

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: bytes32(0),
            destination: destination,
            grossAmount: 0.01 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[10] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            bytes4(0xdeadbeef),
            destination,
            0.01 ether,
            (0.01 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR(),
            publicInputs[11],
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.01 ether, 0, type(uint256).max);
    }

    function testStageBRejectsWrongChainAndPoolBindings() public {
        bytes32 commitment = _fieldCommitment("wrong-chain-pool-note");
        bytes32 nullifier = _fieldCommitment("wrong-chain-pool-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-chain-pool-new");

        pool.deposit{value: 0.01 ether}(commitment);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            newCommitment: newCommitment,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            encryptedNote: encryptedNote
        });

        publicInputs[6] = bytes32(uint256(4326));
        vm.expectRevert("invalid public inputs");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);

        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(this))));
        vm.expectRevert("invalid public inputs");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsWrongRelayerPolicyBinding() public {
        bytes32 commitment = _fieldCommitment("wrong-policy-note");
        bytes32 nullifier = _fieldCommitment("wrong-policy-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 fee = (0.01 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        uint256 minNetAmount = 0.01 ether - fee;

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: bytes32(0),
            destination: destination,
            grossAmount: 0.01 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.01 ether, 0, fee);
    }

    function testStageBRejectsWrongDeadlineBinding() public {
        bytes32 commitment = _fieldCommitment("wrong-deadline-note");
        bytes32 nullifier = _fieldCommitment("wrong-deadline-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 fee = (0.01 ether * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        NullarkPool.RelayerPolicy memory boundPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0),
            minNetAmount: 0.01 ether - fee,
            maxFeeAmount: fee,
            deadlineOrZero: block.timestamp + 100
        });
        NullarkPool.RelayerPolicy memory submittedPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0),
            minNetAmount: 0.01 ether - fee,
            maxFeeAmount: fee,
            deadlineOrZero: block.timestamp + 101
        });

        pool.deposit{value: 0.01 ether}(commitment);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            changeCommitment: bytes32(0),
            destination: destination,
            grossAmount: 0.01 ether,
            spentCommitment: commitment,
            noteAmount: 0.01 ether,
            selector: WITHDRAW_RELAYER_POLICY_SELECTOR,
            relayerPolicy: boundPolicy
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.01 ether, submittedPolicy);
    }

    function testNullarkTreeAcceptsMoreThanPrototypeCapacityMarker() public view {
        uint256 prototypeDepth12Capacity = 4096;

        assertGt(pool.MERKLE_TREE_CAPACITY(), prototypeDepth12Capacity);
        assertEq(pool.MERKLE_TREE_CAPACITY(), 256 * prototypeDepth12Capacity);
    }

    function _fieldCommitment(string memory seed) private pure returns (bytes32) {
        uint256 value = uint256(keccak256(bytes(seed)))
            % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        if (value == 0) {
            value = 1;
        }
        return bytes32(value);
    }

    function _withdrawPartialChange(
        bytes32 spentCommitment,
        bytes32 nullifier,
        bytes32 changeCommitment,
        address payable destination,
        bytes memory encryptedChangeNote
    ) private {
        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                changeCommitment: changeCommitment,
                destination: destination,
                grossAmount: 0.005 ether,
                spentCommitment: spentCommitment,
                noteAmount: 0.01 ether,
                encryptedChangeNote: encryptedChangeNote,
                minNetAmount: 0,
                maxFeeAmount: type(uint256).max
            }),
            nullifier,
            destination,
            0.005 ether,
            encryptedChangeNote,
            0,
            type(uint256).max
        );
    }

    function _withdrawFullChangeNote(bytes32 spentCommitment, bytes32 nullifier, address payable destination) private {
        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                changeCommitment: bytes32(0),
                destination: destination,
                grossAmount: 0.005 ether,
                spentCommitment: spentCommitment,
                noteAmount: 0.005 ether,
                minNetAmount: 0,
                maxFeeAmount: type(uint256).max
            }),
            nullifier,
            destination,
            0.005 ether,
            0,
            type(uint256).max
        );
    }

    function _withdrawPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 changeCommitment,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                changeCommitment: changeCommitment,
                destination: destination,
                grossAmount: grossAmount,
                spentCommitment: spentCommitment,
                noteAmount: noteAmount,
                encryptedChangeNote: "",
                selector: WITHDRAW_BOUNDED_SELECTOR,
                relayerPolicy: _defaultWithdrawPolicy(minNetAmount, maxFeeAmount)
            })
        );
    }

    function _withdrawPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 changeCommitment,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount,
        bytes memory encryptedChangeNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                changeCommitment: changeCommitment,
                destination: destination,
                grossAmount: grossAmount,
                spentCommitment: spentCommitment,
                noteAmount: noteAmount,
                encryptedChangeNote: encryptedChangeNote,
                selector: changeCommitment == bytes32(0) ? WITHDRAW_BOUNDED_SELECTOR : WITHDRAW_CHANGE_BOUNDED_SELECTOR,
                relayerPolicy: _defaultWithdrawPolicy(minNetAmount, maxFeeAmount)
            })
        );
    }

    function _withdrawPublicInputsWithPolicy(
        bytes32 root,
        bytes32 nullifier,
        bytes32 changeCommitment,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount,
        bytes4 selector,
        NullarkPool.RelayerPolicy memory relayerPolicy
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                changeCommitment: changeCommitment,
                destination: destination,
                grossAmount: grossAmount,
                spentCommitment: spentCommitment,
                noteAmount: noteAmount,
                encryptedChangeNote: "",
                selector: selector,
                relayerPolicy: relayerPolicy
            })
        );
    }

    function _withdrawPublicInputsWithPolicy(
        bytes32 root,
        bytes32 nullifier,
        bytes32 changeCommitment,
        address destination,
        uint256 grossAmount,
        bytes32 spentCommitment,
        uint256 noteAmount,
        bytes memory encryptedChangeNote,
        bytes4 selector,
        NullarkPool.RelayerPolicy memory relayerPolicy
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                changeCommitment: changeCommitment,
                destination: destination,
                grossAmount: grossAmount,
                spentCommitment: spentCommitment,
                noteAmount: noteAmount,
                encryptedChangeNote: encryptedChangeNote,
                selector: selector,
                relayerPolicy: relayerPolicy
            })
        );
    }

    function _buildWithdrawPublicInputs(WithdrawInputArgs memory args)
        private
        view
        returns (bytes32[] memory publicInputs)
    {
        uint256 fee = (args.grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR();
        publicInputs = new bytes32[](12);
        publicInputs[0] = args.root;
        publicInputs[1] = args.nullifier;
        publicInputs[2] = args.changeCommitment;
        publicInputs[3] = bytes32(uint256(uint160(args.destination)));
        publicInputs[4] = bytes32(args.grossAmount);
        publicInputs[5] = bytes32(fee);
        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(pool))));
        publicInputs[8] = args.spentCommitment;
        publicInputs[9] = bytes32(args.noteAmount);
        publicInputs[11] = args.changeCommitment == bytes32(0)
            ? pool.computeWithdrawPublicExitEncryptedNoteHash(args.selector, args.nullifier, args.noteAmount)
            : pool.computeWithdrawChangeEncryptedNoteHash(
                args.selector,
                args.nullifier,
                args.changeCommitment,
                args.noteAmount - args.grossAmount,
                args.encryptedChangeNote
            );
        publicInputs[10] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            args.selector,
            args.destination,
            args.grossAmount,
            fee,
            publicInputs[11],
            args.relayerPolicy
        );
    }

    function _privateTransferPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes32 spentCommitment,
        uint256 noteAmount,
        bytes memory encryptedNote
    ) private view returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](12);
        publicInputs[0] = root;
        publicInputs[1] = nullifier;
        publicInputs[2] = newCommitment;
        publicInputs[3] = bytes32(0);
        publicInputs[4] = bytes32(0);
        publicInputs[5] = bytes32(0);
        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(pool))));
        publicInputs[8] = spentCommitment;
        publicInputs[9] = bytes32(noteAmount);
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 0
        });
        NullarkPool.EncryptedNoteV1 memory note = NullarkPool.EncryptedNoteV1({
            shape: PRIVATE_TRANSFER_CONTEXT_SHAPE,
            selector: PRIVATE_TRANSFER_SELECTOR,
            nullifier: nullifier,
            commitment: newCommitment,
            noteAmount: noteAmount,
            encryptedNote: encryptedNote
        });
        publicInputs[11] = pool.computeEncryptedNoteHash(note);
        publicInputs[10] = pool.computeProofContextHash(
            publicInputs,
            PRIVATE_TRANSFER_CONTEXT_SHAPE,
            PRIVATE_TRANSFER_SELECTOR,
            address(0),
            0,
            0,
            publicInputs[11],
            relayerPolicy
        );
    }

    function _defaultWithdrawPolicy(uint256 minNetAmount, uint256 maxFeeAmount)
        private
        pure
        returns (NullarkPool.RelayerPolicy memory)
    {
        return NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: minNetAmount, maxFeeAmount: maxFeeAmount, deadlineOrZero: 0
        });
    }

    function _privateTransferEncryptedNote() private pure returns (bytes memory) {
        return hex"12345678";
    }

    function _expectedSupportedDenominationsWei() private pure returns (uint256[] memory values) {
        values = new uint256[](10);
        values[0] = 5_000_000_000_000_000;
        values[1] = 10_000_000_000_000_000;
        values[2] = 20_000_000_000_000_000;
        values[3] = 30_000_000_000_000_000;
        values[4] = 50_000_000_000_000_000;
        values[5] = 100_000_000_000_000_000;
        values[6] = 200_000_000_000_000_000;
        values[7] = 300_000_000_000_000_000;
        values[8] = 500_000_000_000_000_000;
        values[9] = 1_000_000_000_000_000_000;
    }
}
