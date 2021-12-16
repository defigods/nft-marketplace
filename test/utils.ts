import { Wallet, BigNumber, utils } from 'ethers';
import { time } from '@openzeppelin/test-helpers';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

export const DENOMINATOR = BigNumber.from('10000');

export const generateRandomAddress = () => Wallet.createRandom().address;

export const getCurrentTime = async (): Promise<BigNumber> =>
  BigNumber.from((await time.latest()).toString());

export const increaseTime = async (period: BigNumber) => {
  await time.increase(period.toString());
};

export enum PIXCategory {
  Legendary = 0,
  Rare = 1,
  Uncommon = 2,
  Common = 3,
  Outliers = 4,
}

export enum PIXSize {
  Pix = 0,
  Area = 1,
  Sector = 2,
  Zone = 3,
  Domain = 4,
}

// export const pixes = [
//   {
//     to: '0x4db66587ff11a451f00d7e637e57bf2332c84eab',
//     pixId: '1',
//     category: PIXCategory.Common,
//     size: PIXSize.Pix,
//   },
// ];

const generateRandomPixes = () => {
  let count = 149617062;
  let randomPixes = [];
  console.log('generate start');
  console.log(Date.now());
  for (let i = 0; i < count; i += 1) {
    randomPixes.push({
      to: '0x0cd22dca98855d520c94146b1ac67c9dc1679c3a',
      pixId: '1',
      category: PIXCategory.Common,
      size: PIXSize.Pix,
    });
  }
  console.log('generate done');
  console.log(Date.now());
  return randomPixes;
};

export const getMerkleTree = () => {
  const pixes = generateRandomPixes();
  const leafNodes = pixes.map((pix) =>
    keccak256(
      utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint8', 'uint8'],
        [pix.to, pix.pixId, pix.category, pix.size],
      ),
    ),
  );
  console.log('leaf generated');
  console.log(Date.now());
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
  console.log('merkle generated');
  console.log(Date.now());
  return {
    merkleTree,
    leafNodes,
    pixes,
  };
};
