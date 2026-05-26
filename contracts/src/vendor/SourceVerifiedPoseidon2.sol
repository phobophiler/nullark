// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

contract SourceVerifiedPoseidon2 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256) {
        uint256[2] memory values = [input[0], input[1]];
        return PoseidonT3.hash(values);
    }
}
