// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "./vendor/openzeppelin/utils/ReentrancyGuard.sol";

import {IVerifier} from "./interfaces/IVerifier.sol";

interface IPoseidon2 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

contract ShieldedPool is ReentrancyGuard {
    uint256 public constant WITHDRAWAL_FEE_BPS = 33;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PUBLIC_INPUTS_LENGTH = 10;
    uint256 public constant ROOT_HISTORY_SIZE = 256;
    uint256 public constant MERKLE_TREE_DEPTH = 12;
    uint256 public constant MERKLE_TREE_CAPACITY = 2 ** MERKLE_TREE_DEPTH;
    uint256 public constant MAX_ENCRYPTED_NOTE_BYTES = 2048;
    uint16 public constant ENCRYPTED_NOTE_VERSION = 1;
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant PUBLIC_INPUT_ROOT = 0;
    uint256 private constant PUBLIC_INPUT_NULLIFIER = 1;
    uint256 private constant PUBLIC_INPUT_NEW_COMMITMENT = 2;
    uint256 private constant PUBLIC_INPUT_DESTINATION = 3;
    uint256 private constant PUBLIC_INPUT_GROSS_AMOUNT = 4;
    uint256 private constant PUBLIC_INPUT_FEE = 5;
    uint256 private constant PUBLIC_INPUT_CHAIN_ID = 6;
    uint256 private constant PUBLIC_INPUT_VERIFYING_CONTRACT = 7;
    uint256 private constant PUBLIC_INPUT_SPENT_COMMITMENT = 8;
    uint256 private constant PUBLIC_INPUT_NOTE_AMOUNT = 9;

    IVerifier public immutable verifier;
    IPoseidon2 public immutable poseidon2;
    bytes32 public immutable initialRoot;
    address public immutable feeController;
    address public immutable emergencyGuardian;

    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => uint256) public commitmentAmounts;
    mapping(bytes32 => bool) public nullifiers;

    bytes32 public currentRoot;
    bytes32[ROOT_HISTORY_SIZE] public rootHistory;
    uint256 public rootHistoryIndex;
    bytes32[MERKLE_TREE_DEPTH] public filledSubtrees;
    bytes32[MERKLE_TREE_DEPTH + 1] public zeroHashes;
    uint256 public nextLeafIndex;

    uint256 public accruedProtocolFees;
    uint256 public feeSweptAccounting;
    uint256 public totalDepositedAccounting;
    uint256 public totalWithdrawnAccounting;

    bool public depositsPaused;
    bool public internalSendsPaused;
    bool public feeSweepsPaused;
    bool public withdrawalsEmergencyPaused;

    event DepositCommitmentInserted(bytes32 indexed commitment, uint256 amount);
    event PrivateTransferCommitmentInserted(bytes32 indexed commitment, bytes32 indexed nullifier);
    event WithdrawalChangeCommitmentInserted(bytes32 indexed commitment, bytes32 indexed nullifier, uint256 grossAmount);
    event DepositNoteCreated(
        bytes32 indexed commitment, uint256 indexed leafIndex, bytes encryptedNote, uint16 encryptionVersion
    );
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
    event NullifierSpent(bytes32 indexed nullifier);
    event WithdrawalExecuted(address indexed destination, uint256 grossAmount, uint256 netAmount, uint256 fee);
    event ProtocolFeesAccrued(uint256 amount);
    event ProtocolFeesSwept(address indexed destination, uint256 amount);
    event RootAccepted(bytes32 indexed root, bytes32 indexed previousRoot, bytes32 indexed insertedCommitment);
    event RootExpired(bytes32 indexed root);
    event DepositsPaused(bool paused);
    event InternalSendsPaused(bool paused);
    event FeeSweepsPaused(bool paused);
    event WithdrawalsEmergencyPaused(bool paused);

    modifier onlyFeeController() {
        require(msg.sender == feeController, "only fee controller");
        _;
    }

    modifier onlyEmergencyGuardian() {
        require(msg.sender == emergencyGuardian, "only emergency guardian");
        _;
    }

    constructor(address verifier_, address feeController_, address emergencyGuardian_, address poseidon2_) {
        require(verifier_ != address(0), "invalid verifier");
        require(feeController_ != address(0), "invalid fee controller");
        require(emergencyGuardian_ != address(0), "invalid emergency guardian");
        require(poseidon2_ != address(0), "invalid poseidon");

        verifier = IVerifier(verifier_);
        poseidon2 = IPoseidon2(poseidon2_);
        feeController = feeController_;
        emergencyGuardian = emergencyGuardian_;

        bytes32 computedInitialRoot = _initializeZeroHashes();
        initialRoot = computedInitialRoot;
        currentRoot = computedInitialRoot;
        rootHistory[0] = computedInitialRoot;
        emit RootAccepted(computedInitialRoot, bytes32(0), bytes32(0));
    }

    function isAcceptedRoot(bytes32 root) public view returns (bool) {
        if (root == bytes32(0)) {
            return false;
        }

        for (uint256 i; i < ROOT_HISTORY_SIZE; i++) {
            if (rootHistory[i] == root) {
                return true;
            }
        }

        return false;
    }

    function deposit(bytes32 commitment) external payable {
        _deposit(commitment, "");
    }

    function deposit(bytes32 commitment, bytes calldata encryptedNote) external payable {
        _deposit(commitment, encryptedNote);
    }

    function _deposit(bytes32 commitment, bytes memory encryptedNote) private {
        require(!depositsPaused, "deposits paused");
        require(msg.value > 0, "deposit amount required");
        require(commitment != bytes32(0), "invalid commitment");
        require(_isFieldElement(commitment), "commitment out of range");
        require(!commitments[commitment], "commitment exists");
        require(encryptedNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");

        commitments[commitment] = true;
        commitmentAmounts[commitment] = msg.value;
        totalDepositedAccounting += msg.value;
        uint256 leafIndex = _recordCommitmentRoot(commitment);

        emit DepositCommitmentInserted(commitment, msg.value);
        if (encryptedNote.length != 0) {
            emit DepositNoteCreated(commitment, leafIndex, encryptedNote, ENCRYPTED_NOTE_VERSION);
        }
    }

    function privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment
    ) external {
        _privateTransfer(proof, publicInputs, nullifier, newCommitment, "");
    }

    function privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes calldata encryptedNote
    ) external {
        _privateTransfer(proof, publicInputs, nullifier, newCommitment, encryptedNote);
    }

    function _privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes memory encryptedNote
    ) private {
        require(!internalSendsPaused, "internal sends paused");
        require(nullifier != bytes32(0), "invalid nullifier");
        require(newCommitment != bytes32(0), "invalid commitment");
        require(_isFieldElement(newCommitment), "commitment out of range");
        require(encryptedNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");
        uint256 noteAmount = _requirePrivateTransferPublicInputs(publicInputs, nullifier, newCommitment);
        require(verifier.verify(proof, publicInputs), "invalid proof");
        require(!nullifiers[nullifier], "nullifier already spent");
        require(!commitments[newCommitment], "commitment exists");

        nullifiers[nullifier] = true;
        commitments[newCommitment] = true;
        commitmentAmounts[newCommitment] = noteAmount;
        uint256 leafIndex = _recordCommitmentRoot(newCommitment);

        emit NullifierSpent(nullifier);
        emit PrivateTransferCommitmentInserted(newCommitment, nullifier);
        if (encryptedNote.length != 0) {
            emit PrivateTransferNoteCreated(newCommitment, nullifier, leafIndex, encryptedNote, ENCRYPTED_NOTE_VERSION);
        }
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount
    ) external nonReentrant {
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, "", 0, type(uint256).max);
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) external nonReentrant {
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, "", minNetAmount, maxFeeAmount);
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes calldata encryptedChangeNote
    ) external nonReentrant {
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, 0, type(uint256).max);
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes calldata encryptedChangeNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) external nonReentrant {
        _withdraw(
            proof, publicInputs, nullifier, destination, grossAmount, encryptedChangeNote, minNetAmount, maxFeeAmount
        );
    }

    function _withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes memory encryptedChangeNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private {
        require(!withdrawalsEmergencyPaused, "withdrawals emergency paused");
        require(nullifier != bytes32(0), "invalid nullifier");
        require(!nullifiers[nullifier], "nullifier already spent");
        require(destination != address(0), "invalid destination");
        require(grossAmount > 0, "withdrawal amount required");
        require(encryptedChangeNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");

        uint256 fee = (grossAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR;
        (bytes32 changeCommitment, uint256 noteAmount) =
            _requireWithdrawalPublicInputs(publicInputs, nullifier, destination, grossAmount, fee);
        require(verifier.verify(proof, publicInputs), "invalid proof");
        uint256 netAmount = grossAmount - fee;
        require(fee <= maxFeeAmount, "fee exceeds user bound");
        require(netAmount >= minNetAmount, "net amount below user minimum");
        require(grossAmount <= noteAmount, "withdrawal exceeds note amount");
        if (changeCommitment == bytes32(0)) {
            require(grossAmount == noteAmount, "change commitment required");
        } else {
            require(grossAmount < noteAmount, "invalid change amount");
        }

        uint256 unsweptFees = accruedProtocolFees - feeSweptAccounting;
        uint256 withdrawableAccounting = totalDepositedAccounting - totalWithdrawnAccounting - accruedProtocolFees;
        require(grossAmount <= withdrawableAccounting, "insufficient accounting liquidity");
        require(grossAmount <= address(this).balance - unsweptFees, "insufficient pool liquidity");

        nullifiers[nullifier] = true;
        accruedProtocolFees += fee;
        totalWithdrawnAccounting += netAmount;
        uint256 changeLeafIndex = 0;
        if (changeCommitment != bytes32(0)) {
            commitments[changeCommitment] = true;
            commitmentAmounts[changeCommitment] = noteAmount - grossAmount;
            changeLeafIndex = _recordCommitmentRoot(changeCommitment);
        }

        (bool ok,) = destination.call{value: netAmount}("");
        require(ok, "withdraw transfer failed");

        emit NullifierSpent(nullifier);
        if (changeCommitment != bytes32(0)) {
            emit WithdrawalChangeCommitmentInserted(changeCommitment, nullifier, grossAmount);
            if (encryptedChangeNote.length != 0) {
                emit WithdrawalChangeNoteCreated(
                    changeCommitment, nullifier, changeLeafIndex, grossAmount, encryptedChangeNote, ENCRYPTED_NOTE_VERSION
                );
            }
        }
        emit ProtocolFeesAccrued(fee);
        emit WithdrawalExecuted(destination, grossAmount, netAmount, fee);
    }

    function sweepFees(address payable destination, uint256 amount) external nonReentrant onlyFeeController {
        require(!feeSweepsPaused, "fee sweeps paused");
        require(destination != address(0), "invalid destination");
        require(amount > 0, "sweep amount required");
        require(feeSweptAccounting + amount <= accruedProtocolFees, "sweep exceeds accrued fees");

        feeSweptAccounting += amount;
        (bool ok,) = destination.call{value: amount}("");
        require(ok, "fee sweep failed");

        emit ProtocolFeesSwept(destination, amount);
    }

    function pauseDeposits(bool paused) external onlyFeeController {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    function pauseInternalSends(bool paused) external onlyFeeController {
        internalSendsPaused = paused;
        emit InternalSendsPaused(paused);
    }

    function pauseFeeSweeps(bool paused) external onlyFeeController {
        feeSweepsPaused = paused;
        emit FeeSweepsPaused(paused);
    }

    function pauseWithdrawalsForEmergency(bool paused) external onlyEmergencyGuardian {
        withdrawalsEmergencyPaused = paused;
        emit WithdrawalsEmergencyPaused(paused);
    }

    function _requirePrivateTransferPublicInputs(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment
    ) private view returns (uint256 noteAmount) {
        _requirePublicInputsCommon(publicInputs, nullifier);
        require(publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] == newCommitment, "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_DESTINATION] == bytes32(0), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] == bytes32(0), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_FEE] == bytes32(0), "invalid public inputs");
        noteAmount = _requireSpentCommitmentAmount(publicInputs);
    }

    function _requireWithdrawalPublicInputs(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        uint256 fee
    ) private view returns (bytes32 changeCommitment, uint256 noteAmount) {
        _requirePublicInputsCommon(publicInputs, nullifier);
        changeCommitment = publicInputs[PUBLIC_INPUT_NEW_COMMITMENT];
        if (changeCommitment != bytes32(0)) {
            require(_isFieldElement(changeCommitment), "commitment out of range");
            require(!commitments[changeCommitment], "commitment exists");
        }
        require(publicInputs[PUBLIC_INPUT_DESTINATION] == _addressToBytes32(destination), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] == bytes32(grossAmount), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_FEE] == bytes32(fee), "invalid public inputs");
        noteAmount = _requireSpentCommitmentAmount(publicInputs);
    }

    function _requireSpentCommitmentAmount(bytes32[] calldata publicInputs) private view returns (uint256 noteAmount) {
        bytes32 spentCommitment = publicInputs[PUBLIC_INPUT_SPENT_COMMITMENT];
        noteAmount = uint256(publicInputs[PUBLIC_INPUT_NOTE_AMOUNT]);

        require(spentCommitment != bytes32(0), "invalid spent commitment");
        require(_isFieldElement(spentCommitment), "spent commitment out of range");
        require(commitments[spentCommitment], "unknown spent commitment");
        require(noteAmount > 0, "invalid note amount");
        require(noteAmount < BN254_SCALAR_FIELD, "note amount out of range");
        require(commitmentAmounts[spentCommitment] == noteAmount, "spent commitment amount mismatch");
    }

    function _requirePublicInputsCommon(bytes32[] calldata publicInputs, bytes32 nullifier) private view {
        require(publicInputs.length == PUBLIC_INPUTS_LENGTH, "invalid public inputs");
        require(isAcceptedRoot(publicInputs[PUBLIC_INPUT_ROOT]), "unaccepted root");
        require(publicInputs[PUBLIC_INPUT_NULLIFIER] == nullifier, "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_CHAIN_ID] == bytes32(block.chainid), "invalid public inputs");
        require(
            publicInputs[PUBLIC_INPUT_VERIFYING_CONTRACT] == _addressToBytes32(address(this)), "invalid public inputs"
        );
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }

    function _initializeZeroHashes() private returns (bytes32) {
        zeroHashes[0] = bytes32(0);
        for (uint256 level; level < MERKLE_TREE_DEPTH; level++) {
            filledSubtrees[level] = zeroHashes[level];
            zeroHashes[level + 1] = _poseidon2(zeroHashes[level], zeroHashes[level]);
        }
        return zeroHashes[MERKLE_TREE_DEPTH];
    }

    function _recordCommitmentRoot(bytes32 commitment) private returns (uint256 leafIndex) {
        bytes32 previousRoot = currentRoot;
        bytes32 nextRoot;
        (nextRoot, leafIndex) = _insertMerkleLeaf(commitment);
        uint256 nextIndex = (rootHistoryIndex + 1) % ROOT_HISTORY_SIZE;
        bytes32 expiredRoot = rootHistory[nextIndex];

        if (expiredRoot != bytes32(0) && expiredRoot != nextRoot) {
            emit RootExpired(expiredRoot);
        }

        rootHistory[nextIndex] = nextRoot;
        rootHistoryIndex = nextIndex;
        currentRoot = nextRoot;

        emit RootAccepted(nextRoot, previousRoot, commitment);
    }

    function _insertMerkleLeaf(bytes32 leaf) private returns (bytes32 root, uint256 leafIndex) {
        require(nextLeafIndex < MERKLE_TREE_CAPACITY, "merkle tree full");

        uint256 index = nextLeafIndex;
        leafIndex = index;
        bytes32 current = leaf;
        nextLeafIndex = index + 1;

        for (uint256 level; level < MERKLE_TREE_DEPTH; level++) {
            (current, index) = _insertMerkleLevel(current, index, level);
        }

        root = current;
    }

    function _insertMerkleLevel(bytes32 current, uint256 index, uint256 level)
        private
        returns (bytes32 next, uint256 nextIndex)
    {
        if (index % 2 == 0) {
            filledSubtrees[level] = current;
            next = _poseidon2(current, zeroHashes[level]);
        } else {
            next = _poseidon2(filledSubtrees[level], current);
        }
        nextIndex = index / 2;
    }

    function _poseidon2(bytes32 left, bytes32 right) private view returns (bytes32) {
        uint256[2] memory input = [uint256(left), uint256(right)];
        return bytes32(poseidon2.poseidon(input));
    }

    function _isFieldElement(bytes32 value) private pure returns (bool) {
        return uint256(value) < BN254_SCALAR_FIELD;
    }
}
