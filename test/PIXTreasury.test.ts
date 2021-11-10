import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, constants } from "ethers";
import { generateRandomAddress } from "./utils";

describe("PIXTreasury", function () {
  let pixToken: Contract;
  let pixTreasury: Contract;
  let mockPool: Contract;
  let owner: Signer;
  let alice: Signer;
  let pix: Signer;
  let sale: Signer;

  let auction: string = generateRandomAddress();

  beforeEach(async function () {
    [owner, alice, pix, sale] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    pixToken = await MockTokenFactory.deploy();
    const MockPoolFactory = await ethers.getContractFactory("MockPool");
    mockPool = await MockPoolFactory.deploy();
    const PIXTreasuryFactory = await ethers.getContractFactory("PIXTreasury");
    pixTreasury = await PIXTreasuryFactory.deploy(
      pixToken.address,
      await pix.getAddress(),
      await sale.getAddress(),
      auction
    );
  });

  describe("constructor", () => {
    it("revert if zero address", async function () {
      const PIXTreasury = await ethers.getContractFactory("PIXTreasury");
      await expect(
        PIXTreasury.deploy(
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero
        )
      ).to.revertedWith("PIX Token cannot be zero address");
      await expect(
        PIXTreasury.deploy(
          pixToken.address,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero
        )
      ).to.revertedWith("PIX cannot be zero address");
      await expect(
        PIXTreasury.deploy(
          pixToken.address,
          await pix.getAddress(),
          constants.AddressZero,
          constants.AddressZero
        )
      ).to.revertedWith("Sale cannot be zero address");
      await expect(
        PIXTreasury.deploy(
          pixToken.address,
          await pix.getAddress(),
          await sale.getAddress(),
          constants.AddressZero
        )
      ).to.revertedWith("Auction cannot be zero address");
    });

    it("check initial values", async function () {
      expect(await pixTreasury.pixToken()).equal(pixToken.address);
      expect(await pixTreasury.saleContract()).equal(await sale.getAddress());
      expect(await pixTreasury.auctionContract()).equal(auction);
      expect(await pixTreasury.pixNFT()).equal(await pix.getAddress());
    });
  });

  describe("#setStakingPool", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixTreasury.connect(alice).setStakingPool(1, await alice.getAddress())
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if mode invalid", async () => {
      await expect(
        pixTreasury.setStakingPool(3, await alice.getAddress())
      ).to.revertedWith("Invalid pool mode");
    });

    it("revert if pool is not contract", async () => {
      await expect(
        pixTreasury.setStakingPool(0, await alice.getAddress())
      ).to.revertedWith("Pool is not a contract");
    });

    it("should set pool by owner", async () => {
      await pixTreasury.setStakingPool(0, mockPool.address);
      expect(await pixTreasury.stakingPools(0)).to.equal(mockPool.address);
    });
  });

  describe("#redirectPIX", () => {
    it("revert if msg.sender is not pix", async () => {
      await expect(pixTreasury.redirectPIX()).to.revertedWith(
        "Caller is not PIX contract"
      );
    });

    it("should redirect to pix", async () => {
      await pixTreasury.setStakingPool(1, mockPool.address);
      await pixToken.transfer(pixTreasury.address, 100);
      await pixTreasury.connect(pix).redirectPIX();
      expect(await pixToken.balanceOf(mockPool.address)).to.equal(100);
    });
  });

  describe("#redirectMarket", () => {
    it("revert if msg.sender is not market", async () => {
      await expect(pixTreasury.redirectMarket()).to.revertedWith(
        "Caller is not market contract"
      );
    });

    it("should redirect to market", async () => {
      await pixTreasury.setStakingPool(0, mockPool.address);
      await pixTreasury.setStakingPool(2, mockPool.address);
      await pixToken.transfer(pixTreasury.address, 102);
      await pixTreasury.connect(sale).redirectMarket();
      expect(await pixToken.balanceOf(mockPool.address)).to.equal(102);
    });
  });
});
