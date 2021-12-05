import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Contract, BigNumber, constants, utils } from 'ethers';
import { time } from '@openzeppelin/test-helpers';

const getCurrentTime = async () => {
  return BigNumber.from((await time.latest()).toString());
};

describe('PIXTStaking', function () {
  let owner: Signer;
  let distributor: Signer;
  let alice: Signer;
  let bob: Signer;
  let aliceAddress: string;
  let bobAddress: string;

  let pixt: Contract;
  let staking: Contract;
  let aliceStaking: Contract;
  let bobStaking: Contract;

  let periodStart: BigNumber;

  const reward = utils.parseEther('100');
  const rewardPeriod = 10 * 86400;

  before(async function () {
    [owner, distributor, alice, bob] = await ethers.getSigners();
    aliceAddress = await alice.getAddress();
    bobAddress = await bob.getAddress();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixt = await PIXTFactory.deploy();
    const PIXTStakingFactory = await ethers.getContractFactory('PIXTStaking');
    staking = await PIXTStakingFactory.deploy(pixt.address);
    aliceStaking = staking.connect(alice);
    bobStaking = staking.connect(bob);
    await pixt.transfer(await distributor.getAddress(), reward.mul(3));
    await pixt.transfer(aliceAddress, reward);
    await pixt.transfer(bobAddress, reward);
    await pixt.connect(alice).approve(staking.address, reward);
    await pixt.connect(bob).approve(staking.address, reward);
  });

  describe('constructor', () => {
    it('revert if pixt is zero address', async function () {
      const PIXTStaking = await ethers.getContractFactory('PIXTStaking');
      await expect(PIXTStaking.deploy(constants.AddressZero)).to.revertedWith(
        'Staking: INVALID_PIXT',
      );
    });

    it('check initial values', async function () {
      expect(await staking.pixToken()).equal(pixt.address);
    });
  });

  describe('#setRewardDistributor', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        staking.connect(alice).setRewardDistributor(await distributor.getAddress()),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('revert if distributor is zero address', async () => {
      await expect(staking.setRewardDistributor(constants.AddressZero)).to.revertedWith(
        'Staking: INVALID_DISTRIBUTOR',
      );
    });

    it('should set distributor by owner', async () => {
      await staking.setRewardDistributor(await distributor.getAddress());
      expect(await staking.rewardDistributor()).to.equal(await distributor.getAddress());
    });
  });

  describe('#notifyRewardAmount', () => {
    before(async () => {
      await pixt.connect(distributor).transfer(staking.address, reward);
    });

    it('revert if msg.sender is not distributor', async () => {
      await expect(staking.notifyRewardAmount(reward)).to.revertedWith('Staking: NON_DISTRIBUTOR');
    });

    it('should update reward related arguments', async () => {
      const tx = await staking.connect(distributor).notifyRewardAmount(reward);
      expect(tx).to.emit(staking, 'RewardAdded').withArgs(reward);
      expect(await staking.rewardRate()).to.equal(reward.div(rewardPeriod));
      periodStart = await getCurrentTime();
      expect(await staking.lastUpdateTime()).to.equal(periodStart);
      expect(await staking.periodFinish()).to.equal(periodStart.add(rewardPeriod));
    });
  });

  describe('#stake', () => {
    it('revert if amount is zero', async () => {
      await expect(aliceStaking.stake(0)).to.revertedWith('Staking: STAKE_ZERO');
    });

    it('alice stakes 10 pixt', async () => {
      const prevBalance = await pixt.balanceOf(aliceAddress);
      const tx = await aliceStaking.stake(10);
      expect(tx).to.emit(aliceStaking, 'Staked').withArgs(aliceAddress, 10);
      expect(await aliceStaking.totalStaked()).to.equal(BigNumber.from(10));
      expect(await pixt.balanceOf(aliceAddress)).to.equal(prevBalance.sub(10));
    });

    it('bob stakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86401).toString());
      await bobStaking.stake(10);
      expect((await staking.earned(aliceAddress)).add(await staking.earned(bobAddress))).to.closeTo(
        (await staking.rewardRate()).mul(86400),
        10,
        '',
      );
    });

    it('alice stakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86400 * 2 + 1).toString());
      await aliceStaking.stake(10);
      expect((await staking.earned(aliceAddress)).add(await staking.earned(bobAddress))).to.closeTo(
        (await staking.rewardRate()).mul(86400 * 2),
        10,
        '',
      );
    });

    it('bob stakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86400 * 3 + 1).toString());
      await bobStaking.stake(10);
      expect((await staking.earned(aliceAddress)).add(await staking.earned(bobAddress))).to.closeTo(
        (await staking.rewardRate()).mul(86400 * 3),
        10,
        '',
      );
    });
  });

  describe('#unstake', () => {
    it('revert if amount is zero', async () => {
      await expect(aliceStaking.unstake(0)).to.revertedWith('Staking: UNSTAKE_ZERO');
    });

    it('alice unstakes 10 pixt', async () => {
      await time.increaseTo(periodStart.add(86400 * 4 + 1).toString());
      const prevBalance = await pixt.balanceOf(aliceAddress);
      const tx = await aliceStaking.unstake(10);
      expect(tx).to.emit(aliceStaking, 'Unstaked').withArgs(aliceAddress, 10);
      expect(await aliceStaking.totalStaked()).to.equal(BigNumber.from(30));
      expect(await pixt.balanceOf(aliceAddress)).to.equal(prevBalance.add(10));
    });

    it('bob unstakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86400 * 5 + 1).toString());
      await bobStaking.unstake(10);
      expect((await staking.earned(aliceAddress)).add(await staking.earned(bobAddress))).to.closeTo(
        (await staking.rewardRate()).mul(86400 * 5),
        10,
        '',
      );
    });
  });

  describe('#claim', () => {
    it('alice claim reward', async () => {
      const rewardPerTokenStored = (await staking.rewardPerTokenStored()).add(
        (await staking.rewardRate())
          .mul(1)
          .mul(utils.parseEther('1'))
          .div(await staking.totalStaked()),
      );
      const reward = (await staking.stakedAmounts(aliceAddress))
        .mul(
          rewardPerTokenStored
            .sub(await staking.userRewardPerTokenPaid(aliceAddress))
            .div(utils.parseEther('1')),
        )
        .add(await staking.rewards(aliceAddress));
      const prevBalance = await pixt.balanceOf(aliceAddress);
      const tx = await aliceStaking.claim();
      expect(tx).to.emit(aliceStaking, 'RewardPaid').withArgs(aliceAddress, reward);
      expect(await pixt.balanceOf(aliceAddress)).to.closeTo(prevBalance.add(reward), 10, '');
    });
  });

  describe('#exit', () => {
    it('bob exit staking', async () => {
      const rewardPerTokenStored = (await staking.rewardPerTokenStored()).add(
        (await staking.rewardRate())
          .mul(1)
          .mul(utils.parseEther('1'))
          .div(await staking.totalStaked()),
      );
      const reward = (await staking.stakedAmounts(bobAddress))
        .mul(
          rewardPerTokenStored
            .sub(await staking.userRewardPerTokenPaid(bobAddress))
            .div(utils.parseEther('1')),
        )
        .add(await staking.rewards(bobAddress))
        .add(10);
      const prevBalance = await pixt.balanceOf(bobAddress);
      await bobStaking.exit();
      expect(await pixt.balanceOf(bobAddress)).to.closeTo(prevBalance.add(reward), 10, '');
    });
  });

  describe('#notifyRewardAmount', () => {
    it('should update reward related arguments', async () => {
      await pixt.connect(distributor).transfer(staking.address, reward);

      const periodFinish = await staking.periodFinish();
      const rewardRate = await staking.rewardRate();
      await staking.connect(distributor).notifyRewardAmount(reward);
      const currentTime = await getCurrentTime();
      const leftover = periodFinish.sub(currentTime).mul(rewardRate);

      expect(await staking.rewardRate()).to.equal(leftover.add(reward).div(rewardPeriod));
      expect(await staking.lastUpdateTime()).to.equal(currentTime);
      expect(await staking.periodFinish()).to.equal(currentTime.add(rewardPeriod));
    });
  });
});
