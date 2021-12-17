const { ethers } = require('hardhat');
const { constants } = require('ethers');

async function main() {
  const usdt = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
  const priceFeed = '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0';
  const pixtAddress = '0xE06Bd4F5aAc8D0aA337D13eC88dB6defC6eAEefE';
  const quickSwapFactory = '0x5757371414417b8c6caad45baef941abc7d3ab32';

  const ChainlinkOracle = await ethers.getContractFactory('ChainlinkOracle');
  const chainLinkOracle = await ChainlinkOracle.deploy(constants.AddressZero, usdt, priceFeed);

  const OracleManager = await ethers.getContractFactory('OracleManager');
  const oracleManager = await OracleManager.deploy();

  const UniV2Oracle = await ethers.getContractFactory('UniV2Oracle');
  const uniV2Oracle = await UniV2Oracle.deploy(quickSwapFactory, usdt, pixtAddress);

  await oracleManager.registerOracle(constants.AddressZero, usdt, chainLinkOracle.address);
  await oracleManager.registerOracle(pixtAddress, usdt, uniV2Oracle.address);

  console.log('ChainLinkOracle at', chainLinkOracle.address);
  console.log('Oracle Manager at', oracleManager.address);
  console.log('UniV2Oracle at', uniV2Oracle.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
