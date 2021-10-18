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
  let fixedSale: Contract;
  const tradingFeePct = BigNumber.from("100");

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    alice = signers[1];

    const PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    fixedSale = await PIXFixedSaleFactory.deploy(treasury, tradingFeePct);
  });

  describe("constructor", () => {
    let PIXFixedSaleFactory: ContractFactory;

    beforeEach(async () => {
      PIXFixedSaleFactory = await ethers.getContractFactory("PIXFixedSale");
    });

    it("check initial values", async () => {
      expect(await fixedSale.tradingFeePct()).to.be.equal(tradingFeePct);
      expect(await fixedSale.treasury()).to.be.equal(treasury);
    });

    it("revert if treasury is 0x0", async () => {
      await expect(
        PIXFixedSaleFactory.deploy(constants.AddressZero, tradingFeePct)
      ).to.revertedWith("Treasury 0x!");
    });

    it("revert if tradingFeePct is over 100%", async () => {
      await expect(
        PIXFixedSaleFactory.deploy(
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

  describe("#setWhitelistPaymentToken function", () => {
    const token = generateRandomAddress();

    it("revert if msg.sender is not owner", async () => {
      await expect(
        fixedSale.connect(alice).setWhitelistPaymentToken(token, true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should whitelist payment token", async () => {
      await fixedSale.connect(owner).setWhitelistPaymentToken(token, true);
      expect(await fixedSale.whitelistedPaymentTokens(token)).to.be.equal(true);
    });
  });

  describe("#setWhitelistedNftTokens function", () => {
    const token = generateRandomAddress();

    it("revert if msg.sender is not owner", async () => {
      await expect(
        fixedSale.connect(alice).setWhitelistedNftTokens(token, true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should whitelist payment token", async () => {
      await fixedSale.connect(owner).setWhitelistedNftTokens(token, true);
      expect(await fixedSale.whitelistedNftTokens(token)).to.be.equal(true);
    });
  });
});
