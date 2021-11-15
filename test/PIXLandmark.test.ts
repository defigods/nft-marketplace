import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Contract, constants } from 'ethers';
import { PIXCategory } from './utils';

describe('PIXLandmark', function () {
  let owner: Signer;
  let alice: Signer;
  let pixLandmark: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const PIXLandmarkFactory = await ethers.getContractFactory('PIXLandmark');
    pixLandmark = await PIXLandmarkFactory.deploy();
  });

  describe('constructor', () => {
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

  describe('#addLandmarkType', () => {
    it('revert if type is invalid', async () => {
      await expect(pixLandmark.addLandmarkType(0, [])).to.revertedWith('Landmark: INVALID_TYPE');
    });

    it('should add type', async () => {
      await pixLandmark.addLandmarkType(1, [1, 2]);
      expect(await pixLandmark.pixIdInLandType(1, 0)).to.equal(1);
      expect(await pixLandmark.isPIXInLand(1)).to.equal(true);
    });
  });

  describe('#safeMint', () => {
    it('revert if sender is not moderator', async () => {
      await expect(
        pixLandmark.connect(alice).safeMint(await alice.getAddress(), [PIXCategory.Common, 0]),
      ).to.revertedWith('Landmark: NON_MODERATOR');
    });

    it('revert if type is invalid', async () => {
      await expect(
        pixLandmark.safeMint(await alice.getAddress(), [PIXCategory.Common, 0]),
      ).to.revertedWith('Landmark: INVALID_TYPE');
    });

    it('should safe mint', async () => {
      await pixLandmark.safeMint(await alice.getAddress(), [PIXCategory.Common, 1]);
      expect(await pixLandmark.totalSupply()).to.equal(1);
    });
  });

  describe('#safeBurn', () => {
    beforeEach(async () => {
      await pixLandmark.safeMint(await alice.getAddress(), [PIXCategory.Common, 1]);
    });

    it('revert if sender is not approved', async () => {
      await expect(pixLandmark.safeBurn(1)).to.revertedWith('Landmark: NON_APPROVED');
    });

    it('should safe burn', async () => {
      await pixLandmark.connect(alice).safeBurn(1);
      expect(await pixLandmark.totalSupply()).to.equal(0);
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
      await pixLandmark.safeMint(await alice.getAddress(), [PIXCategory.Common, 1]);
      expect(await pixLandmark.tokenURI(1)).to.equal(uri + '1');
    });
  });
});
