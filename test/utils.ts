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

const generateRandomPixes = () => {
  let count = 1000;
  let randomPixes = [];
  for (let i = 0; i < count; i += 1) {
    randomPixes.push({
      to: generateRandomAddress(),
      pixId: '1',
      category: PIXCategory.Common,
      size: PIXSize.Pix,
    });
  }
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
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
  return {
    merkleTree,
    leafNodes,
    pixes,
  };
};
