import { Wallet, BigNumber } from "ethers";

export const DENOMINATOR = BigNumber.from("10000");
export const generateRandomAddress = () => Wallet.createRandom().address;
