// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVerifier} from "../interfaces/IVerifier.sol";

interface IGroth16DepositV12ProofVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[6] calldata pubSignals
    ) external view returns (bool);
}

interface IGroth16SpendV12ProofVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[10] calldata pubSignals
    ) external view returns (bool);
}

contract ActionRoutingGroth16V12Verifier is IVerifier {
    uint256 private constant DEPOSIT_PUBLIC_INPUTS_LENGTH = 6;
    uint256 private constant SPEND_PUBLIC_INPUTS_LENGTH = 10;
    uint256 private constant PROOF_BYTES_LENGTH = 256;
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

    uint256 private constant MEGAETH_MAINNET_CHAIN_ID = 4326;
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    IGroth16DepositV12ProofVerifier public immutable depositVerifier;
    IGroth16SpendV12ProofVerifier public immutable privateTransferVerifier;
    IGroth16SpendV12ProofVerifier public immutable withdrawVerifier;

    constructor(address depositVerifier_, address privateTransferVerifier_, address withdrawVerifier_) {
        require(depositVerifier_ != address(0), "invalid deposit verifier");
        require(privateTransferVerifier_ != address(0), "invalid private verifier");
        require(withdrawVerifier_ != address(0), "invalid withdraw verifier");

        depositVerifier = IGroth16DepositV12ProofVerifier(depositVerifier_);
        privateTransferVerifier = IGroth16SpendV12ProofVerifier(privateTransferVerifier_);
        withdrawVerifier = IGroth16SpendV12ProofVerifier(withdrawVerifier_);
    }

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (proof.length != PROOF_BYTES_LENGTH) {
            return false;
        }

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) =
            abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));

        if (publicInputs.length == DEPOSIT_PUBLIC_INPUTS_LENGTH) {
            return _verifyDeposit(pA, pB, pC, publicInputs);
        }

        if (publicInputs.length == SPEND_PUBLIC_INPUTS_LENGTH) {
            return _verifySpend(pA, pB, pC, publicInputs);
        }

        return false;
    }

    function _verifyDeposit(
        uint256[2] memory pA,
        uint256[2][2] memory pB,
        uint256[2] memory pC,
        bytes32[] calldata publicInputs
    ) private view returns (bool) {
        uint256[6] memory pubSignals = [uint256(0), uint256(0), uint256(0), uint256(0), uint256(0), uint256(0)];

        for (uint256 i; i < DEPOSIT_PUBLIC_INPUTS_LENGTH; i++) {
            uint256 publicInput = uint256(publicInputs[i]);
            if (publicInput >= BN254_SCALAR_FIELD) {
                return false;
            }
            pubSignals[i] = publicInput;
        }

        if (pubSignals[DEPOSIT_PUBLIC_INPUT_AMOUNT] == 0) {
            return false;
        }

        if (!_isSupportedMegaEthChain(pubSignals[DEPOSIT_PUBLIC_INPUT_CHAIN_ID])) {
            return false;
        }

        if (pubSignals[DEPOSIT_PUBLIC_INPUT_VERIFYING_CONTRACT] >= FIRST_NON_ADDRESS_VALUE) {
            return false;
        }

        if (
            pubSignals[DEPOSIT_PUBLIC_INPUT_CONTEXT_HASH] == 0
                || pubSignals[DEPOSIT_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == 0
        ) {
            return false;
        }

        return depositVerifier.verifyProof(pA, pB, pC, pubSignals);
    }

    function _verifySpend(
        uint256[2] memory pA,
        uint256[2][2] memory pB,
        uint256[2] memory pC,
        bytes32[] calldata publicInputs
    ) private view returns (bool) {
        uint256[10] memory pubSignals = [
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0),
            uint256(0)
        ];

        for (uint256 i; i < SPEND_PUBLIC_INPUTS_LENGTH; i++) {
            uint256 publicInput = uint256(publicInputs[i]);
            if (publicInput >= BN254_SCALAR_FIELD) {
                return false;
            }
            pubSignals[i] = publicInput;
        }

        if (!_isSupportedMegaEthChain(pubSignals[SPEND_PUBLIC_INPUT_CHAIN_ID])) {
            return false;
        }

        if (pubSignals[SPEND_PUBLIC_INPUT_VERIFYING_CONTRACT] >= FIRST_NON_ADDRESS_VALUE) {
            return false;
        }

        if (
            pubSignals[SPEND_PUBLIC_INPUT_PROOF_CONTEXT_HASH] == 0
                || pubSignals[SPEND_PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == 0
        ) {
            return false;
        }

        if (_isPrivateTransfer(pubSignals)) {
            return privateTransferVerifier.verifyProof(pA, pB, pC, pubSignals);
        }

        if (_isWithdrawal(pubSignals)) {
            return withdrawVerifier.verifyProof(pA, pB, pC, pubSignals);
        }

        return false;
    }

    function _isPrivateTransfer(uint256[10] memory publicInputs) private pure returns (bool) {
        return publicInputs[SPEND_PUBLIC_INPUT_OUTPUT_COMMITMENT] != 0
            && publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] == 0 && publicInputs[SPEND_PUBLIC_INPUT_GROSS_AMOUNT] == 0
            && publicInputs[SPEND_PUBLIC_INPUT_FEE] == 0;
    }

    function _isWithdrawal(uint256[10] memory publicInputs) private pure returns (bool) {
        return publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] != 0
            && publicInputs[SPEND_PUBLIC_INPUT_DESTINATION] < FIRST_NON_ADDRESS_VALUE
            && publicInputs[SPEND_PUBLIC_INPUT_GROSS_AMOUNT] > 0;
    }

    function _isSupportedMegaEthChain(uint256 chainId) private pure returns (bool) {
        return chainId == MEGAETH_TESTNET_CHAIN_ID || chainId == MEGAETH_MAINNET_CHAIN_ID;
    }
}
