import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, BigNumber, constants, utils } from 'ethers';
import { PIXCategory, increaseTime } from './utils';

describe('PIXLandStaking', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let pixToken: Contract;
  let pixLandmark: Contract;
  let landStaking: Contract;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const PIXLandmarkFactory = await ethers.getContractFactory('PIXLandmark');
    pixLandmark = await upgrades.deployProxy(PIXLandmarkFactory);

    const PIXLandStakingFactory = await ethers.getContractFactory('PIXLandStaking');
    landStaking = await upgrades.deployProxy(PIXLandStakingFactory, [
      pixToken.address,
      pixLandmark.address,
    ]);

    await pixLandmark.safeMint(await alice.getAddress(), 1, 10, PIXCategory.Legendary);
    await pixToken.approve(landStaking.address, 10000000000000);
    await pixToken.transfer(landStaking.address, utils.parseEther('1000000'));
    await pixToken.transfer(await alice.getAddress(), BigNumber.from(10000));
    await pixToken.transfer(await bob.getAddress(), BigNumber.from(10000));
    await pixLandmark.connect(alice).setApprovalForAll(landStaking.address, true);
  });

  describe('setModerator', () => {
    it('it should revert if the caller is not a owner', async () => {
      await expect(landStaking.connect(alice).setModerator(await bob.getAddress())).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should set moderator properly', async () => {
      await landStaking.setModerator(await alice.getAddress());
      expect(await landStaking.moderator()).to.equal(await alice.getAddress());
    });
  });

  describe('stake', () => {
    it('should stake an NFT', async function () {
      await landStaking.connect(alice).stake(1, 5);
      expect(await pixLandmark.balanceOf(await alice.getAddress(), 1)).to.equal(5);
    });
  });

  describe('claim', () => {
    beforeEach(async function () {
      // Stake an NFT from Alice
      await landStaking.connect(alice).stake(1, 5);
    });

    it('should return correct rewards amount', async function () {
      await landStaking.addReward([await alice.getAddress()], [1], [10]);
      expect((await landStaking.earnedBatch(await alice.getAddress(), [1]))[0]).to.equal(
        BigNumber.from(10),
      );
      expect((await landStaking.earnedByAccount(await alice.getAddress())).toNumber()).to.equal(10);
    });
  });

  describe('unstake', () => {
    beforeEach(async function () {
      // Stake an NFT from Alice
      await landStaking.connect(alice).stake(1, 5);
    });

    it('revert if msg.sender is not staker', async function () {
      await expect(landStaking.unstake(1, 10)).to.revertedWith('LandStaking: NOT_ENOUGH');
    });

    it('should stake again', async function () {
      await landStaking.connect(alice).unstake(1, 5);
      await landStaking.connect(alice).stake(1, 10);
      expect(await pixLandmark.balanceOf(await alice.getAddress(), 1)).to.equal(0);
    });
  });
});
