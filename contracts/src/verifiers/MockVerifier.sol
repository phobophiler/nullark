// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVerifier} from "../interfaces/IVerifier.sol";

contract MockVerifier is IVerifier {
    bool public shouldVerify = true;
    uint256 public expectedPublicInputsLength = 10;

    function setShouldVerify(bool next) external {
        shouldVerify = next;
    }

    function setExpectedPublicInputsLength(uint256 next) external {
        expectedPublicInputsLength = next;
    }

    function verify(bytes calldata, bytes32[] calldata publicInputs) external view returns (bool) {
        return shouldVerify && publicInputs.length == expectedPublicInputsLength;
    }
}
