// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {MockVerifier} from "../src/verifiers/MockVerifier.sol";

contract MockVerifierTest is Test {
    function testMockVerifierCanReject() public {
        MockVerifier verifier = new MockVerifier();
        verifier.setShouldVerify(false);

        bytes32[] memory inputs = new bytes32[](verifier.expectedPublicInputsLength());
        assertFalse(verifier.verify("", inputs));
    }

    function testMockVerifierRejectsUnexpectedInputLength() public {
        MockVerifier verifier = new MockVerifier();
        bytes32[] memory inputs = new bytes32[](verifier.expectedPublicInputsLength() - 1);

        assertFalse(verifier.verify("", inputs));
    }
}
