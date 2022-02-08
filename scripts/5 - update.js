const { ethers } = require('hardhat');

async function main() {
  const PIXAuctionSale = await ethers.getContractFactory('PIXMerkleMinter');
  const contract = await PIXAuctionSale.deploy();
  await contract.deployed();

  console.log('Deployed at', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
