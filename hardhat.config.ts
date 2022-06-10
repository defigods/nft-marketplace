import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-web3';
import 'hardhat-deploy';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'dotenv/config';
import 'hardhat-dependency-compiler';
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
      accounts: [process.env.PRIVATE_KEY],
    },
    testnet: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      chainId: 80001,
      accounts: [process.env.PRIVATE_KEY],
    },
    eth: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      chainId: 1,
      accounts: [process.env.PRIVATE_KEY],
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`,
      chainId: 4,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    proxyAdmin: {
      137: '0xdcEcfaC75FB9E46EA2759F8932d5c5D00f8c96Fd',
      80001: '0x736316f40b36472d447fc86b7ff78484e4261ad1',
    },
    ixtToken: {
      137: '0xE06Bd4F5aAc8D0aA337D13eC88dB6defC6eAEefE',
      80001: '0xae5039fc6D8360008419E169d54F1C81c665c55D',
    },
    ixtMaticLpToken: {
      137: '0x014ac2a53aa6fba4dcd93fde6d3c787b79a1a6e6',
      80001: '0x4E35eB336A9D1ACC2B2626874B5e2bfA22571a23',
    },
    ixtUsdtLpToken: {
      137: '0x304e57c752e854e9a233ae82fcc42f7568b81180',
      80001: '0xd391B55DbA3572033fCA80644071dBC5E0573b2B',
    },
    pixNFT: {
      137: '0xB2435253C71FcA27bE41206EB2793E44e1Df6b6D',
      80001: '0x4BDcFa73220358b2072D58BD30ac565Ed1111B0c',
    },
    pixLandmark: {
      137: '0x9AfB93F1E6D9b13546C4050BA39f0B48a4FB13A7',
      80001: '0x86D5B7f00eF93244eC53A2Ae982F8E5AF47B4Fd7',
    },
  },
  dependencyCompiler: {
    paths: [
      '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
      '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
    ],
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
    version: '0.8.2',
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
