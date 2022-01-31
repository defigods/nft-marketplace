import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, BigNumber, utils, constants, Signer } from 'ethers';
import { DENOMINATOR, generateRandomAddress, getMerkleTree, PIXCategory, PIXSize } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('PIXFixedSale', function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let treasury: string = generateRandomAddress();
  let pixNFT: Contract;
  let fixedSale: Contract;
  let pixtToken: Contract;
  let merkleMinter: Contract;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const PIXTFactory = await ethers.getContractFactory('PIXT');
    pixtToken = await PIXTFactory.connect(bob).deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    const usdc = await MockTokenFactory.deploy('Mock USDC', 'USDC', 6);

    const PIXFactory = await ethers.getContractFactory('PIX');
    pixNFT = await upgrades.deployProxy(PIXFactory, [pixtToken.address, usdc.address]);

    const PIXFixedSaleFactory = await ethers.getContractFactory('PIXFixedSale');
    fixedSale = await upgrades.deployProxy(PIXFixedSaleFactory, [
      pixtToken.address,
      pixNFT.address,
    ]);

    await pixNFT.setTrader(fixedSale.address, true);
    await fixedSale.setWhitelistedNFTs(pixNFT.address, true);
  });

  describe('#requestSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
    });

    it('revert if nft token is not whitelisted', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(generateRandomAddress(), [tokenId], 1),
      ).to.revertedWith('Sale: NOT_WHITELISTED_NFT');
    });

    it('revert if price is 0', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], 0),
      ).to.revertedWith('Sale: PRICE_ZERO');
    });

    it('revert if no token list', async () => {
      await expect(fixedSale.connect(alice).requestSale(pixNFT.address, [], 1)).to.revertedWith(
        'Sale: NO_TOKENS',
      );
    });

    it('revert if PIX not approved', async () => {
      await expect(
        fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price),
      ).to.revertedWith('ERC721: transfer caller is not owner nor approved');
    });

    it('should request sale and emit SaleRequested event', async () => {
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);

      const tx = await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);

      const lastSaleId = 1;
      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(alice.address);
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, 'SaleRequested')
        .withArgs(alice.address, lastSaleId, pixNFT.address, [tokenId], price);
    });
  });

  describe('#updateSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(fixedSale.connect(bob).updateSale(lastSaleId, price)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('revert if price is 0', async () => {
      await expect(fixedSale.connect(alice).updateSale(lastSaleId, 0)).to.revertedWith(
        'Sale: PRICE_ZERO',
      );
    });

    it('should update sale and emit SaleUpdated event', async () => {
      const newPrice = utils.parseEther('2');
      const tx = await fixedSale.connect(alice).updateSale(lastSaleId, newPrice);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(alice.address);
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(newPrice);

      await expect(tx).emit(fixedSale, 'SaleUpdated').withArgs(lastSaleId, newPrice);
    });
  });

  describe('#cancelSale function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastSaleId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
    });

    it('revert if msg.sender is not seller', async () => {
      await expect(fixedSale.connect(bob).cancelSale(lastSaleId)).to.revertedWith(
        'Sale: NOT_SELLER',
      );
    });

    it('should cancel sale and emit SaleCancelled event', async () => {
      const tx = await fixedSale.connect(alice).cancelSale(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(alice.address);

      await expect(tx).emit(fixedSale, 'SaleCancelled').withArgs(lastSaleId);
    });
  });

  describe('#purchaseNFT function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    const lastTokenId = 1;

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);

      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it('revert if NFT is not for sale', async () => {
      await expect(fixedSale.connect(bob).purchaseNFT(lastTokenId)).to.revertedWith(
        'Sale: INVALID_ID',
      );
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchaseNFT(lastTokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(bob.address);
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(alice.address)).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
      expect(tx)
        .to.emit(fixedSale, 'Purchased')
        .withArgs(alice.address, bob.address, lastTokenId, price);
      const saleInfo = await fixedSale.saleInfo(lastTokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });

    it('should not send fee if zero', async () => {
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      await fixedSale.connect(alice).requestSale(pixNFT.address, [tokenId], price);
      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const tx = await fixedSale.connect(bob).purchaseNFT(tokenId);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(bob.address);
      expect(await pixtToken.balanceOf(alice.address)).to.be.equal(aliceBalanceBefore.add(price));
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore);
      expect(tx)
        .to.emit(fixedSale, 'Purchased')
        .withArgs(alice.address, bob.address, tokenId, price);
      const saleInfo = await fixedSale.saleInfo(tokenId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal(0);
    });
  });

  describe('#sellNFTWithSignature function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it('revert if signature invalid', async () => {
      const data = await getDigest(fixedSale, alice, price, pixNFT, BigNumber.from(tokenId));
      await expect(
        fixedSale
          .connect(alice)
          .sellNFTWithSignature(
            bob.address,
            price,
            pixNFT.address,
            tokenId,
            data.v,
            data.r,
            data.s,
          ),
      ).to.revertedWith('Sale: INVALID_SIGNATURE');
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const data = await getDigest(fixedSale, bob, price, pixNFT, BigNumber.from(tokenId));

      const tx = await fixedSale
        .connect(alice)
        .sellNFTWithSignature(bob.address, price, pixNFT.address, tokenId, data.v, data.r, data.s);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(bob.address);
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(alice.address)).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
      expect(tx)
        .to.emit(fixedSale, 'PurchasedWithSignature')
        .withArgs(alice.address, bob.address, pixNFT.address, tokenId, price);
    });
  });

  describe('#setPixMerkleMinter function', () => {
    const merkleMinter = generateRandomAddress();

    it('revert if msg.sender is not owner', async () => {
      await expect(fixedSale.connect(alice).setPixMerkleMinter(merkleMinter)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should update PIX merkle minter', async () => {
      await fixedSale.setPixMerkleMinter(merkleMinter);
      expect(await fixedSale.pixMerkleMinter()).to.be.equal(merkleMinter);
    });
  });

  describe('#requestSaleWithHash function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    let merkleTreeInfo;
    let alicePixes = [];
    let hexProofs = [];
    let merkleRoots = [];
    const aliceIndices = [1, 2];

    beforeEach(async () => {
      const PIXMerkleMinterFactory = await ethers.getContractFactory('PIXMerkleMinter');
      merkleMinter = await upgrades.deployProxy(PIXMerkleMinterFactory, [pixNFT.address]);

      await pixNFT.setModerator(merkleMinter.address, true);

      await fixedSale.setPixMerkleMinter(merkleMinter.address);

      await merkleMinter.setDelegateMinter(fixedSale.address, true);

      merkleTreeInfo = getMerkleTree([bob, alice, alice, bob, owner]);

      await merkleMinter.setMerkleRoot(merkleTreeInfo.merkleTree.getRoot(), true);

      hexProofs = aliceIndices.map((idx) =>
        merkleTreeInfo.merkleTree.getHexProof(merkleTreeInfo.leafNodes[idx]),
      );

      merkleRoots = aliceIndices.map(() => merkleTreeInfo.merkleTree.getRoot());

      alicePixes = aliceIndices.map((idx) => [
        merkleTreeInfo.pixes[idx].pixId,
        merkleTreeInfo.pixes[idx].category,
        merkleTreeInfo.pixes[idx].size,
      ]);

      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);

      await pixNFT.connect(alice).approve(fixedSale.address, tokenId);
    });

    it('revert if price is 0', async () => {
      await expect(
        fixedSale.connect(alice).requestSaleWithHash([], 0, alicePixes, merkleRoots, hexProofs),
      ).to.revertedWith('Sale: PRICE_ZERO');
    });

    it('should request sale and emit SaleRequested event', async () => {
      const tx = await fixedSale
        .connect(alice)
        .requestSaleWithHash([tokenId], price, alicePixes, merkleRoots, hexProofs);

      const lastSaleId = 1;
      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(alice.address);
      expect(saleInfo.nftToken).to.be.equal(pixNFT.address);
      expect(saleInfo.price).to.be.equal(price);

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(fixedSale.address);
      expect(await pixNFT.ownerOf(3)).to.be.equal(fixedSale.address);
      expect(await pixNFT.ownerOf(4)).to.be.equal(fixedSale.address);

      await expect(tx)
        .emit(fixedSale, 'SaleRequested')
        .withArgs(alice.address, lastSaleId, pixNFT.address, [tokenId, 3, 4], price);
    });

    it('purchase NFT which requested with hashes', async () => {
      await fixedSale
        .connect(alice)
        .requestSaleWithHash([tokenId], price, alicePixes, merkleRoots, hexProofs);

      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const lastSaleId = 1;

      await fixedSale.connect(bob).purchaseNFT(lastSaleId);

      expect(await fixedSale.lastSaleId()).to.be.equal(lastSaleId);

      const saleInfo = await fixedSale.saleInfo(lastSaleId);
      expect(saleInfo.seller).to.be.equal(constants.AddressZero);
      expect(saleInfo.nftToken).to.be.equal(constants.AddressZero);
      expect(saleInfo.price).to.be.equal('0');

      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(bob.address);
      expect(await pixNFT.ownerOf(3)).to.be.equal(bob.address);
      expect(await pixNFT.ownerOf(4)).to.be.equal(bob.address);
    });
  });

  describe('#sellNFTWithSignatureWithHash function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');
    let merkleTreeInfo;
    let alicePix;
    let hexProof;
    let merkleRoot;

    beforeEach(async () => {
      const PIXMerkleMinterFactory = await ethers.getContractFactory('PIXMerkleMinter');
      merkleMinter = await upgrades.deployProxy(PIXMerkleMinterFactory, [pixNFT.address]);

      await pixNFT.setModerator(merkleMinter.address, true);

      await fixedSale.setPixMerkleMinter(merkleMinter.address);

      await merkleMinter.setDelegateMinter(fixedSale.address, true);

      merkleTreeInfo = getMerkleTree([bob, alice, alice, bob, owner]);

      await merkleMinter.setMerkleRoot(merkleTreeInfo.merkleTree.getRoot(), true);

      hexProof = merkleTreeInfo.merkleTree.getHexProof(merkleTreeInfo.leafNodes[1]);

      merkleRoot = merkleTreeInfo.merkleTree.getRoot();

      alicePix = [
        merkleTreeInfo.pixes[1].pixId,
        merkleTreeInfo.pixes[1].category,
        merkleTreeInfo.pixes[1].size,
      ];

      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
    });

    it('revert if signature invalid', async () => {
      const data = await getDigestWithHash(fixedSale, alice, price, alice, merkleTreeInfo.pixes[1]);
      await expect(
        fixedSale
          .connect(alice)
          .sellNFTWithSignatureWithHash(
            bob.address,
            price,
            alicePix,
            merkleRoot,
            hexProof,
            data.v,
            data.r,
            data.s,
          ),
      ).to.revertedWith('Sale: INVALID_SIGNATURE');
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const data = await getDigestWithHash(fixedSale, bob, price, alice, merkleTreeInfo.pixes[1]);
      const tx = await fixedSale
        .connect(alice)
        .sellNFTWithSignatureWithHash(
          bob.address,
          price,
          alicePix,
          merkleRoot,
          hexProof,
          data.v,
          data.r,
          data.s,
        );
      expect(await pixNFT.ownerOf(3)).to.be.equal(bob.address);
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(alice.address)).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
      expect(tx)
        .to.emit(fixedSale, 'PurchasedWithSignature')
        .withArgs(alice.address, bob.address, pixNFT.address, 3, price);
    });
  });
});

