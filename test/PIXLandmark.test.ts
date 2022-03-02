import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, constants } from 'ethers';
import { PIXCategory, PIXSize } from './utils';

describe('PIXLandmark', function () {
  let owner: Signer;
  let alice: Signer;
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
    pixLandmark = await upgrades.deployProxy(PIXLandmarkFactory, [pixNFT.address, 'a']);
  });

  describe('#initialize', () => {
    it('revert if pixNFT is zero address', async function () {
      const PIXLandmark = await ethers.getContractFactory('PIXLandmark');
      await expect(upgrades.deployProxy(PIXLandmark, [constants.AddressZero, 'a'])).to.revertedWith(
        'Landmark: INVALID_PIX',
      );
    });

    it('revert if pixNFT is zero address', async function () {
      const PIXLandmark = await ethers.getContractFactory('PIXLandmark');
      await expect(upgrades.deployProxy(PIXLandmark, [pixNFT.address, ''])).to.revertedWith(
        'Landmark: INVALID_URI',
      );
    });

    it('check initial values', async function () {
      expect(await pixLandmark.moderators(await owner.getAddress())).equal(true);
    });
  });

  describe('#setModerator', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        pixLandmark.connect(alice).setModerator(await alice.getAddress(), true),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('revert if moderator is zero address', async () => {
      await expect(pixLandmark.setModerator(constants.AddressZero, true)).to.revertedWith(
        'Landmark: INVALID_MODERATOR',
      );
    });

    it('should set moderator by owner', async () => {
      await pixLandmark.setModerator(await alice.getAddress(), true);
      expect(await pixLandmark.moderators(await alice.getAddress())).to.be.equal(true);

      await pixLandmark.setModerator(await alice.getAddress(), false);
      expect(await pixLandmark.moderators(await alice.getAddress())).to.be.equal(false);
    });
  });

  describe('#addPixesInLandmark', () => {
    it('revert if type is invalid', async () => {
      await expect(pixLandmark.addPixesInLandmark(0, [])).to.revertedWith('Landmark: INVALID_ID');
    });

    it('revert if sender is not moderator', async () => {
      await expect(pixLandmark.addPixesInLandmark(1, [1, 2])).to.revertedWith('Pix: NON_MODERATOR');
    });

    it('should add type', async () => {
      await pixNFT.setModerator(pixLandmark.address, true);
      await pixNFT.safeMint(await alice.getAddress(), [1, PIXCategory.Legendary, PIXSize.Pix]);
      await pixLandmark.addPixesInLandmark(1, [1, 2]);
      expect(await pixNFT.pixesInLand([1])).to.equal(true);
    });
  });

  describe('#safeMint', () => {
    it('revert if sender is not moderator', async () => {
      await expect(
        pixLandmark.connect(alice).safeMint(await alice.getAddress(), 0, 0, PIXCategory.Common),
      ).to.revertedWith('Landmark: NON_MODERATOR');
    });

    it('revert if id is invalid', async () => {
      await expect(
        pixLandmark.safeMint(await alice.getAddress(), 0, 0, PIXCategory.Common),
      ).to.revertedWith('Landmark: INVALID_ID');
    });

    it('revert if amount is invalid', async () => {
      await expect(
        pixLandmark.safeMint(await alice.getAddress(), 1, 0, PIXCategory.Common),
      ).to.revertedWith('Landmark: INVALID_AMOUNT');
    });

    it('should safe mint', async () => {
      await pixLandmark.safeMint(await alice.getAddress(), 1, 1, PIXCategory.Common);
      expect(await pixLandmark.totalSupply(1)).to.equal(1);
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
      await pixLandmark.safeMint(await alice.getAddress(), 1, 1, PIXCategory.Common);
      expect(await pixLandmark.uri(1)).to.equal(uri + '1');
    });
  });
});
