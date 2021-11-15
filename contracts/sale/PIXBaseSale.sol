//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPIXSale.sol";
import "../libraries/DecimalMath.sol";

abstract contract PIXBaseSale is IPIXSale, Ownable, ERC721Holder {
    using DecimalMath for uint256;

    // treasury information
    Treasury public landTreasury;
    Treasury public pixtTreasury;

    // PIXT token
    IERC20 public immutable pixToken;

    // Whitelisted NFT tokens
    mapping(address => bool) public whitelistedNFTs;

    // Last sale id
    uint256 public lastSaleId;

    modifier onlyWhitelistedNFT(address token) {
        require(whitelistedNFTs[token], "Sale: NOT_WHITELISTED_NFT");
        _;
    }

    constructor(address pixt) {
        require(pixt != address(0), "Sale: INVALID_PIXT");
        pixToken = IERC20(pixt);
    }

    function setTreasury(
        address _treasury,
        uint256 _fee,
        bool _mode
    ) external onlyOwner {
        require(_treasury != address(0), "Sale: INVALID_TREASURY");
        require(_fee.isLessThanAndEqualToDenominator(), "Sale: FEE_OVERFLOWN");
        Treasury memory treasury = Treasury(_treasury, _fee);
        if (_mode) {
            landTreasury = treasury;
        } else {
            pixtTreasury = treasury;
        }

        emit TreasuryUpdated(_treasury, _fee, _mode);
    }

    function setWhitelistedNFTs(address _token, bool _whitelist) external onlyOwner {
        whitelistedNFTs[_token] = _whitelist;
    }
}
