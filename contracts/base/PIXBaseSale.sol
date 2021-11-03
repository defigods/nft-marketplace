//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/DecimalMath.sol";

abstract contract PIXBaseSale is Ownable, ERC721Holder {
    using DecimalMath for uint256;

    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint256 tradingFee);
    event Purchased(
        address indexed seller,
        address indexed buyer,
        uint256 indexed saleId,
        uint256 price
    );
    event SaleCancelled(uint256 indexed saleId);

    // treasury address
    address public treasury;

    // trading fee percentage
    uint256 public tradingFeePct;

    // PIXT token;
    IERC20 public immutable pixt;

    // Whitelisted NFT tokens
    mapping(address => bool) public whitelistedNftTokens;

    // Last sale id
    uint256 public lastSaleId;

    modifier onlyWhitelistedNftToken(address token) {
        require(whitelistedNftTokens[token], "Not whitelisted");
        _;
    }

    constructor(
        address _treasury,
        uint256 _tradingFeePct,
        address _pixt
    ) {
        require(_treasury != address(0), "Treasury 0x!");
        require(
            _tradingFeePct.isLessThanAndEqualToDenominator(),
            "Fee overflow"
        );
        require(_pixt != address(0), "PIXT 0x!");

        treasury = _treasury;
        tradingFeePct = _tradingFeePct;
        pixt = IERC20(_pixt);
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

    function setWhitelistedNftTokens(address _token, bool _whitelist)
        external
        onlyOwner
    {
        whitelistedNftTokens[_token] = _whitelist;
    }
}
