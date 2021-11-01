const hre = require('hardhat');

async function main() {
  const PIX = await hre.ethers.getContractFactory('PIX');
  const pixt = await PIX.deploy();
  await pixt.deployed();

  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const cluster = await PIXCluster.deploy(pixt.address);

  await cluster.deployed();

  console.log('PIXCluster at ', cluster.address);
  console.log('PIX Token at ', pixt.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
