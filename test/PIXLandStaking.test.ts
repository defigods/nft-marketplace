import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, BigNumber, constants } from 'ethers';
import { PIXCategory, PIXSize, increaseTime } from './utils';

describe('PIXLandStaking', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let pixToken: Contract;
  let usdc: Contract;
  let pixNFT: Contract;
  let pixLandmark: Contract;
  let pixLandStaking: Contract;

  const rewardPerBlock = BigNumber.from(10);

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    usdc = await MockTokenFactory.deploy('Mock USDC', 'USDC', 6);

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixToken.address, usdc.address]);

    const PIXLandmarkFactory = await ethers.getContractFactory('PIXLandmark');
    pixLandmark = await upgrades.deployProxy(PIXLandmarkFactory, [pixNFT.address]);

    const PIXLandStakingFactory = await ethers.getContractFactory('PIXLandStaking');
    pixLandStaking = await upgrades.deployProxy(PIXLandStakingFactory, [
      pixToken.address,
      pixLandmark.address,
    ]);

    await pixLandmark.setTrader(pixLandStaking.address, true);
    await pixLandmark.safeMint(await alice.getAddress(), [0, PIXCategory.Common, PIXSize.Area]);
    await pixToken.transfer(pixLandStaking.address, ethers.utils.parseEther('1000000'));
    await pixToken.transfer(await alice.getAddress(), BigNumber.from(10000));
    await pixToken.transfer(await bob.getAddress(), BigNumber.from(10000));

    await pixLandStaking.connect(owner).setRewardDistributor(await owner.getAddress());
    await pixLandStaking.connect(owner).notifyRewardAmount(BigNumber.from(864000));
    await pixLandmark.setTier(PIXCategory.Common, PIXSize.Area, 2);
  });

  describe('setRewardDistributor', () => {
    it('it should set reward amount correctly', async () => {
      await pixLandStaking.connect(owner).setRewardDistributor(await alice.getAddress());
      expect(await pixLandStaking.rewardDistributor()).to.equal(await alice.getAddress());
    });

    it('it should revert if the caller is not a owner', async () => {
      await expect(
        pixLandStaking.connect(alice).setRewardDistributor(await bob.getAddress()),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('it should revert if the distributor address is zero address', async () => {
      await expect(
        pixLandStaking.connect(owner).setRewardDistributor(constants.AddressZero),
      ).to.revertedWith('LandStaking: INVALID_DISTRIBUTOR');
    });
  });

  describe('stake', () => {
    it('revert if nftId is zero', async function () {
      await expect(pixLandStaking.connect(alice).stake('0')).to.revertedWith(
        'LandStaking: INVALID_TOKEN_ID',
      );
    });

    it("revert if tier didn't set", async function () {
      await expect(pixLandStaking.connect(alice).stake(1)).to.revertedWith(
        'LandStaking: INVALID_TIER',
      );
    });

    it('should stake an NFT', async function () {
      await pixLandmark.connect(alice).approve(pixLandStaking.address, 1);
      await pixLandStaking.connect(alice).stake(1);
      expect(await pixLandStaking.totalTiers()).to.equal('2');
    });
  });

  describe('claim', () => {
    beforeEach(async function () {
      // Stake an NFT from Alice
      await pixLandmark.connect(alice).approve(pixLandStaking.address, 1);
      await pixLandStaking.connect(alice).stake(1);

      await increaseTime(BigNumber.from(50));
    });

    it('should return correct rewards amount', async function () {
      expect(await pixLandStaking.earned(await alice.getAddress())).to.closeTo(
        BigNumber.from(50),
        1,
        '',
      );
    });

    it('should provide correct rewards', async function () {
      await pixLandStaking.connect(alice).claim();
      expect(await pixToken.balanceOf(await alice.getAddress())).to.closeTo(
        BigNumber.from(10050),
        1,
        '',
      );
    });
  });

  describe('withdraw', () => {
    beforeEach(async function () {
      // Stake an NFT from Alice
      await pixLandmark.connect(alice).approve(pixLandStaking.address, 1);
      await pixLandStaking.connect(alice).stake(1);
    });

    it('should provide correct rewards', async function () {
      await pixLandStaking.connect(alice).withdraw(1);
      expect(await pixToken.balanceOf(await alice.getAddress())).to.closeTo(
        BigNumber.from(10000),
        1,
        '',
      );
    });

    it('should stake again', async function () {
      await pixLandStaking.connect(alice).withdraw(1);
      await pixLandmark.connect(alice).approve(pixLandStaking.address, 1);
      await pixLandStaking.connect(alice).stake(1);
    });
  });
});
