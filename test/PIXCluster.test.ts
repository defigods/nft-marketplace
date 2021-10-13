import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber, constants } from "ethers";
import { PIXCategory, PIXSize } from "./utils";

describe("PIXCluster", function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let pixToken: Contract;
  let pixCluster: Contract;
  const price = ethers.utils.parseEther("1.0");

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    pixToken = await MockTokenFactory.deploy();
    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixCluster = await PIXClusterFactory.deploy(pixToken.address);
  });

  describe("constructor", () => {
    it("revert if token is zero address", async function () {
      const PIXCluster = await ethers.getContractFactory("PIXCluster");
      await expect(
        PIXCluster.deploy(constants.AddressZero)
      ).to.revertedWith("PIX Token cannot be zero address");
    });

    it("check initial values", async function () {
      expect(await pixCluster.combineCounts(PIXSize.Cluster)).equal(50);
      expect(await pixCluster.moderators(await owner.getAddress())).equal(true);
    });
  });

  describe("#setModerator", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setModerator(await alice.getAddress(), true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if moderator is zero address", async () => {
      await expect(
        pixCluster.setModerator(constants.AddressZero, true)
      ).to.revertedWith("Moderator cannot be zero address");
    });

    it("should set moderator by owner", async () => {
      await pixCluster.setModerator(await alice.getAddress(), true);
      expect(await pixCluster.moderators(await alice.getAddress())).to.be.equal(true);

      await pixCluster.setModerator(await alice.getAddress(), false);
      expect(await pixCluster.moderators(await alice.getAddress())).to.be.equal(false);
    });
  });

  describe("#setMintFee", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setMintFee(price)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if fee is zero", async () => {
      await expect(
        pixCluster.setMintFee(0)
      ).to.revertedWith("Fee cannot be zero");
    });

    it("should set fee by owner", async () => {
      await pixCluster.setMintFee(price);
      expect(await pixCluster.mintFee()).to.equal(price);
    });
  });

  describe("#setCombineFee", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setCombineFee(price)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if fee is zero", async () => {
      await expect(
        pixCluster.setCombineFee(0)
      ).to.revertedWith("Fee cannot be zero");
    });

    it("should set fee by owner", async () => {
      await pixCluster.setCombineFee(price);
      expect(await pixCluster.combineFee()).to.equal(price);
    });
  });

  describe("#requestMint", function () {
    it("revert if price is not set", async function () {
      await expect(
        pixCluster.connect(alice).requestMint()
      ).to.revertedWith("Purchase price not set");
    })

    it("revert if insufficient value", async function () {
      await pixCluster.setMintFee(price);
      await expect(
        pixCluster.connect(alice).requestMint()
      ).to.revertedWith("Insufficient for purchase");
    })

    it("revert if pending request exists", async function () {
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });
      await expect(
        pixCluster.connect(alice).requestMint({ value: price })
      ).to.revertedWith("Pending mint request exists");
    })

    it("should request mint by paying ether", async function () {
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });
      expect(await pixCluster.requested(await alice.getAddress())).to.equal(true);
      expect(await ethers.provider.getBalance(pixCluster.address)).equal(price);
    })
  });

  describe("#mintTo", () => {
    it("revert if msg.sender is not moderator", async function () {
      await expect(
        pixCluster.connect(alice).mintTo(await alice.getAddress(), [])
      ).to.revertedWith("Caller is not moderator");
    })

    it("revert if no pending request exists", async function () {
      await expect(
        pixCluster.mintTo(await alice.getAddress(), [])
      ).to.revertedWith("No pending mint request");
    })

    it("revert if invalid categories length", async function () {
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });
      await expect(
        pixCluster.mintTo(await alice.getAddress(), [])
      ).to.revertedWith("Invalid categories length");
    })

    it("should mint new clusters by moderator", async () => {
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });

      const categories = [];
      for (let i = 0; i < 50; i ++) {
        categories.push([
          PIXCategory.Legendary, PIXCategory.Rare, PIXCategory.Uncommon,
          PIXCategory.Common, PIXCategory.Outliers][Math.floor(Math.random() * 5)]
        );
      }
      await pixCluster.mintTo(await alice.getAddress(), categories);

      expect(await pixCluster.balanceOf(await alice.getAddress())).to.equal(50);
    });
  });

  describe("#combine", () => {
    beforeEach(async function () {
      await pixCluster.setMintFee(price);
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken.connect(alice).approve(pixCluster.address, BigNumber.from(100));
    });

    it("revert if price not set", async () => {
      await expect(
        pixCluster.connect(alice).combine([])
      ).to.revertedWith("Combine price not set");
    });

    it("revert if no tokens", async () => {
      await pixCluster.setCombineFee(50);
      await expect(
        pixCluster.connect(alice).combine([])
      ).to.revertedWith("No tokens");
    });

    it("revert if size is federation", async () => {
      await pixCluster.setCombineFee(50);
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Federation]
      );
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Federation]
      );
      await expect(
        pixCluster.connect(alice).combine([1, 2])
      ).to.revertedWith("Cannot combine max size");
    });

    it("revert if combine length is invalid", async () => {
      await pixCluster.setCombineFee(50);
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Cluster]
      );
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Cluster]
      );
      await expect(
        pixCluster.connect(alice).combine([1, 2])
      ).to.revertedWith("Invalid combination");
    });

    it("revert if to combine different size", async () => {
      await pixCluster.setCombineFee(50);
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Domain]
      );
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]
      );
      await expect(
        pixCluster.connect(alice).combine([1, 2])
      ).to.revertedWith("Cannot combine different sizes");
    });

    it("revert if to combine different categories", async () => {
      await pixCluster.setCombineFee(50);
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]
      );
      await pixCluster.safeMint(
        await alice.getAddress(), [PIXCategory.Common, PIXSize.Sector]
      );
      await expect(
        pixCluster.connect(alice).combine([1, 2])
      ).to.revertedWith("Cannot combine different categories");
    });

    it("revert if not owner or operator", async () => {
      await pixCluster.setCombineFee(50);
      const tokenIds = [];
      for (let i = 0; i < 2; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Rare, PIXSize.Domain]
        );
        tokenIds.push(i + 1);
      }
      await expect(
        pixCluster.combine(tokenIds)
      ).to.revertedWith("Caller is not owner or operator");
    });

    it("should combine clusters to mint area", async () => {
      await pixCluster.setCombineFee(50);
      const tokenIds = [];
      for (let i = 0; i < 50; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Common, PIXSize.Cluster]
        );
        tokenIds.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(tokenIds);
      expect(await pixCluster.ownerOf(51)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(51, PIXCategory.Common, PIXSize.Area);
      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine areas to mint sector", async () => {
      await pixCluster.setCombineFee(50);
      const tokenIds = [];
      for (let i = 0; i < 5; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Common, PIXSize.Area]
        );
        tokenIds.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(tokenIds);
      expect(await pixCluster.ownerOf(6)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(6, PIXCategory.Common, PIXSize.Sector);
      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine sectors to mint domain", async () => {
      await pixCluster.setCombineFee(50);
      const tokenIds = [];
      for (let i = 0; i < 2; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Common, PIXSize.Sector]
        );
        tokenIds.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(tokenIds);
      expect(await pixCluster.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(3, PIXCategory.Common, PIXSize.Domain);
      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine domain to mint federation", async () => {
      await pixCluster.setCombineFee(50);
      const tokenIds = [];
      for (let i = 0; i < 2; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Common, PIXSize.Domain]
        );
        tokenIds.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(tokenIds);
      expect(await pixCluster.ownerOf(3)).to.equal(await alice.getAddress());
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(3, PIXCategory.Common, PIXSize.Federation);
      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });
  });

  describe("#withdraw", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).withdraw()
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if nothing to withdraw", async () => {
      await expect(pixCluster.withdraw()).to.revertedWith("Nothing to withdraw");
    });

    it("should withdraw ether to owner address", async () => {
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });
      expect(await ethers.provider.getBalance(pixCluster.address)).to.equal(price);
      await pixCluster.withdraw();
      expect(await ethers.provider.getBalance(pixCluster.address)).to.equal(0);

      await pixCluster.setCombineFee(50);
      await pixToken.transfer(await alice.getAddress(), BigNumber.from(100));
      await pixToken.connect(alice).approve(pixCluster.address, BigNumber.from(100));
      const tokenIds = [];
      for (let i = 0; i < 50; i ++) {
        await pixCluster.safeMint(
          await alice.getAddress(), [PIXCategory.Common, PIXSize.Cluster]
        );
        tokenIds.push(i + 1);
      }
      await pixCluster.connect(alice).combine(tokenIds);
      expect(await pixToken.balanceOf(pixCluster.address)).to.equal(50);
      await pixCluster.withdraw();
      expect(await pixToken.balanceOf(pixCluster.address)).to.equal(0);
    });
  });

  describe("#setBaseURI", () => {
    const uri = "https://planetix.com/nfts/";

    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setBaseURI(uri)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should set base uri by owner", async () => {
      await pixCluster.setBaseURI(uri);
      await pixCluster.setMintFee(price);
      await pixCluster.connect(alice).requestMint({ value: price });
      await pixCluster.mintTo(await alice.getAddress(), new Array(50).fill(PIXCategory.Common));
      expect(await pixCluster.tokenURI(1)).to.equal(uri + "1");
    });
  });
});
