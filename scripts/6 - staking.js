const { ethers, upgrades } = require('hardhat');
const { BigNumber } = require('ethers');

async function main() {
  const pixt = '0xE06Bd4F5aAc8D0aA337D13eC88dB6defC6eAEefE';
  const pix = '0xB2435253C71FcA27bE41206EB2793E44e1Df6b6D';

  const PIXTStaking = await ethers.getContractFactory('PIXTStaking');
  const pixtStaking = await upgrades.deployProxy(PIXTStaking, [pixt]);

  const PIXStaking = await ethers.getContractFactory('PIXStaking');
  const pixStaking = await upgrades.deployProxy(PIXStaking, [pixt, pix, BigNumber.from(10)]);

  console.log('PIXT Staking at', pixtStaking.address);
  console.log('PIX Staking at', pixStaking.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
