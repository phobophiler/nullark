// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {NullarkPool} from "../../src/v1_2/NullarkPool.sol";
import {MockVerifier} from "../../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "../generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract NullarkPoolHarness is NullarkPool {
    constructor(address verifier_, address feeController_, address poseidon2_)
        NullarkPool(verifier_, feeController_, poseidon2_)
    {}

    function clearCurrentRootHistorySlotForTest() external {
        rootHistory[rootHistoryIndex] = bytes32(0);
    }
}

contract NullarkPoolTest is Test {
    bytes32 private constant PRIVATE_TRANSFER_CONTEXT_SHAPE = keccak256("private_transfer_context_v1_2_fee_governance");
    bytes32 private constant WITHDRAW_CONTEXT_SHAPE = keccak256("withdraw_context_v1_2_fee_governance");
    bytes32 private constant ENCRYPTED_OUTPUT_NOTE_HASH_DOMAIN_V2 = keccak256("nullark.encrypted-output-note.v2");
    uint16 private constant ENCRYPTED_OUTPUT_NOTE_VERSION_V2 = 2;
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes32 private constant OBSOLETE_V1_1_PRIVATE_TRANSFER_CONTEXT_SHAPE = keccak256("private_transfer_context_v1_1");
    bytes32 private constant OBSOLETE_V1_1_WITHDRAW_CONTEXT_SHAPE = keccak256("withdraw_context_v1_1");
    bytes4 private constant DEPOSIT_PROOF_SELECTOR = bytes4(keccak256("deposit(bytes,bytes32[],bytes)"));
    bytes4 private constant PRIVATE_TRANSFER_NO_NOTE_SELECTOR =
        bytes4(keccak256("privateTransfer(bytes,bytes32[],bytes32,bytes32)"));
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

    event WithdrawalOutputCommitmentInserted(
        bytes32 indexed commitment, bytes32 indexed nullifier, uint256 grossAmount
    );
    event WithdrawalOutputNoteCreated(
        bytes32 indexed commitment,
        bytes32 indexed nullifier,
        uint256 indexed leafIndex,
        uint256 grossAmount,
        bytes encryptedNote,
        uint16 encryptionVersion
    );
    event WithdrawalExecuted(address indexed destination, uint256 grossAmount, uint256 netAmount, uint256 fee);
    event FeeBpsDecreased(uint16 indexed oldFeeBps, uint16 indexed newFeeBps);
    event FeeBpsIncreaseScheduled(uint16 indexed oldFeeBps, uint16 indexed newFeeBps, uint64 activationTime);
    event FeeBpsIncreaseExecuted(uint16 indexed oldFeeBps, uint16 indexed newFeeBps);
    event FeeBpsIncreaseCancelled(uint16 indexed pendingFeeBps, uint64 activationTime);

    NullarkPoolHarness pool;
    MockVerifier verifier;

    struct WithdrawInputArgs {
        bytes32 root;
        bytes32 nullifier;
        bytes32 outputCommitment;
        address destination;
        uint256 grossAmount;
        bytes encryptedOutputNote;
        bytes4 selector;
        NullarkPool.RelayerPolicy relayerPolicy;
    }

    function setUp() public {
        verifier = new MockVerifier();
        verifier.setExpectedPublicInputsLength(10);
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
        assertEq(pool.PUBLIC_INPUTS_LENGTH(), 10);
        assertEq(pool.MERKLE_TREE_DEPTH(), 20);
        assertEq(pool.ROOT_HISTORY_SIZE(), 256);
    }

    function testV12FeeGovernanceInitializesBoundedFeeState() public view {
        assertEq(pool.INITIAL_FEE_BPS(), 33);
        assertEq(pool.WITHDRAWAL_FEE_BPS(), 33);
        assertEq(pool.feeBps(), 33);
        assertEq(pool.MAX_FEE_BPS(), 100);
        assertEq(pool.FEE_INCREASE_DELAY(), 259_200);
        assertEq(pool.pendingFeeBps(), 0);
        assertEq(pool.pendingFeeActivationTime(), 0);
    }

    function testOnlyFeeControllerCanChangeOrCancelFeeBps() public {
        address attacker = address(0xA11CE);

        vm.startPrank(attacker);
        vm.expectRevert("only fee controller");
        pool.setFeeBps(20);
        vm.expectRevert("only fee controller");
        pool.cancelPendingFeeBps();
        vm.stopPrank();
    }

    function testFeeControllerCannotExceedMaxFeeBps() public {
        vm.expectRevert("fee exceeds max");
        pool.setFeeBps(101);
    }

    function testFeeControllerDecreaseExecutesImmediatelyAndClearsPendingIncrease() public {
        pool.setFeeBps(50);
        assertEq(pool.pendingFeeBps(), 50);

        vm.expectEmit(true, true, false, true, address(pool));
        emit FeeBpsDecreased(33, 20);
        pool.setFeeBps(20);

        assertEq(pool.feeBps(), 20);
        assertEq(pool.pendingFeeBps(), 0);
        assertEq(pool.pendingFeeActivationTime(), 0);
    }

    function testFeeIncreaseSchedulesExecutesAfterDelayAndCanBePermissionless() public {
        uint64 activationTime = uint64(block.timestamp + pool.FEE_INCREASE_DELAY());

        vm.expectEmit(true, true, false, true, address(pool));
        emit FeeBpsIncreaseScheduled(33, 50, activationTime);
        pool.setFeeBps(50);

        assertEq(pool.feeBps(), 33);
        assertEq(pool.pendingFeeBps(), 50);
        assertEq(pool.pendingFeeActivationTime(), activationTime);

        vm.expectRevert("fee timelock active");
        pool.executePendingFeeBps();

        vm.warp(activationTime);
        vm.prank(address(0xB0B));
        vm.expectEmit(true, true, false, true, address(pool));
        emit FeeBpsIncreaseExecuted(33, 50);
        pool.executePendingFeeBps();

        assertEq(pool.feeBps(), 50);
        assertEq(pool.pendingFeeBps(), 0);
        assertEq(pool.pendingFeeActivationTime(), 0);
    }

    function testFeeControllerCanCancelPendingFeeIncrease() public {
        pool.setFeeBps(50);
        uint64 activationTime = pool.pendingFeeActivationTime();

        vm.expectEmit(true, false, false, true, address(pool));
        emit FeeBpsIncreaseCancelled(50, activationTime);
        pool.cancelPendingFeeBps();

        assertEq(pool.feeBps(), 33);
        assertEq(pool.pendingFeeBps(), 0);
        assertEq(pool.pendingFeeActivationTime(), 0);
    }

    function testSupportedDenominationApiUsesTieredValuesUpToOneEth() public view {
        uint256[] memory values = pool.supportedDenominations();
        uint256[] memory expectedValues = _expectedSupportedDenominationsWei();

        assertEq(pool.MIN_DENOMINATION(), 0.005 ether);
        assertEq(pool.MAX_DENOMINATION(), 1 ether);
        assertEq(pool.DENOMINATION_COUNT(), 10);
        assertEq(
            pool.CONFIGURATION_HASH(),
            keccak256(
                "nullark.v1.2.megaeth-mainnet.governed-fee.initial33.max100.delay259200.min0.005.max1.denominations10"
            )
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

        _depositWithProof(commitment, 0.01 ether);

        assertEq(pool.nextLeafIndex(), 1);
        assertTrue(pool.commitments(commitment));
        assertEq(pool.totalDepositedAccounting(), 0.01 ether);
        assertTrue(pool.isAcceptedRoot(pool.currentRoot()));
    }

    function testLegacyDirectDepositEntrypointsRequireProofBoundary() public {
        bytes32 commitment = _fieldCommitment("legacy-direct-deposit");

        vm.expectRevert("deposit proof required");
        pool.deposit{value: 0.01 ether}(commitment);

        vm.expectRevert("deposit proof required");
        pool.deposit{value: 0.01 ether}(commitment, hex"abcd");
    }

    function testProofDepositRequiresSixPublicInputs() public {
        bytes32 commitment = _fieldCommitment("deposit-proof-input-length");
        bytes memory encryptedNote = _depositEncryptedNote(commitment);
        bytes32[] memory publicInputs = new bytes32[](5);
        verifier.setExpectedPublicInputsLength(6);

        vm.expectRevert("invalid deposit public inputs");
        pool.deposit{value: 0.01 ether}(hex"1234", publicInputs, encryptedNote);
    }

    function testProofDepositBindsAmountChainPoolAndEncryptedNote() public {
        bytes32 commitment = _fieldCommitment("deposit-proof-bindings");
        bytes memory encryptedNote = _depositEncryptedNote(commitment);

        bytes32[] memory wrongAmountInputs = _depositPublicInputs(commitment, 0.02 ether, encryptedNote);
        verifier.setExpectedPublicInputsLength(6);
        vm.expectRevert("invalid deposit amount");
        pool.deposit{value: 0.01 ether}(hex"1234", wrongAmountInputs, encryptedNote);

        bytes32[] memory wrongChainInputs = _depositPublicInputs(commitment, 0.01 ether, encryptedNote);
        wrongChainInputs[2] = bytes32(uint256(block.chainid + 1));
        vm.expectRevert("invalid deposit public inputs");
        pool.deposit{value: 0.01 ether}(hex"1234", wrongChainInputs, encryptedNote);

        bytes32[] memory wrongPoolInputs = _depositPublicInputs(commitment, 0.01 ether, encryptedNote);
        wrongPoolInputs[3] = bytes32(uint256(uint160(address(0xBEEF))));
        vm.expectRevert("invalid deposit public inputs");
        pool.deposit{value: 0.01 ether}(hex"1234", wrongPoolInputs, encryptedNote);

        bytes32[] memory wrongNoteHashInputs = _depositPublicInputs(commitment, 0.01 ether, encryptedNote);
        wrongNoteHashInputs[5] = bytes32(uint256(wrongNoteHashInputs[5]) + 1);
        vm.expectRevert("invalid encrypted deposit note hash");
        pool.deposit{value: 0.01 ether}(hex"1234", wrongNoteHashInputs, encryptedNote);

        bytes32[] memory wrongContextHashInputs = _depositPublicInputs(commitment, 0.01 ether, encryptedNote);
        wrongContextHashInputs[4] = bytes32(uint256(wrongContextHashInputs[4]) + 1);
        vm.expectRevert("invalid deposit context hash");
        pool.deposit{value: 0.01 ether}(hex"1234", wrongContextHashInputs, encryptedNote);
    }

    function testProofDepositRequiresEncryptedNoteAndVerifierApproval() public {
        bytes32 commitment = _fieldCommitment("deposit-proof-note-and-verifier");
        bytes32[] memory emptyNotePublicInputs = _depositPublicInputs(commitment, 0.01 ether, "");

        verifier.setExpectedPublicInputsLength(6);
        vm.expectRevert("encrypted deposit note required");
        pool.deposit{value: 0.01 ether}(hex"1234", emptyNotePublicInputs, "");

        bytes memory encryptedNote = _depositEncryptedNote(commitment);
        bytes32[] memory publicInputs = _depositPublicInputs(commitment, 0.01 ether, encryptedNote);
        verifier.setShouldVerify(false);
        vm.expectRevert("invalid proof");
        pool.deposit{value: 0.01 ether}(hex"1234", publicInputs, encryptedNote);
    }

    function testCurrentRootFastPathDoesNotDependOnHistorySlotScan() public {
        bytes32 commitment = _fieldCommitment("current-root-fast-path");
        _depositWithProof(commitment, 0.01 ether);
        bytes32 currentRoot = pool.currentRoot();

        pool.clearCurrentRootHistorySlotForTest();

        assertTrue(pool.isAcceptedRoot(currentRoot));
    }

    function testAcceptedRootLookupKeepsRecentRingAndExpiresOldRoots() public {
        bytes32 initialRoot = pool.initialRoot();
        bytes32[] memory recentRoots = new bytes32[](pool.ROOT_HISTORY_SIZE());

        for (uint256 i; i < pool.ROOT_HISTORY_SIZE(); i++) {
            _depositWithProof(_fieldCommitment(string.concat("recent-root-", vm.toString(i))), 0.005 ether);
            recentRoots[i] = pool.currentRoot();
        }

        assertFalse(pool.isAcceptedRoot(initialRoot));
        for (uint256 i; i < recentRoots.length; i++) {
            assertTrue(pool.isAcceptedRoot(recentRoots[i]));
        }
    }

    function testRejectsUnsupportedDepositDenomination() public {
        bytes32 commitment = _fieldCommitment("unsupported-denomination");
        bytes memory encryptedNote = _depositEncryptedNote(commitment);
        bytes32[] memory publicInputs = _depositPublicInputs(commitment, 0.037 ether, encryptedNote);

        verifier.setExpectedPublicInputsLength(6);
        vm.expectRevert("unsupported fixed denomination");
        pool.deposit{value: 0.037 ether}(hex"1234", publicInputs, encryptedNote);
    }

    function testFullNotePublicExitRequiresOutputCommitmentAndEncryptedOutputNote() public {
        bytes32 commitment = _fieldCommitment("full-note-withdraw");
        bytes32 outputCommitment = _fieldCommitment("full-note-dummy-output");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedOutputNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        uint256 nextLeafIndexBefore = pool.nextLeafIndex();
        uint256 destinationBefore = destination.balance;
        uint256 fee = _expectedFee(0.01 ether);
        uint256 minNetAmount = 0.01 ether - fee;
        uint256 maxFeeAmount = fee;

        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: _fieldCommitment("full-note-nullifier"),
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: 0.01 ether,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: minNetAmount,
                maxFeeAmount: maxFeeAmount
            }),
            _fieldCommitment("full-note-nullifier"),
            destination,
            0.01 ether,
            encryptedOutputNote,
            minNetAmount,
            maxFeeAmount
        );

        assertEq(destination.balance - destinationBefore, minNetAmount);
        assertEq(pool.nextLeafIndex(), nextLeafIndexBefore + 1);
        assertTrue(pool.commitments(outputCommitment));
        assertEq(pool.totalWithdrawnAccounting(), minNetAmount);
        assertEq(pool.accruedProtocolFees(), fee);
    }

    function testV12RejectsStaleFeePublicInputAfterFeeDecrease() public {
        bytes32 commitment = _fieldCommitment("stale-fee-note");
        bytes32 nullifier = _fieldCommitment("stale-fee-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;
        uint256 staleFee = _expectedFee(grossAmount);
        uint256 staleMinNetAmount = grossAmount - staleFee;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, grossAmount);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: staleMinNetAmount,
            maxFeeAmount: staleFee
        });

        pool.setFeeBps(0);

        vm.expectRevert("invalid public inputs");
        pool.withdraw(
            hex"1234",
            publicInputs,
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            staleMinNetAmount,
            staleFee
        );
    }

    function testV12RejectsStaleFeePublicInputAfterExecutedFeeIncrease() public {
        bytes32 commitment = _fieldCommitment("stale-fee-increase-note");
        bytes32 nullifier = _fieldCommitment("stale-fee-increase-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;
        uint256 staleFee = _expectedFee(grossAmount);
        uint256 staleMinNetAmount = grossAmount - staleFee;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, grossAmount);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: staleMinNetAmount,
            maxFeeAmount: staleFee
        });

        pool.setFeeBps(50);
        vm.warp(pool.pendingFeeActivationTime());
        pool.executePendingFeeBps();

        vm.expectRevert("invalid public inputs");
        pool.withdraw(
            hex"1234",
            publicInputs,
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            staleMinNetAmount,
            staleFee
        );
    }

    function testV12RejectsPendingFeePublicInputBeforeActivation() public {
        bytes32 commitment = _fieldCommitment("pending-fee-note");
        bytes32 nullifier = _fieldCommitment("pending-fee-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, grossAmount);
        pool.setFeeBps(50);
        uint256 pendingFee = (grossAmount * uint256(pool.pendingFeeBps())) / pool.BPS_DENOMINATOR();
        uint256 pendingMinNetAmount = grossAmount - pendingFee;
        NullarkPool.RelayerPolicy memory pendingPolicy = _defaultWithdrawPolicy(pendingMinNetAmount, pendingFee);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: pendingMinNetAmount,
            maxFeeAmount: pendingFee
        });
        publicInputs[5] = bytes32(pendingFee);
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            destination,
            grossAmount,
            pendingFee,
            publicInputs[9],
            pendingPolicy
        );

        vm.expectRevert("invalid public inputs");
        pool.withdraw(
            hex"1234",
            publicInputs,
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            pendingMinNetAmount,
            pendingFee
        );
    }

    function testV12AllowsZeroFeeWithdrawalAfterFeeDecrease() public {
        bytes32 commitment = _fieldCommitment("zero-fee-note");
        bytes32 nullifier = _fieldCommitment("zero-fee-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        pool.setFeeBps(0);
        _depositWithProof(commitment, grossAmount);
        uint256 destinationBefore = destination.balance;

        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: grossAmount,
                maxFeeAmount: 0
            }),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            grossAmount,
            0
        );

        assertEq(destination.balance - destinationBefore, grossAmount);
        assertEq(pool.accruedProtocolFees(), 0);
        assertEq(pool.totalWithdrawnAccounting(), grossAmount);
    }

    function testV12AllowsMaxFeeWithdrawalAtOneHundredBps() public {
        bytes32 commitment = _fieldCommitment("max-fee-note");
        bytes32 nullifier = _fieldCommitment("max-fee-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;

        pool.setFeeBps(100);
        vm.warp(pool.pendingFeeActivationTime());
        pool.executePendingFeeBps();
        _depositWithProof(commitment, grossAmount);
        uint256 fee = _expectedFee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        uint256 destinationBefore = destination.balance;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: netAmount,
                maxFeeAmount: fee
            }),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            netAmount,
            fee
        );

        assertEq(fee, 0.0001 ether);
        assertEq(destination.balance - destinationBefore, netAmount);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), netAmount);
    }

    function testV12SetFeeBpsSameCurrentValueClearsPendingIncrease() public {
        pool.setFeeBps(50);
        assertEq(pool.feeBps(), 33);
        assertEq(pool.pendingFeeBps(), 50);
        assertGt(pool.pendingFeeActivationTime(), 0);

        pool.setFeeBps(33);

        assertEq(pool.feeBps(), 33);
        assertEq(pool.pendingFeeBps(), 0);
        assertEq(pool.pendingFeeActivationTime(), 0);
        vm.expectRevert("no pending fee");
        pool.executePendingFeeBps();
    }

    function testV12EnforcesUserMaxFeeAndMinNetBounds() public {
        bytes32 commitment = _fieldCommitment("user-bounds-note");
        bytes32 nullifier = _fieldCommitment("user-bounds-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;
        uint256 fee = _expectedFee(grossAmount);
        uint256 netAmount = grossAmount - fee;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, grossAmount);
        bytes32[] memory maxFeeBoundInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: 0,
            maxFeeAmount: fee - 1
        });

        vm.expectRevert("fee exceeds user bound");
        pool.withdraw(
            hex"1234", maxFeeBoundInputs, nullifier, destination, grossAmount, encryptedOutputNote, 0, fee - 1
        );

        bytes32[] memory minNetBoundInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: netAmount + 1,
            maxFeeAmount: fee
        });

        vm.expectRevert("net amount below user minimum");
        pool.withdraw(
            hex"1234", minNetBoundInputs, nullifier, destination, grossAmount, encryptedOutputNote, netAmount + 1, fee
        );
    }

    function testV12FeeSweepCannotTouchOutstandingPrincipal() public {
        bytes32 commitment = _fieldCommitment("fee-sweep-principal-note");
        bytes32 firstNullifier = _fieldCommitment("fee-sweep-principal-nullifier");
        bytes32 changeCommitment = _fieldCommitment("fee-sweep-principal-change");
        bytes32 secondNullifier = _fieldCommitment("fee-sweep-principal-second-nullifier");
        address payable destination = payable(address(0xBEEF));
        address payable feeDestination = payable(address(0xFEE));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);

        _depositWithProof(commitment, 0.01 ether);
        _withdrawWithOutputNote(firstNullifier, changeCommitment, destination, encryptedChangeNote);

        uint256 feeDestinationBefore = feeDestination.balance;
        pool.sweepFees(feeDestination, fee);

        assertEq(feeDestination.balance - feeDestinationBefore, fee);
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.feeSweptAccounting(), fee);
        assertEq(address(pool).balance, grossAmount);

        _withdrawWithDummyOutputNote(secondNullifier, destination);

        assertEq(pool.accruedProtocolFees(), fee * 2);
        assertEq(pool.feeSweptAccounting(), fee);
        assertEq(address(pool).balance, fee);
        assertTrue(pool.nullifiers(firstNullifier));
        assertTrue(pool.nullifiers(secondNullifier));
    }

    function testV12FeeSweepRequiresFeeControllerAndValidBounds() public {
        bytes32 commitment = _fieldCommitment("fee-sweep-guard-note");
        bytes32 nullifier = _fieldCommitment("fee-sweep-guard-nullifier");
        address payable destination = payable(address(0xBEEF));
        address payable feeDestination = payable(address(0xFEE));
        uint256 grossAmount = 0.01 ether;
        uint256 fee = _expectedFee(grossAmount);
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, grossAmount);
        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: 0,
                maxFeeAmount: type(uint256).max
            }),
            nullifier,
            destination,
            grossAmount,
            encryptedOutputNote,
            0,
            type(uint256).max
        );

        vm.prank(address(0xA11CE));
        vm.expectRevert("only fee controller");
        pool.sweepFees(feeDestination, fee);

        vm.expectRevert("invalid destination");
        pool.sweepFees(payable(address(0)), fee);

        vm.expectRevert("sweep amount required");
        pool.sweepFees(feeDestination, 0);

        vm.expectRevert("sweep exceeds accrued fees");
        pool.sweepFees(feeDestination, fee + 1);

        pool.sweepFees(feeDestination, fee);

        vm.expectRevert("sweep exceeds accrued fees");
        pool.sweepFees(feeDestination, 1);
    }

    function testV12DoesNotExposePauseOrExcessRecoveryPowers() public {
        _assertSelectorUnavailable("recoverExcessBalance(address,uint256)", abi.encode(address(0xCAFE), uint256(1)));
        _assertSelectorUnavailable("pauseDeposits(bool)", abi.encode(true));
        _assertSelectorUnavailable("pauseInternalSends(bool)", abi.encode(true));
        _assertSelectorUnavailable("pauseFeeSweeps(bool)", abi.encode(true));
        _assertSelectorUnavailable("pauseWithdrawalsForEmergency(bool)", abi.encode(true));
    }

    function testBatchNullifierPreflightReportsSpentValuesWithoutMutation() public {
        bytes32 commitment = _fieldCommitment("batch-nullifier-preflight-note");
        bytes32 spentNullifier = _fieldCommitment("batch-spent-nullifier");
        bytes32 freshNullifier = _fieldCommitment("batch-fresh-nullifier");
        bytes32 newCommitment = _fieldCommitment("batch-new-commitment");

        _depositWithProof(commitment, 0.01 ether);

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

    function testStageCAllowsPartialPublicExitWithOneOutputNote() public {
        bytes32 commitment = _fieldCommitment("partial-withdraw");
        bytes32 nullifier = _fieldCommitment("partial-nullifier");
        bytes32 changeCommitment = _fieldCommitment("partial-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        uint256 destinationBefore = destination.balance;
        uint256 fee = _expectedFee(0.005 ether);
        uint256 minNetAmount = 0.005 ether - fee;
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, minNetAmount, fee
        );

        assertEq(destination.balance - destinationBefore, minNetAmount);
        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
        assertEq(pool.accruedProtocolFees(), fee);
        assertEq(pool.totalWithdrawnAccounting(), minNetAmount);
    }

    function testStageCPartialPublicExitEmitsBoundOutputEvents() public {
        bytes32 commitment = _fieldCommitment("partial-event-note");
        bytes32 nullifier = _fieldCommitment("partial-event-nullifier");
        bytes32 changeCommitment = _fieldCommitment("partial-event-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);
        uint256 netAmount = grossAmount - fee;

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: netAmount,
            maxFeeAmount: fee
        });

        vm.expectEmit(true, true, false, true, address(pool));
        emit WithdrawalOutputCommitmentInserted(changeCommitment, nullifier, grossAmount);
        vm.expectEmit(true, true, true, true, address(pool));
        emit WithdrawalOutputNoteCreated(
            changeCommitment, nullifier, 1, grossAmount, encryptedChangeNote, ENCRYPTED_OUTPUT_NOTE_VERSION_V2
        );
        vm.expectEmit(true, false, false, true, address(pool));
        emit WithdrawalExecuted(destination, grossAmount, netAmount, fee);

        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, netAmount, fee);
    }

    function testOutputEncryptedNoteHashUsesV2DomainVersionAndPayloadDigest() public view {
        bytes32 nullifier = _fieldCommitment("v2-output-hash-nullifier");
        bytes32 outputCommitment = _fieldCommitment("v2-output-hash-commitment");
        bytes memory encryptedOutputNote = abi.encodePacked("v2-output-note", nullifier);

        bytes32 expected = _expectedOutputEncryptedNoteHashV2({
            selector: WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            encryptedOutputNote: encryptedOutputNote
        });

        assertEq(
            pool.computeOutputEncryptedNoteHash(
                WITHDRAW_CONTEXT_SHAPE,
                WITHDRAW_CHANGE_BOUNDED_SELECTOR,
                nullifier,
                outputCommitment,
                encryptedOutputNote
            ),
            expected
        );
    }

    function testStageCRejectsV1EncryptedOutputNoteHash() public {
        bytes32 commitment = _fieldCommitment("reject-v1-output-hash-note");
        bytes32 nullifier = _fieldCommitment("reject-v1-output-hash-nullifier");
        bytes32 outputCommitment = _fieldCommitment("reject-v1-output-hash-output");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedOutputNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        bytes32 v1Hash = _expectedOutputEncryptedNoteHashV1({
            selector: WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            encryptedOutputNote: encryptedOutputNote
        });
        publicInputs[9] = v1Hash;
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            destination,
            0.005 ether,
            _expectedFee(0.005 ether),
            v1Hash,
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("invalid encrypted note hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedOutputNote, 0, type(uint256).max
        );
    }

    function testRejectsNoBoundsFullExitSelector() public {
        bytes32 commitment = _fieldCommitment("unbounded-full-exit-note");
        bytes32 nullifier = _fieldCommitment("unbounded-full-exit-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 grossAmount = 0.01 ether;

        _depositWithProof(commitment, grossAmount);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: bytes32(0),
            destination: destination,
            grossAmount: grossAmount,
            selector: WITHDRAW_SELECTOR,
            relayerPolicy: _defaultWithdrawPolicy(0, type(uint256).max)
        });

        vm.expectRevert("bounded withdrawal required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount);
    }

    function testRejectsNoBoundsOutputNoteSelector() public {
        bytes32 commitment = _fieldCommitment("unbounded-partial-note");
        bytes32 nullifier = _fieldCommitment("unbounded-partial-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unbounded-partial-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: grossAmount,
            encryptedOutputNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_SELECTOR,
            relayerPolicy: _defaultWithdrawPolicy(0, type(uint256).max)
        });

        vm.expectRevert("bounded withdrawal required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, grossAmount, encryptedChangeNote);
    }

    function testStageCOutputThenPublicExitConservesValueAndDoesNotInflate() public {
        bytes32 commitment = _fieldCommitment("conservation-note");
        bytes32 firstNullifier = _fieldCommitment("conservation-first-nullifier");
        bytes32 changeCommitment = _fieldCommitment("conservation-change");
        bytes32 secondNullifier = _fieldCommitment("conservation-second-nullifier");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 grossAmount = 0.005 ether;
        uint256 fee = _expectedFee(grossAmount);

        _depositWithProof(commitment, 0.01 ether);
        uint256 poolBalanceAfterDeposit = address(pool).balance;
        uint256 destinationBefore = destination.balance;

        _withdrawWithOutputNote(firstNullifier, changeCommitment, destination, encryptedChangeNote);
        _withdrawWithDummyOutputNote(secondNullifier, destination);

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

    function testStageCRejectsMissingEncryptedOutputNote() public {
        bytes32 commitment = _fieldCommitment("missing-change-note");
        bytes32 nullifier = _fieldCommitment("missing-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("missing-change-commitment");
        address payable destination = payable(address(0xBEEF));

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: "",
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("encrypted output note required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, "", 0, type(uint256).max);
    }

    function testStageCRejectsUnsupportedExitDenomination() public {
        bytes32 commitment = _fieldCommitment("unsupported-exit-note");
        bytes32 nullifier = _fieldCommitment("unsupported-exit-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unsupported-exit-change");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.001 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("unsupported exit denomination");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.001 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCAllowsSupportedExitWithUnlinkableOutputNote() public {
        bytes32 commitment = _fieldCommitment("unsupported-change-note");
        bytes32 nullifier = _fieldCommitment("unsupported-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("unsupported-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.1 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.03 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.03 ether, encryptedChangeNote, 0, type(uint256).max
        );

        assertTrue(pool.commitments(changeCommitment));
        assertTrue(pool.nullifiers(nullifier));
    }

    function testStageCAllowsTieredExitWithOutputNote() public {
        bytes32 commitment = _fieldCommitment("supported-tiered-change-note");
        bytes32 nullifier = _fieldCommitment("supported-tiered-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("supported-tiered-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.05 ether);
        uint256 fee = _expectedFee(0.02 ether);
        uint256 minNetAmount = 0.02 ether - fee;
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.02 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.02 ether, encryptedChangeNote, minNetAmount, fee
        );

        assertTrue(pool.commitments(changeCommitment));
    }

    function testStageCRejectsPublicExitWithoutOutputCommitment() public {
        bytes32 commitment = _fieldCommitment("partial-zero-change-note");
        bytes32 nullifier = _fieldCommitment("partial-zero-change-nullifier");
        address payable destination = payable(address(0xBEEF));

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: bytes32(0),
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: "",
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        vm.expectRevert("output commitment required");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, 0, type(uint256).max);
    }

    function testStageCAllowsFullExitWithOutputCommitment() public {
        bytes32 commitment = _fieldCommitment("full-nonzero-change-note");
        bytes32 nullifier = _fieldCommitment("full-nonzero-change-nullifier");
        bytes32 changeCommitment = _fieldCommitment("full-nonzero-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });

        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedChangeNote, 0, type(uint256).max
        );

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(changeCommitment));
    }

    function testStageCRejectsWrongOutputEncryptedNoteHash() public {
        bytes32 commitment = _fieldCommitment("wrong-change-note-hash-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-note-hash-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-note-hash-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[9] = bytes32(uint256(publicInputs[9]) + 1);

        vm.expectRevert("invalid encrypted note hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsWrongOutputProofContextHash() public {
        bytes32 commitment = _fieldCommitment("wrong-change-context-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-context-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-context-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[8] = bytes32(uint256(publicInputs[8]) + 1);

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, 0, type(uint256).max
        );
    }

    function testStageCRejectsWrongRelayerPolicyBindingForOutput() public {
        bytes32 commitment = _fieldCommitment("wrong-change-policy-note");
        bytes32 nullifier = _fieldCommitment("wrong-change-policy-nullifier");
        bytes32 changeCommitment = _fieldCommitment("wrong-change-policy-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        uint256 fee = _expectedFee(0.005 ether);
        NullarkPool.RelayerPolicy memory boundPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0),
            minNetAmount: 0.005 ether - fee,
            maxFeeAmount: fee,
            deadlineOrZero: block.timestamp + 100
        });
        NullarkPool.RelayerPolicy memory submittedPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: fee, deadlineOrZero: block.timestamp + 100
        });

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR,
            relayerPolicy: boundPolicy
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, submittedPolicy
        );
    }

    function testStageCRejectsExpiredRelayerPolicyForOutput() public {
        bytes32 commitment = _fieldCommitment("expired-change-policy-note");
        bytes32 nullifier = _fieldCommitment("expired-change-policy-nullifier");
        bytes32 changeCommitment = _fieldCommitment("expired-change-policy-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 1
        });

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            selector: WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR,
            relayerPolicy: relayerPolicy
        });

        vm.warp(2);
        vm.expectRevert("expired relayer policy");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.005 ether, encryptedChangeNote, relayerPolicy);
    }

    function testStageCRejectsDuplicateOutputCommitment() public {
        bytes32 commitment = _fieldCommitment("duplicate-change-note");
        bytes32 nullifier = _fieldCommitment("duplicate-change-nullifier");
        bytes32 duplicateCommitment = _fieldCommitment("duplicate-change-commitment");
        address payable destination = payable(address(0xBEEF));
        bytes memory encryptedChangeNote = hex"abcd";

        _depositWithProof(commitment, 0.01 ether);
        _depositWithProof(duplicateCommitment, 0.005 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: duplicateCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
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

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
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

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: changeCommitment,
            destination: destination,
            grossAmount: 0.005 ether,
            encryptedOutputNote: encryptedChangeNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[9] = pool.computeOutputEncryptedNoteHash(
            WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            nullifier,
            unboundSecondOutput,
            encryptedChangeNote
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

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });

        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);

        assertTrue(pool.nullifiers(nullifier));
        assertTrue(pool.commitments(newCommitment));
    }

    function testStageBPrivateTransferNoNoteOverloadRequiresEncryptedOutputNote() public {
        bytes32 commitment = _fieldCommitment("stage-b-private-transfer-no-note");
        bytes32 nullifier = _fieldCommitment("stage-b-private-transfer-no-note-nullifier");
        bytes32 newCommitment = _fieldCommitment("stage-b-private-transfer-no-note-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: ""
        });
        publicInputs[9] = pool.computeOutputEncryptedNoteHash(
            PRIVATE_TRANSFER_CONTEXT_SHAPE, PRIVATE_TRANSFER_NO_NOTE_SELECTOR, nullifier, newCommitment, ""
        );
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            PRIVATE_TRANSFER_CONTEXT_SHAPE,
            PRIVATE_TRANSFER_NO_NOTE_SELECTOR,
            address(0),
            0,
            0,
            publicInputs[9],
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("encrypted output note required");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment);
    }

    function testStageBPrivateTransferExplicitEmptyNoteRequiresEncryptedOutputNote() public {
        bytes32 commitment = _fieldCommitment("stage-b-private-transfer-empty-note");
        bytes32 nullifier = _fieldCommitment("stage-b-private-transfer-empty-note-nullifier");
        bytes32 newCommitment = _fieldCommitment("stage-b-private-transfer-empty-note-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: ""
        });

        vm.expectRevert("encrypted output note required");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, "");
    }

    function testStageBRejectsWrongProofContextHash() public {
        bytes32 commitment = _fieldCommitment("wrong-context-note");
        bytes32 nullifier = _fieldCommitment("wrong-context-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-context-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });
        publicInputs[8] = bytes32(uint256(publicInputs[8]) + 1);

        vm.expectRevert("invalid proof context hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsV11PrivateTransferContextShape() public {
        bytes32 commitment = _fieldCommitment("obsolete-v11-private-transfer-note");
        bytes32 nullifier = _fieldCommitment("obsolete-v11-private-transfer-nullifier");
        bytes32 newCommitment = _fieldCommitment("obsolete-v11-private-transfer-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            OBSOLETE_V1_1_PRIVATE_TRANSFER_CONTEXT_SHAPE,
            PRIVATE_TRANSFER_SELECTOR,
            address(0),
            0,
            0,
            publicInputs[9],
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("invalid proof context hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsWrongEncryptedNoteHash() public {
        bytes32 commitment = _fieldCommitment("wrong-note-hash-note");
        bytes32 nullifier = _fieldCommitment("wrong-note-hash-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-note-hash-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });
        publicInputs[9] = bytes32(uint256(publicInputs[9]) + 1);

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsZeroAppendedHashes() public {
        bytes32 commitment = _fieldCommitment("zero-stage-b-note");
        bytes32 nullifier = _fieldCommitment("zero-stage-b-nullifier");
        bytes32 newCommitment = _fieldCommitment("zero-stage-b-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });
        publicInputs[8] = bytes32(0);
        publicInputs[9] = bytes32(0);

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function testStageBRejectsWrongEncryptedNotePayload() public {
        bytes32 commitment = _fieldCommitment("wrong-action-note");
        bytes32 nullifier = _fieldCommitment("wrong-action-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-action-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
        });

        vm.expectRevert("invalid encrypted note hash");
        pool.privateTransfer(hex"1234", publicInputs, nullifier, newCommitment, hex"9999");
    }

    function testStageBRejectsWrongSelectorBinding() public {
        bytes32 commitment = _fieldCommitment("wrong-selector-note");
        bytes32 nullifier = _fieldCommitment("wrong-selector-nullifier");
        address payable destination = payable(address(0xBEEF));
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            bytes4(0xdeadbeef),
            destination,
            0.01 ether,
            _expectedFee(0.01 ether),
            publicInputs[9],
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedOutputNote, 0, type(uint256).max
        );
    }

    function testV12RejectsObsoleteV11WithdrawContextShape() public {
        bytes32 commitment = _fieldCommitment("obsolete-v11-shape-note");
        bytes32 nullifier = _fieldCommitment("obsolete-v11-shape-nullifier");
        address payable destination = payable(address(0xBEEF));
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: 0,
            maxFeeAmount: type(uint256).max
        });
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            OBSOLETE_V1_1_WITHDRAW_CONTEXT_SHAPE,
            WITHDRAW_CHANGE_BOUNDED_SELECTOR,
            destination,
            0.01 ether,
            _expectedFee(0.01 ether),
            publicInputs[9],
            _defaultWithdrawPolicy(0, type(uint256).max)
        );

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(
            hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedOutputNote, 0, type(uint256).max
        );
    }

    function testStageBRejectsWrongChainAndPoolBindings() public {
        bytes32 commitment = _fieldCommitment("wrong-chain-pool-note");
        bytes32 nullifier = _fieldCommitment("wrong-chain-pool-nullifier");
        bytes32 newCommitment = _fieldCommitment("wrong-chain-pool-new");

        _depositWithProof(commitment, 0.01 ether);
        bytes memory encryptedNote = _privateTransferEncryptedNote();
        bytes32[] memory publicInputs = _privateTransferPublicInputs({
            root: pool.currentRoot(), nullifier: nullifier, newCommitment: newCommitment, encryptedNote: encryptedNote
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
        uint256 fee = _expectedFee(0.01 ether);
        uint256 minNetAmount = 0.01 ether - fee;
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputs({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            encryptedOutputNote: encryptedOutputNote,
            minNetAmount: minNetAmount,
            maxFeeAmount: fee
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedOutputNote, 0, fee);
    }

    function testStageBRejectsWrongDeadlineBinding() public {
        bytes32 commitment = _fieldCommitment("wrong-deadline-note");
        bytes32 nullifier = _fieldCommitment("wrong-deadline-nullifier");
        address payable destination = payable(address(0xBEEF));
        uint256 fee = _expectedFee(0.01 ether);
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
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);

        _depositWithProof(commitment, 0.01 ether);
        bytes32[] memory publicInputs = _withdrawPublicInputsWithPolicy({
            root: pool.currentRoot(),
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            destination: destination,
            grossAmount: 0.01 ether,
            encryptedOutputNote: encryptedOutputNote,
            selector: WITHDRAW_CHANGE_RELAYER_POLICY_SELECTOR,
            relayerPolicy: boundPolicy
        });

        vm.expectRevert("invalid proof context hash");
        pool.withdraw(hex"1234", publicInputs, nullifier, destination, 0.01 ether, encryptedOutputNote, submittedPolicy);
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

    function _dummyOutputCommitment(bytes32 nullifier) private pure returns (bytes32) {
        uint256 value = uint256(keccak256(abi.encodePacked("dummy-output", nullifier)))
            % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        if (value == 0) {
            value = 1;
        }
        return bytes32(value);
    }

    function _dummyEncryptedOutputNote(bytes32 nullifier) private pure returns (bytes memory) {
        return abi.encodePacked("dummy-output-note-v1.2", nullifier);
    }

    function _expectedOutputEncryptedNoteHashV2(
        bytes4 selector,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes memory encryptedOutputNote
    ) private view returns (bytes32) {
        return bytes32(
            uint256(
                keccak256(
                    abi.encode(
                        ENCRYPTED_OUTPUT_NOTE_HASH_DOMAIN_V2,
                        ENCRYPTED_OUTPUT_NOTE_VERSION_V2,
                        block.chainid,
                        address(pool),
                        WITHDRAW_CONTEXT_SHAPE,
                        selector,
                        nullifier,
                        outputCommitment,
                        keccak256(encryptedOutputNote)
                    )
                )
            ) % BN254_SCALAR_FIELD
        );
    }

    function _expectedOutputEncryptedNoteHashV1(
        bytes4 selector,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes memory encryptedOutputNote
    ) private view returns (bytes32) {
        return bytes32(
            uint256(
                keccak256(
                    abi.encode(
                        keccak256("nullark.encrypted-note.v1"),
                        uint16(1),
                        block.chainid,
                        address(pool),
                        WITHDRAW_CONTEXT_SHAPE,
                        selector,
                        nullifier,
                        outputCommitment,
                        encryptedOutputNote
                    )
                )
            ) % BN254_SCALAR_FIELD
        );
    }

    function _depositWithProof(bytes32 commitment, uint256 amount) private {
        bytes memory encryptedNote = _depositEncryptedNote(commitment);
        verifier.setExpectedPublicInputsLength(6);
        pool.deposit{value: amount}(hex"1234", _depositPublicInputs(commitment, amount, encryptedNote), encryptedNote);
        verifier.setExpectedPublicInputsLength(10);
    }

    function _depositPublicInputs(bytes32 commitment, uint256 amount, bytes memory encryptedNote)
        private
        view
        returns (bytes32[] memory publicInputs)
    {
        publicInputs = new bytes32[](6);
        publicInputs[0] = commitment;
        publicInputs[1] = bytes32(amount);
        publicInputs[2] = bytes32(block.chainid);
        publicInputs[3] = bytes32(uint256(uint160(address(pool))));
        publicInputs[5] = pool.computeDepositEncryptedNoteHash(DEPOSIT_PROOF_SELECTOR, commitment, encryptedNote);
        publicInputs[4] = pool.computeDepositContextHash(DEPOSIT_PROOF_SELECTOR, commitment, amount, publicInputs[5]);
    }

    function _depositEncryptedNote(bytes32 commitment) private pure returns (bytes memory) {
        return abi.encodePacked("deposit-note-v1.2", commitment);
    }

    function _withdrawWithOutputNote(
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
                outputCommitment: changeCommitment,
                destination: destination,
                grossAmount: 0.005 ether,
                encryptedOutputNote: encryptedChangeNote,
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

    function _withdrawWithDummyOutputNote(bytes32 nullifier, address payable destination) private {
        bytes32 outputCommitment = _dummyOutputCommitment(nullifier);
        bytes memory encryptedOutputNote = _dummyEncryptedOutputNote(nullifier);
        pool.withdraw(
            hex"1234",
            _withdrawPublicInputs({
                root: pool.currentRoot(),
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: 0.005 ether,
                encryptedOutputNote: encryptedOutputNote,
                minNetAmount: 0,
                maxFeeAmount: type(uint256).max
            }),
            nullifier,
            destination,
            0.005 ether,
            encryptedOutputNote,
            0,
            type(uint256).max
        );
    }

    function _withdrawPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 outputCommitment,
        address destination,
        uint256 grossAmount,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: "",
                selector: WITHDRAW_BOUNDED_SELECTOR,
                relayerPolicy: _defaultWithdrawPolicy(minNetAmount, maxFeeAmount)
            })
        );
    }

    function _withdrawPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 outputCommitment,
        address destination,
        uint256 grossAmount,
        bytes memory encryptedOutputNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
                selector: outputCommitment == bytes32(0) ? WITHDRAW_BOUNDED_SELECTOR : WITHDRAW_CHANGE_BOUNDED_SELECTOR,
                relayerPolicy: _defaultWithdrawPolicy(minNetAmount, maxFeeAmount)
            })
        );
    }

    function _withdrawPublicInputsWithPolicy(
        bytes32 root,
        bytes32 nullifier,
        bytes32 outputCommitment,
        address destination,
        uint256 grossAmount,
        bytes4 selector,
        NullarkPool.RelayerPolicy memory relayerPolicy
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: "",
                selector: selector,
                relayerPolicy: relayerPolicy
            })
        );
    }

    function _withdrawPublicInputsWithPolicy(
        bytes32 root,
        bytes32 nullifier,
        bytes32 outputCommitment,
        address destination,
        uint256 grossAmount,
        bytes memory encryptedOutputNote,
        bytes4 selector,
        NullarkPool.RelayerPolicy memory relayerPolicy
    ) private view returns (bytes32[] memory publicInputs) {
        return _buildWithdrawPublicInputs(
            WithdrawInputArgs({
                root: root,
                nullifier: nullifier,
                outputCommitment: outputCommitment,
                destination: destination,
                grossAmount: grossAmount,
                encryptedOutputNote: encryptedOutputNote,
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
        uint256 fee = _expectedFee(args.grossAmount);
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
            WITHDRAW_CONTEXT_SHAPE, args.selector, args.nullifier, args.outputCommitment, args.encryptedOutputNote
        );
        publicInputs[8] = pool.computeProofContextHash(
            publicInputs,
            WITHDRAW_CONTEXT_SHAPE,
            args.selector,
            args.destination,
            args.grossAmount,
            fee,
            publicInputs[9],
            args.relayerPolicy
        );
    }

    function _privateTransferPublicInputs(
        bytes32 root,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes memory encryptedNote
    ) private view returns (bytes32[] memory publicInputs) {
        publicInputs = new bytes32[](10);
        publicInputs[0] = root;
        publicInputs[1] = nullifier;
        publicInputs[2] = newCommitment;
        publicInputs[3] = bytes32(0);
        publicInputs[4] = bytes32(0);
        publicInputs[5] = bytes32(0);
        publicInputs[6] = bytes32(block.chainid);
        publicInputs[7] = bytes32(uint256(uint160(address(pool))));
        NullarkPool.RelayerPolicy memory relayerPolicy = NullarkPool.RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 0
        });
        publicInputs[9] = pool.computeOutputEncryptedNoteHash(
            PRIVATE_TRANSFER_CONTEXT_SHAPE, PRIVATE_TRANSFER_SELECTOR, nullifier, newCommitment, encryptedNote
        );
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

    function _assertSelectorUnavailable(string memory signature, bytes memory args) private {
        (bool ok,) = address(pool).call(bytes.concat(bytes4(keccak256(bytes(signature))), args));
        assertFalse(ok);
    }

    function _expectedFee(uint256 grossAmount) private view returns (uint256) {
        return (grossAmount * uint256(pool.feeBps())) / pool.BPS_DENOMINATOR();
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
