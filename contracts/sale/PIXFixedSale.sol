//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../base/PIXBaseSale.sol";
import "../libraries/DecimalMath.sol";

contract PIXFixedSale is PIXBaseSale {
    using SafeERC20 for IERC20;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint256[] tokenIds,
        uint256 price
    );
    event SaleUpdated(uint256 indexed saleId, uint256 newPrice);

    struct FixedSaleInfo {
        address seller; // Seller address
        address nftToken; // Nft token address
        uint256 price; // Fixed sale price
        uint256[] tokenIds; // List of tokenIds
    }

    mapping(uint256 => FixedSaleInfo) public saleInfo;

    constructor(
        address _treasury,
        uint256 _tradingFeePct,
        address _pixt
    )
        PIXBaseSale(_treasury, _tradingFeePct, _pixt)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /** @notice request sale for fixed price
     *  @param _nftToken NFT token address for sale
     *  @param _tokenIds List of tokenIds
     *  @param _price fixed sale price
     */
    function requestSale(
        address _nftToken,
        uint256[] calldata _tokenIds,
        uint256 _price
    ) external onlyWhitelistedNftToken(_nftToken) {
        require(_price > 0, ">0");
        require(_tokenIds.length > 0, "No tokens");

        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            IERC721(_nftToken).safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
        }

        lastSaleId += 1;
        saleInfo[lastSaleId] = FixedSaleInfo({
            seller: msg.sender,
            nftToken: _nftToken,
            price: _price,
            tokenIds: _tokenIds
        });

        emit SaleRequested(
            msg.sender,
            lastSaleId,
            _nftToken,
            _tokenIds,
            _price
        );
    }

    /** @notice update sale info
     *  @param _saleId Sale id to update
     *  @param _price new price
     */
    function updateSale(uint256 _saleId, uint256 _price) external {
        require(saleInfo[_saleId].seller == msg.sender, "!seller");
        require(_price > 0, ">0");

        saleInfo[_saleId].price = _price;

        emit SaleUpdated(_saleId, _price);
    }

    /** @notice cancel sale request
     *  @param _saleId Sale id to cancel
     */
    function cancelSale(uint256 _saleId) external {
        FixedSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.seller == msg.sender, "!seller");

        for (uint256 i = 0; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i]
            );
        }

        emit SaleCancelled(_saleId);

        delete saleInfo[_saleId];
    }

    /** @notice purchase PIX in fixed price
     *  @param _saleId Sale ID
     */
    function purchasePIX(uint256 _saleId) external payable {
        FixedSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.price > 0, "!sale");

        uint256 fee = _saleInfo.price.decimalMul(tradingFeePct);
        pixt.safeTransferFrom(
            msg.sender,
            _saleInfo.seller,
            _saleInfo.price - fee
        );
        if (fee > 0) {
            pixt.safeTransferFrom(msg.sender, treasury, fee);
        }

        for (uint256 i = 0; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i]
            );
        }

        emit Purchased(_saleInfo.seller, msg.sender, _saleId, _saleInfo.price);

        delete saleInfo[_saleId];
    }
}
