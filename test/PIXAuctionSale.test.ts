import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber, utils, constants } from "ethers";
import {
  DENOMINATOR,
  generateRandomAddress,
  getCurrentTime,
  increaseTime,
  PIXCategory,
  PIXSize,
} from "./utils";

describe("PIXAuctionSale", function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let treasury: string = generateRandomAddress();
  let pixCluster: Contract;
  let auctionSale: Contract;
  const tradingFeePct = BigNumber.from("100");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];
    bob = signers[2];
    carol = signers[3];

    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixCluster = await PIXClusterFactory.deploy();
    await pixCluster
      .connect(owner)
      .setModerator(await owner.getAddress(), true);

    const PIXAuctionSaleFactory = await ethers.getContractFactory(
      "PIXAuctionSale"
    );
    auctionSale = await PIXAuctionSaleFactory.deploy(
      pixCluster.address,
      treasury,
      tradingFeePct
    );
  });

  describe("#requestSale function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it("revert if token is not whitelisted", async () => {
      await expect(
        auctionSale
          .connect(alice)
          .requestSale(tokenId, generateRandomAddress(), endTime, 0)
      ).to.revertedWith("not whitelisted");
    });

    it("revert if minPrice is 0", async () => {
      const tokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(tokenAddress, true);

      await expect(
        auctionSale
          .connect(alice)
          .requestSale(tokenId, tokenAddress, endTime, 0)
      ).to.revertedWith(">0");
    });

    it("revert if endTime is less than block timestamp", async () => {
      const tokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(tokenAddress, true);

      const oldEndTime = (await getCurrentTime()).sub(BigNumber.from("10"));
      await expect(
        auctionSale
          .connect(alice)
          .requestSale(tokenId, tokenAddress, oldEndTime, minPrice)
      ).to.revertedWith("invalid time");
    });

    it("revert if PIX not approved", async () => {
      const tokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(tokenAddress, true);

      await expect(
        auctionSale
          .connect(alice)
          .requestSale(tokenId, tokenAddress, endTime, minPrice)
      ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("should request sale and emit SaleRequested event", async () => {
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      const tokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(tokenAddress, true);

      const tx = await auctionSale
        .connect(alice)
        .requestSale(tokenId, tokenAddress, endTime, minPrice);

      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.token).to.be.equal(tokenAddress);
      expect(saleInfo.endTime).to.be.equal(endTime);
      expect(saleInfo.minPrice).to.be.equal(minPrice);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        auctionSale.address
      );

      await expect(tx)
        .emit(auctionSale, "SaleRequested")
        .withArgs(
          await alice.getAddress(),
          tokenId,
          tokenAddress,
          endTime,
          minPrice
        );
    });
  });

  describe("#updateSale function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const tokenAddress = constants.AddressZero;
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);

      await auctionSale.connect(owner).setWhitelist(tokenAddress, true);

      await auctionSale
        .connect(alice)
        .requestSale(tokenId, tokenAddress, endTime, minPrice);
    });

    it("revert if token is not whitelisted", async () => {
      await expect(
        auctionSale
          .connect(alice)
          .updateSale(tokenId, generateRandomAddress(), endTime, minPrice)
      ).to.revertedWith("not whitelisted");
    });

    it("revert if msg.sender is not seller", async () => {
      const newTokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(newTokenAddress, true);

      await expect(
        auctionSale
          .connect(bob)
          .updateSale(tokenId, newTokenAddress, endTime, minPrice)
      ).to.revertedWith("!seller");
    });

    it("revert if minPrice is 0", async () => {
      const newTokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(newTokenAddress, true);

      await expect(
        auctionSale
          .connect(alice)
          .updateSale(tokenId, newTokenAddress, endTime, 0)
      ).to.revertedWith(">0");
    });

    it("revert if endTime is less than block timestamp", async () => {
      const newTokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(newTokenAddress, true);

      const oldEndTime = (await getCurrentTime()).sub(BigNumber.from("10"));
      await expect(
        auctionSale
          .connect(alice)
          .updateSale(tokenId, newTokenAddress, oldEndTime, minPrice)
      ).to.revertedWith("invalid time");
    });

    it("revert if there is bidder", async () => {
      const newTokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(newTokenAddress, true);

      await auctionSale
        .connect(bob)
        .bid(tokenId, minPrice, { value: minPrice });
      await expect(
        auctionSale
          .connect(alice)
          .updateSale(tokenId, newTokenAddress, endTime, minPrice)
      ).to.revertedWith("has bid");
    });

    it("should update sale and emit SaleUpdated event", async () => {
      const newTokenAddress = generateRandomAddress();
      await auctionSale.connect(owner).setWhitelist(newTokenAddress, true);
      const newPrice = utils.parseEther("2");
      const newEndTime = endTime.add(auctionPeriod);
      const tx = await auctionSale
        .connect(alice)
        .updateSale(tokenId, newTokenAddress, newEndTime, newPrice);

      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.token).to.be.equal(newTokenAddress);
      expect(saleInfo.endTime).to.be.equal(newEndTime);
      expect(saleInfo.minPrice).to.be.equal(newPrice);

      await expect(tx)
        .emit(auctionSale, "SaleUpdated")
        .withArgs(tokenId, newTokenAddress, newEndTime, newPrice);
    });
  });

  describe("#cancelSale function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const tokenAddress = constants.AddressZero;
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, tokenAddress, endTime, minPrice);
    });

    it("revert if msg.sender is not seller", async () => {
      await expect(
        auctionSale.connect(bob).cancelSale(tokenId)
      ).to.revertedWith("!seller");
    });

    it("revert if there is bidder", async () => {
      await auctionSale
        .connect(bob)
        .bid(tokenId, minPrice, { value: minPrice });
      await expect(
        auctionSale.connect(alice).cancelSale(tokenId)
      ).to.revertedWith("has bid");
    });

    it("should cancel sale and emit SaleCancelled event", async () => {
      const tx = await auctionSale.connect(alice).cancelSale(tokenId);

      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.token).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await alice.getAddress()
      );

      await expect(tx).emit(auctionSale, "SaleCancelled").withArgs(tokenId);
    });
  });

  describe("#bid function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it("revert if NFT is not for sale", async () => {
      await expect(
        auctionSale.connect(bob).bid(tokenId, minPrice, { value: minPrice })
      ).to.revertedWith("!sale");
    });

    it("revert if send less than minPrice", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      const bidPrice = minPrice.sub(utils.parseEther("0.5"));
      await expect(
        auctionSale.connect(bob).bid(tokenId, bidPrice, { value: bidPrice })
      ).to.revertedWith("invalid price");
    });

    it("revert if not send correct ether", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await expect(
        auctionSale
          .connect(bob)
          .bid(tokenId, minPrice, { value: utils.parseEther("2") })
      ).to.revertedWith("invalid amount");
    });

    it("revert if auction ended", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));
      await expect(
        auctionSale.connect(bob).bid(tokenId, minPrice, { value: minPrice })
      ).to.revertedWith("ended");
    });

    it("should accept Ether bid and emit Bid event", async () => {
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      const tx = await auctionSale
        .connect(bob)
        .bid(tokenId, bidAmount, { value: bidAmount });
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        auctionSale.address
      );
      expect(await ethers.provider.getBalance(auctionSale.address)).to.be.equal(
        bidAmount
      );
      expect(tx)
        .to.emit(auctionSale, "Bid")
        .withArgs(
          await bob.getAddress(),
          tokenId,
          constants.AddressZero,
          bidAmount
        );
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(await bob.getAddress());
      expect(saleState.bidAmount).to.be.equal(bidAmount);
    });

    it("should accept ERC20 bid and emit Bid event", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await mockToken.connect(bob).approve(auctionSale.address, bidAmount);

      await auctionSale
        .connect(alice)
        .requestSale(tokenId, mockToken.address, endTime, minPrice);
      const tx = await auctionSale.connect(bob).bid(tokenId, bidAmount);

      expect(await mockToken.balanceOf(auctionSale.address)).to.be.equal(
        bidAmount
      );
      expect(tx)
        .to.emit(auctionSale, "Bid")
        .withArgs(
          await bob.getAddress(),
          tokenId,
          mockToken.address,
          bidAmount
        );
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(await bob.getAddress());
      expect(saleState.bidAmount).to.be.equal(bidAmount);
    });

    it("revert if send less than or equal to last bid amount", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      const topBid = minPrice.add(utils.parseEther("0.5"));
      await auctionSale.connect(bob).bid(tokenId, topBid, { value: topBid });

      await expect(
        auctionSale.connect(carol).bid(tokenId, topBid, { value: topBid })
      ).to.revertedWith("invalid price");

      await expect(
        auctionSale
          .connect(carol)
          .bid(tokenId, topBid.sub(utils.parseEther("0.1")), {
            value: topBid.sub(utils.parseEther("0.1")),
          })
      ).to.revertedWith("invalid price");
    });
  });

  describe("#cancelBid function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it("revert if msg.sender is not bidder", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      const bidPrice = minPrice.add(utils.parseEther("0.5"));
      await auctionSale
        .connect(bob)
        .bid(tokenId, bidPrice, { value: bidPrice });

      await expect(
        auctionSale.connect(carol).cancelBid(tokenId)
      ).to.revertedWith("!bidder");
    });

    it("should cancel Ether bid and emit BidCancelled event", async () => {
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await auctionSale
        .connect(bob)
        .bid(tokenId, bidAmount, { value: bidAmount });

      const bobBalanceBefore = await bob.getBalance();
      const tx = await auctionSale.connect(bob).cancelBid(tokenId);
      const receipt = await tx.wait();

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        auctionSale.address
      );

      expect(await bob.getBalance()).to.be.equal(
        bobBalanceBefore
          .add(bidAmount)
          .sub(receipt.effectiveGasPrice.mul(receipt.gasUsed))
      );
      expect(tx)
        .to.emit(auctionSale, "BidCancelled")
        .withArgs(
          await bob.getAddress(),
          tokenId,
          constants.AddressZero,
          bidAmount
        );
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal("0");
    });

    it("should accept ERC20 bid and emit Bid event", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await mockToken.connect(bob).approve(auctionSale.address, bidAmount);

      await auctionSale
        .connect(alice)
        .requestSale(tokenId, mockToken.address, endTime, minPrice);
      await auctionSale
        .connect(bob)
        .bid(tokenId, bidAmount, { value: bidAmount });

      const bobBalanceBefore = await mockToken.balanceOf(
        await bob.getAddress()
      );
      const tx = await auctionSale.connect(bob).cancelBid(tokenId);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        auctionSale.address
      );
      expect(await mockToken.balanceOf(await bob.getAddress())).to.be.equal(
        bobBalanceBefore.add(bidAmount)
      );
      expect(tx)
        .to.emit(auctionSale, "BidCancelled")
        .withArgs(
          await bob.getAddress(),
          tokenId,
          mockToken.address,
          bidAmount
        );
      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal("0");
    });
  });

  describe("#endAuction function", () => {
    const tokenId = 1;
    const minPrice = utils.parseEther("1");
    const auctionPeriod = BigNumber.from("3600");
    let endTime: BigNumber;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(auctionSale.address, tokenId);
      endTime = (await getCurrentTime()).add(auctionPeriod);
    });

    it("revert if no bidder", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await increaseTime(auctionPeriod.add(auctionPeriod));
      await expect(auctionSale.endAuction(tokenId)).to.revertedWith("!bid");
    });

    it("revert if not ended yet", async () => {
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await auctionSale
        .connect(bob)
        .bid(tokenId, minPrice, { value: minPrice });
      await expect(auctionSale.endAuction(tokenId)).to.revertedWith("!ended");
    });

    it("should end auction and send PIX to top bidder and send ether to seller and treasury", async () => {
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await auctionSale
        .connect(bob)
        .bid(tokenId, bidAmount, { value: bidAmount });
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await alice.getBalance();
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury);
      const tx = await auctionSale.endAuction(tokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      const fee = bidAmount.mul(tradingFeePct).div(DENOMINATOR);
      expect(await alice.getBalance()).to.be.equal(
        aliceBalanceBefore.add(bidAmount).sub(fee)
      );
      expect(await ethers.provider.getBalance(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee)
      );
      expect(tx)
        .to.emit(auctionSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          constants.AddressZero,
          bidAmount
        );
      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });

    it("should not send fee if tradingFeePct is zero", async () => {
      await auctionSale.connect(owner).setTradingFeePct(0);
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      await auctionSale
        .connect(alice)
        .requestSale(tokenId, constants.AddressZero, endTime, minPrice);
      await auctionSale
        .connect(bob)
        .bid(tokenId, bidAmount, { value: bidAmount });
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await alice.getBalance();
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury);
      const tx = await auctionSale.endAuction(tokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      expect(await alice.getBalance()).to.be.equal(
        aliceBalanceBefore.add(bidAmount)
      );
      expect(await ethers.provider.getBalance(treasury)).to.be.equal(
        treasuryBalanceBefore
      );
      expect(tx)
        .to.emit(auctionSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          constants.AddressZero,
          bidAmount
        );
      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });

    it("should end auction and send PIX to top bidder and send ERC20 to seller and treasury", async () => {
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      await mockToken.connect(bob).approve(auctionSale.address, bidAmount);

      await auctionSale
        .connect(alice)
        .requestSale(tokenId, mockToken.address, endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, bidAmount);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await mockToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(tokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      const fee = bidAmount.mul(tradingFeePct).div(DENOMINATOR);
      expect(await mockToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(bidAmount).sub(fee)
      );
      expect(await mockToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee)
      );
      expect(tx)
        .to.emit(auctionSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          mockToken.address,
          bidAmount
        );
      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });

    it("should not send ERC20 fee if tradingFeePct is zero", async () => {
      await auctionSale.connect(owner).setTradingFeePct(0);
      const bidAmount = minPrice.add(utils.parseEther("0.5"));
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      await mockToken.connect(bob).approve(auctionSale.address, bidAmount);

      await auctionSale
        .connect(alice)
        .requestSale(tokenId, mockToken.address, endTime, minPrice);
      await auctionSale.connect(bob).bid(tokenId, bidAmount);
      await increaseTime(auctionPeriod.add(auctionPeriod));

      const aliceBalanceBefore = await mockToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury);
      const tx = await auctionSale.endAuction(tokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      expect(await mockToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(bidAmount)
      );
      expect(await mockToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore
      );
      expect(tx)
        .to.emit(auctionSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          mockToken.address,
          bidAmount
        );
      const saleInfo = await auctionSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.endTime).to.be.equal(0);
      expect(saleInfo.minPrice).to.be.equal(0);

      const saleState = await auctionSale.saleState(tokenId);
      expect(saleState.bidder).to.be.equal(constants.AddressZero);
      expect(saleState.bidAmount).to.be.equal(0);
    });
  });
});
