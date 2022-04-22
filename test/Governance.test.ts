import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, BigNumber, providers } from 'ethers';
import { PIXCategory, PIXSize } from './utils';
import { time } from '@openzeppelin/test-helpers';

const period = 3600;

describe('PIXLending', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;

  let usdc: Contract;
  let pixToken: Contract;
  let pixNFT: Contract;
  let pixLending: Contract;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const PIXLendingFactory = await ethers.getContractFactory('PIXLending');
    pixLending = await upgrades.deployProxy(PIXLendingFactory, [pixToken.address, period]);

    await pixToken.transfer(await alice.getAddress(), BigNumber.from(100000000));
  });
});
