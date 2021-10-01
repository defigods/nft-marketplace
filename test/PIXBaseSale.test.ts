import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Signer,
  Contract,
  BigNumber,
  ContractFactory,
  constants,
} from "ethers";
import { DENOMINATOR, generateRandomAddress } from "./utils";

describe("PIXBaseSale", function () {
  let owner: Signer;
  let alice: Signer;
  let treasury: string = generateRandomAddress();
  let pixCluster: Contract;
  let fixedSale: Contract;
  const tradingFeePct = BigNumber.from("100");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];

    const PIXClusterFactory = await ethers.getContractFactory("PIXCluster");
    pixCluster = await PIXClusterFactory.deploy();
    const PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    fixedSale = await PIXFixedSaleFactory.deploy(
      pixCluster.address,
      treasury,
      tradingFeePct
    );
  });

  describe("constructor", () => {
    let PIXFixedSaleFactory: ContractFactory;

    beforeEach(async () => {
      PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    });

    it("check initial values", async () => {
      expect(await fixedSale.tradingFeePct()).to.be.equal(tradingFeePct);
      expect(await fixedSale.treasury()).to.be.equal(treasury);
      expect(await fixedSale.pixCluster()).to.be.equal(pixCluster.address);
    });

    it("revert if pixCluster is 0x0", async () => {
      await expect(
        PIXFixedSaleFactory.deploy(
          constants.AddressZero,
          treasury,
          tradingFeePct
        )
      ).to.revertedWith("PIX 0x!");
    });

    it("revert if treasury is 0x0", async () => {
      await expect(
        PIXFixedSaleFactory.deploy(
          pixCluster.address,
          constants.AddressZero,
          tradingFeePct
        )
      ).to.revertedWith("Treasury 0x!");
    });

    it("revert if tradingFeePct is over 100%", async () => {
      await expect(
        PIXFixedSaleFactory.deploy(
          pixCluster.address,
          treasury,
          DENOMINATOR.add(BigNumber.from("1"))
        )
      ).to.revertedWith("Fee overflow");
    });
  });

  describe("#setTreasury function", () => {
    const newTreasury = generateRandomAddress();

    it("revert if msg.sender is not owner", async () => {
      await expect(
        fixedSale.connect(alice).setTreasury(newTreasury)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if new treasury is 0x0", async () => {
      await expect(
        fixedSale.connect(owner).setTreasury(constants.AddressZero)
      ).to.revertedWith("Treasury 0x!");
    });

    it("should update new treasury and emit TreasuryUpdated event", async () => {
      const tx = await fixedSale.connect(owner).setTreasury(newTreasury);
      expect(await fixedSale.treasury()).to.be.equal(newTreasury);
      expect(tx).to.emit(fixedSale, "TreasuryUpdated").withArgs(newTreasury);
    });
  });

  describe("#setTradingFeePct function", () => {
    const newTradingFeePct = BigNumber.from("300");

    it("revert if msg.sender is not owner", async () => {
      await expect(
        fixedSale.connect(alice).setTradingFeePct(newTradingFeePct)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if new tradingFeePct is over 100%", async () => {
      await expect(
        fixedSale
          .connect(owner)
          .setTradingFeePct(DENOMINATOR.add(BigNumber.from("1")))
      ).to.revertedWith("Fee overflow!");
    });

    it("should update new treasury and emit FeeUpdated event", async () => {
      const tx = await fixedSale
        .connect(owner)
        .setTradingFeePct(newTradingFeePct);
      expect(await fixedSale.tradingFeePct()).to.be.equal(newTradingFeePct);
      expect(tx).to.emit(fixedSale, "FeeUpdated").withArgs(newTradingFeePct);
    });
  });

  describe("#setWhitelist function", () => {
    const token = generateRandomAddress();

    it("revert if msg.sender is not owner", async () => {
      await expect(
        fixedSale.connect(alice).setWhitelist(token, true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should whitelist payment token", async () => {
      await fixedSale.connect(owner).setWhitelist(token, true);
      expect(await fixedSale.whitelistedTokens(token)).to.be.equal(true);
    });
  });
});
