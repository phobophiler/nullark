// SPDX-License-Identifier: MIT

// nullark >_

pragma solidity ^0.8.26;

import {ReentrancyGuard} from "../vendor/openzeppelin/utils/ReentrancyGuard.sol";

import {IVerifier} from "../interfaces/IVerifier.sol";

interface IPoseidon2 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

contract NullarkPool is ReentrancyGuard {
    uint16 public constant INITIAL_FEE_BPS = 33;
    uint256 public constant WITHDRAWAL_FEE_BPS = INITIAL_FEE_BPS;
    uint16 public constant MAX_FEE_BPS = 100;
    uint64 public constant FEE_INCREASE_DELAY = 259_200;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PUBLIC_INPUTS_LENGTH = 10;
    uint256 public constant DEPOSIT_PUBLIC_INPUTS_LENGTH = 6;
    uint256 public constant ROOT_HISTORY_SIZE = 256;
    uint256 public constant MERKLE_TREE_DEPTH = 20;
    uint256 public constant MERKLE_TREE_CAPACITY = 2 ** MERKLE_TREE_DEPTH;
    uint256 public constant MAX_ENCRYPTED_NOTE_BYTES = 2048;
    uint16 public constant ENCRYPTED_NOTE_VERSION = 1;
    uint16 public constant ENCRYPTED_OUTPUT_NOTE_VERSION = 2;
    uint16 public constant PROOF_CONTEXT_VERSION = 1;
    uint256 public constant MIN_DENOMINATION = 0.005 ether;
    uint256 public constant MAX_DENOMINATION = 1 ether;
    uint256 public constant DENOMINATION_COUNT = 10;
    bytes32 public constant CONFIGURATION_HASH = keccak256(
        "nullark.v1.2.megaeth-mainnet.governed-fee.initial33.max100.delay259200.min0.005.max1.denominations10"
    );
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant PUBLIC_INPUT_ROOT = 0;
    uint256 private constant PUBLIC_INPUT_NULLIFIER = 1;
    uint256 private constant PUBLIC_INPUT_OUTPUT_COMMITMENT = 2;
    uint256 private constant PUBLIC_INPUT_DESTINATION = 3;
    uint256 private constant PUBLIC_INPUT_GROSS_AMOUNT = 4;
    uint256 private constant PUBLIC_INPUT_FEE = 5;
    uint256 private constant PUBLIC_INPUT_CHAIN_ID = 6;
    uint256 private constant PUBLIC_INPUT_VERIFYING_CONTRACT = 7;
    uint256 private constant PUBLIC_INPUT_PROOF_CONTEXT_HASH = 8;
    uint256 private constant PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 9;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_COMMITMENT = 0;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_AMOUNT = 1;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_CHAIN_ID = 2;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT = 3;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH = 4;
    uint256 private constant DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 5;

    bytes32 private constant PROOF_CONTEXT_DOMAIN = keccak256("nullark.proof-context.v1");
    bytes32 private constant DEPOSIT_CONTEXT_DOMAIN = keccak256("nullark.deposit-context.v1");
    bytes32 private constant ENCRYPTED_NOTE_HASH_DOMAIN = keccak256("nullark.encrypted-note.v1");
    bytes32 private constant ENCRYPTED_OUTPUT_NOTE_HASH_DOMAIN_V2 = keccak256("nullark.encrypted-output-note.v2");
    bytes32 private constant RELAYER_POLICY_DOMAIN = keccak256("nullark.relayer-policy.v1");
    bytes32 private constant DEPOSIT_CONTEXT_SHAPE = keccak256("deposit_context_v1_2");
    bytes32 private constant PRIVATE_TRANSFER_CONTEXT_SHAPE = keccak256("private_transfer_context_v1_2_fee_governance");
    bytes32 private constant WITHDRAW_CONTEXT_SHAPE = keccak256("withdraw_context_v1_2_fee_governance");

    struct RelayerPolicy {
        address relayer;
        uint256 minNetAmount;
        uint256 maxFeeAmount;
        uint256 deadlineOrZero;
    }

    struct EncryptedNoteV1 {
        bytes32 shape;
        bytes4 selector;
        bytes32 nullifier;
        bytes32 commitment;
        bytes encryptedNote;
    }

    struct EncryptedOutputNoteV2 {
        bytes32 shape;
        bytes4 selector;
        bytes32 nullifier;
        bytes32 outputCommitment;
        bytes encryptedOutputNote;
    }

    struct ProofContextV1 {
        bytes32 shape;
        bytes4 selector;
        bytes32 root;
        bytes32 nullifier;
        address destination;
        uint256 grossAmount;
        uint256 fee;
        bytes32 encryptedNoteHash;
        bytes32 relayerPolicyHash;
        uint256 deadlineOrZero;
    }

    IVerifier public immutable verifier;
    IPoseidon2 public immutable poseidon2;
    bytes32 public immutable initialRoot;
    address public immutable feeController;

    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => bool) public nullifiers;
    mapping(bytes32 => bool) public acceptedRoots;

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
    uint16 public feeBps;
    uint16 public pendingFeeBps;
    uint64 public pendingFeeActivationTime;

    event DepositCommitmentInserted(bytes32 indexed commitment, uint256 amount);
    event PrivateTransferCommitmentInserted(bytes32 indexed commitment, bytes32 indexed nullifier);
    event WithdrawalOutputCommitmentInserted(
        bytes32 indexed commitment, bytes32 indexed nullifier, uint256 grossAmount
    );
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
    event WithdrawalOutputNoteCreated(
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
    event FeeBpsDecreased(uint16 indexed oldFeeBps, uint16 indexed newFeeBps);
    event FeeBpsIncreaseScheduled(uint16 indexed oldFeeBps, uint16 indexed newFeeBps, uint64 activationTime);
    event FeeBpsIncreaseExecuted(uint16 indexed oldFeeBps, uint16 indexed newFeeBps);
    event FeeBpsIncreaseCancelled(uint16 indexed pendingFeeBps, uint64 activationTime);
    event RootAccepted(bytes32 indexed root, bytes32 indexed previousRoot, bytes32 indexed insertedCommitment);
    event RootExpired(bytes32 indexed root);

    modifier onlyFeeController() {
        require(msg.sender == feeController, "only fee controller");
        _;
    }

    constructor(address verifier_, address feeController_, address poseidon2_) {
        require(verifier_ != address(0), "invalid verifier");
        require(feeController_ != address(0), "invalid fee controller");
        require(poseidon2_ != address(0), "invalid poseidon");

        verifier = IVerifier(verifier_);
        poseidon2 = IPoseidon2(poseidon2_);
        feeController = feeController_;
        feeBps = INITIAL_FEE_BPS;

        bytes32 computedInitialRoot = _initializeZeroHashes();
        initialRoot = computedInitialRoot;
        currentRoot = computedInitialRoot;
        rootHistory[0] = computedInitialRoot;
        acceptedRoots[computedInitialRoot] = true;
        emit RootAccepted(computedInitialRoot, bytes32(0), bytes32(0));
    }

    function setFeeBps(uint16 newFeeBps) external onlyFeeController {
        require(newFeeBps <= MAX_FEE_BPS, "fee exceeds max");

        uint16 oldFeeBps = feeBps;
        if (newFeeBps == oldFeeBps) {
            pendingFeeBps = 0;
            pendingFeeActivationTime = 0;
            return;
        }

        if (newFeeBps < oldFeeBps) {
            feeBps = newFeeBps;
            pendingFeeBps = 0;
            pendingFeeActivationTime = 0;
            emit FeeBpsDecreased(oldFeeBps, newFeeBps);
            return;
        }

        uint64 activationTime = uint64(block.timestamp + FEE_INCREASE_DELAY);
        pendingFeeBps = newFeeBps;
        pendingFeeActivationTime = activationTime;
        emit FeeBpsIncreaseScheduled(oldFeeBps, newFeeBps, activationTime);
    }

    function executePendingFeeBps() external {
        uint16 newFeeBps = pendingFeeBps;
        require(newFeeBps != 0, "no pending fee");
        require(block.timestamp >= pendingFeeActivationTime, "fee timelock active");

        uint16 oldFeeBps = feeBps;
        feeBps = newFeeBps;
        pendingFeeBps = 0;
        pendingFeeActivationTime = 0;
        emit FeeBpsIncreaseExecuted(oldFeeBps, newFeeBps);
    }

    function cancelPendingFeeBps() external onlyFeeController {
        uint16 cancelledFeeBps = pendingFeeBps;
        uint64 cancelledActivationTime = pendingFeeActivationTime;
        require(cancelledFeeBps != 0, "no pending fee");

        pendingFeeBps = 0;
        pendingFeeActivationTime = 0;
        emit FeeBpsIncreaseCancelled(cancelledFeeBps, cancelledActivationTime);
    }

    function isAcceptedRoot(bytes32 root) public view returns (bool) {
        return root != bytes32(0) && acceptedRoots[root];
    }

    function isSpentArray(bytes32[] calldata nullifierValues) external view returns (bool[] memory spent) {
        spent = new bool[](nullifierValues.length);
        for (uint256 i; i < nullifierValues.length; i++) {
            spent[i] = nullifiers[nullifierValues[i]];
        }
    }

    function supportedDenominations() public pure returns (uint256[] memory values) {
        values = new uint256[](DENOMINATION_COUNT);
        values[0] = 0.005 ether;
        values[1] = 0.01 ether;
        values[2] = 0.02 ether;
        values[3] = 0.03 ether;
        values[4] = 0.05 ether;
        values[5] = 0.1 ether;
        values[6] = 0.2 ether;
        values[7] = 0.3 ether;
        values[8] = 0.5 ether;
        values[9] = 1 ether;
    }

    function isSupportedDenomination(uint256 amount) public pure returns (bool) {
        uint256[] memory values = supportedDenominations();
        for (uint256 i; i < values.length; i++) {
            if (amount == values[i]) {
                return true;
            }
        }
        return false;
    }

    function deposit(bytes32 commitment) external payable {
        commitment;
        revert("deposit proof required");
    }

    function deposit(bytes32 commitment, bytes calldata encryptedNote) external payable {
        (commitment, encryptedNote);
        revert("deposit proof required");
    }

    function deposit(bytes calldata proof, bytes32[] calldata publicInputs, bytes calldata encryptedNote)
        external
        payable
        nonReentrant
    {
        _depositWithProof(proof, publicInputs, encryptedNote, msg.sig);
    }

    function _depositWithProof(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes calldata encryptedNote,
        bytes4 selector
    ) private {
        require(publicInputs.length == DEPOSIT_PUBLIC_INPUTS_LENGTH, "invalid deposit public inputs");

        bytes32 commitment = publicInputs[DEPOSIT_PUBLIC_INPUT_COMMITMENT];
        uint256 amount = uint256(publicInputs[DEPOSIT_PUBLIC_INPUT_AMOUNT]);
        require(commitment != bytes32(0), "invalid commitment");
        require(_isFieldElement(commitment), "commitment out of range");
        require(!commitments[commitment], "commitment exists");
        require(amount == msg.value, "invalid deposit amount");
        require(msg.value > 0, "deposit amount required");
        require(isSupportedDenomination(msg.value), "unsupported fixed denomination");
        require(publicInputs[DEPOSIT_PUBLIC_INPUT_CHAIN_ID] == bytes32(block.chainid), "invalid deposit public inputs");
        require(
            publicInputs[DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT] == _addressToBytes32(address(this)),
            "invalid deposit public inputs"
        );
        require(encryptedNote.length != 0, "encrypted deposit note required");
        require(encryptedNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");
        bytes32 encryptedNoteHash = _depositEncryptedNoteHash(selector, commitment, encryptedNote);
        require(
            publicInputs[DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == encryptedNoteHash,
            "invalid encrypted deposit note hash"
        );
        require(
            publicInputs[DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH]
                == _depositContextHash(selector, commitment, amount, encryptedNoteHash),
            "invalid deposit context hash"
        );
        require(verifier.verify(proof, publicInputs), "invalid proof");

        commitments[commitment] = true;
        totalDepositedAccounting += msg.value;
        uint256 leafIndex = _recordCommitmentRoot(commitment);

        emit DepositCommitmentInserted(commitment, msg.value);
        emit DepositNoteCreated(commitment, leafIndex, encryptedNote, ENCRYPTED_NOTE_VERSION);
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

    function privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes calldata encryptedNote,
        RelayerPolicy calldata relayerPolicy
    ) external {
        _privateTransfer(proof, publicInputs, nullifier, newCommitment, encryptedNote, relayerPolicy, msg.sig);
    }

    function _privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes memory encryptedNote
    ) private {
        RelayerPolicy memory relayerPolicy = RelayerPolicy({
            relayer: address(0), minNetAmount: 0, maxFeeAmount: type(uint256).max, deadlineOrZero: 0
        });
        _privateTransfer(proof, publicInputs, nullifier, newCommitment, encryptedNote, relayerPolicy, msg.sig);
    }

    function _privateTransfer(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment,
        bytes memory encryptedNote,
        RelayerPolicy memory relayerPolicy,
        bytes4 selector
    ) private {
        require(nullifier != bytes32(0), "invalid nullifier");
        require(newCommitment != bytes32(0), "invalid commitment");
        require(_isFieldElement(newCommitment), "commitment out of range");
        require(encryptedNote.length != 0, "encrypted output note required");
        require(encryptedNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");
        _requirePrivateTransferPublicInputs(publicInputs, nullifier, newCommitment);
        _requireRelayerPolicy(relayerPolicy);
        _requirePrivateTransferStageBBindings(
            publicInputs, nullifier, newCommitment, encryptedNote, relayerPolicy, selector
        );
        require(verifier.verify(proof, publicInputs), "invalid proof");
        require(!nullifiers[nullifier], "nullifier already spent");
        require(!commitments[newCommitment], "commitment exists");

        nullifiers[nullifier] = true;
        commitments[newCommitment] = true;
        uint256 leafIndex = _recordCommitmentRoot(newCommitment);

        emit NullifierSpent(nullifier);
        emit PrivateTransferCommitmentInserted(newCommitment, nullifier);
        emit PrivateTransferNoteCreated(
            newCommitment, nullifier, leafIndex, encryptedNote, ENCRYPTED_OUTPUT_NOTE_VERSION
        );
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount
    ) external pure {
        (proof, publicInputs, nullifier, destination, grossAmount);
        revert("bounded withdrawal required");
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
        bytes calldata encryptedOutputNote
    ) external pure {
        (proof, publicInputs, nullifier, destination, grossAmount, encryptedOutputNote);
        revert("bounded withdrawal required");
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes calldata encryptedOutputNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) external nonReentrant {
        _withdraw(
            proof, publicInputs, nullifier, destination, grossAmount, encryptedOutputNote, minNetAmount, maxFeeAmount
        );
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        RelayerPolicy calldata relayerPolicy
    ) external nonReentrant {
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, "", relayerPolicy, msg.sig);
    }

    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes calldata encryptedOutputNote,
        RelayerPolicy calldata relayerPolicy
    ) external nonReentrant {
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, encryptedOutputNote, relayerPolicy, msg.sig);
    }

    function _withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes memory encryptedOutputNote,
        uint256 minNetAmount,
        uint256 maxFeeAmount
    ) private {
        RelayerPolicy memory relayerPolicy = RelayerPolicy({
            relayer: address(0), minNetAmount: minNetAmount, maxFeeAmount: maxFeeAmount, deadlineOrZero: 0
        });
        _withdraw(proof, publicInputs, nullifier, destination, grossAmount, encryptedOutputNote, relayerPolicy, msg.sig);
    }

    function _withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address payable destination,
        uint256 grossAmount,
        bytes memory encryptedOutputNote,
        RelayerPolicy memory relayerPolicy,
        bytes4 selector
    ) private {
        require(nullifier != bytes32(0), "invalid nullifier");
        require(!nullifiers[nullifier], "nullifier already spent");
        require(destination != address(0), "invalid destination");
        require(grossAmount > 0, "withdrawal amount required");
        require(encryptedOutputNote.length <= MAX_ENCRYPTED_NOTE_BYTES, "encrypted note too large");

        uint256 fee = (grossAmount * feeBps) / BPS_DENOMINATOR;
        bytes32 outputCommitment =
            _requireWithdrawalPublicInputs(publicInputs, nullifier, destination, grossAmount, fee);
        _requireRelayerPolicy(relayerPolicy);
        require(relayerPolicy.minNetAmount <= grossAmount, "invalid relayer policy");
        require(isSupportedDenomination(grossAmount), "unsupported exit denomination");
        require(encryptedOutputNote.length != 0, "encrypted output note required");
        _requireWithdrawalStageBBindings(
            publicInputs,
            nullifier,
            destination,
            grossAmount,
            fee,
            outputCommitment,
            encryptedOutputNote,
            relayerPolicy,
            selector
        );
        require(verifier.verify(proof, publicInputs), "invalid proof");
        uint256 netAmount = grossAmount - fee;
        require(fee <= relayerPolicy.maxFeeAmount, "fee exceeds user bound");
        require(netAmount >= relayerPolicy.minNetAmount, "net amount below user minimum");

        uint256 unsweptFees = accruedProtocolFees - feeSweptAccounting;
        uint256 withdrawableAccounting = totalDepositedAccounting - totalWithdrawnAccounting - accruedProtocolFees;
        require(grossAmount <= withdrawableAccounting, "insufficient accounting liquidity");
        require(grossAmount <= address(this).balance - unsweptFees, "insufficient pool liquidity");

        nullifiers[nullifier] = true;
        accruedProtocolFees += fee;
        totalWithdrawnAccounting += netAmount;
        commitments[outputCommitment] = true;
        uint256 outputLeafIndex = _recordCommitmentRoot(outputCommitment);

        (bool ok,) = destination.call{value: netAmount}("");
        require(ok, "withdraw transfer failed");

        emit NullifierSpent(nullifier);
        emit WithdrawalOutputCommitmentInserted(outputCommitment, nullifier, grossAmount);
        emit WithdrawalOutputNoteCreated(
            outputCommitment,
            nullifier,
            outputLeafIndex,
            grossAmount,
            encryptedOutputNote,
            ENCRYPTED_OUTPUT_NOTE_VERSION
        );
        emit ProtocolFeesAccrued(fee);
        emit WithdrawalExecuted(destination, grossAmount, netAmount, fee);
    }

    function computeRelayerPolicyHash(RelayerPolicy calldata relayerPolicy) external pure returns (bytes32) {
        return _relayerPolicyHash(relayerPolicy);
    }

    function computeEncryptedNoteHash(EncryptedNoteV1 calldata encryptedNote) external view returns (bytes32) {
        return _encryptedNoteHash(encryptedNote);
    }

    function computeDepositEncryptedNoteHash(bytes4 selector, bytes32 commitment, bytes calldata encryptedNote)
        external
        view
        returns (bytes32)
    {
        return _depositEncryptedNoteHash(selector, commitment, encryptedNote);
    }

    function computeDepositContextHash(bytes4 selector, bytes32 commitment, uint256 amount, bytes32 encryptedNoteHash)
        external
        view
        returns (bytes32)
    {
        return _depositContextHash(selector, commitment, amount, encryptedNoteHash);
    }

    function computeOutputEncryptedNoteHash(
        bytes32 shape,
        bytes4 selector,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes calldata encryptedOutputNote
    ) external view returns (bytes32) {
        return _encryptedOutputNoteHash(
            _encryptedOutputNoteV2(shape, selector, nullifier, outputCommitment, encryptedOutputNote)
        );
    }

    function computeProofContextHash(
        bytes32[] calldata publicInputs,
        bytes32 shape,
        bytes4 selector,
        address destination,
        uint256 grossAmount,
        uint256 fee,
        bytes32 encryptedNoteHash,
        RelayerPolicy calldata relayerPolicy
    ) external view returns (bytes32) {
        return _proofContextHash(
            ProofContextV1({
                shape: shape,
                selector: selector,
                root: publicInputs[PUBLIC_INPUT_ROOT],
                nullifier: publicInputs[PUBLIC_INPUT_NULLIFIER],
                destination: destination,
                grossAmount: grossAmount,
                fee: fee,
                encryptedNoteHash: encryptedNoteHash,
                relayerPolicyHash: _relayerPolicyHash(relayerPolicy),
                deadlineOrZero: relayerPolicy.deadlineOrZero
            })
        );
    }

    function sweepFees(address payable destination, uint256 amount) external nonReentrant onlyFeeController {
        require(destination != address(0), "invalid destination");
        require(amount > 0, "sweep amount required");
        require(feeSweptAccounting + amount <= accruedProtocolFees, "sweep exceeds accrued fees");

        feeSweptAccounting += amount;
        (bool ok,) = destination.call{value: amount}("");
        require(ok, "fee sweep failed");

        emit ProtocolFeesSwept(destination, amount);
    }

    function _requirePrivateTransferPublicInputs(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 newCommitment
    ) private view {
        _requirePublicInputsCommon(publicInputs, nullifier);
        require(publicInputs[PUBLIC_INPUT_OUTPUT_COMMITMENT] == newCommitment, "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_DESTINATION] == bytes32(0), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] == bytes32(0), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_FEE] == bytes32(0), "invalid public inputs");
    }

    function _requireWithdrawalPublicInputs(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        uint256 fee
    ) private view returns (bytes32 outputCommitment) {
        _requirePublicInputsCommon(publicInputs, nullifier);
        outputCommitment = publicInputs[PUBLIC_INPUT_OUTPUT_COMMITMENT];
        require(outputCommitment != bytes32(0), "output commitment required");
        require(_isFieldElement(outputCommitment), "commitment out of range");
        require(!commitments[outputCommitment], "commitment exists");
        require(publicInputs[PUBLIC_INPUT_DESTINATION] == _addressToBytes32(destination), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] == bytes32(grossAmount), "invalid public inputs");
        require(publicInputs[PUBLIC_INPUT_FEE] == bytes32(fee), "invalid public inputs");
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

    function _requireStageBBindings(
        bytes32[] calldata publicInputs,
        EncryptedNoteV1 memory encryptedNote,
        ProofContextV1 memory proofContext
    ) private view {
        bytes32 encryptedNoteHash = _encryptedNoteHash(encryptedNote);
        bytes32 proofContextHash = _proofContextHash(proofContext);

        require(publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == encryptedNoteHash, "invalid encrypted note hash");
        require(publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] == proofContextHash, "invalid proof context hash");
    }

    function _requirePrivateTransferStageBBindings(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes memory encryptedOutputNote,
        RelayerPolicy memory relayerPolicy,
        bytes4 selector
    ) private view {
        EncryptedOutputNoteV2 memory encryptedOutputNoteV2 = _encryptedOutputNoteV2(
            PRIVATE_TRANSFER_CONTEXT_SHAPE, selector, nullifier, outputCommitment, encryptedOutputNote
        );
        bytes32 encryptedNoteHash = _encryptedOutputNoteHash(encryptedOutputNoteV2);
        ProofContextV1 memory proofContext;
        proofContext.shape = PRIVATE_TRANSFER_CONTEXT_SHAPE;
        proofContext.selector = selector;
        proofContext.root = publicInputs[PUBLIC_INPUT_ROOT];
        proofContext.nullifier = publicInputs[PUBLIC_INPUT_NULLIFIER];
        proofContext.destination = address(0);
        proofContext.grossAmount = 0;
        proofContext.fee = 0;
        proofContext.encryptedNoteHash = encryptedNoteHash;
        proofContext.relayerPolicyHash = _relayerPolicyHash(relayerPolicy);
        proofContext.deadlineOrZero = relayerPolicy.deadlineOrZero;
        require(publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == encryptedNoteHash, "invalid encrypted note hash");
        require(
            publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] == _proofContextHash(proofContext),
            "invalid proof context hash"
        );
    }

    function _requireWithdrawalStageBBindings(
        bytes32[] calldata publicInputs,
        bytes32 nullifier,
        address destination,
        uint256 grossAmount,
        uint256 fee,
        bytes32 outputCommitment,
        bytes memory encryptedOutputNote,
        RelayerPolicy memory relayerPolicy,
        bytes4 selector
    ) private view {
        EncryptedOutputNoteV2 memory encryptedOutputNoteV2 = _encryptedOutputNoteV2(
            WITHDRAW_CONTEXT_SHAPE, selector, nullifier, outputCommitment, encryptedOutputNote
        );
        bytes32 encryptedNoteHash = _encryptedOutputNoteHash(encryptedOutputNoteV2);
        ProofContextV1 memory proofContext;
        proofContext.shape = WITHDRAW_CONTEXT_SHAPE;
        proofContext.selector = selector;
        proofContext.root = publicInputs[PUBLIC_INPUT_ROOT];
        proofContext.nullifier = publicInputs[PUBLIC_INPUT_NULLIFIER];
        proofContext.destination = destination;
        proofContext.grossAmount = grossAmount;
        proofContext.fee = fee;
        proofContext.encryptedNoteHash = encryptedNoteHash;
        proofContext.relayerPolicyHash = _relayerPolicyHash(relayerPolicy);
        proofContext.deadlineOrZero = relayerPolicy.deadlineOrZero;
        bytes32 proofContextHash = _proofContextHash(proofContext);

        require(publicInputs[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == encryptedNoteHash, "invalid encrypted note hash");
        require(publicInputs[PUBLIC_INPUT_PROOF_CONTEXT_HASH] == proofContextHash, "invalid proof context hash");
    }

    function _requireRelayerPolicy(RelayerPolicy memory relayerPolicy) private view {
        if (relayerPolicy.relayer != address(0)) {
            require(msg.sender == relayerPolicy.relayer, "invalid relayer");
        }
        if (relayerPolicy.deadlineOrZero != 0) {
            require(block.timestamp <= relayerPolicy.deadlineOrZero, "expired relayer policy");
        }
    }

    function _proofContextHash(ProofContextV1 memory context) private view returns (bytes32) {
        bytes memory encoded = new bytes(448);
        bytes32 domain = PROOF_CONTEXT_DOMAIN;
        uint256 version = PROOF_CONTEXT_VERSION;
        uint256 chainId = block.chainid;
        address pool = address(this);
        uint256 scalarField = BN254_SCALAR_FIELD;
        uint256 fieldElement;

        assembly {
            let ptr := add(encoded, 32)
            mstore(ptr, domain)
            mstore(add(ptr, 32), version)
            mstore(add(ptr, 64), chainId)
            mstore(add(ptr, 96), pool)
            mstore(add(ptr, 128), mload(context))
            mstore(add(ptr, 160), mload(add(context, 32)))
            mstore(add(ptr, 192), mload(add(context, 64)))
            mstore(add(ptr, 224), mload(add(context, 96)))
            mstore(add(ptr, 256), mload(add(context, 128)))
            mstore(add(ptr, 288), mload(add(context, 160)))
            mstore(add(ptr, 320), mload(add(context, 192)))
            mstore(add(ptr, 352), mload(add(context, 224)))
            mstore(add(ptr, 384), mload(add(context, 256)))
            mstore(add(ptr, 416), mload(add(context, 288)))
            fieldElement := mod(keccak256(ptr, 448), scalarField)
        }

        return bytes32(fieldElement);
    }

    function _depositContextHash(bytes4 selector, bytes32 commitment, uint256 amount, bytes32 encryptedNoteHash)
        private
        view
        returns (bytes32)
    {
        return _hashToField(
            abi.encode(
                DEPOSIT_CONTEXT_DOMAIN,
                PROOF_CONTEXT_VERSION,
                block.chainid,
                address(this),
                DEPOSIT_CONTEXT_SHAPE,
                selector,
                commitment,
                amount,
                encryptedNoteHash
            )
        );
    }

    function _depositEncryptedNoteHash(bytes4 selector, bytes32 commitment, bytes memory encryptedNote)
        private
        view
        returns (bytes32)
    {
        return _encryptedNoteHash(
            _encryptedNoteV1(DEPOSIT_CONTEXT_SHAPE, selector, bytes32(0), commitment, encryptedNote)
        );
    }

    function _encryptedNoteHash(EncryptedNoteV1 memory encryptedNote) private view returns (bytes32) {
        return _hashToField(
            abi.encode(
                ENCRYPTED_NOTE_HASH_DOMAIN,
                ENCRYPTED_NOTE_VERSION,
                block.chainid,
                address(this),
                encryptedNote.shape,
                encryptedNote.selector,
                encryptedNote.nullifier,
                encryptedNote.commitment,
                encryptedNote.encryptedNote
            )
        );
    }

    function _encryptedOutputNoteHash(EncryptedOutputNoteV2 memory outputNote) private view returns (bytes32) {
        return _hashToField(
            abi.encode(
                ENCRYPTED_OUTPUT_NOTE_HASH_DOMAIN_V2,
                ENCRYPTED_OUTPUT_NOTE_VERSION,
                block.chainid,
                address(this),
                outputNote.shape,
                outputNote.selector,
                outputNote.nullifier,
                outputNote.outputCommitment,
                keccak256(outputNote.encryptedOutputNote)
            )
        );
    }

    function _encryptedNoteV1(
        bytes32 shape,
        bytes4 selector,
        bytes32 nullifier,
        bytes32 commitment,
        bytes memory encryptedNote
    ) private pure returns (EncryptedNoteV1 memory) {
        return EncryptedNoteV1({
            shape: shape, selector: selector, nullifier: nullifier, commitment: commitment, encryptedNote: encryptedNote
        });
    }

    function _encryptedOutputNoteV2(
        bytes32 shape,
        bytes4 selector,
        bytes32 nullifier,
        bytes32 outputCommitment,
        bytes memory encryptedOutputNote
    ) private pure returns (EncryptedOutputNoteV2 memory) {
        return EncryptedOutputNoteV2({
            shape: shape,
            selector: selector,
            nullifier: nullifier,
            outputCommitment: outputCommitment,
            encryptedOutputNote: encryptedOutputNote
        });
    }

    function _relayerPolicyHash(RelayerPolicy memory relayerPolicy) private pure returns (bytes32) {
        return _hashToField(
            abi.encode(
                RELAYER_POLICY_DOMAIN,
                PROOF_CONTEXT_VERSION,
                relayerPolicy.relayer,
                relayerPolicy.minNetAmount,
                relayerPolicy.maxFeeAmount,
                relayerPolicy.deadlineOrZero
            )
        );
    }

    function _hashToField(bytes memory encoded) private pure returns (bytes32) {
        return bytes32(uint256(keccak256(encoded)) % BN254_SCALAR_FIELD);
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
            acceptedRoots[expiredRoot] = false;
            emit RootExpired(expiredRoot);
        }

        rootHistory[nextIndex] = nextRoot;
        rootHistoryIndex = nextIndex;
        currentRoot = nextRoot;
        acceptedRoots[nextRoot] = true;

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
