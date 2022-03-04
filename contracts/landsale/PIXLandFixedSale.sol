//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../libraries/DecimalMath.sol";
import "./PIXLandBaseSale.sol";

contract PIXLandFixedSale is PIXLandBaseSale {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint256[] tokenIds,
        uint256[] amounts,
        uint256 price
    );

    event SaleUpdated(uint256 indexed saleId, uint256 newPrice);

    event PurchasedWithSignature(
        address indexed seller,
        address indexed buyer,
        address nftToken,
        uint256 tokenId,
        uint256 amount,
        uint256 price
    );

    struct FixedSaleInfo {
        address seller; // Seller address
        address nftToken; // NFT token address
        uint256 price; // Fixed sale price
        uint256[] tokenIds; // List of tokenIds
        uint256[] amounts; // List of amounts per each tokenId
    }

    mapping(uint256 => FixedSaleInfo) public saleInfo;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public nonces;

    bytes32 private constant BID_MESSAGE =
        keccak256(
            "BidMessage(address bidder,uint256 price,address nftToken,uint256 tokenId,uint256 amount,uint256 nonce)"
        );

    address public burnHolder;

    mapping(address => mapping(uint256 => uint256)) public noncesForSale;

    bytes32 private constant OFFER_MESSAGE =
        keccak256("OfferMessage(address bidder,uint256 price,uint256 saleId,uint256 nonce)");

    function initialize(address _pixt, address _pixLand) external initializer {
        __PIXLandBaseSale_init(_pixt, _pixLand);
    }

    /** @notice request sale for fixed price
     *  @param _nftToken NFT token address for sale
     *  @param _tokenIds List of tokenIds
     *  @param _price fixed sale price
     */
    function requestSale(
        address _nftToken,
        uint256[] calldata _tokenIds,
        uint256[] calldata _amounts,
        uint256 _price
    ) external onlyWhitelistedNFT(_nftToken) {
        require(_price > 0, "Sale: PRICE_ZERO");
        require(
            _tokenIds.length > 0 && _tokenIds.length == _amounts.length,
            "Sale: INVALID_ARGUMENTS"
        );

        for (uint256 i; i < _tokenIds.length; i += 1) {
            IERC1155Upgradeable(_nftToken).safeTransferFrom(
                msg.sender,
                address(this),
                _tokenIds[i],
                _amounts[i],
                ""
            );
        }

        _registerSaleRequest(msg.sender, _nftToken, _price, _tokenIds, _amounts);
    }

    /** @notice update sale info
     *  @param _saleId Sale id to update
     *  @param _price new price
     */
    function updateSale(uint256 _saleId, uint256 _price) external {
        require(saleInfo[_saleId].seller == msg.sender, "Sale: NOT_SELLER");
        require(_price > 0, "Sale: PRICE_ZERO");

        saleInfo[_saleId].price = _price;

        emit SaleUpdated(_saleId, _price);
    }

    /** @notice cancel sale request
     *  @param _saleId Sale id to cancel
     */
    function cancelSale(uint256 _saleId) external {
        FixedSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.seller == msg.sender, "Sale: NOT_SELLER");

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC1155Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i],
                _saleInfo.amounts[i],
                ""
            );
        }

        emit SaleCancelled(_saleId);
        delete saleInfo[_saleId];
    }

    /** @notice purchase NFT in fixed price
     *  @param buyer buyer address
     *  @param price bid amount
     *  @param nftToken nft token address
     *  @param tokenId nft token id
     *  @param amount token amount
     */
    function sellNFTWithSignature(
        address buyer,
        uint256 price,
        address nftToken,
        uint256 tokenId,
        uint256 amount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyWhitelistedNFT(nftToken) {
        _checkBidSignature(buyer, price, nftToken, tokenId, amount, v, r, s);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        _acceptPaymentForSell(msg.sender, buyer, price);

        IERC1155Upgradeable(nftToken).safeTransferFrom(msg.sender, buyer, tokenId, amount, "");

        emit PurchasedWithSignature(msg.sender, buyer, nftToken, tokenId, amount, price);
    }

    function _checkBidSignature(
        address buyer,
        uint256 price,
        address nftToken,
        uint256 tokenId,
        uint256 amount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 nonce = nonces[buyer][nftToken][tokenId]++;
        bytes32 structHash = keccak256(
            abi.encode(BID_MESSAGE, buyer, price, nftToken, tokenId, amount, nonce)
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == buyer, "Sale: INVALID_SIGNATURE");
    }

    /** @notice purchase sale of NFT in fixed price
     *  @param buyer buyer address
     *  @param price bid amount
     *  @param saleId sale id
     */
    function sellSaleWithSignature(
        address buyer,
        uint256 price,
        uint256 saleId,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 nonce = noncesForSale[buyer][saleId]++;
        bytes32 structHash = keccak256(abi.encode(OFFER_MESSAGE, buyer, price, saleId, nonce));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == buyer, "Sale: INVALID_SIGNATURE");

        FixedSaleInfo storage sale = saleInfo[saleId];
        _acceptPaymentForSell(msg.sender, buyer, price);

        for (uint256 i; i < sale.tokenIds.length; i += 1) {
            IERC1155Upgradeable(sale.nftToken).safeTransferFrom(
                address(this),
                buyer,
                sale.tokenIds[i],
                sale.amounts[i],
                ""
            );
        }

        emit Purchased(msg.sender, buyer, saleId, price);
    }

    /** @notice purchase NFT in fixed price
     *  @param _saleId Sale ID
     */
    function purchaseNFT(uint256 _saleId) external {
        FixedSaleInfo memory _saleInfo = saleInfo[_saleId];
        require(_saleInfo.price > 0, "Sale: INVALID_ID");

        _acceptPaymentForSell(_saleInfo.seller, msg.sender, _saleInfo.price);

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC1155Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i],
                _saleInfo.amounts[i],
                ""
            );
        }

        emit Purchased(_saleInfo.seller, msg.sender, _saleId, _saleInfo.price);

        delete saleInfo[_saleId];
    }

    function setBurnHolder(address holder) external onlyOwner {
        burnHolder = holder;
    }

    function _registerSaleRequest(
        address seller,
        address nftToken,
        uint256 price,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) private {
        lastSaleId += 1;
        saleInfo[lastSaleId] = FixedSaleInfo({
            seller: seller,
            nftToken: nftToken,
            price: price,
            tokenIds: tokenIds,
            amounts: amounts
        });

        emit SaleRequested(seller, lastSaleId, nftToken, tokenIds, amounts, price);
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
}
