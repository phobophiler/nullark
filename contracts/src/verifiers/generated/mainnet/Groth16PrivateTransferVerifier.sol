// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16PrivateTransferVerifier {
    // Scalar field size
    uint256 constant r = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax = 15338199456724848378444385548909129709405272595424296358282402745695186491691;
    uint256 constant alphay = 10709474856717473587885417634126801182216729695717951681956363795809320029121;
    uint256 constant betax1 = 18393849994734458044983512526189208777493594902819022906326659695887074261764;
    uint256 constant betax2 = 14080307758281654550988268276038369157849821277516006235863873485545931445506;
    uint256 constant betay1 = 8936172737604913314618109591753402574914857786359639997084243024150126509239;
    uint256 constant betay2 = 5734654860869051628261999203567766046659775770693630576334524019904524335500;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 19053526124564076598207754160893659474591296121076298922803956778312449419721;
    uint256 constant deltax2 = 4897969476415883871197106856815396566829243058402106287860039144401174923042;
    uint256 constant deltay1 = 3152069883957653887098330651289533723593774696550808551868419782312688249976;
    uint256 constant deltay2 = 9751608229123938770273180377618117408644684456850649048739416746353501491777;

    uint256 constant IC0x = 14569120969225422115636622886944111348089791172238693135614787713529676369578;
    uint256 constant IC0y = 13405831240662701709693452051621558976808620751773877711989048267958480218755;

    uint256 constant IC1x = 18119435835486872450775279937410426781879836558321135031394057383252982267559;
    uint256 constant IC1y = 8533262249102080312255515006313591796854546548720810786067179772535013204692;

    uint256 constant IC2x = 19401421439949015547920472766223979308277481648488225874078314994767356006663;
    uint256 constant IC2y = 5016776157127611251770979739432222486674560422092213982089800171263265394558;

    uint256 constant IC3x = 18049058402455022231567868714960386778689740999934952128327083003032255552363;
    uint256 constant IC3y = 3972324047837250829340535228850323442149018376376704457182501228845111865575;

    uint256 constant IC4x = 156448768898493295258153159552243168938906420381573830033767474330667535992;
    uint256 constant IC4y = 15686600880217239017553632688382745978630938537407242350773014473553513257462;

    uint256 constant IC5x = 271248651102375552394484146159235526703875665193617971138133088802145690287;
    uint256 constant IC5y = 13180735358746296631953500282766758086378222103507607452232850095312089863507;

    uint256 constant IC6x = 229297758014159054244682224764006991668466021410413337160842514238829219954;
    uint256 constant IC6y = 2844157811999622601937010504762370029097660275457728749408318068745656301933;

    uint256 constant IC7x = 20614061803287004144797953243282443509780549763609366621887898722004223375955;
    uint256 constant IC7y = 8074637344586562027400553731015777515441508163478741809791515349786723573190;

    uint256 constant IC8x = 13722986233679478318948522663579131925488070261635048534498575671461257605214;
    uint256 constant IC8y = 10429104686495294659512559206408166030156330679873752305701740816404980572599;

    uint256 constant IC9x = 1474142445871735515559910742781416574499514096365746198454040413273336335219;
    uint256 constant IC9y = 16096116994306078501459510755951163276789442230264457549732167142676665643568;

    uint256 constant IC10x = 915086017351441923053608857195470197405996132636813867450178424913444662819;
    uint256 constant IC10y = 4724135572876169881640292075470740160225713380308999264974470935504483448371;

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[10] calldata _pubSignals
    ) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x

                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))

                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))

                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))

                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))

                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))

                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))

                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))

                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))

                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)

                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F

            checkField(calldataload(add(_pubSignals, 0)))

            checkField(calldataload(add(_pubSignals, 32)))

            checkField(calldataload(add(_pubSignals, 64)))

            checkField(calldataload(add(_pubSignals, 96)))

            checkField(calldataload(add(_pubSignals, 128)))

            checkField(calldataload(add(_pubSignals, 160)))

            checkField(calldataload(add(_pubSignals, 192)))

            checkField(calldataload(add(_pubSignals, 224)))

            checkField(calldataload(add(_pubSignals, 256)))

            checkField(calldataload(add(_pubSignals, 288)))

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
