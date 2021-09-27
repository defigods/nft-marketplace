//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../base/PIXBaseSale.sol";
import "../libraries/DecimalMath.sol";

contract PIXAuctionSale is PIXBaseSale, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed tokenId,
        address indexed token,
        uint64 endTime,
        uint256 price
    );
    event SaleUpdated(
        uint256 indexed tokenId,
        address indexed token,
        uint256 newPrice
    );
    event SaleCancelled(uint256 indexed tokenId);
    event Bid(
        address indexed bidder,
        uint256 indexed tokenId,
        address indexed token,
        uint256 bidAmount
    );
    event BidCancelled(
        address indexed bidder,
        uint256 indexed tokenId,
        address indexed token,
        uint256 bidAmount
    );

    struct AuctionSaleInfo {
        address seller; // Seller address
        address token; // Sell token - address(0) is Eth
        uint64 endTime; // Auction end time
        uint256 minPrice; // min auction price
    }

    struct AuctionSaleState {
        address bidder; // Bidder address
        uint256 bidAmount; // Bid price
    }

    mapping(uint256 => AuctionSaleInfo) public saleInfo;
    mapping(uint256 => AuctionSaleState) public saleState;

    constructor(
        address _pixCluster,
        address _treasury,
        uint256 _tradingFeePct
    ) PIXBaseSale(_pixCluster, _treasury, _tradingFeePct) {}

    /** @notice request sale for fixed price
     *  @param _tokenId PIX tokenID for sale
     *  @param _token Token address for sale
     *  @param _endTime Auction end time
     *  @param _minPrice fixed sale price
     */
    function requestSale(
        uint256 _tokenId,
        address _token,
        uint64 _endTime,
        uint256 _minPrice
    ) external {
        require(_minPrice > 0, ">0");
        require(_endTime > block.timestamp, "invalid time");
        require(saleInfo[_tokenId].minPrice == 0, "already!");

        pixCluster.safeTransferFrom(msg.sender, address(this), _tokenId);

        saleInfo[_tokenId] = AuctionSaleInfo({
            seller: msg.sender,
            token: _token,
            endTime: _endTime,
            minPrice: _minPrice
        });

        emit SaleRequested(msg.sender, _tokenId, _token, _endTime, _minPrice);
    }

    /** @notice update auction info
     *  @dev can update when there is no bid
     *  @param _tokenId PIX tokenID for sale
     *  @param _token new token address
     *  @param _endTime new auction end time
     *  @param _minPrice new min price
     */
    function updateSale(
        uint256 _tokenId,
        address _token,
        uint64 _endTime,
        uint256 _minPrice
    ) external {
        require(_minPrice > 0, ">0");
        require(saleInfo[_tokenId].minPrice != 0, "!sale");
        require(saleInfo[_tokenId].seller == msg.sender, "!seller");
        require(saleState[_tokenId].bidder == address(0), "has bid");
        require(_endTime > block.timestamp, "invalid time");

        saleInfo[_tokenId].token = _token;
        saleInfo[_tokenId].endTime = _endTime;
        saleInfo[_tokenId].minPrice = _minPrice;

        emit SaleUpdated(_tokenId, _token, _minPrice);
    }

    /** @notice cancel sale request
     *  @dev can cancel when there is no bid
     *  @param _tokenId PIX tokenID to cancel
     */
    function cancelSale(uint256 _tokenId) external {
        AuctionSaleInfo storage _saleInfo = saleInfo[_tokenId];
        require(_saleInfo.minPrice > 0, "!sale");
        require(_saleInfo.seller == msg.sender, "!seller");
        require(saleState[_tokenId].bidder == address(0), "has bid");

        pixCluster.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit SaleCancelled(_tokenId);

        delete saleInfo[_tokenId];
    }

    /** @notice bid for sale
     *  @param _tokenId PIX tokenID for sale
     *  @param _amount Amount to bid
     */
    function bid(uint256 _tokenId, uint256 _amount)
        external
        payable
        nonReentrant
    {
        AuctionSaleInfo storage _saleInfo = saleInfo[_tokenId];
        AuctionSaleState storage _saleState = saleState[_tokenId];
        require(_saleInfo.minPrice > 0, "!sale");
        require(
            (_saleState.bidAmount == 0 && _amount >= _saleInfo.minPrice) ||
                (_saleState.bidAmount != 0 && _amount > _saleState.bidAmount),
            "!invalid price"
        );

        if (_saleInfo.token == address(0)) {
            require(_amount == msg.value, "Invalid amount");
        } else {
            uint256 balanceBefore = IERC20(_saleInfo.token).balanceOf(
                address(this)
            );
            IERC20(_saleInfo.token).safeTransferFrom(
                msg.sender,
                address(this),
                _amount
            );
            require(
                IERC20(_saleInfo.token).balanceOf(address(this)) -
                    balanceBefore ==
                    _amount,
                "Invalid amount"
            );
        }

        _saleState.bidder = msg.sender;
        _saleState.bidAmount = _amount;

        emit Bid(msg.sender, _tokenId, _saleInfo.token, _amount);
    }

    /** @notice cancel bid
     *  @param _tokenId PIX tokenID for sale
     */
    function cancelBid(uint256 _tokenId) external nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[_tokenId];
        AuctionSaleState storage _saleState = saleState[_tokenId];
        require(_saleState.bidder == msg.sender, "!invalid bidder");

        if (_saleInfo.token == address(0)) {
            (bool success, ) = msg.sender.call{value: _saleState.bidAmount}("");
            require(success, "Transfer failed!");
        } else {
            IERC20(_saleInfo.token).safeTransfer(
                msg.sender,
                _saleState.bidAmount
            );
        }

        emit BidCancelled(
            msg.sender,
            _tokenId,
            _saleInfo.token,
            _saleState.bidAmount
        );

        delete saleState[_tokenId];
    }

    /** @notice end auction and give PIX to top bidder
     *  @param _tokenId PIX tokenID for sale
     */
    function endAuction(uint256 _tokenId) external nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[_tokenId];
        AuctionSaleState storage _saleState = saleState[_tokenId];
        require(_saleInfo.endTime > 0, "!sale");
        require(_saleInfo.endTime <= block.timestamp, "!ended");
        require(_saleState.bidder != address(0), "!bid");

        uint256 fee = _saleState.bidAmount.decimalMul(tradingFeePct);
        if (_saleInfo.token == address(0)) {
            (bool success, ) = _saleInfo.seller.call{
                value: _saleState.bidAmount - fee
            }("");
            require(success, "Transfer failed!");
            if (fee > 0) {
                (success, ) = treasury.call{value: fee}("");
                require(success, "Transfer failed!");
            }
        } else {
            IERC20(_saleInfo.token).safeTransferFrom(
                address(this),
                _saleInfo.seller,
                _saleState.bidAmount - fee
            );
            if (fee > 0) {
                IERC20(_saleInfo.token).safeTransferFrom(
                    address(this),
                    treasury,
                    _saleState.bidAmount
                );
            }
        }

        pixCluster.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit Purchased(
            _saleInfo.seller,
            _saleState.bidder,
            _tokenId,
            _saleInfo.token,
            _saleState.bidAmount
        );

        delete saleInfo[_tokenId];
        delete saleState[_tokenId];
    }
}
