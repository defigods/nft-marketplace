//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRNG {
    function getRandomNumber() external returns (bytes32 requestId);
}
