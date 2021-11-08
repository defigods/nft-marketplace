const hre = require('hardhat');
const { utils } = require('ethers');

async function main() {
  const PIXT = await hre.ethers.getContractFactory('PIXT');
  const pixt = await PIXT.deploy(utils.parseEther('140000000'));
  await pixt.deployed();

  const PIXCluster = await hre.ethers.getContractFactory('PIXCluster');
  const cluster = await PIXCluster.deploy(pixt.address);

  await cluster.deployed();

  console.log('PIXCluster at', cluster.address);
  console.log('PIX Token at', pixt.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
