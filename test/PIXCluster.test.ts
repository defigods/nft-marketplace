import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber, constants } from "ethers";
import { PIXCategory, PIXSize } from "./utils";

describe("PIXCluster", function () {
  let owner: Signer;
  let alice: Signer;
  let pixToken: Contract;
  let pixNFT: Contract;
  const price = 50;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    pixToken = await MockTokenFactory.deploy();
    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixNFT = await PIXClusterFactory.deploy(pixToken.address);
    await pixToken.transfer(await alice.getAddress(), BigNumber.from(200));
    await pixToken.connect(alice).approve(pixNFT.address, BigNumber.from(200));
  });

  describe("constructor", () => {
    it("revert if token is zero address", async function () {
      const PIXCluster = await ethers.getContractFactory("PIXCluster");
      await expect(PIXCluster.deploy(constants.AddressZero)).to.revertedWith(
        "PIX Token cannot be zero address"
      );
    });

    it("check initial values", async function () {
      expect(await pixNFT.combineCounts(PIXSize.Cluster)).equal(50);
      expect(await pixNFT.moderators(await owner.getAddress())).equal(true);
    });
  });

  describe("#setModerator", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixNFT.connect(alice).setModerator(await alice.getAddress(), true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if moderator is zero address", async () => {
      await expect(
        pixNFT.setModerator(constants.AddressZero, true)
      ).to.revertedWith("Moderator cannot be zero address");
    });

    it("should set moderator by owner", async () => {
      await pixNFT.setModerator(await alice.getAddress(), true);
      expect(await pixNFT.moderators(await alice.getAddress())).to.equal(true);

      await pixNFT.setModerator(await alice.getAddress(), false);
      expect(await pixNFT.moderators(await alice.getAddress())).to.equal(false);
    });
  });

  describe("#setMintFee", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(pixNFT.connect(alice).setMintFee(price)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("revert if fee is zero", async () => {
      await expect(pixNFT.setMintFee(0)).to.revertedWith("Fee cannot be zero");
    });

    it("should set fee by owner", async () => {
      await pixNFT.setMintFee(price);
      expect(await pixNFT.mintFee()).to.equal(price);
    });
  });

  describe("#setCombineFee", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(pixNFT.connect(alice).setCombineFee(price)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("revert if fee is zero", async () => {
      await expect(pixNFT.setCombineFee(0)).to.revertedWith(
        "Fee cannot be zero"
      );
    });

    it("should set fee by owner", async () => {
      await pixNFT.setCombineFee(price);
      expect(await pixNFT.combineFee()).to.equal(price);
    });
  });

  describe("#requestMint", function () {
    it("revert if price not set", async function () {
      await expect(pixNFT.connect(alice).requestMint()).to.revertedWith(
        "Purchase price not set"
      );
    });

    it("revert if pending request exists", async function () {
      await pixNFT.setMintFee(price);
      await pixNFT.connect(alice).requestMint();
      await expect(pixNFT.connect(alice).requestMint()).to.revertedWith(
        "Pending mint request exists"
      );
    });

    it("should request mint by paying pixt", async function () {
      await pixNFT.setMintFee(price);
      const tx = await pixNFT.connect(alice).requestMint();
      expect(tx)
        .to.emit(pixNFT, "Requested")
        .withArgs(await alice.getAddress());
      expect(await pixNFT.requested(await alice.getAddress())).to.equal(true);
      expect(await pixToken.balanceOf(pixNFT.address)).equal(price);
    });
  });

  describe("#mintTo", () => {
    it("revert if msg.sender is not moderator", async function () {
      await expect(
        pixNFT.connect(alice).mintTo(await alice.getAddress(), [], [])
      ).to.revertedWith("Caller is not moderator");
    });

    it("revert if no pending request exists", async function () {
      await expect(
        pixNFT.mintTo(await alice.getAddress(), [], [])
      ).to.revertedWith("No pending mint request");
    });

    it("revert if invalid categories length", async function () {
      await pixNFT.setMintFee(price);
      await pixNFT.connect(alice).requestMint();
      await expect(
        pixNFT.mintTo(await alice.getAddress(), [], [])
      ).to.revertedWith("Invalid categories length");
    });

    it("should mint new clusters by moderator", async () => {
      await pixNFT.setMintFee(price);
      await pixNFT.connect(alice).requestMint();

      const pixIds = [];
      const categories = [];
      for (let i = 0; i < 50; i++) {
        pixIds.push(i + 1);
        categories.push(
          [
            PIXCategory.Legendary,
            PIXCategory.Rare,
            PIXCategory.Uncommon,
            PIXCategory.Common,
            PIXCategory.Outliers,
          ][Math.floor(Math.random() * 5)]
        );
      }
      await pixNFT.mintTo(await alice.getAddress(), pixIds, categories);

      expect(await pixNFT.balanceOf(await alice.getAddress())).to.equal(50);
    });
  });

  describe("#safeMint", () => {
    it("revert if pix info is invalid", async () => {
      await expect(
        pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Cluster,
        ])
      ).to.revertedWith("Invalid PIX info");
      await expect(
        pixNFT.safeMint(await alice.getAddress(), [
          1,
          PIXCategory.Common,
          PIXSize.Domain,
        ])
      ).to.revertedWith("Invalid PIX info");
    });

    it("should safe mint", async () => {
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Domain,
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Common,
        PIXSize.Cluster,
      ]);
      expect(await pixNFT.totalSupply()).to.equal(2);
    });
  });

  describe("#batchMint", () => {
    it("revert if mint length is invalid", async () => {
      await expect(
        pixNFT.batchMint(await alice.getAddress(), [])
      ).to.revertedWith("Invalid pixes length");
    });

    it("should batch mint", async () => {
      const infos = [];
      for (let i = 0; i < 10; i++) {
        infos.push([0, PIXCategory.Common, PIXSize.Domain]);
      }
      await pixNFT.batchMint(await alice.getAddress(), infos);
      expect(await pixNFT.totalSupply()).to.equal(10);
    });
  });

  describe("#combine", () => {
    beforeEach(async function () {
      await pixNFT.setMintFee(price);
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken
        .connect(alice)
        .approve(pixNFT.address, BigNumber.from(100));
    });

    it("revert if price not set", async () => {
      await expect(pixNFT.connect(alice).combine([])).to.revertedWith(
        "Combine price not set"
      );
    });

    it("revert if no tokens", async () => {
      await pixNFT.setCombineFee(price);
      await expect(pixNFT.connect(alice).combine([])).to.revertedWith(
        "No tokens"
      );
    });

    it("revert if size is federation", async () => {
      await pixNFT.setCombineFee(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Federation,
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Federation,
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith(
        "Cannot combine max size"
      );
    });

    it("revert if combine length is invalid", async () => {
      await pixNFT.setCombineFee(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Rare,
        PIXSize.Cluster,
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        1,
        PIXCategory.Rare,
        PIXSize.Cluster,
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith(
        "Invalid combination"
      );
    });

    it("revert if to combine different size", async () => {
      await pixNFT.setCombineFee(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Domain,
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith(
        "Should combine same sizes"
      );
    });

    it("revert if to combine different categories", async () => {
      await pixNFT.setCombineFee(price);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Rare,
        PIXSize.Sector,
      ]);
      await pixNFT.safeMint(await alice.getAddress(), [
        0,
        PIXCategory.Common,
        PIXSize.Sector,
      ]);
      await expect(pixNFT.connect(alice).combine([1, 2])).to.revertedWith(
        "Should combine same categories"
      );
    });

    it("revert if not owner", async () => {
      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Rare,
          PIXSize.Domain,
        ]);
        tokenIds.push(i + 1);
      }
      await expect(pixNFT.combine(tokenIds)).to.revertedWith(
        "Caller is not owner"
      );
    });

    it("should combine clusters to mint area", async () => {
      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 50; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          i + 1,
          PIXCategory.Common,
          PIXSize.Cluster,
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(51)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixNFT, "Combined")
        .withArgs(51, PIXCategory.Common, PIXSize.Area);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it("should combine areas to mint sector", async () => {
      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 5; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Area,
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(6)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixNFT, "Combined")
        .withArgs(6, PIXCategory.Common, PIXSize.Sector);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it("should combine sectors to mint domain", async () => {
      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Sector,
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixNFT, "Combined")
        .withArgs(3, PIXCategory.Common, PIXSize.Domain);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });

    it("should combine domain to mint federation", async () => {
      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 2; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          0,
          PIXCategory.Common,
          PIXSize.Domain,
        ]);
        tokenIds.push(i + 1);
      }
      const tx = await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixNFT.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixNFT, "Combined")
        .withArgs(3, PIXCategory.Common, PIXSize.Federation);
      expect(await pixNFT.totalSupply()).to.equal(1);
    });
  });

  describe("#withdraw", () => {
    beforeEach(async function () {
      await pixNFT.setMintFee(price);
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken
        .connect(alice)
        .approve(pixNFT.address, BigNumber.from(100));
    });

    it("revert if msg.sender is not owner", async () => {
      await expect(pixNFT.connect(alice).withdraw()).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should withdraw pixt tokens to owner address", async () => {
      await pixNFT.connect(alice).requestMint();
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(50);
      await pixNFT.withdraw();
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(0);

      await pixNFT.setCombineFee(price);
      const tokenIds = [];
      for (let i = 0; i < 50; i++) {
        await pixNFT.safeMint(await alice.getAddress(), [
          i + 1,
          PIXCategory.Common,
          PIXSize.Cluster,
        ]);
        tokenIds.push(i + 1);
      }
      await pixNFT.connect(alice).combine(tokenIds);
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(50);
      await pixNFT.withdraw();
      expect(await pixToken.balanceOf(pixNFT.address)).to.equal(0);
    });
  });

  describe("#setBaseURI", () => {
    const uri = "https://planetix.com/nfts/";

    it("revert if msg.sender is not owner", async () => {
      await expect(pixNFT.connect(alice).setBaseURI(uri)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should set base uri by owner", async () => {
      await pixNFT.setBaseURI(uri);
      await pixNFT.setMintFee(price);
      await pixNFT.connect(alice).requestMint();
      await pixNFT.mintTo(
        await alice.getAddress(),
        new Array(50).fill(1),
        new Array(50).fill(PIXCategory.Common)
      );
      expect(await pixNFT.tokenURI(1)).to.equal(uri + "1");
    });
  });
});
