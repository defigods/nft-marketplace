import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, utils } from "ethers";

describe("PIXT", function () {
  let pixtToken: Contract;
  let alice: Signer;
  let totalSupply = utils.parseEther("100000");
  const NAME = "PlanetIX";
  const SYMBOL = "IXT";

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    alice = signers[0];

    const PIXTFactory = await ethers.getContractFactory("PIXT");
    pixtToken = await PIXTFactory.deploy(totalSupply);
  });

  describe("check tokenomics", () => {
    it("check name", async () => {
      expect(await pixtToken.name()).to.equal(NAME);
    });

    it("check symbol", async () => {
      expect(await pixtToken.symbol()).to.equal(SYMBOL);
    });

    it("check totalSupply", async () => {
      expect(await pixtToken.totalSupply()).to.equal(totalSupply);
    });
  });
});
