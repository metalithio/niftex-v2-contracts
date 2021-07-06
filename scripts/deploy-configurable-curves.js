const { ethers, upgrades } = require("hardhat");
require('dotenv').config();
/*
  Before:
    - Double check .env if variables under # MISC is correct
*/

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  const shardedWalletTemplate = process.env.SHARDED_WALLET_TEMPLATE;
  console.log(`SHARDED_WALLET_TEMPLATE: ${shardedWalletTemplate}`);

  // Deploy DefaultPricingCurve
  const DefaultPricingCurve = await ethers.getContractFactory("DefaultPricingCurve");
  const defaultpricingcurve = await DefaultPricingCurve.deploy();
  console.log(`DefaultPricingCurve address: ${defaultpricingcurve.address}`);


  // Deploy CustomPricingCurve
  const CustomPricingCurve = await ethers.getContractFactory("CustomPricingCurve");
  const custompricingcurve = await CustomPricingCurve.deploy();
  console.log(`CustomPricingCurve address: ${custompricingcurve.address}`);

  // Deploy CustomPricingCurveDeployer
  const CustomPricingCurveDeployer = await ethers.getContractFactory('CustomPricingCurveDeployer');
  const custompricingcurvedeployer = await CustomPricingCurveDeployer.deploy(shardedWalletTemplate);
  console.log(`CustomPricingCurveDeployer address: ${custompricingcurvedeployer.address}`);

  // Remember to set CURVE_TEMPLATE, CURVE_TEMPLATE_CUSTOM_PRICING and CURVE_STRETCH via multisig
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
