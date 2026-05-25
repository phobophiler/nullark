// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVerifier} from "../interfaces/IVerifier.sol";

interface IGroth16ProofVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[12] calldata pubSignals
    ) external view returns (bool);
}

contract ActionRoutingGroth16Verifier is IVerifier {
    uint256 private constant PUBLIC_INPUTS_LENGTH = 12;
    uint256 private constant PROOF_BYTES_LENGTH = 256;
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 private constant FIRST_NON_ADDRESS_VALUE = 1 << 160;

    uint256 private constant PUBLIC_INPUT_NEW_COMMITMENT = 2;
    uint256 private constant PUBLIC_INPUT_DESTINATION = 3;
    uint256 private constant PUBLIC_INPUT_GROSS_AMOUNT = 4;
    uint256 private constant PUBLIC_INPUT_FEE = 5;
    uint256 private constant PUBLIC_INPUT_CHAIN_ID = 6;
    uint256 private constant PUBLIC_INPUT_VERIFYING_CONTRACT = 7;
    uint256 private constant PUBLIC_INPUT_PROOF_CONTEXT_HASH = 10;
    uint256 private constant PUBLIC_INPUT_ENCRYPTED_NOTE_HASH = 11;
    uint256 private constant MEGAETH_MAINNET_CHAIN_ID = 4326;
    uint256 private constant MEGAETH_TESTNET_CHAIN_ID = 6343;

    IGroth16ProofVerifier public immutable privateTransferVerifier;
    IGroth16ProofVerifier public immutable withdrawVerifier;

    constructor(address privateTransferVerifier_, address withdrawVerifier_) {
        require(privateTransferVerifier_ != address(0), "invalid private verifier");
        require(withdrawVerifier_ != address(0), "invalid withdraw verifier");

        privateTransferVerifier = IGroth16ProofVerifier(privateTransferVerifier_);
        withdrawVerifier = IGroth16ProofVerifier(withdrawVerifier_);
    }

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != PUBLIC_INPUTS_LENGTH || proof.length != PROOF_BYTES_LENGTH) {
            return false;
        }

        uint256[12] memory pubSignals = [
            uint256(0),
            uint256(0),
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
        for (uint256 i; i < PUBLIC_INPUTS_LENGTH; i++) {
            uint256 publicInput = uint256(publicInputs[i]);
            if (publicInput >= BN254_SCALAR_FIELD) {
                return false;
            }
            pubSignals[i] = publicInput;
        }

        if (pubSignals[PUBLIC_INPUT_VERIFYING_CONTRACT] >= FIRST_NON_ADDRESS_VALUE) {
            return false;
        }

        if (!_isSupportedMegaEthChain(pubSignals[PUBLIC_INPUT_CHAIN_ID])) {
            return false;
        }

        if (pubSignals[PUBLIC_INPUT_PROOF_CONTEXT_HASH] == 0 || pubSignals[PUBLIC_INPUT_ENCRYPTED_NOTE_HASH] == 0) {
            return false;
        }

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) =
            abi.decode(proof, (uint256[2], uint256[2][2], uint256[2]));

        if (_isPrivateTransfer(pubSignals)) {
            return privateTransferVerifier.verifyProof(pA, pB, pC, pubSignals);
        }

        if (_isWithdrawal(pubSignals)) {
            return withdrawVerifier.verifyProof(pA, pB, pC, pubSignals);
        }

        return false;
    }

    function _isPrivateTransfer(uint256[12] memory publicInputs) private pure returns (bool) {
        return publicInputs[PUBLIC_INPUT_NEW_COMMITMENT] != 0 && publicInputs[PUBLIC_INPUT_DESTINATION] == 0
            && publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] == 0 && publicInputs[PUBLIC_INPUT_FEE] == 0;
    }

    function _isWithdrawal(uint256[12] memory publicInputs) private pure returns (bool) {
        return publicInputs[PUBLIC_INPUT_DESTINATION] != 0
            && publicInputs[PUBLIC_INPUT_DESTINATION] < FIRST_NON_ADDRESS_VALUE
            && publicInputs[PUBLIC_INPUT_GROSS_AMOUNT] > 0;
    }

    function _isSupportedMegaEthChain(uint256 chainId) private pure returns (bool) {
        return chainId == MEGAETH_TESTNET_CHAIN_ID || chainId == MEGAETH_MAINNET_CHAIN_ID;
    }
}