const getDigest = async (
  sale: Contract,
  buyer: SignerWithAddress,
  price: BigNumber,
  nftToken: Contract,
  tokenId: BigNumber,
) => {
  const domain = {
    name: 'PlanetIX',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: sale.address,
  };

  const types = {
    BidMessage: [
      { name: 'bidder', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'nftToken', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const value = {
    bidder: buyer.address,
    price,
    nftToken: nftToken.address,
    tokenId,
    nonce: await sale.nonces(buyer.address, nftToken.address, tokenId),
  };

  const signature = await buyer._signTypedData(domain, types, value);
  return utils.splitSignature(signature);
};

const getDigestWithHash = async (
  sale: Contract,
  buyer: SignerWithAddress,
  price: BigNumber,
  seller: SignerWithAddress,
  info: any,
) => {
  const domain = {
    name: 'PlanetIX',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: sale.address,
  };

  const types = {
    PIXInfo: [
      { name: 'pixId', type: 'uint256' },
      { name: 'category', type: 'uint8' },
      { name: 'size', type: 'uint8' },
    ],
    BidMessageWithHash: [
      { name: 'bidder', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'info', type: 'PIXInfo' },
    ],
  };

  const value = {
    bidder: buyer.address,
    price,
    seller: seller.address,
    info: {
      pixId: info.pixId,
      category: info.category,
      size: info.size,
    },
  };

  const signature = await buyer._signTypedData(domain, types, value);
  return utils.splitSignature(signature);
};
