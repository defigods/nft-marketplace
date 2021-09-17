//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PIXBaseSale.sol";

contract PIXFixedSale is PIXBaseSale {
    event SaleRequested(
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price
    );
    event SaleUpdated(uint256 indexed tokenId, uint256 newPrice);
    event SaleCancelled(uint256 indexed tokenId);
    event Purchased(
        address indexed seller,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 price
    );

    struct FixedSaleInfo {
        address seller; // Seller address
        uint256 price; // Fixed sale price
    }

    mapping(uint256 => FixedSaleInfo) public saleInfo;

    constructor(
        address _pixCluster,
        address _treasury,
        uint256 _tradingFeePct
    ) PIXBaseSale(_pixCluster, _treasury, _tradingFeePct) {}

    /** @notice request sale for fixed price
     *  @param _tokenId PIX tokenID for sale
     *  @param _price fixed sale price
     */
    function requestSale(uint256 _tokenId, uint256 _price) external {
        require(_price > 0, ">0");
        require(saleInfo[_tokenId].price == 0, "already!");

        pixCluster.safeTransferFrom(msg.sender, address(this), _tokenId);

        saleInfo[_tokenId] = FixedSaleInfo({seller: msg.sender, price: _price});

        emit SaleRequested(msg.sender, _tokenId, _price);
    }

    /** @notice update sale price
     *  @param _tokenId PIX tokenID for sale
     *  @param _price new price
     */
    function updateSale(uint256 _tokenId, uint256 _price) external {
        require(_price > 0, ">0");
        require(saleInfo[_tokenId].price != 0, "!sale");
        require(saleInfo[_tokenId].seller == msg.sender, "!seller");

        saleInfo[_tokenId].price = _price;

        emit SaleUpdated(_tokenId, _price);
    }

    /** @notice cancel sale request
     *  @param _tokenId PIX tokenID to cancel
     */
    function cancelSale(uint256 _tokenId) external {
        FixedSaleInfo storage _saleInfo = saleInfo[_tokenId];
        require(_saleInfo.price > 0, "!sale");
        require(_saleInfo.seller == msg.sender, "!seller");

        pixCluster.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit SaleCancelled(_tokenId);

        _saleInfo.seller = address(0);
        _saleInfo.price = 0;
    }

    /** @notice purchase PIX in fixed price
     *  @param _tokenId PIX tokenID for sale
     */
    function purchasePIX(uint256 _tokenId) external payable {
        FixedSaleInfo storage _saleInfo = saleInfo[_tokenId];
        require(_saleInfo.price > 0, "!sale");
        require(_saleInfo.price == msg.value, "!price");

        pixCluster.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit Purchased(_saleInfo.seller, msg.sender, _tokenId, _saleInfo.price);

        _saleInfo.seller = address(0);
        _saleInfo.price = 0;
    }
}
