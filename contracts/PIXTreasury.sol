//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PIXTreasury is Ownable {
    using Address for address;
    using SafeERC20 for IERC20;

    IERC20 public immutable pixToken;
    address public immutable pixNFT;
    address public immutable saleContract;
    address public immutable auctionContract;

    address[] public stakingPools;

    modifier onlyMarket() {
        require(
            msg.sender == saleContract || msg.sender == auctionContract,
            "Caller is not market contract"
        );
        _;
    }

    modifier onlyPIX() {
        require(msg.sender == pixNFT, "Caller is not PIX contract");
        _;
    }

    constructor(
        address pixt,
        address pix,
        address sale,
        address auction
    ) {
        require(pixt != address(0), "PIX Token cannot be zero address");
        require(pix != address(0), "PIX cannot be zero address");
        require(sale != address(0), "Sale cannot be zero address");
        require(auction != address(0), "Auction cannot be zero address");
        pixToken = IERC20(pixt);
        pixNFT = pix;
        saleContract = sale;
        auctionContract = auction;
        stakingPools = new address[](3);
    }

    function setStakingPool(uint256 mode, address pool) external onlyOwner {
        require(mode < 3, "Invalid pool mode");
        require(pool.isContract(), "Pool is not a contract");
        stakingPools[mode] = pool;
    }

    function redirectMarket() external onlyMarket {
        uint256 amount = pixToken.balanceOf(address(this));
        pixToken.safeTransfer(stakingPools[0], amount / 3);
        pixToken.safeTransfer(stakingPools[2], (amount * 2) / 3);
    }

    function redirectPIX() external onlyPIX {
        pixToken.safeTransfer(
            stakingPools[1],
            pixToken.balanceOf(address(this))
        );
    }
}
