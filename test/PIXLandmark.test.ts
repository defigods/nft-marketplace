import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, constants } from "ethers";
import { PIXCategory } from "./utils";

describe("PIXLandmark", function () {
  let owner: Signer;
  let alice: Signer;
  let pixLandmark: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();

    const PIXLandmarkFactory = await ethers.getContractFactory("PIXLandmark");
    pixLandmark = await PIXLandmarkFactory.deploy();
  });

  describe("constructor", () => {
    it("check initial values", async function () {
      expect(await pixLandmark.moderators(await owner.getAddress())).equal(
        true
      );
    });
  });

  describe("#setModerator", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(
        pixLandmark.connect(alice).setModerator(await alice.getAddress(), true)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("revert if moderator is zero address", async () => {
      await expect(
        pixLandmark.setModerator(constants.AddressZero, true)
      ).to.revertedWith("Moderator cannot be zero address");
    });

    it("should set moderator by owner", async () => {
      await pixLandmark.setModerator(await alice.getAddress(), true);
      expect(
        await pixLandmark.moderators(await alice.getAddress())
      ).to.be.equal(true);

      await pixLandmark.setModerator(await alice.getAddress(), false);
      expect(
        await pixLandmark.moderators(await alice.getAddress())
      ).to.be.equal(false);
    });
  });

  describe("#setBaseURI", () => {
    const uri = "https://planetix.com/land-nfts/";

    it("revert if msg.sender is not owner", async () => {
      await expect(pixLandmark.connect(alice).setBaseURI(uri)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should set base uri by owner", async () => {
      await pixLandmark.setBaseURI(uri);
      await pixLandmark.safeMint(await alice.getAddress(), [
        [1, 2],
        PIXCategory.Common,
      ]);
      expect(await pixLandmark.tokenURI(1)).to.equal(uri + "1");
    });
  });
});
