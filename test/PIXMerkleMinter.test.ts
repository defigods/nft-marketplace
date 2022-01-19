import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Signer, Contract } from 'ethers';
import { getMerkleTree } from './utils';

describe('PIX', function () {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let marketplace: Signer;
  let pixToken: Contract;
  let pixNFT: Contract;
  let usdc: Contract;
  let merkleMinter: Contract;
  const { leafNodes, merkleTree, pixes } = getMerkleTree();

  beforeEach(async function () {
    [owner, alice, bob, marketplace] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixToken = await PIXTFactory.deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    usdc = await MockTokenFactory.deploy('Mock USDC', 'USDC', 6);

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixToken.address, usdc.address]);

    const PIXMerkleMinterFactory = await ethers.getContractFactory('PIXMerkleMinter');
    merkleMinter = await upgrades.deployProxy(PIXMerkleMinterFactory, [pixNFT.address]);

    await pixNFT.setModerator(merkleMinter.address, true);
  });

  describe('#setMerkleRoot', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        merkleMinter.connect(alice).setMerkleRoot(merkleTree.getRoot(), true),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('should set merkle root by owner', async () => {
      await merkleMinter.connect(owner).setMerkleRoot(merkleTree.getRoot(), true);
      expect(await merkleMinter.merkleRoots(merkleTree.getHexRoot())).to.equal(true);

      await merkleMinter.connect(owner).setMerkleRoot(merkleTree.getRoot(), false);
      expect(await merkleMinter.merkleRoots(merkleTree.getHexRoot())).to.equal(false);
    });
  });

  describe('#mintByProof', () => {
    beforeEach(async () => {
      await merkleMinter.connect(owner).setMerkleRoot(merkleTree.getRoot(), true);
    });

    it('revert if merkle root is not registered', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter.mintByProof(
          anotherMerkleTreeInfo.pixes[index].to,
          pixInfo,
          anotherMerkleTreeInfo.merkleTree.getRoot(),
          hexProof,
        ),
      ).to.revertedWith('Pix: invalid root');
    });

    it('revert if merkle root is invalid', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter.mintByProof(
          anotherMerkleTreeInfo.pixes[index].to,
          pixInfo,
          merkleTree.getRoot(),
          hexProof,
        ),
      ).to.revertedWith('Pix: invalid proof');
    });

    it('should mint by proof', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter.mintByProof(pixes[index].to, pixInfo, merkleTree.getRoot(), hexProof);
      expect((await pixNFT.ownerOf(1)).toLowerCase()).to.equal(pixes[index].to.toLowerCase());
    });

    it('revert if already minted', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter.mintByProof(pixes[index].to, pixInfo, merkleTree.getRoot(), hexProof);

      await expect(
        merkleMinter.mintByProof(pixes[index].to, pixInfo, merkleTree.getRoot(), hexProof),
      ).to.revertedWith('Pix: already minted');
    });
  });

  describe('#setMarketplace', () => {
    it('revert if msg.sender is not owner', async () => {
      await expect(
        merkleMinter.connect(alice).setMarketplace(await marketplace.getAddress()),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('should set marketplace by owner', async () => {
      await merkleMinter.connect(owner).setMarketplace(await marketplace.getAddress());
      expect(await merkleMinter.marketplace()).to.equal(await marketplace.getAddress());
    });
  });

  describe('#mintToNewOwner', () => {
    beforeEach(async () => {
      await merkleMinter.connect(owner).setMerkleRoot(merkleTree.getRoot(), true);
      await merkleMinter.connect(owner).setMarketplace(await marketplace.getAddress());
    });

    it('revert if msg.sender is not marketplace', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(alice)
          .mintToNewOwner(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            pixInfo,
            anotherMerkleTreeInfo.merkleTree.getRoot(),
            hexProof,
          ),
      ).to.revertedWith('Pix: not marketplace');
    });

    it('revert if merkle root is not registered', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwner(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            pixInfo,
            anotherMerkleTreeInfo.merkleTree.getRoot(),
            hexProof,
          ),
      ).to.revertedWith('Pix: invalid root');
    });

    it('revert if merkle root is invalid', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwner(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            pixInfo,
            merkleTree.getRoot(),
            hexProof,
          ),
      ).to.revertedWith('Pix: invalid proof');
    });

    it('should mint by proof', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter
        .connect(marketplace)
        .mintToNewOwner(
          await alice.getAddress(),
          pixes[index].to,
          pixInfo,
          merkleTree.getRoot(),
          hexProof,
        );
      expect(await pixNFT.ownerOf(1)).to.equal(await alice.getAddress());
    });

    it('revert if already minted', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter
        .connect(marketplace)
        .mintToNewOwner(
          await alice.getAddress(),
          pixes[index].to,
          pixInfo,
          merkleTree.getRoot(),
          hexProof,
        );

      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwner(
            await alice.getAddress(),
            pixes[index].to,
            pixInfo,
            merkleTree.getRoot(),
            hexProof,
          ),
      ).to.revertedWith('Pix: already minted');
    });
  });

  describe('#mintToNewOwnerInBatch', () => {
    beforeEach(async () => {
      await merkleMinter.connect(owner).setMerkleRoot(merkleTree.getRoot(), true);
      await merkleMinter.connect(owner).setMarketplace(await marketplace.getAddress());
    });

    it('revert if msg.sender is not marketplace', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(alice)
          .mintToNewOwnerInBatch(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            [pixInfo],
            [anotherMerkleTreeInfo.merkleTree.getRoot()],
            [hexProof],
          ),
      ).to.revertedWith('Pix: not marketplace');
    });

    it('revert if merkle root is not registered', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwnerInBatch(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            [pixInfo],
            [anotherMerkleTreeInfo.merkleTree.getRoot()],
            [hexProof],
          ),
      ).to.revertedWith('Pix: invalid root');
    });

    it('revert if merkle root is invalid', async () => {
      const anotherMerkleTreeInfo = getMerkleTree();
      let index = 0;
      const hexProof = anotherMerkleTreeInfo.merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [
        anotherMerkleTreeInfo.pixes[index].pixId,
        anotherMerkleTreeInfo.pixes[index].category,
        anotherMerkleTreeInfo.pixes[index].size,
      ];
      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwnerInBatch(
            await alice.getAddress(),
            anotherMerkleTreeInfo.pixes[index].to,
            [pixInfo],
            [merkleTree.getRoot()],
            [hexProof],
          ),
      ).to.revertedWith('Pix: invalid proof');
    });

    it('should mint by proof', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter
        .connect(marketplace)
        .mintToNewOwnerInBatch(
          await alice.getAddress(),
          pixes[index].to,
          [pixInfo],
          [merkleTree.getRoot()],
          [hexProof],
        );
      expect(await pixNFT.ownerOf(1)).to.equal(await alice.getAddress());
    });

    it('revert if already minted', async () => {
      let index = 0;
      const hexProof = merkleTree.getHexProof(leafNodes[index]);
      const pixInfo = [pixes[index].pixId, pixes[index].category, pixes[index].size];
      await merkleMinter
        .connect(marketplace)
        .mintToNewOwner(
          await alice.getAddress(),
          pixes[index].to,
          pixInfo,
          merkleTree.getRoot(),
          hexProof,
        );

      await expect(
        merkleMinter
          .connect(marketplace)
          .mintToNewOwnerInBatch(
            await alice.getAddress(),
            pixes[index].to,
            [pixInfo],
            [merkleTree.getRoot()],
            [hexProof],
          ),
      ).to.revertedWith('Pix: already minted');
    });
  });
});
