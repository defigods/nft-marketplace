import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber, utils, constants } from "ethers";
import {
  DENOMINATOR,
  generateRandomAddress,
  PIXCategory,
  PIXSize,
} from "./utils";

describe("PIXFixedSale", function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let treasury: string = generateRandomAddress();
  let pixCluster: Contract;
  let fixedSale: Contract;
  const tradingFeePct = BigNumber.from("100");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];
    bob = signers[2];

    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixCluster = await PIXClusterFactory.deploy(generateRandomAddress(), generateRandomAddress());
    await pixCluster
      .connect(owner)
      .setModerator(await owner.getAddress(), true);

    const PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    fixedSale = await PIXFixedSaleFactory.deploy(treasury, tradingFeePct);

    await fixedSale.setWhitelistedNftTokens(pixCluster.address, true);
  });

  describe("#requestSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
    });

    it("revert if token is not whitelisted", async () => {
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(
            pixCluster.address,
            [tokenId],
            generateRandomAddress(),
            price
          )
      ).to.revertedWith("Not whitelisted");
    });

    it("revert if nft token is not whitelisted", async () => {
      const tokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);

      await expect(
        fixedSale
          .connect(alice)
          .requestSale(generateRandomAddress(), [tokenId], tokenAddress, 0)
      ).to.revertedWith("Not whitelisted");
    });

    it("revert if price is 0", async () => {
      const tokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(pixCluster.address, [tokenId], tokenAddress, 0)
      ).to.revertedWith(">0");
    });

    it("revert if no token list", async () => {
      const tokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(pixCluster.address, [], tokenAddress, 1)
      ).to.revertedWith("No tokens");
    });

    it("revert if PIX not approved", async () => {
      const tokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(pixCluster.address, [tokenId], tokenAddress, price)
      ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("should request sale and emit SaleRequested event", async () => {
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
      const tokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);
      const tx = await fixedSale
        .connect(alice)
        .requestSale(pixCluster.address, [tokenId], tokenAddress, price);

      const lastSaleId = 1;
      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixCluster.address);
      expect(saleInfo.paymentToken).to.be.equal(tokenAddress);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, "SaleRequested")
        .withArgs(
          await alice.getAddress(),
          lastSaleId,
          pixCluster.address,
          tokenAddress,
          [tokenId],
          price
        );
    });
  });

  describe("#updateSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");
    const tokenAddress = generateRandomAddress();
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);
      await fixedSale
        .connect(alice)
        .requestSale(pixCluster.address, [tokenId], tokenAddress, price);
    });

    it("revert if token is not whitelisted", async () => {
      await expect(
        fixedSale
          .connect(alice)
          .updateSale(lastSaleId, generateRandomAddress(), price)
      ).to.revertedWith("Not whitelisted");
    });

    it("revert if msg.sender is not seller", async () => {
      const newTokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(newTokenAddress, true);

      await expect(
        fixedSale.connect(bob).updateSale(lastSaleId, newTokenAddress, price)
      ).to.revertedWith("!seller");
    });

    it("revert if price is 0", async () => {
      const newTokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(newTokenAddress, true);

      await expect(
        fixedSale.connect(alice).updateSale(lastSaleId, newTokenAddress, 0)
      ).to.revertedWith(">0");
    });

    it("should update sale and emit SaleUpdated event", async () => {
      const newTokenAddress = generateRandomAddress();
      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(newTokenAddress, true);
      const newPrice = utils.parseEther("2");
      const tx = await fixedSale
        .connect(alice)
        .updateSale(lastSaleId, newTokenAddress, newPrice);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixCluster.address);
      expect(saleInfo.paymentToken).to.be.equal(newTokenAddress);
      expect(saleInfo.price).to.be.equal(newPrice);

      await expect(tx)
        .emit(fixedSale, "SaleUpdated")
        .withArgs(lastSaleId, newTokenAddress, newPrice);
    });
  });

  describe("#cancelSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");
    const tokenAddress = generateRandomAddress();
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);

      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(tokenAddress, true);

      await fixedSale
        .connect(alice)
        .requestSale(pixCluster.address, [tokenId], tokenAddress, price);
    });

    it("revert if msg.sender is not seller", async () => {
      await expect(
        fixedSale.connect(bob).cancelSale(lastSaleId)
      ).to.revertedWith("!seller");
    });

    it("should cancel sale and emit SaleCancelled event", async () => {
      const tx = await fixedSale.connect(alice).cancelSale(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.paymentToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await alice.getAddress()
      );

      await expect(tx).emit(fixedSale, "SaleCancelled").withArgs(lastSaleId);
    });
  });

  describe("#purchasePIX function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");
    const lastTokenId = 1;

    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);

      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(constants.AddressZero, true);

      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
    });

    it("revert if NFT is not for sale", async () => {
      await expect(
        fixedSale.connect(bob).purchasePIX(lastTokenId)
      ).to.revertedWith("!sale");
    });

    it("revert if not send correct ether", async () => {
      await fixedSale
        .connect(alice)
        .requestSale(
          pixCluster.address,
          [tokenId],
          constants.AddressZero,
          price
        );
      await expect(
        fixedSale
          .connect(bob)
          .purchasePIX(tokenId, { value: utils.parseEther("2") })
      ).to.revertedWith("!price");
    });

    it("should purchase PIX using ether and send to seller and treasury", async () => {
      await fixedSale
        .connect(alice)
        .requestSale(
          pixCluster.address,
          [tokenId],
          constants.AddressZero,
          price
        );
      const aliceBalanceBefore = await alice.getBalance();
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury);
      const tx = await fixedSale
        .connect(bob)
        .purchasePIX(lastTokenId, { value: price });
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      const fee = price.mul(tradingFeePct).div(DENOMINATOR);
      expect(await alice.getBalance()).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee)
      );
      expect(await ethers.provider.getBalance(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee)
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          lastTokenId,
          constants.AddressZero,
          price
        );
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.paymentToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it("should not send fee if tradingFeePct is zero", async () => {
      await fixedSale.connect(owner).setTradingFeePct(0);
      await fixedSale
        .connect(alice)
        .requestSale(
          pixCluster.address,
          [tokenId],
          constants.AddressZero,
          price
        );
      const aliceBalanceBefore = await alice.getBalance();
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury);
      const tx = await fixedSale
        .connect(bob)
        .purchasePIX(lastTokenId, { value: price });
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      expect(await alice.getBalance()).to.be.equal(
        aliceBalanceBefore.add(price)
      );
      expect(await ethers.provider.getBalance(treasury)).to.be.equal(
        treasuryBalanceBefore
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          lastTokenId,
          constants.AddressZero,
          price
        );
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.paymentToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it("should purchase PIX using ERC20 token and send to seller and treasury", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      await mockToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(mockToken.address, true);

      await fixedSale
        .connect(alice)
        .requestSale(pixCluster.address, [tokenId], mockToken.address, price);
      const aliceBalanceBefore = await mockToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchasePIX(lastTokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      const fee = price.mul(tradingFeePct).div(DENOMINATOR);
      expect(await mockToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee)
      );
      expect(await mockToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee)
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          lastTokenId,
          mockToken.address,
          price
        );
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it("should not send fee if tradingFeePct is zero", async () => {
      await fixedSale.connect(owner).setTradingFeePct(0);
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const mockToken = await MockTokenFactory.connect(bob).deploy();
      await mockToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale
        .connect(owner)
        .setWhitelistPaymentToken(mockToken.address, true);

      await fixedSale
        .connect(alice)
        .requestSale(pixCluster.address, [tokenId], mockToken.address, price);
      const aliceBalanceBefore = await mockToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await mockToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchasePIX(tokenId);
      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await bob.getAddress()
      );
      expect(await mockToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price)
      );
      expect(await mockToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          mockToken.address,
          price
        );
      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.paymentToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });
  });
});
