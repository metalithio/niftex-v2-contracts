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
  const modules = await Object.entries({
    // "action":              "ActionModule",
    // "basicdistribution":   "BasicDistributionModule",
    // "buyout":              "BuyoutModule",
    // "crowdsale":           "FixedPriceSaleModule",
    // "factory":             "ShardedWalletFactory",
    // "multicall":           "MulticallModule",
    // "tokenreceiver":       "TokenReceiverModule",
    // "erc20managermodule":  "ERC20ManagerModule",
    "swmanagermodule":     "SwManagerModule",
  }).reduce(
    async (accAsPromise, [key, name ]) => {
      const acc    = await accAsPromise;
      const Module = await ethers.getContractFactory(name);
      const module = await Module.deploy(shardedWalletTemplate);
      console.log(` - ${name}: ${module.address}`);
      return Object.assign(acc, { [ key ]: module });
    },
    Promise.resolve({})
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
