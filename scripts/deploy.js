const hre = require('hardhat');

async function main() {
  const MockToken = await hre.ethers.getContractFactory('MockToken');
  const pix = await MockToken.deploy();
  await pix.deployed();

  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const cluster = await PIXCluster.deploy(pix.address);

  await cluster.deployed();

  console.log('PIXCluster at ', cluster.address);
  console.log('PIX Token at ', pix.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
