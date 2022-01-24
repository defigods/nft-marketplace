import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Wallet, Contract, BigNumber, utils, constants, Signer } from 'ethers';
import { ecsign } from 'ethereumjs-util';
import { DENOMINATOR, generateRandomAddress, getMerkleTree, PIXCategory, PIXSize } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = utils;

describe('PIXFixedSale', function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: Wallet;
  let treasury: string = generateRandomAddress();
  let pixNFT: Contract;
  let fixedSale: Contract;
  let pixtToken: Contract;
  let merkleMinter: Contract;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    bob = Wallet.fromMnemonic(
      'test test test test test test test test test test test junk',
    ).connect(owner.provider);

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
      const data = await getDigest(fixedSale, bob, price, pixNFT, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(process.env.PRIVATE_KEY.slice(2), 'hex'),
      );
      await expect(
        fixedSale
          .connect(alice)
          .sellNFTWithSignature(bob.address, price, pixNFT.address, tokenId, v, r, s),
      ).to.revertedWith('Sale: INVALID_SIGNATURE');
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const data = await getDigest(fixedSale, bob, price, pixNFT, BigNumber.from(tokenId));
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );
      const tx = await fixedSale
        .connect(alice)
        .sellNFTWithSignature(bob.address, price, pixNFT.address, tokenId, v, r, s);
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
      const data = await getDigestWithHash(fixedSale, bob, price, alice, merkleTreeInfo.pixes[1]);
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(process.env.PRIVATE_KEY.slice(2), 'hex'),
      );
      await expect(
        fixedSale
          .connect(alice)
          .sellNFTWithSignatureWithHash(
            bob.address,
            price,
            alicePix,
            merkleRoot,
            hexProof,
            v,
            r,
            s,
          ),
      ).to.revertedWith('Sale: INVALID_SIGNATURE');
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await fixedSale.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(fixedSale.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);
      const data = await getDigestWithHash(fixedSale, bob, price, alice, merkleTreeInfo.pixes[1]);
      const { v, r, s } = ecsign(
        Buffer.from(data.slice(2), 'hex'),
        Buffer.from(bob.privateKey.slice(2), 'hex'),
      );
      const tx = await fixedSale
        .connect(alice)
        .sellNFTWithSignatureWithHash(bob.address, price, alicePix, merkleRoot, hexProof, v, r, s);
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
  buyer: Wallet,
  price: BigNumber,
  nftToken: Contract,
  tokenId: BigNumber,
) => {
  const separator = keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(
          toUtf8Bytes(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
          ),
        ),
        keccak256(toUtf8Bytes('PlanetIX')),
        keccak256(toUtf8Bytes('1')),
        (await ethers.provider.getNetwork()).chainId,
        sale.address,
      ],
    ),
  );
  const hash = keccak256(
    toUtf8Bytes(
      'BidMessage(address bidder,uint256 price,address nftToken,uint256 tokenId,uint256 nonce)',
    ),
  );
  const nonce = await sale.nonces(buyer.address, nftToken.address, tokenId);
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        separator,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'uint256', 'address', 'uint256', 'uint256'],
            [hash, buyer.address, price, nftToken.address, tokenId, nonce],
          ),
        ),
      ],
    ),
  );
};

const getDigestWithHash = async (
  sale: Contract,
  buyer: Wallet,
  price: BigNumber,
  seller: SignerWithAddress,
  info: any,
) => {
  const separator = keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(
          toUtf8Bytes(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
          ),
        ),
        keccak256(toUtf8Bytes('PlanetIX')),
        keccak256(toUtf8Bytes('1')),
        (await ethers.provider.getNetwork()).chainId,
        sale.address,
      ],
    ),
  );
  const hash = keccak256(
    toUtf8Bytes('BidMessageWithHash(address bidder,uint256 price,address seller, PIXInfo info)'),
  );

  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        separator,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'uint256', 'address', 'uint256', 'uint8', 'uint8'],
            [hash, buyer.address, price, seller.address, info.pixId, info.category, info.size],
          ),
        ),
      ],
    ),
  );
};
