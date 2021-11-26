const { ethers, upgrades } = require('hardhat');

async function main() {
  const PIX = await ethers.getContractFactory('PIX');
  const pix = await PIX.deploy();
  await pix.deployed();

  console.log('PIX at', pix.address);

  // const PIXFixedSale = await ethers.getContractFactory('PIXFixedSale');
  // const fixedSale = await upgrades.deployProxy(PIXFixedSale, [
  //   '0xae5039fc6D8360008419E169d54F1C81c665c55D',
  //   '0x4BDcFa73220358b2072D58BD30ac565Ed1111B0c',
  // ]);

  // console.log('PIX at', fixedSale.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
