import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-web3';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'dotenv/config';
import '@openzeppelin/hardhat-upgrades';

export default {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      timeout: 1000000,
      initialBaseFeePerGas: 0,
    },
    mainnet: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      chainId: 137,
      accounts: [process.env.MAINNET_KEY],
    },
    testnet: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      chainId: 80001,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  typechain: {
    outDir: 'src/types',
    target: 'ethers-v5',
  },
  gasReporter: {
    currency: 'ETH',
  },
  etherscan: {
    apiKey: process.env.API_KEY,
  },
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  mocha: {
    timeout: 2000000,
  },
};
