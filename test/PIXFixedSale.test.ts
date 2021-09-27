import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Signer,
  Contract,
  BigNumber,
  utils,
  ContractFactory,
  constants,
} from "ethers";
import { DENOMINATOR, generateRandomAddress } from "./utils";

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
    pixCluster = await PIXClusterFactory.deploy();
    await pixCluster
      .connect(owner)
      .setModerator(await owner.getAddress(), true);

    const PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    fixedSale = await PIXFixedSaleFactory.deploy(
      pixCluster.address,
      treasury,
      tradingFeePct
    );
  });

  describe("#requestSale function", () => {
    const tokenId = 0;
    const price = utils.parseEther("1");

    beforeEach(async () => {
      await pixCluster.connect(owner).safeMint(await alice.getAddress());
    });

    it("revert if price is 0", async () => {
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(tokenId, generateRandomAddress(), 0)
      ).to.revertedWith(">0");
    });

    it("revert if PIX not approved", async () => {
      await expect(
        fixedSale
          .connect(alice)
          .requestSale(tokenId, generateRandomAddress(), price)
      ).to.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("should request sale and emit SaleRequested event", async () => {
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
      const tokenAddress = generateRandomAddress();
      const tx = await fixedSale
        .connect(alice)
        .requestSale(tokenId, tokenAddress, price);

      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.token).to.be.equal(tokenAddress);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, "SaleRequested")
        .withArgs(await alice.getAddress(), tokenId, tokenAddress, price);
    });
  });

  describe("#updateSale function", () => {
    const tokenId = 0;
    const price = utils.parseEther("1");
    const tokenAddress = generateRandomAddress();

    beforeEach(async () => {
      await pixCluster.connect(owner).safeMint(await alice.getAddress());
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(tokenId, tokenAddress, price);
    });

    it("revert if msg.sender is not seller", async () => {
      await expect(
        fixedSale
          .connect(bob)
          .updateSale(tokenId, generateRandomAddress(), price)
      ).to.revertedWith("!seller");
    });

    it("revert if price is 0", async () => {
      await expect(
        fixedSale.connect(alice).updateSale(tokenId, generateRandomAddress(), 0)
      ).to.revertedWith(">0");
    });

    it("should update sale and emit SaleUpdated event", async () => {
      const newTokenAddress = generateRandomAddress();
      const newPrice = utils.parseEther("2");
      const tx = await fixedSale
        .connect(alice)
        .updateSale(tokenId, newTokenAddress, newPrice);

      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(await alice.getAddress());
      expect(saleInfo.token).to.be.equal(newTokenAddress);
      expect(saleInfo.price).to.be.equal(newPrice);

      await expect(tx)
        .emit(fixedSale, "SaleUpdated")
        .withArgs(tokenId, newTokenAddress, newPrice);
    });
  });

  describe("#cancelSale function", () => {
    const tokenId = 0;
    const price = utils.parseEther("1");
    const tokenAddress = generateRandomAddress();

    beforeEach(async () => {
      await pixCluster.connect(owner).safeMint(await alice.getAddress());
      await pixCluster.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(tokenId, tokenAddress, price);
    });

    it("revert if msg.sender is not seller", async () => {
      await expect(fixedSale.connect(bob).cancelSale(tokenId)).to.revertedWith(
        "!seller"
      );
    });

    it("should cancel sale and emit SaleCancelled event", async () => {
      const tx = await fixedSale.connect(alice).cancelSale(tokenId);

      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.token).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);

      expect(await pixCluster.ownerOf(tokenId)).to.be.equal(
        await alice.getAddress()
      );

      await expect(tx).emit(fixedSale, "SaleCancelled").withArgs(tokenId);
    });
  });
});
