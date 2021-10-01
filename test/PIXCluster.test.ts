import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber, utils, constants } from "ethers";
import { PIXCategory, PIXSize } from "./utils";

describe("PIXCluster", function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let pixCluster: Contract;
  const MAX_PURCHASE = 20;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];
    bob = signers[2];

    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixCluster = await PIXClusterFactory.deploy();
  });

  describe("#safeMint function", () => {
    it("revert if msg.sender is not moderator", async () => {
      await expect(
        pixCluster
          .connect(alice)
          .safeMint(await alice.getAddress(), [
            PIXCategory.Rare,
            PIXSize.Sector,
          ])
      ).to.revertedWith("Caller is not moderator");
    });

    it("should mint new PIXCluster by moderator", async () => {
      await pixCluster
        .connect(owner)
        .setModerator(await alice.getAddress(), true);
      await pixCluster
        .connect(alice)
        .safeMint(await bob.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);

      expect(await pixCluster.ownerOf(1)).to.be.equal(await bob.getAddress());
      expect(await pixCluster.pixLength()).to.be.equal(1);
    });
  });

  describe("#setModerator function", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setModerator(await alice.getAddress(), true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if moderator is zero address", async () => {
      await expect(
        pixCluster.connect(owner).setModerator(constants.AddressZero, true)
      ).to.revertedWith("Moderator cannot be zero address");
    });

    it("should set moderator by owner", async () => {
      await pixCluster
        .connect(owner)
        .setModerator(await alice.getAddress(), true);

      expect(await pixCluster.moderators(await alice.getAddress())).to.be.equal(
        true
      );

      await pixCluster
        .connect(owner)
        .setModerator(await alice.getAddress(), false);

      expect(await pixCluster.moderators(await alice.getAddress())).to.be.equal(
        false
      );
    });
  });

  describe("#setPrice function", () => {
    const price = utils.parseEther("1");

    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixCluster.connect(alice).setPrice(PIXCategory.Common, price)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if price is zero", async () => {
      await expect(
        pixCluster.connect(owner).setPrice(PIXCategory.Common, 0)
      ).to.revertedWith("Price cannot be zero");
    });

    it("should set price by owner", async () => {
      await pixCluster.connect(owner).setPrice(PIXCategory.Common, price);

      expect(await pixCluster.prices(PIXCategory.Common)).to.be.equal(price);
    });
  });

  describe("#mint function", () => {
    const price = [
      utils.parseEther("0.1"),
      utils.parseEther("0.2"),
      utils.parseEther("0.4"),
      utils.parseEther("0.5"),
      utils.parseEther("0.7"),
    ];

    it("revert if price is not set", async () => {
      await expect(
        pixCluster
          .connect(alice)
          .mint([PIXCategory.Common], { value: price[PIXCategory.Common] })
      ).to.revertedWith("not for sale");
    });

    it("revert if mint count zero", async () => {
      for (let i = 0; i < price.length; i += 1) {
        await pixCluster.connect(owner).setPrice(i, price[i]);
      }
      await expect(pixCluster.connect(alice).mint([])).to.revertedWith(
        "no list"
      );
    });

    it("revert if mint count over reach max", async () => {
      for (let i = 0; i < price.length; i += 1) {
        await pixCluster.connect(owner).setPrice(i, price[i]);
      }
      const list = [];
      for (let i = 0; i <= MAX_PURCHASE; i += 1) {
        list.push(PIXCategory.Common);
      }
      await expect(
        pixCluster.connect(alice).mint(list, {
          value: price[PIXCategory.Common].mul(
            BigNumber.from(MAX_PURCHASE + 1).toString()
          ),
        })
      ).to.revertedWith("You cannot mint more than limit");
    });

    it("revert if msg.value is not match with price", async () => {
      for (let i = 0; i < price.length; i += 1) {
        await pixCluster.connect(owner).setPrice(i, price[i]);
      }
      await expect(
        pixCluster
          .connect(owner)
          .mint([PIXCategory.Common], { value: [PIXCategory.Legendary] })
      ).to.revertedWith("invalid price");
    });

    it("should mint new NFTs by paying ether", async () => {
      for (let i = 0; i < price.length; i += 1) {
        await pixCluster.connect(owner).setPrice(i, price[i]);
      }
      const nftToPurchase = [
        PIXCategory.Rare,
        PIXCategory.Outliers,
        PIXCategory.Uncommon,
        PIXCategory.Legendary,
        PIXCategory.Common,
        PIXCategory.Outliers,
        PIXCategory.Common,
      ];
      let totalPrice = BigNumber.from("0");
      for (let i = 0; i < nftToPurchase.length; i += 1) {
        totalPrice = totalPrice.add(price[nftToPurchase[i]]);
      }

      await pixCluster
        .connect(alice)
        .mint(nftToPurchase, { value: totalPrice });

      expect(await ethers.provider.getBalance(pixCluster.address)).to.be.equal(
        totalPrice
      );

      for (let i = 0; i < nftToPurchase.length; i += 1) {
        expect(await pixCluster.ownerOf(i + 1)).to.be.equal(
          await alice.getAddress()
        );
        const info = await pixCluster.infos(i + 1);
        expect(info.size).to.be.equal(PIXSize.Cluster);
        expect(info.category).to.be.equal(nftToPurchase[i]);
      }
    });
  });

  describe("#combine function", () => {
    beforeEach(async () => {
      await pixCluster
        .connect(owner)
        .setModerator(await owner.getAddress(), true);
    });

    it("revert if combine length is zero", async () => {
      await expect(pixCluster.connect(alice).combine([])).to.revertedWith(
        "no tokens"
      );
    });

    it("revert if size is federation", async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Rare,
          PIXSize.Federation,
        ]);
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Rare,
          PIXSize.Federation,
        ]);
      await expect(pixCluster.connect(alice).combine([1, 2])).to.revertedWith(
        "max size"
      );
    });

    it("revert if combine length is invalid", async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Rare,
          PIXSize.Cluster,
        ]);
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Rare,
          PIXSize.Cluster,
        ]);
      await expect(pixCluster.connect(alice).combine([1, 2])).to.revertedWith(
        "invalid length"
      );
    });

    it("revert if trying to combine different categories", async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Common,
          PIXSize.Sector,
        ]);
      await expect(pixCluster.connect(alice).combine([1, 2])).to.revertedWith(
        "invalid categories"
      );
    });

    it("revert if trying to combine different size", async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Common,
          PIXSize.Domain,
        ]);
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Common,
          PIXSize.Sector,
        ]);
      await expect(pixCluster.connect(alice).combine([1, 2])).to.revertedWith(
        "invalid sizes"
      );
    });

    it("revert if not owner", async () => {
      await pixCluster
        .connect(owner)
        .safeMint(await bob.getAddress(), [PIXCategory.Common, PIXSize.Domain]);
      await pixCluster
        .connect(owner)
        .safeMint(await alice.getAddress(), [
          PIXCategory.Common,
          PIXSize.Domain,
        ]);
      await expect(pixCluster.connect(alice).combine([1, 2])).to.revertedWith(
        "not owner"
      );
    });

    it("should combine clusters to mint area", async () => {
      const count = 50;
      const combineList = [];
      for (let i = 0; i < count; i += 1) {
        await pixCluster
          .connect(owner)
          .safeMint(await alice.getAddress(), [
            PIXCategory.Common,
            PIXSize.Cluster,
          ]);
        combineList.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(combineList);
      expect(await pixCluster.ownerOf(count + 1)).to.be.equal(
        await alice.getAddress()
      );
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(count + 1, PIXCategory.Common, PIXSize.Area);

      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine areas to mint sector", async () => {
      const count = 5;
      const combineList = [];
      for (let i = 0; i < count; i += 1) {
        await pixCluster
          .connect(owner)
          .safeMint(await alice.getAddress(), [PIXCategory.Rare, PIXSize.Area]);
        combineList.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(combineList);
      expect(await pixCluster.ownerOf(count + 1)).to.be.equal(
        await alice.getAddress()
      );
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(count + 1, PIXCategory.Rare, PIXSize.Sector);

      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine sectors to mint domain", async () => {
      const count = 2;
      const combineList = [];
      for (let i = 0; i < count; i += 1) {
        await pixCluster
          .connect(owner)
          .safeMint(await alice.getAddress(), [
            PIXCategory.Uncommon,
            PIXSize.Sector,
          ]);
        combineList.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(combineList);
      expect(await pixCluster.ownerOf(count + 1)).to.be.equal(
        await alice.getAddress()
      );
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(count + 1, PIXCategory.Uncommon, PIXSize.Domain);

      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });

    it("should combine domain to mint federation", async () => {
      const count = 2;
      const combineList = [];
      for (let i = 0; i < count; i += 1) {
        await pixCluster
          .connect(owner)
          .safeMint(await alice.getAddress(), [
            PIXCategory.Legendary,
            PIXSize.Domain,
          ]);
        combineList.push(i + 1);
      }
      const tx = await pixCluster.connect(alice).combine(combineList);
      expect(await pixCluster.ownerOf(count + 1)).to.be.equal(
        await alice.getAddress()
      );
      expect(tx)
        .to.emit(pixCluster, "Combined")
        .withArgs(count + 1, PIXCategory.Legendary, PIXSize.Federation);

      expect(await pixCluster.totalSupply()).to.be.equal(1);
    });
  });

  describe("#withdraw function", () => {
    const price = [
      utils.parseEther("0.1"),
      utils.parseEther("0.2"),
      utils.parseEther("0.4"),
      utils.parseEther("0.5"),
      utils.parseEther("0.7"),
    ];

    it("revert if msg.sender is not owner", async () => {
      await expect(pixCluster.connect(alice).withdraw()).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("revert if nothing withdraw", async () => {
      await expect(pixCluster.connect(owner).withdraw()).to.revertedWith(
        "nothing to withdraw"
      );
    });

    it("should withdraw ether to owner address", async () => {
      for (let i = 0; i < price.length; i += 1) {
        await pixCluster.connect(owner).setPrice(i, price[i]);
      }
      const nftToPurchase = [
        PIXCategory.Rare,
        PIXCategory.Outliers,
        PIXCategory.Uncommon,
        PIXCategory.Legendary,
        PIXCategory.Common,
        PIXCategory.Outliers,
        PIXCategory.Common,
      ];
      let totalPrice = BigNumber.from("0");
      for (let i = 0; i < nftToPurchase.length; i += 1) {
        totalPrice = totalPrice.add(price[nftToPurchase[i]]);
      }

      await pixCluster
        .connect(alice)
        .mint(nftToPurchase, { value: totalPrice });

      const ownerBalanceBefore = await owner.getBalance();
      const tx = await pixCluster.connect(owner).withdraw();
      const receipt = await tx.wait(1);

      expect(await ethers.provider.getBalance(pixCluster.address)).to.be.equal(
        0
      );

      expect(await owner.getBalance()).to.be.equal(
        ownerBalanceBefore
          .add(totalPrice)
          .sub(receipt.effectiveGasPrice.mul(receipt.gasUsed))
      );
    });
  });

  describe("#setBaseURI function", () => {
    const uri = "https://planetix.com/nfts/";

    it("revert if msg.sender is not owner", async () => {
      await expect(pixCluster.connect(alice).setBaseURI(uri)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should set base uri by owner", async () => {
      await pixCluster.connect(owner).setBaseURI(uri);

      await pixCluster
        .connect(owner)
        .setModerator(await alice.getAddress(), true);
      await pixCluster
        .connect(alice)
        .safeMint(await bob.getAddress(), [PIXCategory.Rare, PIXSize.Sector]);

      expect(await pixCluster.tokenURI(1)).to.be.equal(uri + "1");
    });
  });
});
