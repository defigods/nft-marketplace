import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Contract, BigNumber, ContractFactory, constants, utils } from 'ethers';
import { DENOMINATOR, generateRandomAddress } from './utils';

describe('PIXBaseSale', function () {
  let owner: Signer;
  let alice: Signer;
  let treasury: string = generateRandomAddress();
  let fixedSale: Contract;
  let pixtToken: Contract;
  const tradingFeePct = BigNumber.from('100');

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixtToken = await PIXTFactory.deploy();

    const PIXFixedSaleFactory = await ethers.getContractFactory('PIXFixedSale');
    fixedSale = await PIXFixedSaleFactory.deploy(pixtToken.address);
  });

  describe('constructor', () => {
    let PIXFixedSaleFactory: ContractFactory;

    beforeEach(async () => {
      PIXFixedSaleFactory = await ethers.getContractFactory('PIXFixedSale');
    });

    it('check initial values', async () => {
      expect(await fixedSale.pixToken()).to.be.equal(pixtToken.address);
    });

    it('revert if pixtToken is zero', async () => {
      await expect(PIXFixedSaleFactory.deploy(constants.AddressZero)).to.revertedWith(
        'Sale: INVALID_PIXT',
      );
    });
  });

  describe('#setTreasury function', () => {
    const newTreasury = generateRandomAddress();

    it('revert if msg.sender is not owner', async () => {
      await expect(fixedSale.connect(alice).setTreasury(newTreasury, 0, false)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('revert if new treasury is 0x0', async () => {
      await expect(fixedSale.setTreasury(constants.AddressZero, 0, false)).to.revertedWith(
        'Sale: INVALID_TREASURY',
      );
    });

    it('revert if fee is overflown', async () => {
      await expect(
        fixedSale.setTreasury(newTreasury, DENOMINATOR.add(BigNumber.from(1)), false),
      ).to.revertedWith('Sale: FEE_OVERFLOWN');
    });

    it('should update new treasury and emit TreasuryUpdated event', async () => {
      const tx = await fixedSale.setTreasury(newTreasury, 10, false);
      const treasury = await fixedSale.pixtTreasury();
      expect(treasury[0]).to.be.equal(newTreasury);
      expect(treasury[1]).to.be.equal(10);
      expect(tx).to.emit(fixedSale, 'TreasuryUpdated').withArgs(newTreasury, 10, false);
    });
  });

  describe('#setWhitelistedNFTs function', () => {
    const token = generateRandomAddress();

    it('revert if msg.sender is not owner', async () => {
      await expect(fixedSale.connect(alice).setWhitelistedNFTs(token, true)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should whitelist nft', async () => {
      await fixedSale.setWhitelistedNFTs(token, true);
      expect(await fixedSale.whitelistedNFTs(token)).to.be.equal(true);
    });
  });
});
