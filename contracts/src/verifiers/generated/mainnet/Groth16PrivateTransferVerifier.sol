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
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 19894238337093105710184905065119188502323496113692738651607604190346141549217;
    uint256 constant alphay  = 7298484472052699725360734307070510648575516919844749612069047647511841744565;
    uint256 constant betax1  = 15707224959411985875319505018557247304944465135675747448991613563085966913024;
    uint256 constant betax2  = 19377600051778104169506886432910599324350153067368102647273776453854791009703;
    uint256 constant betay1  = 15285887592697552749044403843610179398365620520171068199818030659294265516741;
    uint256 constant betay2  = 11031911698394848210154431457033361505055766349871984754918178213032490075929;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 21739144018180753233622567559902953550438735054615138714295041515598957890987;
    uint256 constant deltax2 = 12615122893861805893337168445473407978378549478066907200610927281301048664989;
    uint256 constant deltay1 = 8661648809984187441498473133961911502090238179136848389754420499347975239524;
    uint256 constant deltay2 = 5424063152418987437706761230039104652447843942389348235781791460732122038422;


    uint256 constant IC0x = 4309503932518732898305053737432193050439369249140247275571223386576937027353;
    uint256 constant IC0y = 3238188791284417766942935326705181524918822173503943518651301404820831796687;

    uint256 constant IC1x = 535771899715217877160079397225293767889402760979058506383670483365385611477;
    uint256 constant IC1y = 12335076954817176688844980776505252051012043489461703819272082903363636552925;

    uint256 constant IC2x = 6246809709364909263172127822004045593915009063239474326946142448717853959885;
    uint256 constant IC2y = 17909538802083324321095179075227239920116535911113429920323109168242311975737;

    uint256 constant IC3x = 18400933895596699544012776887751041176987727269154749728823554357096624884672;
    uint256 constant IC3y = 9312564148919405089713637404013645056206648259415127397546878324667194978733;

    uint256 constant IC4x = 21040993850448225783492492216695732209957696932929990393225346960323734942772;
    uint256 constant IC4y = 14582494159278408425435114876246383075643633373915324976216477522330594860791;

    uint256 constant IC5x = 20491443481166068524469017975625057185383394234394020089605311458854453029651;
    uint256 constant IC5y = 3550791172262335880630492420993528959988287678183010873993810072918167159861;

    uint256 constant IC6x = 19474373552539080626936862189396714117403972262713310228987666529608135250874;
    uint256 constant IC6y = 18261224217844839871700505634329323464647866104846016314635464005641927199881;

    uint256 constant IC7x = 20113235181186470480709004437894521165399781366821650431222205673408244375275;
    uint256 constant IC7y = 1850601732446752657691056234175677375719326117122754474389817732571196479065;

    uint256 constant IC8x = 18106802422813093689592967312709500745185520087158671786593417454270988260971;
    uint256 constant IC8y = 17696750544021298070933678331207869278988265515133772395860062084108525636022;

    uint256 constant IC9x = 12039726315492410290213744176082122979577441512021126342867407635919671832068;
    uint256 constant IC9y = 7455270233323855791522286854537129426278533319919786791523419875959608939839;

    uint256 constant IC10x = 15141028247367114329078662058795823661730755277103910302991773513749654052635;
    uint256 constant IC10y = 21075807953685385627298555278917774731995329042971278389753675435414237395303;

    uint256 constant IC11x = 20199445559336601794189379177582697879837748605245430609136062157905913711390;
    uint256 constant IC11y = 18244477071196045195754738267435359963762016170455528024461564921785838997492;

    uint256 constant IC12x = 5950057695683933931759882458413749690486521835305559294850705327301083669089;
    uint256 constant IC12y = 8909179389232141651175512139659128961163339047433787483705477222628909927072;


    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[12] calldata _pubSignals) public view returns (bool) {
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

                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))

                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))


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

            checkField(calldataload(add(_pubSignals, 320)))

            checkField(calldataload(add(_pubSignals, 352)))


            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
