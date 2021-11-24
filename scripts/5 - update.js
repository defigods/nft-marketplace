const { ethers, upgrades } = require('hardhat');

async function main() {
  const PIX = await ethers.getContractFactory('PIX');
  const pix = await upgrades.upgradeProxy('0xB2435253C71FcA27bE41206EB2793E44e1Df6b6D', PIX);

  console.log('PIX at', pix.address);
  console.log('PIX at', pix.options.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
