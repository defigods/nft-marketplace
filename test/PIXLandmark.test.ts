import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, constants } from 'ethers';
import { PIXCategory } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('PIXLandmark', function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let pixToken: Contract;
  let pixNFT: Contract;
  let pixLandmark: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    const usdc = await MockTokenFactory.deploy('Mock USDC', 'USDC', 6);

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixToken.address, usdc.address]);

    const PIXLandmarkFactory = await ethers.getContractFactory('PIXLandmark');
    pixLandmark = await upgrades.deployProxy(PIXLandmarkFactory, [pixNFT.address]);
  });

  describe('#initialize', () => {
    it('revert if pixNFT is zero address', async function () {
      const PIXLandmark = await ethers.getContractFactory('PIXLandmark');
      await expect(upgrades.deployProxy(PIXLandmark, [constants.AddressZero])).to.revertedWith(
        'Landmark: INVALID_PIX',
      );
    });

    it('check initial values', async function () {
      expect(await pixLandmark.moderators(owner.address)).equal(true);
      expect(await pixLandmark.name()).equal('PIX Landmark');
      expect(await pixLandmark.symbol()).equal('PIXLand');
    });
  });

  describe('#setModerator', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(pixLandmark.connect(alice).setModerator(alice.address, true)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('revert if moderator is zero address', async () => {
      await expect(pixLandmark.setModerator(constants.AddressZero, true)).to.revertedWith(
        'Landmark: INVALID_MODERATOR',
      );
    });

    it('should set moderator by owner', async () => {
      await pixLandmark.setModerator(alice.address, true);
      expect(await pixLandmark.moderators(alice.address)).to.be.equal(true);

      await pixLandmark.setModerator(alice.address, false);
      expect(await pixLandmark.moderators(alice.address)).to.be.equal(false);
    });
  });

  describe('#safeMint', () => {
    it('revert if sender is not moderator', async () => {
      await expect(
        pixLandmark.connect(alice).safeMint(alice.address, 1, PIXCategory.Common),
      ).to.revertedWith('Landmark: NON_MODERATOR');
    });

    it('should safe mint', async () => {
      await pixLandmark.safeMint(alice.address, 1, PIXCategory.Common);
      expect(await pixLandmark.totalSupply(1)).to.equal(1);
    });
  });

  describe('#batchMint', () => {
    it('revert if sender is not moderator', async () => {
      await expect(
        pixLandmark.connect(alice).batchMint(alice.address, [], [PIXCategory.Common]),
      ).to.revertedWith('Landmark: NON_MODERATOR');
    });

    it('revert if arguments invalid', async () => {
      await expect(pixLandmark.batchMint(alice.address, [], [PIXCategory.Common])).to.revertedWith(
        'Landmark: INVALID_ARGUMENTS',
      );
    });

    it('should safe mint', async () => {
      await pixLandmark.batchMint(alice.address, [2], [PIXCategory.Common]);
      expect(await pixLandmark.totalSupply(1)).to.equal(2);
    });
  });

  describe('#setBaseURI', () => {
    const uri = 'https://planetix.com/land-nfts/';

    it('revert if msg.sender is not owner', async () => {
      await expect(pixLandmark.connect(alice).setBaseURI(uri)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should set base uri by owner', async () => {
      await pixLandmark.setBaseURI(uri);
      await pixLandmark.safeMint(alice.address, 1, PIXCategory.Common);
      expect(await pixLandmark.uri(1)).to.equal(uri + '1');
    });
  });
});
