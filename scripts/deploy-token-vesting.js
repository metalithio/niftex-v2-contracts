const { ethers, upgrades, web3 } = require("hardhat");
const BigNumber = require('bignumber.js');
const { investors } = require('../utils/investors');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  // Deploy TokenVesting instance
  const TokenVesting = await ethers.getContractFactory("TokenVesting");
  const tokenVesting = await TokenVesting.deploy(deployer.address);
  console.log(`TokenVesting address: ${tokenVesting.address}`);

  // Deploy TokenVesting factory
  const TokenVestingFactory = await ethers.getContractFactory("TokenVestingFactory");
  const tokenVestingFactory = await TokenVestingFactory.deploy(tokenVesting.address);
  console.log(`TokenVestingFactory address: ${tokenVestingFactory.address}`);

  for (let i = 0; i < investors.length; i++) {
    const {
      name,
      beneficiary,
      start,
      cliffDuration,
      duration,
      revocable
    } = investors[i];

    const txnHash = await tokenVestingFactory.mintTokenVesting(
        beneficiary,
        start,
        cliffDuration,
        duration,
        revocable
      );

    console.log({ txnHash });
  }

  // const TokenVesting = await ethers.getContractFactory('TokenVesting');
  // const tokenVesting = await TokenVesting.attach('0x96d7B063A8E90fBAEF1fA88f9a71Acd2Cc8f34fA');

  // const beneficiary = await tokenVesting.beneficiary();
  // const start = await tokenVesting.start();
  // const cliff = await tokenVesting.cliff();
  // const duration = await tokenVesting.duration();
  // const revocable = await tokenVesting.revocable();

  // console.log({
  //   beneficiary,
  //   start: new BigNumber(start).toFixed(),
  //   cliff: new BigNumber(cliff).toFixed(),
  //   duration: new BigNumber(duration).toFixed(),
  //   revocable,
  // })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
