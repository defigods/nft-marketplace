const { ethers, upgrades } = require('hardhat');

async function main() {
  const PIXFixedSaleFactory = await ethers.getContractFactory('PIXFixedSale');
  const fixedSale = await PIXFixedSaleFactory.deploy();
  await fixedSale.deployed();
  //   const fixedSale = await upgrades.upgradeProxy(
  //     '0x303935084B9e0a7129801bbDa1B409e2573eD58f',
  //     PIXFixedSale,
  //   );

  console.log('Fixed sale at', fixedSale.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
