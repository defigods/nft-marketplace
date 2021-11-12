const hre = require('hardhat');

async function main() {
  const PIX = await hre.ethers.getContractFactory('PIX');
  const pix = await PIX.attach('0xf6a4ab28074688469158d1233b468c34b53e4935');
  await pix.setModerator('0xbdfAab0AC9b4185A7c1f77A6E5fb922B0b5b9C06', true);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
