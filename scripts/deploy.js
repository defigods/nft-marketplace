const hre = require('hardhat');

async function main() {
  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const cluster = await PIXCluster.deploy();

  await cluster.deployed();

  console.log('PIXCluster deployed to:', cluster.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
