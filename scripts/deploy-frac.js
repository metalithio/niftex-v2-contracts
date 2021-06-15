/*
	Steps:
	1. Deploy FRAC, transfer all FRAC to temp NIFTEX wallet
*/

const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  const now = Math.round(new Date().valueOf() / 1000);
  const FracToken = await ethers.getContractFactory('FracToken');

  const beneficiary = process.env.MULTISIG_ADDRESS;
  const minter = process.env.MULTISIG_ADDRESS;
  const mintingAllowedAfter = now + 60*60*24*365*2;

  const fractoken = await FracToken.deploy(
		beneficiary, // account to receive all tokens minted
		minter, // minter
		mintingAllowedAfter // 2 years from now
	);

	console.log(`FracToken address: ${fractoken.address}`);
	console.log(`Wallet owning 100% FRAC: ${beneficiary}`);
	console.log(`Minter: ${minter}`);
	console.log(`Minting allowed after: ${mintingAllowedAfter} - ${new Date(mintingAllowedAfter * 1000)}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });