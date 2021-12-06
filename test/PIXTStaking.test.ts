import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
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
  let pixtStaking: Contract;
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
    pixtStaking = await upgrades.deployProxy(PIXTStakingFactory, [pixt.address]);

    aliceStaking = pixtStaking.connect(alice);
    bobStaking = pixtStaking.connect(bob);
    await pixt.transfer(await distributor.getAddress(), reward.mul(3));
    await pixt.transfer(aliceAddress, reward);
    await pixt.transfer(bobAddress, reward);
    await pixt.connect(alice).approve(pixtStaking.address, reward);
    await pixt.connect(bob).approve(pixtStaking.address, reward);
  });

  describe('#initialize', () => {
    it('revert if pixt is zero address', async function () {
      const PIXTStaking = await ethers.getContractFactory('PIXTStaking');
      await expect(upgrades.deployProxy(PIXTStaking, [constants.AddressZero])).to.revertedWith(
        'Staking: INVALID_PIXT',
      );
    });

    it('check initial values', async function () {
      expect(await pixtStaking.pixToken()).equal(pixt.address);
    });
  });

  describe('#setRewardDistributor', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        pixtStaking.connect(alice).setRewardDistributor(await distributor.getAddress()),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('revert if distributor is zero address', async () => {
      await expect(pixtStaking.setRewardDistributor(constants.AddressZero)).to.revertedWith(
        'Staking: INVALID_DISTRIBUTOR',
      );
    });

    it('should set distributor by owner', async () => {
      await pixtStaking.setRewardDistributor(await distributor.getAddress());
      expect(await pixtStaking.rewardDistributor()).to.equal(await distributor.getAddress());
    });
  });

  describe('#notifyRewardAmount', () => {
    before(async () => {
      await pixt.connect(distributor).transfer(pixtStaking.address, reward);
    });

    it('revert if msg.sender is not distributor', async () => {
      await expect(pixtStaking.notifyRewardAmount(reward)).to.revertedWith(
        'Staking: NON_DISTRIBUTOR',
      );
    });

    it('should update reward related arguments', async () => {
      const tx = await pixtStaking.connect(distributor).notifyRewardAmount(reward);
      expect(tx).to.emit(pixtStaking, 'RewardAdded').withArgs(reward);
      expect(await pixtStaking.rewardRate()).to.equal(reward.div(rewardPeriod));
      periodStart = await getCurrentTime();
      expect(await pixtStaking.lastUpdateTime()).to.equal(periodStart);
      expect(await pixtStaking.periodFinish()).to.equal(periodStart.add(rewardPeriod));
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
      expect(
        (await pixtStaking.earned(aliceAddress)).add(await pixtStaking.earned(bobAddress)),
      ).to.closeTo((await pixtStaking.rewardRate()).mul(86400), 10, '');
    });

    it('alice stakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86400 * 2 + 1).toString());
      await aliceStaking.stake(10);
      expect(
        (await pixtStaking.earned(aliceAddress)).add(await pixtStaking.earned(bobAddress)),
      ).to.closeTo((await pixtStaking.rewardRate()).mul(86400 * 2), 10, '');
    });

    it('bob stakes 10 pixt after 1 day', async () => {
      await time.increaseTo(periodStart.add(86400 * 3 + 1).toString());
      await bobStaking.stake(10);
      expect(
        (await pixtStaking.earned(aliceAddress)).add(await pixtStaking.earned(bobAddress)),
      ).to.closeTo((await pixtStaking.rewardRate()).mul(86400 * 3), 10, '');
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
      expect(
        (await pixtStaking.earned(aliceAddress)).add(await pixtStaking.earned(bobAddress)),
      ).to.closeTo((await pixtStaking.rewardRate()).mul(86400 * 5), 10, '');
    });
  });

  describe('#claim', () => {
    it('alice claim reward', async () => {
      const rewardPerTokenStored = (await pixtStaking.rewardPerTokenStored()).add(
        (await pixtStaking.rewardRate())
          .mul(1)
          .mul(utils.parseEther('1'))
          .div(await pixtStaking.totalStaked()),
      );
      const reward = (await pixtStaking.stakedAmounts(aliceAddress))
        .mul(
          rewardPerTokenStored
            .sub(await pixtStaking.userRewardPerTokenPaid(aliceAddress))
            .div(utils.parseEther('1')),
        )
        .add(await pixtStaking.rewards(aliceAddress));
      const prevBalance = await pixt.balanceOf(aliceAddress);
      const tx = await aliceStaking.claim();
      expect(tx).to.emit(aliceStaking, 'RewardPaid').withArgs(aliceAddress, reward);
      expect(await pixt.balanceOf(aliceAddress)).to.closeTo(prevBalance.add(reward), 10, '');
    });
  });

  describe('#exit', () => {
    it('bob exit pixtStaking', async () => {
      const rewardPerTokenStored = (await pixtStaking.rewardPerTokenStored()).add(
        (await pixtStaking.rewardRate())
          .mul(1)
          .mul(utils.parseEther('1'))
          .div(await pixtStaking.totalStaked()),
      );
      const reward = (await pixtStaking.stakedAmounts(bobAddress))
        .mul(
          rewardPerTokenStored
            .sub(await pixtStaking.userRewardPerTokenPaid(bobAddress))
            .div(utils.parseEther('1')),
        )
        .add(await pixtStaking.rewards(bobAddress))
        .add(10);
      const prevBalance = await pixt.balanceOf(bobAddress);
      await bobStaking.exit();
      expect(await pixt.balanceOf(bobAddress)).to.closeTo(prevBalance.add(reward), 10, '');
    });
  });

  describe('#notifyRewardAmount', () => {
    it('should update reward related arguments', async () => {
      await pixt.connect(distributor).transfer(pixtStaking.address, reward);

      const periodFinish = await pixtStaking.periodFinish();
      const rewardRate = await pixtStaking.rewardRate();
      await pixtStaking.connect(distributor).notifyRewardAmount(reward);
      const currentTime = await getCurrentTime();
      const leftover = periodFinish.sub(currentTime).mul(rewardRate);

      expect(await pixtStaking.rewardRate()).to.equal(leftover.add(reward).div(rewardPeriod));
      expect(await pixtStaking.lastUpdateTime()).to.equal(currentTime);
      expect(await pixtStaking.periodFinish()).to.equal(currentTime.add(rewardPeriod));
    });
  });
});
