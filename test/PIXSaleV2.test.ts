import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, BigNumber, utils, constants, Wallet, BigNumberish } from 'ethers';
import { Address, ecsign } from 'ethereumjs-util';
import { DENOMINATOR, generateRandomAddress, getMerkleTree, PIXCategory, PIXSize } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = utils;

type SaleInfo = {
  seller: string;
  executeBySeller: boolean;
  nftToken: string;
  tokenIds: BigNumber[];
  tokenAmounts: BigNumber[];
  hashes: string[];
  minPrice: BigNumber;
  validUntil: BigNumber;
  is721: boolean;
  inLandmark: boolean;
};

describe('PIXSaleV2', function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let treasury: string = generateRandomAddress();
  let pixNFT: Contract;
  let saleV2: Contract;
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

    const PIXMerkleMinterFactory = await ethers.getContractFactory('PIXMerkleMinter');
    merkleMinter = await upgrades.deployProxy(PIXMerkleMinterFactory, [pixNFT.address]);

    const PIXSaleV2Factory = await ethers.getContractFactory('PIXSaleV2');
    saleV2 = await upgrades.deployProxy(PIXSaleV2Factory, [
      pixtToken.address,
      pixNFT.address,
      merkleMinter.address,
    ]);

    await pixNFT.setTrader(saleV2.address, true);
    await pixNFT.setTrader(merkleMinter.address, true);
    await saleV2.setWhitelistedNFTs(pixNFT.address, true);
  });

  describe('#buy function', () => {
    const tokenId = 1;
    const price = utils.parseEther('1');

    beforeEach(async () => {
      await pixNFT.safeMint(alice.address, [0, PIXCategory.Rare, PIXSize.Sector]);
      await pixNFT.connect(alice).setApprovalForAll(saleV2.address, true);
    });

    it('should purchase PIX and send to seller and treasury', async () => {
      await saleV2.setTreasury(treasury, 100, 0, false);
      await pixtToken.connect(bob).approve(saleV2.address, price);

      const aliceBalanceBefore = await pixtToken.balanceOf(alice.address);
      const treasuryBalanceBefore = await pixtToken.balanceOf(treasury);

      const saleInfos: SaleInfo[] = [
        {
          seller: alice.address,
          executeBySeller: false,
          nftToken: pixNFT.address,
          tokenIds: [BigNumber.from(tokenId)],
          tokenAmounts: [BigNumber.from(0)],
          hashes: [],
          minPrice: price,
          validUntil: BigNumber.from('7777777777'),
          is721: true,
          inLandmark: false,
        },
      ];

      const { sig, saleSignatures } = await getDigest(saleV2, alice, saleInfos);

      await saleV2.connect(bob).buy([saleSignatures, 0, saleInfos[0], [], [], [], sig], price);
      expect(await pixNFT.ownerOf(tokenId)).to.be.equal(bob.address);
      const fee = price.mul(BigNumber.from('100')).div(DENOMINATOR);
      expect(await pixtToken.balanceOf(alice.address)).to.be.equal(
        aliceBalanceBefore.add(price).sub(fee),
      );
      expect(await pixtToken.balanceOf(treasury)).to.be.equal(treasuryBalanceBefore.add(fee));
    });
  });
});

const getDigest = async (sale: Contract, seller: SignerWithAddress, saleInfos: SaleInfo[]) => {
  const domain = {
    name: 'PlanetIX',
    version: '2',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: sale.address,
  };

  const types = {
    Sales: [{ name: 'signatures', type: 'bytes32[]' }],
  };

  const signatures = saleInfos.map((info) =>
    utils.solidityKeccak256(
      [
        'address',
        'bool',
        'address',
        'uint256[]',
        'uint256[]',
        'bytes32[]',
        'uint256',
        'uint64',
        'bool',
        'bool',
      ],
      [
        info.seller,
        info.executeBySeller,
        info.nftToken,
        info.tokenIds,
        info.tokenAmounts,
        info.hashes,
        info.minPrice,
        info.validUntil,
        info.is721,
        info.inLandmark,
      ],
    ),
  );

  const value = {
    seller: seller.address,
    signatures,
  };

  const signature = await seller._signTypedData(domain, types, value);
  const split = utils.splitSignature(signature);
  const sig = utils.defaultAbiCoder.encode(
    ['uint8', 'bytes32', 'bytes32'],
    [split.v, split.r, split.s],
  );
  return {
    sig,
    saleSignatures: signatures,
  };
};
