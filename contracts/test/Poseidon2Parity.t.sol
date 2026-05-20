// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {SourceVerifiedPoseidon2} from "../src/vendor/SourceVerifiedPoseidon2.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

interface IPoseidon2ForParity {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

contract Poseidon2ParityTest is Test {
    uint256 private constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IPoseidon2ForParity rawPoseidon;
    SourceVerifiedPoseidon2 sourceVerifiedPoseidon;

    function setUp() public {
        rawPoseidon = IPoseidon2ForParity(LocalPoseidonMerkleFixtures.deployPoseidonT3());
        sourceVerifiedPoseidon = new SourceVerifiedPoseidon2();
    }

    function testFixedVectorParity() public view {
        _assertParity(0, 0);
        _assertParity(1, 2);
        _assertParity(uint256(LocalPoseidonMerkleFixtures.privateTransferSpentCommitment()), 0);
        _assertParity(uint256(LocalPoseidonMerkleFixtures.withdrawSpentCommitment()), 0);
        _assertParity(
            uint256(LocalPoseidonMerkleFixtures.privateTransferSpentCommitment()),
            uint256(LocalPoseidonMerkleFixtures.privateTransferNewCommitment())
        );
    }

    function testFuzzParity(uint256 left, uint256 right) public view {
        _assertParity(left % FIELD_MODULUS, right % FIELD_MODULUS);
    }

    function _assertParity(uint256 left, uint256 right) private view {
        uint256[2] memory memoryInput = [left, right];
        uint256 raw = rawPoseidon.poseidon(memoryInput);
        uint256 sourceVerified = sourceVerifiedPoseidon.poseidon(memoryInput);
        assertEq(sourceVerified, raw);
    }
}
