import { Wallet, BigNumber } from "ethers";
import { time } from "@openzeppelin/test-helpers";

export const DENOMINATOR = BigNumber.from("10000");

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
