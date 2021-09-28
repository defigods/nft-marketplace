import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "dotenv/config";

export default {
  networks: {
    hardhat: {},
  },
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 100,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
};
