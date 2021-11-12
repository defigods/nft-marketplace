const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const treasury = await deployer.getAddress();
  const pixtAddress = '0x56a2406752DF391FFF98b69112399eCBCa640C9e';

  const PIXFixedSale = await hre.ethers.getContractFactory('PIXFixedSale');
  const fixedSale = await PIXFixedSale.deploy(treasury, 5, pixtAddress);
  const PIXAuctionSale = await hre.ethers.getContractFactory('PIXAuctionSale');
  const auctionSale = await PIXAuctionSale.deploy(treasury, 5, pixtAddress);

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
