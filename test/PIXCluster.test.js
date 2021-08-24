const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('PIXCluster', function () {
  before(async function () {
    this.signers = await ethers.getSigners();
  });

  beforeEach(async function () {
    const PIXCluster = await ethers.getContractFactory('PIXCluster');
    this.cluster = await PIXCluster.deploy('PIX Cluster', 'PIX');
    await this.cluster.deployed();
  });

  it('Set price by non-owner', async function () {
    await this.cluster.connect(this.signers[1]).setPrice(0, 1);
  });
});
