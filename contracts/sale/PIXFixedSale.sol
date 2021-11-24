//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "../libraries/DecimalMath.sol";
import "./PIXBaseSale.sol";

contract PIXFixedSale is PIXBaseSale, EIP712Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    event SaleRequested(
        address indexed seller,
        uint256 indexed saleId,
        address nftToken,
        uint256[] tokenIds,
        uint256 price
    );

    event SaleUpdated(uint256 indexed saleId, uint256 newPrice);

    event PurchasedWithSignature(
        address indexed seller,
        address indexed buyer,
        address nftToken,
        uint256 tokenId,
        uint256 price
    );

    struct FixedSaleInfo {
        address seller; // Seller address
        address nftToken; // NFT token address
        uint256 price; // Fixed sale price
        uint256[] tokenIds; // List of tokenIds
    }

    mapping(uint256 => FixedSaleInfo) public saleInfo;
    mapping(address => uint256) public nonces;

    bytes32 private constant BID_MESSAGE =
        keccak256(
            "BidMessage(address bidder,uint256 price,address nftToken,uint256 tokenId,uint256 nonce)"
        );

    function initialize(address _pixt, address _pix) external initializer {
        __PIXBaseSale_init(_pixt, _pix);
        __EIP712_init("PlanetIX", "1");
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
    ) external onlyWhitelistedNFT(_nftToken) {
        require(_price > 0, "Sale: PRICE_ZERO");
        require(_tokenIds.length > 0, "Sale: NO_TOKENS");

        for (uint256 i; i < _tokenIds.length; i += 1) {
            IERC721Upgradeable(_nftToken).safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }

        lastSaleId += 1;
        saleInfo[lastSaleId] = FixedSaleInfo({
            seller: msg.sender,
            nftToken: _nftToken,
            price: _price,
            tokenIds: _tokenIds
        });

        emit SaleRequested(msg.sender, lastSaleId, _nftToken, _tokenIds, _price);
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
            IERC721Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i]
            );
        }

        emit SaleCancelled(_saleId);

        delete saleInfo[_saleId];
    }

    /** @notice purchase NFT in fixed price
     *  @param _saleId Sale ID
     */
    function purchaseNFT(uint256 _saleId) external {
        FixedSaleInfo storage _saleInfo = saleInfo[_saleId];
        require(_saleInfo.price > 0, "Sale: INVALID_ID");

        Treasury memory treasury;
        if (_saleInfo.nftToken == pixNFT && IPIX(pixNFT).pixesInLand(_saleInfo.tokenIds)) {
            treasury = landTreasury;
        } else {
            treasury = pixtTreasury;
        }

        uint256 fee = _saleInfo.price.decimalMul(treasury.fee);
        uint256 burnFee = _saleInfo.price.decimalMul(treasury.burnFee);
        IERC20Upgradeable(pixToken).safeTransferFrom(
            msg.sender,
            _saleInfo.seller,
            _saleInfo.price - fee - burnFee
        );
        if (fee > 0) {
            IERC20Upgradeable(pixToken).safeTransferFrom(msg.sender, treasury.treasury, fee);
        }
        if (burnFee > 0) {
            ERC20BurnableUpgradeable(pixToken).burnFrom(msg.sender, burnFee);
        }

        for (uint256 i; i < _saleInfo.tokenIds.length; i += 1) {
            IERC721Upgradeable(_saleInfo.nftToken).safeTransferFrom(
                address(this),
                msg.sender,
                _saleInfo.tokenIds[i]
            );
        }

        emit Purchased(_saleInfo.seller, msg.sender, _saleId, _saleInfo.price);

        delete saleInfo[_saleId];
    }

    /** @notice purchase not-on-sale NFT in fixed price
     *
     */
    function sellNFTWithSignature(
        address buyer,
        uint256 price,
        address nftToken,
        uint256 tokenId,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 nonce = nonces[buyer]++;
        bytes32 structHash = keccak256(
            abi.encode(BID_MESSAGE, buyer, price, nftToken, tokenId, nonce)
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == buyer, "Sale: INVALID_SIGNATURE");

        address _buyer = buyer;
        uint256 _price = price;
        address _nftToken = nftToken;
        uint256 _tokenId = tokenId;

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = _tokenId;

        Treasury memory treasury;
        if (_nftToken == pixNFT && IPIX(pixNFT).pixesInLand(tokenIds)) {
            treasury = landTreasury;
        } else {
            treasury = pixtTreasury;
        }

        uint256 fee = _price.decimalMul(treasury.fee);
        uint256 burnFee = _price.decimalMul(treasury.burnFee);
        uint256 tradeAmount = _price - fee - burnFee;
        IERC20Upgradeable(pixToken).safeTransferFrom(_buyer, msg.sender, tradeAmount);
        if (fee > 0) {
            IERC20Upgradeable(pixToken).safeTransferFrom(_buyer, treasury.treasury, fee);
        }
        if (burnFee > 0) {
            ERC20Burnable(pixToken).burnFrom(_buyer, burnFee);
        }

        IERC721Upgradeable(_nftToken).safeTransferFrom(msg.sender, _buyer, _tokenId);

        emit PurchasedWithSignature(msg.sender, _buyer, _nftToken, _tokenId, _price);
    }
}
