import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, Wallet, BigNumber, utils, constants } from 'ethers';
import { ecsign } from 'ethereumjs-util';
import {
  DENOMINATOR,
  generateRandomAddress,
  getCurrentTime,
  increaseTime,
  PIXCategory,
  PIXSize,
} from './utils';
const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = utils;

describe('PIXAuctionSale', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Wallet;
  let treasury: string = generateRandomAddress();
  let pixtToken: Contract;
  let pixNFT: Contract;
  let auctionSale: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    bob = Wallet.fromMnemonic(
      'test test test test test test test test test test test junk',
    ).connect(owner.provider);

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixtToken = await PIXTFactory.connect(bob).deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    const usdc = await MockTokenFactory.deploy('Mock USDC', 'USDC', 6);

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixtToken.address, usdc.address]);

    const PIXAuctionSaleFactory = await ethers.getContractFactory('PIXAuctionSale');
    auctionSale = await upgrades.deployProxy(PIXAuctionSaleFactory, [
      pixtToken.address,
      pixNFT.address,
    ]);

    await pixNFT.setTrader(auctionSale.address, true);
    await auctionSale.setWhitelistedNFTs(pixNFT.address, true);
    await pixtToken.connect(bob).approve(auctionSale.address, utils.parseEther('153258228'));
  });

  describe('#requestSale function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it('revert if nft token is not whitelisted', async () => {
      await expect(
        auctionSale.connect(alice).requestSale(generateRandomAddress(), [tokenId], endTime, 0),
      ).to.revertedWith('Sale: NOT_WHITELISTED_NFT');
    });

    it('revert if minPrice is 0', async () => {
      await expect(
        auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, 0),
      ).to.revertedWith('Sale: PRICE_ZERO');
    });

    it('revert if no tokens', async () => {
      await expect(
        auctionSale.connect(alice).requestSale(pixNFT.address, [], endTime, 1),
      ).to.revertedWith('Sale: NO_TOKENS');
    });

    it('revert if endTime is less than block timestamp', async () => {
      const oldEndTime = (await getCurrentTime()).sub(BigNumber.from('10'));
      await expect(
        auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], oldEndTime, minPrice),
      ).to.revertedWith('Sale: INVALID_TIME');
    });

    it('revert if PIX not approved', async () => {
      await expect(
        auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice),
      ).to.revertedWith('ERC721: transfer caller is not owner nor approved');
    });

    it('should request sale and emit SaleRequested event', async () => {
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);

      const tx = await auctionSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], endTime, minPrice);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.endTime).to.be.equal(endTime);
      expect(saleInfo.minPrice).to.be.equal(minPrice);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(auctionSale.address);

      await expect(tx)
        .emit(auctionSale, 'SaleRequested')
        .withArgs(
          await alice.getAddress(),
          lastSaleId,
          pixNFT.address,
          endTime,
          [tokenId],
          minPrice,
        );
    });
  });

  describe('#updateSale function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(auctionSale.connect(bob).updateSale(tokenId, endTime)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('revert if endTime is less than block timestamp', async () => {
      const oldEndTime = (await getCurrentTime()).sub(BigNumber.from('10'));
      await expect(auctionSale.connect(alice).updateSale(tokenId, oldEndTime)).to.revertedWith(
        'Sale: INVALID_TIME',
      );
    });

    it('should update sale and emit SaleUpdated event', async () => {
      const newEndTime = endTime.add(auctionPeriod);
      const tx = await auctionSale.connect(alice).updateSale(tokenId, newEndTime);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.endTime).to.be.equal(newEndTime);

      await expect(tx).emit(auctionSale, 'SaleUpdated').withArgs(tokenId, newEndTime);
    });
  });

  describe('#cancelSale function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(auctionSale.connect(bob).cancelSale(tokenId)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('should cancel sale and emit SaleCancelled event', async () => {
      const tx = await auctionSale.connect(alice).cancelSale(tokenId);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await alice.getAddress());

      await expect(tx).emit(auctionSale, 'SaleCancelled').withArgs(lastSaleId);
    });
  });

  describe('#endAuction function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it('revert if not ended yet', async () => {
      const data = await getDigest(auctionSale, bob, minPrice, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await expect(
        auctionSale.endAuction(await bob.getAddress(), minPrice, tokenId, v, r, s),
      ).to.revertedWith('!Sale: ALREADY_ENDED');
    });

    it('revert if invalid signature', async () => {
      const data = await getDigest(auctionSale, bob, minPrice, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(process.env.PRIVATE_KEY.slice(2), 'hex'),
      );
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));
      await expect(
        auctionSale.endAuction(await bob.getAddress(), minPrice, tokenId, v, r, s),
      ).to.revertedWith('Sale: INVALID_SIGNATURE');
    });

    it('should end auction and send PIX to top bidder and send PIXT to seller and treasury', async () => {
      await auctionSale.setTreasury(treasury, 50, 50, false);
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      const data = await getDigest(auctionSale, bob, bidAmount, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(await bob.getAddress(), bidAmount, tokenId, v, r, s);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      const fee = bidAmount.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(bidAmount).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee.div(2)),
      );
      expect(tx)
        .to.emit(auctionSale, 'Purchased')
        .withArgs(await alice.getAddress(), await bob.getAddress(), tokenId, bidAmount);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);
    });

    it('should not send fee if zero', async () => {
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      const data = await getDigest(auctionSale, bob, bidAmount, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(await bob.getAddress(), bidAmount, tokenId, v, r, s);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(bidAmount),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore);
      expect(tx)
        .to.emit(auctionSale, 'Purchased')
        .withArgs(await alice.getAddress(), await bob.getAddress(), tokenId, bidAmount);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);
    });
  });
});

const getDigest = async (sale: Contract, buyer: Wallet, price: BigNumber, saleId: BigNumber) => {
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
        sale.address,
      ],
    ),
  );
  const hash = keccak256(
    toUtf8Bytes('BidMessage(address bidder,uint256 price,uint256 saleId,uint256 nonce)'),
  );
  const nonce = await sale.nonces(await buyer.getAddress(), saleId);
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        separator,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'uint256', 'uint256', 'uint256'],
            [hash, await buyer.getAddress(), price, saleId, nonce],
          ),
        ),
      ],
    ),
  );
};
