const { ethers, upgrades } = require('hardhat');

async function main() {
  const PIXT = await ethers.getContractFactory('PIXT');
  const pixt = await PIXT.deploy();
  await pixt.deployed();

  const PIX = await ethers.getContractFactory('PIX');
  const pix = await upgrades.deployProxy(PIX, [pixt.address]);
  await pix.deployed();

  console.log('PIX NFT at ', pix.address);
  console.log('PIX Token at ', pixt.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
