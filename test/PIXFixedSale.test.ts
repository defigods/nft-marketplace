import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Wallet, Contract, BigNumber, utils, constants } from 'ethers';
import { ecsign } from 'ethereumjs-util';
import {
  DENOMINATOR,
  generateRandomAddress,
  PIXCategory,
  PIXClassification,
  PIXSize,
} from './utils';
const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = utils;

describe('PIXFixedSale', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Wallet;
  let treasury: string = generateRandomAddress();
  let pixNFT: Contract;
  let fixedSale: Contract;
  let pixtToken: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    bob = Wallet.fromMnemonic(
      'test test test test test test test test test test test junk',
    ).connect(owner.provider);

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixtToken = await PIXTFactory.connect(bob).deploy();

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixtToken.address]);

    const PIXFixedSaleFactory = await ethers.getContractFactory('PIXFixedSale');
    fixedSale = await upgrades.deployProxy(PIXFixedSaleFactory, [
      pixtToken.address,
      pixNFT.address,
    ]);

    await fixedSale.setWhitelistedNFTs(pixNFT.address, true);
  });

  describe('#requestSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
    });

    it('revert if nft token is not whitelisted', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(generateRandomAddress(), [tokenId], 1),
      ).to.revertedWith('Sale: NOT_WHITELISTED_NFT');
    });

    it('revert if price is 0', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], 0),
      ).to.revertedWith('Sale: PRICE_ZERO');
    });

    it('revert if no token list', async () => {
      await expect(fixedSale.connect(alice).requestSale(pixNFT.address, [], 1)).to.revertedWith(
        'Sale: NO_TOKENS',
      );
    });

    it('revert if PIX not approved', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price),
      ).to.revertedWith('ERC721: transfer caller is not owner nor approved');
    });

    it('should request sale and emit SaleRequested event', async () => {
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);

      const tx = await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);

      const lastSaleId = 1;
      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, 'SaleRequested')
        .withArgs(await alice.getAddress(), lastSaleId, pixNFT.address, [tokenId], price);
    });
  });

  describe('#updateSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(fixedSale.connect(bob).updateSale(lastSaleId, price)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('revert if price is 0', async () => {
      await expect(fixedSale.connect(alice).updateSale(lastSaleId, 0)).to.revertedWith(
        'Sale: PRICE_ZERO',
      );
    });

    it('should update sale and emit SaleUpdated event', async () => {
      const newPrice = utils.parseEther('2');
      const tx = await fixedSale.connect(alice).updateSale(lastSaleId, newPrice);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(newPrice);

      await expect(tx).emit(fixedSale, 'SaleUpdated').withArgs(lastSaleId, newPrice);
    });
  });

  describe('#cancelSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(fixedSale.connect(bob).cancelSale(lastSaleId)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('should cancel sale and emit SaleCancelled event', async () => {
      const tx = await fixedSale.connect(alice).cancelSale(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await alice.getAddress());

      await expect(tx).emit(fixedSale, 'SaleCancelled').withArgs(lastSaleId);
    });
  });

  describe('#purchaseNFT function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastTokenId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);

      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it('revert if NFT is not for sale', async () => {
      await expect(fixedSale.connect(bob).purchaseNFT(lastTokenId)).to.revertedWith(
        'Sale: INVALID_ID',
      );
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchaseNFT(lastTokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
      expect(tx)
        .to.emit(fixedSale, 'Purchased')
        .withArgs(await alice.getAddress(), await bob.getAddress(), lastTokenId, price);
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it('should not send fee if zero', async () => {
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchaseNFT(tokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore);
      expect(tx)
        .to.emit(fixedSale, 'Purchased')
        .withArgs(await alice.getAddress(), await bob.getAddress(), tokenId, price);
      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });
  });

  describe('#sellNFTWithSignature function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
        PIXClassification.CapitalCity,
        'US',
      ]);

      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it('revert if signature invalid', async () => {
      const data = await getDigest(
        pixtToken,
        fixedSale,
        bob,
        pixNFT,
        BigNumber.from(tokenId),
        price,
      );
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(process.env.PRIVATE_KEY.slice(2), 'hex'),
      );
      await expect(
        fixedSale
          .connect(alice)
          .sellNFTWithSignature(await bob.getAddress(), price, pixNFT.address, tokenId, v, r, s),
      ).to.revertedWith('PIXT: INVALID_SIGNATURE');
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const data = await getDigest(
        pixtToken,
        fixedSale,
        bob,
        pixNFT,
        BigNumber.from(tokenId),
        price,
      );
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );
      const tx = await fixedSale
        .connect(alice)
        .sellNFTWithSignature(await bob.getAddress(), price, pixNFT.address, tokenId, v, r, s);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
      expect(tx)
        .to.emit(fixedSale, 'PurchasedWithSignature')
        .withArgs(await alice.getAddress(), await bob.getAddress(), pixNFT.address, tokenId, price);
    });
  });
});

const getDigest = async (
  pixToken: Contract,
  sale: Contract,
  buyer: Wallet,
  nftToken: Contract,
  tokenId: BigNumber,
  price: BigNumber,
) => {
  const separator = keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(
          toUtf8Bytes(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
          ),
        ),
        keccak256(toUtf8Bytes('PlanetIX')),
        keccak256(toUtf8Bytes('1')),
        (await ethers.provider.getNetwork()).chainId,
        pixToken.address,
      ],
    ),
  );
  const hash = keccak256(
    toUtf8Bytes(
      'PermitForBid(address owner,address spender,uint256 amount,address nftToken,uint256 tokenId,uint256 nonce)',
    ),
  );
  const nonce = await pixToken.nonces(await buyer.getAddress());
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        separator,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
            [hash, await buyer.getAddress(), sale.address, price, nftToken.address, tokenId, nonce],
          ),
        ),
      ],
    ),
  );
};
