const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const treasury = await deployer.getAddress();

  const PIXFixedSale = await hre.ethers.getContractFactory('PIXFixedSale');
  const fixedSale = await PIXFixedSale.deploy(treasury, 5);
  const PIXAuctionSale = await hre.ethers.getContractFactory('PIXAuctionSale');
  const auctionSale = await PIXAuctionSale.deploy(treasury, 5);

  await fixedSale.deployed();
  await auctionSale.deployed();

  console.log('Fixed sale at ', fixedSale.address);
  console.log('Auction sale at ', auctionSale.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
