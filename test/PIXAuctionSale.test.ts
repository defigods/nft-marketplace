import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract, BigNumber, utils, constants } from 'ethers';
import {
  DENOMINATOR,
  generateRandomAddress,
  getCurrentTime,
  increaseTime,
  PIXCategory,
  PIXSize,
} from './utils';

describe('PIXAuctionSale', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let treasury: string = generateRandomAddress();
  let pixtToken: Contract;
  let pixNFT: Contract;
  let auctionSale: Contract;

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();

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
      await expect(auctionSale.connect(bob).updateSale(tokenId, endTime, minPrice)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('revert if minPrice is 0', async () => {
      await expect(auctionSale.connect(alice).updateSale(tokenId, endTime, 0)).to.revertedWith(
        'Sale: PRICE_ZERO',
      );
    });

    it('revert if endTime is less than block timestamp', async () => {
      const oldEndTime = (await getCurrentTime()).sub(BigNumber.from('10'));
      await expect(
        auctionSale.connect(alice).updateSale(tokenId, oldEndTime, minPrice),
      ).to.revertedWith('Sale: INVALID_TIME');
    });

    it('revert if there is bidder', async () => {
      await auctionSale.connect(bob).bid(tokenId, minPrice);
      await expect(
        auctionSale.connect(alice).updateSale(tokenId, endTime, minPrice),
      ).to.revertedWith('Sale: BID_EXIST');
    });

    it('should update sale and emit SaleUpdated event', async () => {
      const newPrice = utils.parseEther('2');
      const newEndTime = endTime.add(auctionPeriod);
      const tx = await auctionSale.connect(alice).updateSale(tokenId, newEndTime, newPrice);

      const lastSaleId = 1;
      const saleInfo = await auctionSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.endTime).to.be.equal(newEndTime);
      expect(saleInfo.minPrice).to.be.equal(newPrice);

      await expect(tx).emit(auctionSale, 'SaleUpdated').withArgs(tokenId, newEndTime, newPrice);
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

    it('revert if there is bidder', async () => {
      await auctionSale.connect(bob).bid(tokenId, minPrice);
      await expect(auctionSale.connect(alice).cancelSale(tokenId)).to.revertedWith(
        'Sale: BID_EXIST',
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

  describe('#bid function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it('revert if NFT is not for sale', async () => {
      await expect(auctionSale.connect(bob).bid(tokenId, minPrice)).to.revertedWith(
        'Sale: INVALID_ID',
      );
    });

    it('revert if send less than minPrice', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      const bidPrice = minPrice.sub(utils.parseEther('0.5'));
      await expect(auctionSale.connect(bob).bid(tokenId, bidPrice)).to.revertedWith(
        'Sale: INVALID_PRICE',
      );
    });

    it('revert if auction Sale: ALREADY_ENDED', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));
      await expect(auctionSale.connect(bob).bid(tokenId, minPrice)).to.revertedWith(
        'Sale: ALREADY_ENDED',
      );
    });

    it('should accept bid and emit Bid event', async () => {
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      const tx = await auctionSale.connect(bob).bid(tokenId, bidAmount);

      expect(await pixtToken.balanceOf(auctionSale.address)).to.be.equal(bidAmount);
      expect(tx)
        .to.emit(auctionSale, 'Bid')
        .withArgs(await bob.getAddress(), tokenId, bidAmount);
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(await bob.getAddress());
      expect(saleState.bidAmount).to.be.equal(bidAmount);
    });

    it('should refund previous bid', async () => {
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      const newBidAmount = bidAmount.add(utils.parseEther('0.1'));
      await pixtToken.connect(bob).transfer(await carol.getAddress(), newBidAmount);
      await pixtToken.connect(carol).approve(auctionSale.address, newBidAmount);

      const bobBalance = await pixtToken.balanceOf(await bob.getAddress());

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      const tx = await auctionSale.connect(bob).bid(tokenId, bidAmount);

      await auctionSale.connect(carol).bid(tokenId, newBidAmount);

      expect(await pixtToken.balanceOf(auctionSale.address)).to.be.equal(newBidAmount);
      expect(await pixtToken.balanceOf(await bob.getAddress())).to.be.equal(bobBalance);
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(await carol.getAddress());
      expect(saleState.bidAmount).to.be.equal(newBidAmount);
    });

    it('revert if send less than or equal to last bid amount', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      const topBid = minPrice.add(utils.parseEther('0.5'));
      await auctionSale.connect(bob).bid(tokenId, topBid);

      await expect(auctionSale.connect(carol).bid(tokenId, topBid)).to.revertedWith(
        'Sale: INVALID_PRICE',
      );

      await expect(
        auctionSale.connect(carol).bid(tokenId, topBid.sub(utils.parseEther('0.1'))),
      ).to.revertedWith('Sale: INVALID_PRICE');
    });
  });

  describe('#cancelBid function', () => {
    const tokenId = 1;
    const minPrice = utils.parseEther('1');
    const auctionPeriod = BigNumber.from('3600');
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixNFT.safeMint(await alice.getAddress(), [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it('revert if msg.sender is not bidder', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      const bidPrice = minPrice.add(utils.parseEther('0.5'));
      await auctionSale.connect(bob).bid(tokenId, bidPrice);

      await expect(auctionSale.connect(carol).cancelBid(tokenId)).to.revertedWith(
        'Sale: NOT_BIDDER',
      );
    });

    it('should accept bid and emit Bid event', async () => {
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, bidAmount);

      const bobBalanceBefore = await pixtToken.balanceOf(await bob.getAddress());
      const tx = await auctionSale.connect(bob).cancelBid(tokenId);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(auctionSale.address);
      expect(await pixtToken.balanceOf(await bob.getAddress())).to.be.equal(
        bobBalanceBefore.add(bidAmount),
      );
      expect(tx)
        .to.emit(auctionSale, 'BidCancelled')
        .withArgs(await bob.getAddress(), tokenId, bidAmount);
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal('0');
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

    it('revert if no bidder', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));
      await expect(auctionSale.endAuction(tokenId)).to.revertedWith('Sale: NO_BIDS');
    });

    it('revert if not ended yet', async () => {
      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, minPrice);
      await expect(auctionSale.endAuction(tokenId)).to.revertedWith('!Sale: ALREADY_ENDED');
    });

    it('should end auction and send PIX to top bidder and send PIXT to seller and treasury', async () => {
      await auctionSale.setTreasury(treasury, 50, 50, false);
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, bidAmount);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(tokenId);
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

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });

    it('should not send fee if zero', async () => {
      const bidAmount = minPrice.add(utils.parseEther('0.5'));

      await auctionSale.connect(alice).requestSale(pixNFT.address, [tokenId], endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, bidAmount);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await pixtToken.balanceOf(await alice.getAddress());
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(tokenId);
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

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });
  });
});
