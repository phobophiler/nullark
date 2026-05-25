// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";
import {LocalPoseidonMerkleFixtures} from "./generated/UNTRUSTED_LOCAL/LocalPoseidonMerkleFixtures.sol";

contract ShieldedPoolInvariantsTest is Test {
    receive() external payable {}

    function testSweptFeesNeverExceedAccruedFees() public {
        MockVerifier verifier = new MockVerifier();
        ShieldedPool pool =
            new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(pool, keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );
        pool.sweepFees(payable(address(this)), pool.accruedProtocolFees());

        assertLe(pool.feeSweptAccounting(), pool.accruedProtocolFees());
    }

    function testPoolAssetsCoverUnsweptFees() public {
        MockVerifier verifier = new MockVerifier();
        ShieldedPool pool =
            new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.withdraw(
            "",
            _withdrawalInputs(pool, keccak256("withdraw-nullifier"), address(0xBEEF), 1 ether),
            keccak256("withdraw-nullifier"),
            payable(address(0xBEEF)),
            1 ether
        );

        uint256 unsweptFees = pool.accruedProtocolFees() - pool.feeSweptAccounting();
        assertGe(address(pool).balance, unsweptFees);
    }

    function testPauseAuthorityCannotRedirectOrSweepPrincipal() public {
        MockVerifier verifier = new MockVerifier();
        ShieldedPool pool =
            new ShieldedPool(address(verifier), address(this), address(0xCAFE), LocalPoseidonMerkleFixtures.deployPoseidonT3());

        pool.deposit{value: 1 ether}(_fieldCommitment("funding"));
        pool.pauseDeposits(true);
        pool.pauseInternalSends(true);

        vm.expectRevert("sweep exceeds accrued fees");
        pool.sweepFees(payable(address(this)), 1 wei);
    }

    function _withdrawalInputs(ShieldedPool pool, bytes32 nullifier, address destination, uint256 grossAmount)
        private
        view
        returns (bytes32[] memory inputs)
    {
        inputs = new bytes32[](pool.PUBLIC_INPUTS_LENGTH());
        inputs[0] = pool.currentRoot();
        inputs[1] = nullifier;
        inputs[3] = bytes32(uint256(uint160(destination)));
        inputs[4] = bytes32(grossAmount);
        inputs[5] = bytes32((grossAmount * pool.WITHDRAWAL_FEE_BPS()) / pool.BPS_DENOMINATOR());
        inputs[6] = bytes32(block.chainid);
        inputs[7] = bytes32(uint256(uint160(address(pool))));
        inputs[8] = _fieldCommitment("funding");
        inputs[9] = bytes32(uint256(1 ether));
    }

    function _fieldCommitment(string memory label) private pure returns (bytes32) {
        return bytes32(uint256(uint160(uint256(keccak256(bytes(label))))));
    }
}
