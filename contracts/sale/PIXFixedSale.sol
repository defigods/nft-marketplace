//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../base/PIXBaseSale.sol";
import "../libraries/DecimalMath.sol";

contract PIXFixedSale is PIXBaseSale {
    using SafeERC20 for IERC20;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed tokenId,
        address indexed token,
        uint256 price
    );
    event SaleUpdated(
        uint256 indexed tokenId,
        address indexed token,
        uint256 newPrice
    );
    event SaleCancelled(uint256 indexed tokenId);

    struct FixedSaleInfo {
        address seller; // Seller address
        address token; // Sell token - address(0) is Eth
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
     *  @param _token Token address for sale
     *  @param _price fixed sale price
     */
    function requestSale(
        uint256 _tokenId,
        address _token,
        uint256 _price
    ) external {
        require(_price > 0, ">0");
        require(saleInfo[_tokenId].price == 0, "already!");

        pixCluster.safeTransferFrom(msg.sender, address(this), _tokenId);

        saleInfo[_tokenId] = FixedSaleInfo({
            seller: msg.sender,
            token: _token,
            price: _price
        });

        emit SaleRequested(msg.sender, _tokenId, _token, _price);
    }

    /** @notice update sale info
     *  @param _tokenId PIX tokenID for sale
     *  @param _token new token address
     *  @param _price new price
     */
    function updateSale(
        uint256 _tokenId,
        address _token,
        uint256 _price
    ) external {
        require(_price > 0, ">0");
        require(saleInfo[_tokenId].price != 0, "!sale");
        require(saleInfo[_tokenId].seller == msg.sender, "!seller");

        saleInfo[_tokenId].token = _token;
        saleInfo[_tokenId].price = _price;

        emit SaleUpdated(_tokenId, _token, _price);
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

        delete saleInfo[_tokenId];
    }

    /** @notice purchase PIX in fixed price
     *  @param _tokenId PIX tokenID for sale
     */
    function purchasePIX(uint256 _tokenId) external payable {
        FixedSaleInfo storage _saleInfo = saleInfo[_tokenId];
        require(_saleInfo.price > 0, "!sale");

        uint256 fee = _saleInfo.price.decimalMul(tradingFeePct);
        if (_saleInfo.token == address(0)) {
            require(_saleInfo.price == msg.value, "!price");
            (bool success, ) = _saleInfo.seller.call{
                value: _saleInfo.price - fee
            }("");
            require(success, "Transfer failed!");
            if (fee > 0) {
                (success, ) = treasury.call{value: fee}("");
                require(success, "Transfer failed!");
            }
        } else {
            IERC20(_saleInfo.token).safeTransferFrom(
                msg.sender,
                _saleInfo.seller,
                _saleInfo.price - fee
            );
            if (fee > 0) {
                IERC20(_saleInfo.token).safeTransferFrom(
                    msg.sender,
                    treasury,
                    _saleInfo.price
                );
            }
        }

        pixCluster.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit Purchased(
            _saleInfo.seller,
            msg.sender,
            _tokenId,
            _saleInfo.token,
            _saleInfo.price
        );

        delete saleInfo[_tokenId];
    }
}
