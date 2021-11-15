import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Contract, utils, constants, BigNumber } from 'ethers';
import { getCurrentTime, increaseTime } from './utils';

describe('Vesting', function () {
  let pixtToken: Contract;
  let vesting: Contract;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  const RELEASE_PERIOD = BigNumber.from((3600 * 24 * 7).toString());

  beforeEach(async function () {
    [alice, bob, carol] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixtToken = await PIXTFactory.deploy();
    const VestingFactory = await ethers.getContractFactory('Vesting');
    vesting = await VestingFactory.deploy(pixtToken.address);

    await pixtToken.connect(alice).approve(vesting.address, utils.parseEther('100000'));
  });

  describe('check constructor', () => {
    it('check init value', async () => {
      expect(await vesting.connect(alice).pixtToken()).to.equal(pixtToken.address);
    });

    it('Revert if pixtToken is zero', async () => {
      const VestingFactory = await ethers.getContractFactory('Vesting');
      await expect(VestingFactory.deploy(constants.AddressZero)).to.be.revertedWith(
        'Vesting: PIXT_ZERO_ADDRESS',
      );
    });
  });

  describe('#initVesting function', () => {
    const amount = utils.parseEther('10');
    const period = 3600 * 24 * 30;

    it('Revert if startTime is less than block time', async () => {
      const currentTime = await getCurrentTime();
      await expect(
        vesting.initVesting(amount, currentTime, period, await bob.getAddress()),
      ).to.revertedWith('Vesting: INVALID_START_TIME');
    });

    it('Revert if period is zero', async () => {
      const currentTime = await getCurrentTime();
      await expect(
        vesting.initVesting(
          amount,
          currentTime.add(BigNumber.from('1000')),
          0,
          await bob.getAddress(),
        ),
      ).to.revertedWith('Vesting: INVALID_PERIOD');
    });

    it('Revert if beneficiary is zero', async () => {
      const currentTime = await getCurrentTime();
      await expect(
        vesting.initVesting(
          amount,
          currentTime.add(BigNumber.from('1000')),
          period,
          constants.AddressZero,
        ),
      ).to.revertedWith('Vesting: INVALID_BENEFICIARY');
    });

    it('Should init vesting for beneficiary', async () => {
      const currentTime = await getCurrentTime();
      const startTime = currentTime.add(BigNumber.from('1000'));
      const tx = await vesting
        .connect(alice)
        .initVesting(amount, startTime, period, await bob.getAddress());

      expect(await vesting.vestLength()).to.equal(1);
      const vestInfo = await vesting.vestInfos('0');
      expect(vestInfo.amount).to.equal(amount);
      expect(vestInfo.beneficiary).to.equal(await bob.getAddress());
      expect(vestInfo.period).to.equal(period);
      expect(vestInfo.startTime).to.equal(startTime);
      expect(vestInfo.claimed).to.equal('0');

      await expect(tx)
        .to.emit(vesting, 'VestInitialized')
        .withArgs(await bob.getAddress(), startTime, period, amount, '0');

      expect(await pixtToken.balanceOf(vesting.address)).to.equal(amount);
    });
  });

  describe('#initVestings function', () => {
    const amounts = [utils.parseEther('10'), utils.parseEther('5')];
    const periods = [3600 * 24 * 30, 3600 * 24 * 31];

    it('Revert if length is zero', async () => {
      await expect(vesting.initVestings([], [], [], [])).to.revertedWith('Vesting: INVALID_LENGTH');
    });

    it('Revert if amounts length is not same as startTimes length', async () => {
      const currentTime = await getCurrentTime();
      const startTime = currentTime.add(BigNumber.from('1000'));
      await expect(
        vesting.initVestings(amounts, [startTime], periods, [
          await bob.getAddress(),
          await carol.getAddress(),
        ]),
      ).to.revertedWith('Vesting: INVALID_LENGTH');
    });

    it('Revert if amounts length is not same as periods length', async () => {
      const currentTime = await getCurrentTime();
      const startTime = currentTime.add(BigNumber.from('1000'));
      await expect(
        vesting.initVestings(
          amounts,
          [startTime, startTime],
          [3600 * 24 * 30],
          [await bob.getAddress(), await carol.getAddress()],
        ),
      ).to.revertedWith('Vesting: INVALID_LENGTH');
    });

    it('Revert if amounts length is not same as beneficiaries length', async () => {
      const currentTime = await getCurrentTime();
      const startTime = currentTime.add(BigNumber.from('1000'));
      await expect(
        vesting.initVestings(amounts, [startTime, startTime], periods, [await bob.getAddress()]),
      ).to.revertedWith('Vesting: INVALID_LENGTH');
    });

    it('Should init multiple vestings', async () => {
      const currentTime = await getCurrentTime();
      const startTimes = [
        currentTime.add(BigNumber.from('1000')),
        currentTime.add(BigNumber.from('100')),
      ];
      const beneficiaries = [await bob.getAddress(), await carol.getAddress()];
      const tx = await vesting
        .connect(alice)
        .initVestings(amounts, startTimes, periods, beneficiaries);

      expect(await vesting.vestLength()).to.equal(amounts.length);

      let totalAmount = BigNumber.from('0');
      for (let i = 0; i < amounts.length; i += 1) {
        const vestInfo = await vesting.vestInfos(i);
        expect(vestInfo.amount).to.equal(amounts[i]);
        expect(vestInfo.beneficiary).to.equal(beneficiaries[i]);
        expect(vestInfo.period).to.equal(periods[i]);
        expect(vestInfo.startTime).to.equal(startTimes[i]);
        expect(vestInfo.claimed).to.equal('0');

        totalAmount = totalAmount.add(amounts[i]);
        // await expect(tx)
        //   .to.emit(vesting, "VestInitialized")
        //   .withArgs(
        //     beneficiaries[i],
        //     startTimes[i],
        //     periods[i],
        //     amounts[i],
        //     "0"
        //   );
      }

      expect(await pixtToken.balanceOf(vesting.address)).to.equal(totalAmount);
    });
  });

  describe('#claim function', () => {
    const amount = utils.parseEther('10');
    const period = BigNumber.from((3600 * 24 * 30).toString());
    let startTime;

    beforeEach(async () => {
      startTime = (await getCurrentTime()).add(BigNumber.from('1000'));
      await vesting.connect(alice).initVesting(amount, startTime, period, await bob.getAddress());
    });

    it('Revert if msg.sender is not beneficiary', async () => {
      await increaseTime(BigNumber.from('1000'));
      await expect(vesting.connect(alice).claim('0')).to.revertedWith(
        'Vesting: INVALID_BENEFICIARY',
      );
    });

    it('Revert if still locked', async () => {
      expect(await vesting.getPendingAmount('0')).to.equal(0);
      await expect(vesting.connect(bob).claim('0')).to.revertedWith('Vesting: EMPTY_BALANCE');
    });

    it('Revert if release period not passed yet', async () => {
      await increaseTime(RELEASE_PERIOD);
      expect(await vesting.getPendingAmount('0')).to.equal(0);
      await expect(vesting.connect(bob).claim('0')).to.revertedWith('Vesting: EMPTY_BALANCE');
    });

    it('Should claim per week', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('3')));
      const claimAmount = amount.mul(RELEASE_PERIOD.mul(BigNumber.from('2'))).div(period);
      expect(await vesting.getPendingAmount('0')).to.equal(claimAmount);
      const tx = await vesting.connect(bob).claim('0');

      expect(await pixtToken.balanceOf(await bob.getAddress())).to.equal(claimAmount);
      expect(await pixtToken.balanceOf(vesting.address)).to.equal(amount.sub(claimAmount));
      const vestInfo = await vesting.vestInfos('0');
      expect(vestInfo.claimed).to.equal(claimAmount);

      await expect(tx)
        .to.emit(vesting, 'Claimed')
        .withArgs(await bob.getAddress(), claimAmount);
    });

    it('Revert if week reward claimed', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('2')));

      await vesting.connect(bob).claim('0');

      expect(await vesting.getPendingAmount('0')).to.equal(0);

      await expect(vesting.connect(bob).claim('0')).to.revertedWith('Vesting: EMPTY_BALANCE');
    });

    it('Should claim all after period', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('5')));

      const tx = await vesting.connect(bob).claim('0');

      expect(await pixtToken.balanceOf(await bob.getAddress())).to.equal(amount);
      expect(await pixtToken.balanceOf(vesting.address)).to.equal(0);
      const vestInfo = await vesting.vestInfos('0');
      expect(vestInfo.claimed).to.equal(amount);

      await expect(tx)
        .to.emit(vesting, 'Claimed')
        .withArgs(await bob.getAddress(), amount);
    });

    it('Revert if all claimed', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('5')));

      await vesting.connect(bob).claim('0');

      expect(await vesting.getPendingAmount('0')).to.equal(0);

      await expect(vesting.connect(bob).claim('0')).to.revertedWith('Vesting: EMPTY_BALANCE');
    });
  });

  describe('#claimInBatch function', () => {
    const amounts = [utils.parseEther('10'), utils.parseEther('5')];
    const periods = [3600 * 24 * 30, 3600 * 24 * 31];
    let startTimes;

    beforeEach(async () => {
      const currentTime = await getCurrentTime();
      startTimes = [
        currentTime.add(BigNumber.from('1000')),
        currentTime.add(BigNumber.from('100')),
      ];
      const beneficiaries = [await bob.getAddress(), await bob.getAddress()];
      await vesting.connect(alice).initVestings(amounts, startTimes, periods, beneficiaries);
    });

    it('Revert if length is zero', async () => {
      await expect(vesting.claimInBatch([])).to.revertedWith('Vesting: INVALID_LENGTH');
    });

    it('Should init multiple vestings', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('5')));

      let totalAmount = BigNumber.from('0');
      for (let i = 0; i < amounts.length; i += 1) {
        totalAmount = totalAmount.add(amounts[i]);
      }

      expect(await vesting.getPendingAmounts([0, 1])).to.equal(totalAmount);
      await vesting.connect(bob).claimInBatch([0, 1]);

      for (let i = 0; i < amounts.length; i += 1) {
        const vestInfo = await vesting.vestInfos(i);
        expect(vestInfo.amount).to.equal(amounts[i]);
        expect(vestInfo.period).to.equal(periods[i]);
        expect(vestInfo.startTime).to.equal(startTimes[i]);
        expect(vestInfo.claimed).to.equal(amounts[i]);
      }

      expect(await pixtToken.balanceOf(vesting.address)).to.equal('0');
      expect(await pixtToken.balanceOf(await bob.getAddress())).to.equal(totalAmount);
    });

    it('Revert if all reward claimed', async () => {
      await increaseTime(RELEASE_PERIOD.mul(BigNumber.from('5')));

      await vesting.connect(bob).claimInBatch([0, 1]);

      expect(await vesting.getPendingAmounts([0, 1])).to.equal(0);

      await expect(vesting.connect(bob).claimInBatch([0, 1])).to.revertedWith(
        'Vesting: EMPTY_BALANCE',
      );
    });
  });
});
