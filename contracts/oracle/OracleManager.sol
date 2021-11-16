//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IOracleManager.sol";

contract OracleManager is IOracleManager, Ownable {
    event OracleRegistered(address indexed token0, address indexed token1, address indexed oracle);
    event OracleRemoved(address indexed token0, address indexed token1);

    mapping(address => mapping(address => address)) public oracles;

    function registerOracle(
        address token0,
        address token1,
        address oracle
    ) external onlyOwner {
        // address(0) => ETH
        require(token0 != token1, "invalid tokens");
        require(oracle != address(0), "invalid oracle");

        (address tokenA, address tokenB) = IOracle(oracle).tokens();
        if (tokenA == token0) {
            require(tokenB == token1, "token and oracle not match");
        } else if (tokenA == token1) {
            require(tokenB == token0, "token and oracle not match");
        }
        oracles[token0][token1] = oracle;
        oracles[token1][token0] = oracle;

        emit OracleRegistered(token0, token1, oracle);
    }

    function removeOracle(address token0, address token1) external onlyOwner {
        require(oracles[token0][token1] != address(0), "no oracle");

        delete oracles[token0][token1];
        delete oracles[token1][token0];

        emit OracleRemoved(token0, token1);
    }

    function getAmountOut(
        address srcToken,
        address dstToken,
        uint256 amountIn
    ) external override returns (uint256) {
        IOracle oracle = IOracle(oracles[srcToken][dstToken]);

        return oracle.getAmountOut(srcToken, amountIn);
    }
}
