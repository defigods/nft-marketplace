//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../libraries/DecimalMath.sol";
import "../interfaces/IPIX.sol";
import "../interfaces/IPIXMerkleMinter.sol";
import "../PIXT.sol";
import "./PIXBaseSale.sol";
import "hardhat/console.sol";

contract PIXSaleV2 is PIXBaseSale, EIP712Upgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using DecimalMath for uint256;

    event PurchasedV2(
        address indexed seller,
        address indexed buyer,
        bytes32 indexed signature,
        uint256[] idx,
        uint256 price
    );

    struct SaleInfo {
        bool executeBySeller;
        address nftToken;
        uint256[] tokenIds;
        bytes32[] hashes;
        uint256 minPrice;
        uint64 validUntil;
    }

    bytes32 private constant SALE_INFO_MSG =
        keccak256("SaleInfos(address seller,bytes32[] signatures)");

    mapping(bytes32 => mapping(uint256 => bool)) public invalidSales;

    address public burnHolder;
    IPIXMerkleMinter public pixMerkleMinter;

    function initialize(address _pixt, address _pix) external initializer {
        __PIXBaseSale_init(_pixt, _pix);
        __ReentrancyGuard_init();
        __EIP712_init("PlanetIX", "2");
    }

    function buy(
        address seller,
        bytes32[] memory signatures,
        uint256[] memory idx,
        SaleInfo[] memory saleInfos,
        IPIX.PIXInfo[] memory merklePixInfos,
        bytes32[] memory merkleRoot,
        bytes32[][] memory merkleProofs,
        uint256 price,
        bytes memory sig
    ) external nonReentrant {
        address _seller = seller;
        address _buyer = msg.sender;

        bytes32[] memory _signatures = signatures;
        uint256[] memory _idx = idx;
        SaleInfo[] memory _saleInfos = saleInfos;
        IPIX.PIXInfo[] memory _merklePixInfos = merklePixInfos;
        bytes32[] memory _merkleRoot = merkleRoot;
        bytes32[][] memory _merkleProofs = merkleProofs;
        uint256 _price = price;
        bool executeBySeller = false;

        bytes32 signature = _verifySignature(_seller, _signatures, sig);

        (uint256 minPrice, bool isLandNft, bytes32[] memory merkleHashes) = _takeNFTs(
            _seller,
            _buyer,
            signature,
            _signatures,
            _idx,
            _saleInfos,
            _merklePixInfos.length,
            executeBySeller
        );

        isLandNft = _takeNFTsWithMerkleTree(
            _seller,
            _buyer,
            merkleHashes,
            _merklePixInfos,
            _merkleRoot,
            _merkleProofs,
            isLandNft
        );

        require(price >= minPrice, "SaleV2: invalid price");

        _acceptPayment(_seller, _buyer, _price, isLandNft);

        emit PurchasedV2(_seller, _buyer, signature, _idx, _price);
    }

    function executeSale(
        address buyer,
        bytes32[] memory signatures,
        uint256[] memory idx,
        SaleInfo[] memory saleInfos,
        IPIX.PIXInfo[] memory merklePixInfos,
        bytes32[] memory merkleRoot,
        bytes32[][] memory merkleProofs,
        uint256 price,
        bytes memory sig
    ) external nonReentrant {
        address _seller = msg.sender;
        address _buyer = buyer;

        bytes32[] memory _signatures = signatures;
        uint256[] memory _idx = idx;
        SaleInfo[] memory _saleInfos = saleInfos;
        IPIX.PIXInfo[] memory _merklePixInfos = merklePixInfos;
        bytes32[] memory _merkleRoot = merkleRoot;
        bytes32[][] memory _merkleProofs = merkleProofs;
        uint256 _price = price;
        bool executeBySeller = true;

        bytes32 signature = _verifySignature(_seller, _signatures, sig);

        (uint256 minPrice, bool isLandNft, bytes32[] memory merkleHashes) = _takeNFTs(
            _seller,
            _buyer,
            signature,
            _signatures,
            _idx,
            _saleInfos,
            _merklePixInfos.length,
            executeBySeller
        );

        isLandNft = _takeNFTsWithMerkleTree(
            _seller,
            _buyer,
            merkleHashes,
            _merklePixInfos,
            _merkleRoot,
            _merkleProofs,
            isLandNft
        );

        require(price >= minPrice, "SaleV2: invalid price");

        _acceptPayment(_seller, _buyer, _price, isLandNft);

        emit PurchasedV2(_seller, _buyer, signature, _idx, _price);
    }

    function _verifySignature(
        address seller,
        bytes32[] memory signatures,
        bytes memory sig
    ) private view returns (bytes32 signature) {
        (uint8 v, bytes32 r, bytes32 s) = abi.decode(sig, (uint8, bytes32, bytes32));
        bytes32 structHash = keccak256(
            abi.encode(SALE_INFO_MSG, seller, keccak256(abi.encodePacked(signatures)))
        );
        signature = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(signature, v, r, s);
        require(signer == seller, "SaleV2: invalid signature");
    }

    function _takeNFTs(
        address seller,
        address buyer,
        bytes32 signature,
        bytes32[] memory signatures,
        uint256[] memory idx,
        SaleInfo[] memory saleInfos,
        uint256 merkleCount,
        bool executeBySeller
    )
        private
        returns (
            uint256 minPrice,
            bool isLandNft,
            bytes32[] memory merkleHashes
        )
    {
        uint256 len = idx.length;

        address _seller = seller;
        address _buyer = buyer;
        bytes32 _signature = signature;

        uint256 merkleIdx;
        merkleHashes = new bytes32[](merkleCount);

        for (uint256 i = 0; i < len; i += 1) {
            SaleInfo memory info = saleInfos[i];
            require(
                signatures[i] ==
                    keccak256(
                        abi.encodePacked(
                            info.executeBySeller,
                            info.nftToken,
                            info.tokenIds,
                            info.hashes,
                            info.minPrice,
                            info.validUntil
                        )
                    ),
                "SaleV2: invalid sale info"
            );
            uint256 saleIdx = idx[i];
            require(invalidSales[_signature][saleIdx] == false, "SaleV2: cancelled or executed");
            require(whitelistedNFTs[info.nftToken], "SaleV2: NOT_WHITELISTED_NFT");
            require(info.validUntil >= block.timestamp, "SaleV2: expired");
            require(info.executeBySeller == executeBySeller, "SaleV2: invalid");
            minPrice += info.minPrice;
            uint256[] memory tokenIds = info.tokenIds;
            uint256 tokenLength = tokenIds.length;

            for (uint256 j = 0; j < tokenLength; j += 1) {
                IERC721Upgradeable(info.nftToken).safeTransferFrom(_seller, _buyer, tokenIds[j]);
            }

            bytes32[] memory hashes = info.hashes;
            uint256 hashLength = tokenIds.length;

            for (uint256 j = 0; j < hashLength; j += 1) {
                merkleHashes[merkleIdx] = hashes[j];
                merkleIdx += 1;
            }

            if (!isLandNft && info.nftToken == pixNFT && IPIX(pixNFT).pixesInLand(tokenIds)) {
                isLandNft = true;
            }
            invalidSales[_signature][saleIdx] = true;
        }
    }

    function _takeNFTsWithMerkleTree(
        address seller,
        address buyer,
        bytes32[] memory merkleHashes,
        IPIX.PIXInfo[] memory merklePixInfos,
        bytes32[] memory merkleRoots,
        bytes32[][] memory merkleProofs,
        bool _isLandNft
    ) private returns (bool isLandNft) {
        uint256 len = merkleHashes.length;

        address _seller = seller;
        address _buyer = buyer;

        uint256[] memory tokenIds = new uint256[](len);

        for (uint256 i = 0; i < len; i += 1) {
            IPIX.PIXInfo memory info = merklePixInfos[i];
            require(
                merkleHashes[i] ==
                    keccak256(abi.encode(_seller, info.pixId, info.category, info.size)),
                "SaleV2: invalid pix info"
            );

            tokenIds[i] = pixMerkleMinter.mintToNewOwner(
                _buyer,
                _seller,
                info,
                merkleRoots[i],
                merkleProofs[i]
            );
        }

        if (!_isLandNft && IPIX(pixNFT).pixesInLand(tokenIds)) {
            isLandNft = true;
        }
    }

    function _acceptPayment(
        address seller,
        address buyer,
        uint256 price,
        bool isLandNft
    ) private {
        Treasury memory treasury;
        if (isLandNft) {
            treasury = landTreasury;
        } else {
            treasury = pixtTreasury;
        }

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
