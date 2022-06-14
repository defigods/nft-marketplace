const { ethers, upgrades } = require('hardhat');

async function main() {
  const ContractFactory = await ethers.getContractFactory('NFT');
  const contract = await upgrades.upgradeProxy(
    '0xba6666b118f8303f990f3519df07e160227cce87',
    ContractFactory,
  );
  await contract.deployed();

  console.log('Deployed at', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
