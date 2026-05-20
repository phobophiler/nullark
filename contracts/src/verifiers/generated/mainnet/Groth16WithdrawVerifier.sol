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
    uint256 constant deltax1 = 6588689534418451089943099412892893456591567151172181483639689381753425966452;
    uint256 constant deltax2 = 13381640709949587948572967954912932468754045003597485935201398512233067255553;
    uint256 constant deltay1 = 19833604122472137886511388652707134342642549016809797954463021766720400915500;
    uint256 constant deltay2 = 15880225027188522932768531732429039614685462732405846472569122487777574882966;


    uint256 constant IC0x = 8864733050623935548462953784321106938756596349195048973248994157126715829917;
    uint256 constant IC0y = 10351093797371806246530737849028193045818137539395729449000991996409017118670;

    uint256 constant IC1x = 8793900862275835971967693299720915069649234026846297686476973229063212725702;
    uint256 constant IC1y = 3912984965922228636671803301145436073423258230966506948114239287343447717074;

    uint256 constant IC2x = 19603082586421984249451518351054909240796483127064961945011300887373808442174;
    uint256 constant IC2y = 7379189308899627813306753675202768611985311374772273353506449278738871595871;

    uint256 constant IC3x = 19255245595584984861766650335616453791980421381032993745360432117863869581039;
    uint256 constant IC3y = 13460770847923525280440092077473654730937626298705189515623258143400879684828;

    uint256 constant IC4x = 13988223711049341791872127272440063928818954066955831747125516692056090250396;
    uint256 constant IC4y = 9443814591777360496816254586288187179590672648511231011596591956199569859302;

    uint256 constant IC5x = 6381122089853734215206748017136183360321544290843479359814624239166461335650;
    uint256 constant IC5y = 17159520761361384902252934632625043457076015768038441285705937459264127912293;

    uint256 constant IC6x = 18267607398890862195245557806725268806180364736499109082828130348650357807825;
    uint256 constant IC6y = 10946294536084088826226514968261091406557158621982886457901502145691356148002;

    uint256 constant IC7x = 20493180116127159694941162421117867663427536430646690562578117995187214874046;
    uint256 constant IC7y = 10664670222887299126688271266177083331713126639285822750217867287394873015744;

    uint256 constant IC8x = 3797452634221372275899298078863722361983568460986801973448025520468418198667;
    uint256 constant IC8y = 17526423191342994750065936558326707703939018692505137864785203851838113475433;

    uint256 constant IC9x = 19880283257199382569783470794263230349226254765334676015582588959997211398332;
    uint256 constant IC9y = 14605958441350002239556818994273582585458110626830517534485035733932875053920;

    uint256 constant IC10x = 8616893975596577021253841111065323162146788334174523284440967959959316791669;
    uint256 constant IC10y = 18796214844998655187317801790718548349946621107385510107067831774588225043366;

    uint256 constant IC11x = 20798301044019301637102480912206143408813390571884554114680854113194744505022;
    uint256 constant IC11y = 17721151195517649907398225281538281879671043404654414859799620882021676832852;

    uint256 constant IC12x = 430872558245451965662017405947436802956429296116913081442930349045287073642;
    uint256 constant IC12y = 8872725960681105463818812158194739882616360895746334385003145459925780496926;


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
