//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PIXT is ERC20("PIXT", "PIXT") {
    constructor(uint256 totalSupply) {
        _mint(msg.sender, totalSupply);
    }
}
