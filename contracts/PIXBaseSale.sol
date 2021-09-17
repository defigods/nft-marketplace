//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

abstract contract PIXBaseSale is Ownable, ERC721Holder {
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint256 tradingFee);

    uint256 private constant DENOMINATOR = 10000;

    // PIXCluster address
    IERC721 public immutable pixCluster;

    // treasury address
    address public treasury;

    // trading fee percentage
    uint256 public tradingFeePct;

    constructor(
        address _pixCluster,
        address _treasury,
        uint256 _tradingFeePct
    ) {
        require(_pixCluster != address(0), "0x!");
        require(_treasury != address(0), "0x!");
        require(_tradingFeePct <= DENOMINATOR, "overflow");

        pixCluster = IERC721(_pixCluster);
        treasury = _treasury;
        tradingFeePct = _tradingFeePct;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "0x!");
        treasury = _treasury;

        emit TreasuryUpdated(_treasury);
    }

    function setTradingFee(uint256 _tradingFeePct) external onlyOwner {
        require(_tradingFeePct <= DENOMINATOR, "overflow");
        tradingFeePct = _tradingFeePct;

        emit FeeUpdated(_tradingFeePct);
    }
}
