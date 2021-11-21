const { ethers, upgrades } = require('hardhat');

async function main() {
  const pixtAddress = '0xaA8aF7853c6E449197a1369dE255A92264F65A6a';

  const PIXFixedSale = await ethers.getContractFactory('PIXFixedSale');
  const fixedSale = await upgrades.deployProxy(PIXFixedSale, [pixtAddress]);
  const PIXAuctionSale = await ethers.getContractFactory('PIXAuctionSale');
  const auctionSale = await upgrades.deployProxy(PIXAuctionSale, [pixtAddress]);

  await fixedSale.deployed();
  await auctionSale.deployed();

  console.log('Fixed sale at', fixedSale.address);
  console.log('Auction sale at', auctionSale.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
