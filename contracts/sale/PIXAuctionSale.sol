//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./PIXBaseSale.sol";
import "../libraries/DecimalMath.sol";

contract PIXAuctionSale is PIXBaseSale, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint64 endTime,
        uint256[] tokenIds,
        uint256 price
    );
    event SaleUpdated(uint256 indexed saleId, uint64 newEndTime, uint256 newPrice);
    event Bid(address indexed bidder, uint256 indexed saleId, uint256 bidAmount);
    event BidCancelled(address indexed bidder, uint256 indexed saleId, uint256 bidAmount);

    struct AuctionSaleInfo {
        address seller; // Seller address
        address nftToken; // NFT token address
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

    function initialize(address _pixt) external initializer {
        __PIXBaseSale_init(_pixt);
        __ReentrancyGuard_init();
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
    ) external onlyWhitelistedNFT(_nftToken) {
        require(_minPrice > 0, "Sale: PRICE_ZERO");
        require(_tokenIds.length > 0, "Sale: NO_TOKENS");
        // solhint-disable-next-line not-rely-on-time
        require(_endTime > block.timestamp, "Sale: INVALID_TIME");

        for (uint256 i; i < _tokenIds.length; i += 1) {
            IERC721Upgradeable(_nftToken).safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }

        lastSaleId += 1;
        saleInfo[lastSaleId] = AuctionSaleInfo({
            seller: msg.sender,
            nftToken: _nftToken,
            endTime: _endTime,
            minPrice: _minPrice,
            tokenIds: _tokenIds
        });

        emit SaleRequested(msg.sender, lastSaleId, _nftToken, _endTime, _tokenIds, _minPrice);
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
        require(_minPrice > 0, "Sale: PRICE_ZERO");
        require(saleInfo[_saleId].seller == msg.sender, "Sale: NOT_SELLER");
        require(saleState[_saleId].bidder == address(0), "Sale: BID_EXIST");
        // solhint-disable-next-line not-rely-on-time
        require(_endTime > block.timestamp, "Sale: INVALID_TIME");

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
        require(_saleInfo.seller == msg.sender, "Sale: NOT_SELLER");
        require(saleState[_saleId].bidder == address(0), "Sale: BID_EXIST");

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721Upgradeable(_saleInfo.nftToken).safeTransferFrom(
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
    function bid(uint256 _saleId, uint256 _amount) external payable nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        AuctionSaleState storage _saleState = saleState[_saleId];
        require(_saleInfo.minPrice > 0, "Sale: INVALID_ID");
        // solhint-disable-next-line not-rely-on-time
        require(_saleInfo.endTime >= block.timestamp, "Sale: ALREADY_ENDED");
        require(
            (_saleState.bidAmount == 0 && _amount >= _saleInfo.minPrice) ||
                (_saleState.bidAmount != 0 && _amount > _saleState.bidAmount),
            "Sale: INVALID_PRICE"
        );

        if (_saleState.bidder != address(0)) {
            pixToken.safeTransfer(_saleState.bidder, _saleState.bidAmount);
        }
        pixToken.safeTransferFrom(msg.sender, address(this), _amount);

        _saleState.bidder = msg.sender;
        _saleState.bidAmount = _amount;

        emit Bid(msg.sender, _saleId, _amount);
    }

    /** @notice cancel bid
     *  @param _saleId Sale ID
     */
    function cancelBid(uint256 _saleId) external nonReentrant {
        AuctionSaleState storage _saleState = saleState[_saleId];
        require(_saleState.bidder == msg.sender, "Sale: NOT_BIDDER");

        pixToken.safeTransfer(msg.sender, _saleState.bidAmount);

        emit BidCancelled(msg.sender, _saleId, _saleState.bidAmount);

        delete saleState[_saleId];
    }

    /** @notice end auction and give PIX to top bidder
     *  @param _saleId PIX tokenID for sale
     */
    function endAuction(uint256 _saleId) external nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        AuctionSaleState storage _saleState = saleState[_saleId];

        require(_saleState.bidder != address(0), "Sale: NO_BIDS");
        // solhint-disable-next-line not-rely-on-time
        require(_saleInfo.endTime <= block.timestamp, "!Sale: ALREADY_ENDED");

        uint256 fee = _saleState.bidAmount.decimalMul(landTreasury.fee);
        pixToken.safeTransfer(_saleInfo.seller, _saleState.bidAmount - fee);
        if (fee > 0) {
            pixToken.safeTransfer(landTreasury.treasury, fee);
        }

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                _saleState.bidder,
                _saleInfo.tokenIds[i]
            );
        }

        emit Purchased(_saleInfo.seller, _saleState.bidder, _saleId, _saleState.bidAmount);

        delete saleInfo[_saleId];
        delete saleState[_saleId];
    }
}
