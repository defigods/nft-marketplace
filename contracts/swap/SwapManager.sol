//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "../interfaces/ISwapManager.sol";

contract SwapManager is ISwapManager, Ownable {
    using SafeERC20 for IERC20;

    address public immutable router;
    address public immutable weth;

    constructor(address _router) {
        require(_router != address(0), "router is zero!");
        router = _router;
        weth = IUniswapV2Router02(_router).WETH();
    }

    function swap(
        address srcToken,
        address dstToken,
        uint256 amount,
        address destination
    ) external payable override {
        require(amount > 0, "swap zero");
        if (srcToken == address(0)) {
            // ETH
            require(msg.value == amount, "invalid eth amount");
            address[] memory path = new address[](2);
            path[0] = weth;
            path[1] = dstToken;
            IUniswapV2Router02(router).swapExactETHForTokens{value: amount}(
                0,
                path,
                destination,
                block.timestamp
            );
        } else {
            IERC20(srcToken).safeTransferFrom(msg.sender, address(this), amount);
            IERC20(srcToken).approve(router, amount);
            address[] memory path = new address[](2);
            path[0] = srcToken;
            path[1] = dstToken;
            IUniswapV2Router02(router).swapExactTokensForTokens(
                amount,
                0,
                path,
                destination,
                block.timestamp
            );
        }
    }
}
