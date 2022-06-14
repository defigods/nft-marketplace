const { ethers } = require('hardhat');

async function main() {
  const ContractFactory = await ethers.getContractFactory('RandomNumberGenerator');
  const contract = await ContractFactory.deploy('0xba6666b118f8303f990f3519df07e160227cce87');
  await contract.deployed();

  console.log('Deployed at', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
