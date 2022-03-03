//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "../libraries/DecimalMath.sol";
import "../PIXT.sol";

abstract contract PIXLandBaseSale is
    OwnableUpgradeable,
    ERC1155HolderUpgradeable,
    EIP712Upgradeable
{
    using DecimalMath for uint256;

    event Purchased(
        address indexed seller,
        address indexed buyer,
        uint256 indexed saleId,
        uint256 price
    );

    event SaleCancelled(uint256 indexed saleId);

    event TreasuryUpdated(address treasury, uint256 fee, uint256 burnFee);

    struct Treasury {
        address treasury;
        uint256 fee;
        uint256 burnFee;
    }

    // treasury information
    Treasury public treasury;

    // PIXT token
    address public pixToken;
    address public pixLandmark;

    // Whitelisted NFT tokens
    mapping(address => bool) public whitelistedNFTs;

    // Last sale id
    uint256 public lastSaleId;

    modifier onlyWhitelistedNFT(address token) {
        require(whitelistedNFTs[token], "Sale: NOT_WHITELISTED_NFT");
        _;
    }

    function __PIXLandBaseSale_init(address pixt, address pixLand) internal initializer {
        require(pixt != address(0), "Sale: INVALID_PIXT");
        require(pixLand != address(0), "Sale: INVALID_PIX_LANDMARK");
        pixToken = pixt;
        pixLandmark = pixLand;
        __Ownable_init();
        __ERC1155Holder_init();
        __EIP712_init("PlanetIX", "1");
    }

    function setTreasury(
        address _treasury,
        uint256 _fee,
        uint256 _burnFee
    ) external onlyOwner {
        require(_treasury != address(0), "Sale: INVALID_TREASURY");
        require((_fee + _burnFee).isLessThanAndEqualToDenominator(), "Sale: FEE_OVERFLOWN");
        treasury = Treasury(_treasury, _fee, _burnFee);
        emit TreasuryUpdated(_treasury, _fee, _burnFee);
    }

    function setWhitelistedNFTs(address _token, bool _whitelist) external onlyOwner {
        whitelistedNFTs[_token] = _whitelist;
    }
}
