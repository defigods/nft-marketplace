const { ethers, upgrades } = require('hardhat');

async function main() {
  const ContractFactory = await ethers.getContractFactory('NFT');
  const contract = await upgrades.deployProxy(ContractFactory, [
    'PlanetIX - Genesis Corporations',
    'PIX-GC',
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
