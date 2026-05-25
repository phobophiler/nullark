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

contract Groth16WithdrawVerifier {
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
    uint256 constant deltax1 = 19547466851582235577642576857773046427878156567764701176236038661137676493137;
    uint256 constant deltax2 = 3774200717028234699111195521732114464738896129336169713184068268403874645149;
    uint256 constant deltay1 = 16974207141453196352704430729805408569306945800819822164785517185368830148358;
    uint256 constant deltay2 = 2560766987762132683846147697130501666282716070012662622539509635244218029142;

    uint256 constant IC0x = 7793953928904016216056515209236116098137663486566889031890609787184561789563;
    uint256 constant IC0y = 5007102578530739690570742940190197698455347208034544007536528887247097457853;

    uint256 constant IC1x = 5044647117237136096290510412654560220503336527653705273263283787494935874008;
    uint256 constant IC1y = 14139779492829968255445047299354008501006891427822744813252305079849988582909;

    uint256 constant IC2x = 13265408109157366141833530005098849623013650077421243648328765315774146520159;
    uint256 constant IC2y = 3403065278308270013004810492759492236954070861506430772652019297387385897783;

    uint256 constant IC3x = 8326562199398621412328628503924294910833076599726817572059602346062366443699;
    uint256 constant IC3y = 11568228107946598366155900324451152826726796402534531278133012529778505481700;

    uint256 constant IC4x = 5998149012762197564026140372902700448516474483837406646014533621650238671630;
    uint256 constant IC4y = 1516709380975897975411685548250086587863027387611339433445032510810094293498;

    uint256 constant IC5x = 8854313040347890339601488250577437237421519363012270657964765529480503437503;
    uint256 constant IC5y = 3102772931882299145903353897643904378840919803548708075151237852641275673215;

    uint256 constant IC6x = 8727835035084874985986144841277846984733014189257386078449382312514227787866;
    uint256 constant IC6y = 413579113999412208561144040575313917008297603538086137576707831495921953373;

    uint256 constant IC7x = 9234399699549104757654456950563693465241349545516900866775483063871831370599;
    uint256 constant IC7y = 9218059972883019485760708657548964512725506095043040694654145734073346612058;

    uint256 constant IC8x = 17906816875907590250192647968264988225417185948074708388526059416333258930030;
    uint256 constant IC8y = 3762376375977532122450903627367968124506891412223715323518060888312355622617;

    uint256 constant IC9x = 18427203213632300575794937616859028193677631992979060274253883685889513406541;
    uint256 constant IC9y = 1641104871317602655071870925716247446867516067021100117676434866732125642952;

    uint256 constant IC10x = 7930345226518561947749255530679141670706314154076426688077034027835939305666;
    uint256 constant IC10y = 17918881395051833921722552747721500856303776231711130734599098204468421137946;

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
