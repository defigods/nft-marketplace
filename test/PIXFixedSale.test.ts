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
  let pixNFT: Contract;
  let fixedSale: Contract;
  let pixtToken: Contract;
  const tradingFeePct = BigNumber.from("100");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];
    bob = signers[2];

    const PIXFactory = await ethers.getContractFactory("PIX");
    pixNFT = await PIXFactory.deploy(generateRandomAddress());
    await pixNFT.connect(owner).setModerator(await owner.getAddress(), true);

    const PIXTFactory = await ethers.getContractFactory("PIXT");
    pixtToken = await PIXTFactory.connect(bob).deploy(
      utils.parseEther("140000000")
    );

    const PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    fixedSale = await PIXFixedSaleFactory.deploy(
      treasury,
      tradingFeePct,
      pixtToken.address
    );

    await fixedSale.setWhitelistedNftTokens(pixNFT.address, true);
  });

  describe("#requestSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");

    beforeEach(async () => {
      await pixNFT
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Sector,
        ]);
    });

    it("revert if nft token is not whitelisted", async () => {
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(generateRandomAddress(), [tokenId], 1)
      ).to.revertedWith("Not whitelisted");
    });

    it("revert if price is 0", async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], 0)
      ).to.revertedWith(">0");
    });

    it("revert if no token list", async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [], 1)
      ).to.revertedWith("No tokens");
    });

    it("revert if PIX not approved", async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price)
      ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("should request sale and emit SaleRequested event", async () => {
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);

      const tx = await fixedSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], price);

      const lastSaleId = 1;
      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, "SaleRequested")
        .withArgs(
          await alice.getAddress(),
          lastSaleId,
          pixNFT.address,
          [tokenId],
          price
        );
    });
  });

  describe("#updateSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Sector,
        ]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], price);
    });

    it("revert if msg.sender is not seller", async () => {
      await expect(
        fixedSale.connect(bob).updateSale(lastSaleId, price)
      ).to.revertedWith("!seller");
    });

    it("revert if price is 0", async () => {
      await expect(
        fixedSale.connect(alice).updateSale(lastSaleId, 0)
      ).to.revertedWith(">0");
    });

    it("should update sale and emit SaleUpdated event", async () => {
      const newPrice = utils.parseEther("2");
      const tx = await fixedSale
        .connect(alice)
        .updateSale(lastSaleId, newPrice);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(newPrice);

      await expect(tx)
        .emit(fixedSale, "SaleUpdated")
        .withArgs(lastSaleId, newPrice);
    });
  });

  describe("#cancelSale function", () => {
    const tokenId = 1;
    const price = utils.parseEther("1");
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Sector,
        ]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], price);
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
      expect(saleInfo.price).to.be.equal(0);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(
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
      await pixNFT
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Sector,
        ]);

      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it("revert if NFT is not for sale", async () => {
      await expect(
        fixedSale.connect(bob).purchasePIX(lastTokenId)
      ).to.revertedWith("!sale");
    });

    it("should purchase PIX and send to seller and treasury", async () => {
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchasePIX(lastTokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      const fee = price.mul(tradingFeePct).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee)
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore.add(fee)
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          lastTokenId,
          price
        );
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it("should not send fee if tradingFeePct is zero", async () => {
      await fixedSale.connect(owner).setTradingFeePct(0);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale
        .connect(alice)
        .requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(
        await alice.getAddress()
      );
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchasePIX(tokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(await bob.getAddress());
      expect(await pixtToken.balanceOf(await alice.getAddress())).to.be.equal(
        aliceBalanceBefore.add(price)
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(
        treasuryBalanceBefore
      );
      expect(tx)
        .to.emit(fixedSale, "Purchased")
        .withArgs(
          await alice.getAddress(),
          await bob.getAddress(),
          tokenId,
          price
        );
      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });
  });
});
