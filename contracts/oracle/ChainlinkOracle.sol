//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../interfaces/IOracle.sol";

contract ChainlinkOracle is IOracle, Ownable {
    AggregatorV3Interface public immutable priceFeed;
    address public immutable token0;
    address public immutable token1;

    constructor(
        address _token0,
        address _token1,
        address _priceFeed
    ) {
        require(_token0 != _token1, "invalid tokens");
        require(_priceFeed != address(0), "invalid price feed");

        token0 = _token0;
        token1 = _token1;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function tokens() external view override returns (address, address) {
        return (token0, token1);
    }

    function getAmountOut(address token, uint256 amount) external override returns (uint256) {
        (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        require(price >= 0, "invalid price");
    }
}
