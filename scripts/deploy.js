const hre = require('hardhat');

async function main() {
  const MockToken = await hre.ethers.getContractFactory('MockToken');
  const usdt = await MockToken.deploy();
  await usdt.deployed();
  const pixt = await MockToken.deploy();
  await pixt.deployed();

  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const cluster = await PIXCluster.deploy(usdt.address, pixt.address);

  await cluster.deployed();

  console.log('PIXCluster at ', cluster.address);
  console.log('USD Token at ', usdt.address);
  console.log('PIX Token at ', pixt.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
