//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPIXSale {
    event Purchased(
        address indexed seller,
        address indexed buyer,
        uint256 indexed saleId,
        uint256 price
    );

    event SaleCancelled(uint256 indexed saleId);

    event TreasuryUpdated(address treasury, uint256 fee, bool mode);

    struct Treasury {
        address treasury;
        uint256 fee;
    }
}
