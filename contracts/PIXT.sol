//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract PIXT is Ownable, ERC20PresetMinterPauser("PlanetIX", "IXT") {
    constructor() {
        // initial supply : 140,000,000
        _mint(msg.sender, 140 * 1e24);
    }
}
