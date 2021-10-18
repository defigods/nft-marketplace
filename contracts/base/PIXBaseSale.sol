//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "../libraries/DecimalMath.sol";

abstract contract PIXBaseSale is Ownable, ERC721Holder {
    using DecimalMath for uint256;

    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint256 tradingFee);
    event Purchased(
        address indexed seller,
        address indexed buyer,
        uint256 indexed saleId,
        address paymentToken,
        uint256 price
    );
    event SaleCancelled(uint256 indexed saleId);

    // treasury address
    address public treasury;

    // trading fee percentage
    uint256 public tradingFeePct;

    // Whitelisted payment tokens
    mapping(address => bool) public whitelistedPaymentTokens;

    // Whitelisted NFT tokens
    mapping(address => bool) public whitelistedNftTokens;

    // Last sale id
    uint256 public lastSaleId;

    modifier onlyWhitelistedPaymentToken(address token) {
        require(whitelistedPaymentTokens[token], "Not whitelisted");
        _;
    }

    modifier onlyWhitelistedNftToken(address token) {
        require(whitelistedNftTokens[token], "Not whitelisted");
        _;
    }

    constructor(address _treasury, uint256 _tradingFeePct) {
        require(_treasury != address(0), "Treasury 0x!");
        require(
            _tradingFeePct.isLessThanAndEqualToDenominator(),
            "Fee overflow"
        );

        treasury = _treasury;
        tradingFeePct = _tradingFeePct;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Treasury 0x!");
        treasury = _treasury;

        emit TreasuryUpdated(_treasury);
    }

    function setTradingFeePct(uint256 _tradingFeePct) external onlyOwner {
        require(
            _tradingFeePct.isLessThanAndEqualToDenominator(),
            "Fee overflow!"
        );
        tradingFeePct = _tradingFeePct;

        emit FeeUpdated(_tradingFeePct);
    }

    function setWhitelistPaymentToken(address _token, bool _whitelist)
        external
        onlyOwner
    {
        whitelistedPaymentTokens[_token] = _whitelist;
    }

    function setWhitelistedNftTokens(address _token, bool _whitelist)
        external
        onlyOwner
    {
        whitelistedNftTokens[_token] = _whitelist;
    }
}
