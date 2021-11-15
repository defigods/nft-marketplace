import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, BigNumber, constants } from 'ethers';
import { PIXCategory, PIXSize, PIXClassification, DENOMINATOR } from './utils';

describe('PIX', function () {
  let owner: Signer;
  let alice: Signer;
  let pixToken: Contract;
  let pixNFT: Contract;
  const price = 5;
  const ZeroAddress = ethers.constants.AddressZero;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixToken.address]);
    await pixToken.transfer(await alice.getAddress(), BigNumber.from(200));
    await pixToken.connect(alice).approve(pixNFT.address, BigNumber.from(200));
  });

  describe('#initialize', () => {
    it('revert if token is zero address', async function () {
      const PIX = await ethers.getContractFactory('PIX');
      await expect(upgrades.deployProxy(PIX, [constants.AddressZero])).to.revertedWith(
        'Pix: INVALID_PIXT',
      );
    });

    it('check initial values', async function () {
      expect(await pixNFT.combineCounts(PIXSize.Area)).equal(5);
      expect(await pixNFT.packPrices(0)).equal(5);
      expect(await pixNFT.moderators(await owner.getAddress())).equal(true);
    });
  });

  describe('#withdraw', () => {
    beforeEach(async function () {
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken.connect(alice).approve(pixNFT.address, BigNumber.from(100));
    });

    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).withdraw([])).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should withdraw erc20 tokens to owner address', async () => {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(5);
      await pixNFT.withdraw([pixToken.address]);
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(0);

      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 50; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          i + 1,
          PIXCategory.Legendary,
          PIXSize.Pix,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(price);
      await pixNFT.withdraw([pixToken.address]);
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(0);
    });
  });

  describe('#setModerator', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        pixNFT.connect(alice).setModerator(await alice.getAddress(), true),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('revert if moderator is zero address', async () => {
      await expect(pixNFT.setModerator(constants.AddressZero, true)).to.revertedWith(
        'Pix: INVALID_MODERATOR',
      );
    });

    it('should set moderator by owner', async () => {
      await pixNFT.setModerator(await alice.getAddress(), true);
      expect(await pixNFT.moderators(await alice.getAddress())).to.equal(true);

      await pixNFT.setModerator(await alice.getAddress(), false);
      expect(await pixNFT.moderators(await alice.getAddress())).to.equal(false);
    });
  });

  describe('#setPackPrice', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).setPackPrice(1, price)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('revert if mode is invalid', async () => {
      await expect(pixNFT.setPackPrice(0, 0)).to.revertedWith('Pix: INVALID_PRICE_MODE');
    });

    it('revert if price is zero', async () => {
      await expect(pixNFT.setPackPrice(1, 0)).to.revertedWith('Pix: ZERO_PRICE');
    });

    it('should set price by owner', async () => {
      await pixNFT.setPackPrice(1, price);
      expect(await pixNFT.packPrices(0)).to.equal(price);
    });
  });

  describe('#setCombinePrice', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).setCombinePrice(price)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('revert if price is zero', async () => {
      await expect(pixNFT.setCombinePrice(0)).to.revertedWith('Pix: ZERO_PRICE');
    });

    it('should set price by owner', async () => {
      await pixNFT.setCombinePrice(price);
      expect(await pixNFT.combinePrice()).to.equal(price);
    });
  });

  describe('#setPaymentToken', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).setPaymentToken(pixToken.address, false)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should set payment token by owner', async () => {
      await pixNFT.setPaymentToken(ZeroAddress, true);
      expect(await pixNFT.paymentTokens(ZeroAddress)).to.equal(true);
    });
  });

  describe('#setTreasury', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).setTreasury(await owner.getAddress(), 25)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('revert if treasury is zero address', async () => {
      await expect(pixNFT.setTreasury(ZeroAddress, 25)).to.revertedWith('Pix: INVALID_TREASURY');
    });

    it('revert if fee is over 10000', async () => {
      await expect(
        pixNFT.setTreasury(await alice.getAddress(), DENOMINATOR.add(BigNumber.from(1))),
      ).to.revertedWith('Pix: FEE_OVERFLOW');
    });

    it('should set treasury by owner', async () => {
      await pixNFT.setTreasury(await owner.getAddress(), 25);
      const treasury = await pixNFT.treasury();
      expect(treasury[0]).to.equal(await owner.getAddress());
      expect(treasury[1]).to.equal(25);
    });
  });

  describe('#requestMint', function () {
    it('revert if payment token is not approved', async function () {
      await expect(pixNFT.connect(alice).requestMint(ZeroAddress, 1)).to.revertedWith(
        'Pix: TOKEN_NOT_APPROVED',
      );
    });

    it('revert if mode is invalid', async function () {
      await expect(pixNFT.connect(alice).requestMint(pixToken.address, 0)).to.revertedWith(
        'Pix: INVALID_PRICE_MODE',
      );
    });

    it('revert if pending request exists', async function () {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      await expect(pixNFT.connect(alice).requestMint(pixToken.address, 1)).to.revertedWith(
        'Pix: PENDING_REQUEST_EXIST',
      );
    });

    it('should request mint by paying pixt', async function () {
      const tx = await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      expect(tx)
        .to.emit(pixNFT, 'Requested')
        .withArgs(await alice.getAddress(), 1);
      expect(await pixNFT.pendingPackType(await alice.getAddress())).to.equal(1);
      expect(await pixToken.balanceOf(pixNFT.address)).equal(price);
    });
  });

  describe('#mintTo', () => {
    it('revert if msg.sender is not moderator', async function () {
      await expect(
        pixNFT.connect(alice).mintTo(await alice.getAddress(), [], [], [], []),
      ).to.revertedWith('Pix: NON_MODERATOR');
    });

    it('revert if no pending request exists', async function () {
      await expect(pixNFT.mintTo(await alice.getAddress(), [], [], [], [])).to.revertedWith(
        'Pix: NO_PENDING_REQUEST',
      );
    });

    it('revert if invalid parameters', async function () {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      await expect(pixNFT.mintTo(await alice.getAddress(), [1], [], [], [])).to.revertedWith(
        'Pix: INVALID_LENGTH',
      );
    });

    it('should mint new pixes by moderator', async () => {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);

      const pixIds = [];
      const categories = [];
      const classifications = [];
      const countries = [];
      for (let i = 0; i < 50; i++) {
        pixIds.push(i + 1);
        categories.push(PIXCategory.Legendary);
        classifications.push(PIXClassification.CapitalCity);
        countries.push('US');
      }
      await pixNFT.mintTo(await alice.getAddress(), pixIds, categories, classifications, countries);
      expect(await pixNFT.balanceOf(await alice.getAddress())).to.equal(50);
    });
  });

  describe('#completeRequest', () => {
    it('revert if caller is not moderator', async () => {
      await expect(
        pixNFT.connect(alice).completeRequest(await alice.getAddress(), 1),
      ).to.revertedWith('Pix: NON_MODERATOR');
    });

    it('revert if request is invalid', async () => {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      await expect(pixNFT.completeRequest(await alice.getAddress(), 2)).to.revertedWith(
        'Pix: INVALID_REQUEST',
      );
    });

    it('should complete request', async () => {
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      await pixNFT.completeRequest(await alice.getAddress(), 1);
      expect(await pixNFT.pendingPackType(await alice.getAddress())).to.equal(0);
    });
  });

  describe('#safeMint', () => {
    it('revert if pix info is invalid', async () => {
      await expect(
        pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Pix,
          PIXClassification.CapitalCity,
          'US',
        ]),
      ).to.revertedWith('Pix: INVALID_ARGUMENTS');
      await expect(
        pixNFT.safeMint(await alice.getAddress(), [
          1,
          PIXCategory.Common,
          PIXSize.Zone,
          PIXClassification.CapitalCity,
          'US',
        ]),
      ).to.revertedWith('Pix: INVALID_ARGUMENTS');
    });

    it('should safe mint', async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Zone,
        PIXClassification.CapitalCity,
        'US',
      ]);
      const tx = await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Common,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
      expect(tx)
        .to.emit(pixNFT, 'PIXMinted')
        .withArgs(
          await alice.getAddress(),
          2,
          1,
          PIXCategory.Common,
          PIXSize.Pix,
          PIXClassification.CapitalCity,
          'US',
        );
      expect(await pixNFT.totalSupply()).to.equal(2);
    });
  });

  describe('#batchMint', () => {
    it('should batch mint', async () => {
      const infos = [];
      for (let i = 0; i < 10; i++) {
        infos.push([0, PIXCategory.Common, PIXSize.Zone, PIXClassification.CapitalCity, 'US']);
      }
      await pixNFT.batchMint(await alice.getAddress(), infos);
      expect(await pixNFT.totalSupply()).to.equal(10);
    });
  });

  describe('#safeBurn', () => {
    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Zone,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Common,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
    });

    it('revert if msg.sender is not approved', async () => {
      await expect(pixNFT.safeBurn(1)).to.revertedWith('Pix: NON_APPROVED');
    });

    it('should safe burn', async () => {
      await pixNFT.connect(alice).safeBurn(1);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });
  });

  describe('#batchBurn', () => {
    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Zone,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Common,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
    });

    it('revert if msg.sender is not approved', async () => {
      await expect(pixNFT.batchBurn([1, 2])).to.revertedWith('Pix: NON_APPROVED');
    });

    it('should batch burn', async () => {
      await pixNFT.connect(alice).batchBurn([1, 2]);
      expect(await pixNFT.totalSupply()).to.equal(0);
    });
  });

  describe('#updateTerritoryInfo', () => {
    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Common,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Area,
        PIXClassification.CapitalCity,
        'US',
      ]);
    });

    it('revert if update non-territory info', async () => {
      await expect(
        pixNFT.updateTerritoryInfo(1, 1, PIXClassification.CapitalCity, 'US'),
      ).to.revertedWith('Pix: TERRITORIES_ONLY');
    });

    it('should update territory info', async () => {
      await pixNFT.updateTerritoryInfo(2, 1, PIXClassification.CapitalCity, 'USA');
      expect((await pixNFT.pixInfos(2))[4]).to.equal('USA');
      await expect(
        pixNFT.updateTerritoryInfo(2, 1, PIXClassification.CapitalCity, 'US'),
      ).to.revertedWith('Pix: TERRITORY_ALREADY_SET');
    });
  });

  describe('#combine', () => {
    beforeEach(async function () {
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken.connect(alice).approve(pixNFT.address, BigNumber.from(100));
    });

    it('revert if price not set', async () => {
      await expect(pixNFT.connect(alice).combine([])).to.revertedWith('Pix: PRICE_NOT_SET');
    });

    it('revert if no tokens', async () => {
      await pixNFT.setCombinePrice(price);
      await expect(pixNFT.connect(alice).combine([])).to.revertedWith('Pix: NO_TOKENS');
    });

    it('revert if size is domain', async () => {
      await pixNFT.setCombinePrice(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Domain,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Domain,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith('Pix: MAX_NOT_ALLOWED');
    });

    it('revert if combine length is invalid', async () => {
      await pixNFT.setCombinePrice(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Rare,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Rare,
        PIXSize.Pix,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith('Pix: INVALID_ARGUMENTS');
    });

    it('revert if to combine different size', async () => {
      await pixNFT.setCombinePrice(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Zone,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith('Pix: SAME_SIZE_ONLY');
    });

    it('revert if to combine different categories', async () => {
      await pixNFT.setCombinePrice(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith(
        'Pix: SAME_CATEGORY_ONLY',
      );
    });

    it('revert if not owner', async () => {
      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Zone,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      await expect(pixNFT.combine(tokenIds)).to.revertedWith('Pix: NON_APPROVED');
    });

    it('should combine pixes to mint area', async () => {
      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 50; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          i + 1,
          PIXCategory.Legendary,
          PIXSize.Pix,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(51)).to.equal(await alice.getAddress());
      expect(tx).to.emit(pixNFT, 'Combined').withArgs(51, PIXCategory.Legendary, PIXSize.Area);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it('should combine areas to mint sector', async () => {
      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 5; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Area,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(6)).to.equal(await alice.getAddress());
      expect(tx).to.emit(pixNFT, 'Combined').withArgs(6, PIXCategory.Common, PIXSize.Sector);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it('should combine sectors to mint zone', async () => {
      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Sector,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx).to.emit(pixNFT, 'Combined').withArgs(3, PIXCategory.Common, PIXSize.Zone);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it('should combine zone to mint domain', async () => {
      await pixNFT.setCombinePrice(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Zone,
          PIXClassification.CapitalCity,
          'US',
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx).to.emit(pixNFT, 'Combined').withArgs(3, PIXCategory.Common, PIXSize.Domain);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });
  });

  describe('#setBaseURI', () => {
    const uri = 'https://planetix.com/nfts/';

    it('revert if msg.sender is not owner', async () => {
      await expect(pixNFT.connect(alice).setBaseURI(uri)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should set base uri by owner', async () => {
      await pixNFT.setBaseURI(uri);
      await pixNFT.connect(alice).requestMint(pixToken.address, 1);
      await pixNFT.mintTo(
        await alice.getAddress(),
        new Array(50).fill(1),
        new Array(50).fill(PIXCategory.Common),
        new Array(50).fill(PIXClassification.CapitalCity),
        new Array(50).fill('US'),
      );
      await pixNFT.completeRequest(await alice.getAddress(), 1);
      expect(await pixNFT.tokenURI(1)).to.equal(uri + '1');
    });
  });
});
