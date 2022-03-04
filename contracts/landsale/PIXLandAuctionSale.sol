// solhint-disable not-rely-on-time
//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../libraries/DecimalMath.sol";
import "./PIXLandBaseSale.sol";

contract PIXLandAuctionSale is PIXLandBaseSale, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint64 endTime,
        uint256[] tokenIds,
        uint256[] amounts,
        uint256 price
    );

    event SaleUpdated(uint256 indexed saleId, uint64 newEndTime);

    struct AuctionSaleInfo {
        address seller; // Seller address
        address nftToken; // NFT token address
        uint64 endTime; // Auction end time
        uint256 minPrice; // min auction price
        uint256[] tokenIds; // List of tokenIds
        uint256[] amounts; // List of amounts
    }

    struct AuctionSaleState {
        address bidder; // Bidder address
        uint256 bidAmount; // Bid price
    }

    mapping(uint256 => AuctionSaleInfo) public saleInfo;
    mapping(uint256 => AuctionSaleState) public saleState;
    mapping(address => mapping(uint256 => uint256)) public nonces;

    bytes32 private constant BID_MESSAGE =
        keccak256("BidMessage(address bidder,uint256 price,uint256 saleId,uint256 nonce)");

    address public burnHolder;
    address public operator;

    function initialize(address _pixt, address _pixLand) external initializer {
        __PIXLandBaseSale_init(_pixt, _pixLand);
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
        uint256[] calldata _amounts,
        uint64 _endTime,
        uint256 _minPrice
    ) external onlyWhitelistedNFT(_nftToken) {
        require(_minPrice > 0, "Sale: PRICE_ZERO");
        require(
            _tokenIds.length > 0 && _tokenIds.length == _amounts.length,
            "Sale: INVALID_ARGUMENTS"
        );
        require(_endTime > block.timestamp, "Sale: INVALID_TIME");

        for (uint256 i; i < _tokenIds.length; i += 1) {
            IERC1155Upgradeable(_nftToken).safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i],
                _amounts[i],
                ""
            );
        }

        _registerSaleRequest(msg.sender, _nftToken, _endTime, _minPrice, _tokenIds, _amounts);
    }

    /** @notice update auction info
     *  @param _saleId Sale id to update
     *  @param _endTime new auction end time
     */
    function updateSale(uint256 _saleId, uint64 _endTime) external {
        require(saleInfo[_saleId].seller == msg.sender, "Sale: NOT_SELLER");
        require(_endTime > block.timestamp, "Sale: INVALID_TIME");
        saleInfo[_saleId].endTime = _endTime;
        emit SaleUpdated(_saleId, _endTime);
    }

    /** @notice cancel sale request
     *  @dev can cancel when there is no bid
     *  @param _saleId Sale id to cancel
     */
    function cancelSale(uint256 _saleId) external {
        AuctionSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.seller == msg.sender || msg.sender == operator, "Sale: NOT_SELLER");

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC1155Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                _saleInfo.seller,
                _saleInfo.tokenIds[i],
                _saleInfo.amounts[i],
                ""
            );
        }

        emit SaleCancelled(_saleId);

        delete saleInfo[_saleId];
    }

    /** @notice end auction and give PIX to top bidder
     *  @param buyer buyer address
     *  @param price bid amount
     *  @param saleId auction sale id
     */
    function endAuction(
        address buyer,
        uint256 price,
        uint256 saleId,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        AuctionSaleInfo storage _saleInfo = saleInfo[saleId];
        require(_saleInfo.endTime <= block.timestamp, "!Sale: ALREADY_ENDED");

        uint256 nonce = nonces[buyer][saleId]++;
        bytes32 structHash = keccak256(abi.encode(BID_MESSAGE, buyer, price, saleId, nonce));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == buyer, "Sale: INVALID_SIGNATURE");

        _acceptPaymentForSell(_saleInfo.seller, buyer, price);

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC1155Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                buyer,
                _saleInfo.tokenIds[i],
                _saleInfo.amounts[i],
                ""
            );
        }

        emit Purchased(_saleInfo.seller, buyer, saleId, price);
        delete saleInfo[saleId];
    }

    function _acceptPaymentForSell(
        address seller,
        address buyer,
        uint256 price
    ) private {
        uint256 fee = price.decimalMul(treasury.fee);
        uint256 burnFee = price.decimalMul(treasury.burnFee);
        uint256 tradeAmount = price - fee - burnFee;
        IERC20Upgradeable(pixToken).safeTransferFrom(buyer, seller, tradeAmount);
        if (fee > 0) {
            IERC20Upgradeable(pixToken).safeTransferFrom(buyer, treasury.treasury, fee);
        }
        if (burnFee > 0) {
            if (burnHolder == address(0)) ERC20Burnable(pixToken).burnFrom(buyer, burnFee);
            else IERC20Upgradeable(pixToken).safeTransferFrom(buyer, burnHolder, burnFee);
        }
    }

    function setBurnHolder(address holder) external onlyOwner {
        burnHolder = holder;
    }

    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Sale: INVALID_OPERATOR");
        operator = _operator;
    }

    function _registerSaleRequest(
        address seller,
        address nftToken,
        uint64 endTime,
        uint256 minPrice,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) private {
        lastSaleId += 1;
        saleInfo[lastSaleId] = AuctionSaleInfo({
            seller: seller,
            nftToken: nftToken,
            endTime: endTime,
            minPrice: minPrice,
            tokenIds: tokenIds,
            amounts: amounts
        });

        emit SaleRequested(seller, lastSaleId, nftToken, endTime, tokenIds, amounts, minPrice);
    }
}
