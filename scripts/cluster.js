const hre = require('hardhat');

async function main() {
  const PIX = await hre.ethers.getContractFactory('PIX');
  const pixt = await PIX.deploy();
  await pixt.deployed();

  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const pix = await PIXCluster.deploy(pixt.address);

  await pix.deployed();

  console.log('PIXCluster at ', pix.address);
  console.log('PIX Token at ', pixt.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
