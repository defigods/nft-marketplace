//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../base/PIXBaseSale.sol";
import "../libraries/DecimalMath.sol";

contract PIXAuctionSale is PIXBaseSale, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint64 endTime,
        uint256[] tokenIds,
        uint256 price
    );
    event SaleUpdated(
        uint256 indexed saleId,
        uint64 newEndTime,
        uint256 newPrice
    );
    event Bid(
        address indexed bidder,
        uint256 indexed saleId,
        uint256 bidAmount
    );
    event BidCancelled(
        address indexed bidder,
        uint256 indexed saleId,
        uint256 bidAmount
    );

    struct AuctionSaleInfo {
        address seller; // Seller address
        address nftToken; // Nft token address
        uint64 endTime; // Auction end time
        uint256 minPrice; // min auction price
        uint256[] tokenIds; // List of tokenIds
    }

    struct AuctionSaleState {
        address bidder; // Bidder address
        uint256 bidAmount; // Bid price
    }

    mapping(uint256 => AuctionSaleInfo) public saleInfo;
    mapping(uint256 => AuctionSaleState) public saleState;

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
     *  @param _endTime Auction end time
     *  @param _minPrice fixed sale price
     */
    function requestSale(
        address _nftToken,
        uint256[] calldata _tokenIds,
        uint64 _endTime,
        uint256 _minPrice
    ) external onlyWhitelistedNftToken(_nftToken) {
        require(_minPrice > 0, ">0");
        require(_tokenIds.length > 0, "No tokens");
        // solhint-disable-next-line not-rely-on-time
        require(_endTime > block.timestamp, "invalid time");

        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            IERC721(_nftToken).safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i]
            );
        }

        lastSaleId += 1;
        saleInfo[lastSaleId] = AuctionSaleInfo({
            seller: msg.sender,
            nftToken: _nftToken,
            endTime: _endTime,
            minPrice: _minPrice,
            tokenIds: _tokenIds
        });

        emit SaleRequested(
            msg.sender,
            lastSaleId,
            _nftToken,
            _endTime,
            _tokenIds,
            _minPrice
        );
    }

    /** @notice update auction info
     *  @dev can update when there is no bid
     *  @param _saleId Sale id to update
     *  @param _endTime new auction end time
     *  @param _minPrice new min price
     */
    function updateSale(
        uint256 _saleId,
        uint64 _endTime,
        uint256 _minPrice
    ) external {
        require(_minPrice > 0, ">0");
        require(saleInfo[_saleId].seller == msg.sender, "!seller");
        require(saleState[_saleId].bidder == address(0), "has bid");
        // solhint-disable-next-line not-rely-on-time
        require(_endTime > block.timestamp, "invalid time");

        saleInfo[_saleId].endTime = _endTime;
        saleInfo[_saleId].minPrice = _minPrice;

        emit SaleUpdated(_saleId, _endTime, _minPrice);
    }

    /** @notice cancel sale request
     *  @dev can cancel when there is no bid
     *  @param _saleId Sale id to cancel
     */
    function cancelSale(uint256 _saleId) external {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.seller == msg.sender, "!seller");
        require(saleState[_saleId].bidder == address(0), "has bid");

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

    /** @notice bid for sale
     *  @param _saleId Sale ID
     *  @param _amount Amount to bid
     */
    function bid(uint256 _saleId, uint256 _amount)
        external
        payable
        nonReentrant
    {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        AuctionSaleState storage _saleState = saleState[_saleId];
        require(_saleInfo.minPrice > 0, "!sale");
        // solhint-disable-next-line not-rely-on-time
        require(_saleInfo.endTime >= block.timestamp, "ended");
        require(
            (_saleState.bidAmount == 0 && _amount >= _saleInfo.minPrice) ||
                (_saleState.bidAmount != 0 && _amount > _saleState.bidAmount),
            "invalid price"
        );

        if (_saleState.bidder != address(0)) {
            pixt.safeTransfer(_saleState.bidder, _saleState.bidAmount);
        }
        pixt.safeTransferFrom(msg.sender, address(this), _amount);

        _saleState.bidder = msg.sender;
        _saleState.bidAmount = _amount;

        emit Bid(msg.sender, _saleId, _amount);
    }

    /** @notice cancel bid
     *  @param _saleId Sale ID
     */
    function cancelBid(uint256 _saleId) external nonReentrant {
        AuctionSaleState storage _saleState = saleState[_saleId];
        require(_saleState.bidder == msg.sender, "!bidder");

        pixt.safeTransfer(msg.sender, _saleState.bidAmount);

        emit BidCancelled(msg.sender, _saleId, _saleState.bidAmount);

        delete saleState[_saleId];
    }

    /** @notice end auction and give PIX to top bidder
     *  @param _saleId PIX tokenID for sale
     */
    function endAuction(uint256 _saleId) external nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        AuctionSaleState storage _saleState = saleState[_saleId];

        require(_saleState.bidder != address(0), "!bid");
        // solhint-disable-next-line not-rely-on-time
        require(_saleInfo.endTime <= block.timestamp, "!ended");

        uint256 fee = _saleState.bidAmount.decimalMul(tradingFeePct);
        pixt.safeTransfer(_saleInfo.seller, _saleState.bidAmount - fee);
        if (fee > 0) {
            pixt.safeTransfer(treasury, fee);
        }

        for (uint256 i = 0; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                _saleState.bidder,
                _saleInfo.tokenIds[i]
            );
        }

        emit Purchased(
            _saleInfo.seller,
            _saleState.bidder,
            _saleId,
            _saleState.bidAmount
        );

        delete saleInfo[_saleId];
        delete saleState[_saleId];
    }
}
