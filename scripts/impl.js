const { ethers, upgrades } = require('hardhat');

async function main() {
  const ContractFactory = await ethers.getContractFactory('PIXTStakingLottery');
  const contract = await upgrades.deployProxy(ContractFactory, [
    '0xae5039fc6D8360008419E169d54F1C81c665c55D',
    10,
    86400 * 7,
  ]);
  await contract.deployed();

  console.log('Deployed at', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
