import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { Contract, utils, constants, Signer } from 'ethers';
import 'dotenv/config';

describe('PIX fork', function () {
  const router = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
  const sushiRouter = '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506';
  const pixt = '0xE06Bd4F5aAc8D0aA337D13eC88dB6defC6eAEefE';
  const usdt = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
  const weth = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
  let oracleManager: Contract;
  let alice: Signer;
  let bob: Signer;

  before(async function () {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
            // blockNumber: 22627000,
          },
        },
      ],
    });

    [alice, bob] = await ethers.getSigners();

    const OracleManager = await ethers.getContractFactory('OracleManager');
    oracleManager = OracleManager.attach('0x6aB819382A03D0DF86A2b95E2CD550Cd4148d34d');
  });

  describe('constructor', () => {
    it('check initial values', async () => {
      const data = await oracleManager.callStatic.getAmountOut(
        usdt,
        '0x0000000000000000000000000000000000000000',
        '5500000',
      );
      expect(data).to.be.equal('0');
      // expect(await swapManager.weth()).to.be.equal(weth);
    });
  });
});
