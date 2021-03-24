const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  // Deploy ShardedWallet
  const ShardedWallet = await ethers.getContractFactory("ShardedWallet");
  const shardedwallet = await ShardedWallet.deploy();
  console.log(`ShardedWallet address: ${shardedwallet.address}`);

  // Deploy BondingCurve
  const BondingCurve = await ethers.getContractFactory("BondingCurve3");
  const bondingcurve = await BondingCurve.deploy();
  console.log(`BondingCurve address: ${bondingcurve.address}`);

  // Deploy Governance
  const Governance = await ethers.getContractFactory("Governance");
  const governance = await upgrades.deployProxy(Governance);
  await governance.deployed();
  console.log(`Governance address: ${governance.address}`);

  // Deploy and whitelist modules
  console.log("Deploying modules:");
  const MODULE_ROLE = await governance.MODULE_ROLE();
  const modules = await Object.entries({
    "action":              "ActionModule",
    "basicdistribution":   "BasicDistributionModule",
    "buyout":              "BuyoutModule",
    "crowdsale":           "FixedPriceSaleModule",
    "factory":             "ShardedWalletFactory",
    "multicall":           "MulticallModule",
    "tokenreceiver":       "TokenReceiverModule",
    "erc20managermodule":  "ERC20ManagerModule",
  }).reduce(
    async (accAsPromise, [key, name ]) => {
      const acc    = await accAsPromise;
      const Module = await ethers.getContractFactory(name);
      const module = await Module.deploy(shardedwallet.address);
      await governance.grantRole(MODULE_ROLE, module.address);
      console.log(` - ${name}: ${module.address}`);
      return Object.assign(acc, { [ key ]: module });
    },
    Promise.resolve({})
  );

  // Link static methods
  console.log("Linking static methods");
  for ([ method, address ] of Object.entries({
    "onERC721Received(address,address,uint256,bytes)":                   modules.tokenreceiver.address,
    "onERC1155Received(address,address,uint256,uint256,bytes)":          modules.tokenreceiver.address,
    "onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)": modules.tokenreceiver.address,
    "tokensReceived(address,address,address,uint256,bytes,bytes)":       modules.tokenreceiver.address,
  }))
  {
    const fragment = modules.tokenreceiver.interface.functions[method];
    const sighash = modules.tokenreceiver.interface.getSighash(fragment);
    console.log(` - ${sighash}: ${address} (${method})`)
    await governance.setGlobalModule(sighash, address);
  }

  // Set config
  console.log("Configuring governance");
  for ([ key, value ] of Object.entries({
    [ await modules.action.ACTION_AUTH_RATIO()    ]: ethers.utils.parseEther('0.03'),
    [ await modules.buyout.BUYOUT_AUTH_RATIO()    ]: ethers.utils.parseEther('0.01'),
    [ await modules.action.ACTION_DURATION()      ]: 432000,
    [ await modules.buyout.BUYOUT_DURATION()      ]: 432000,
    [ await modules.crowdsale.CURVE_TEMPLATE()    ]: bondingcurve.address,
    [ await modules.crowdsale.PCT_SHARDS_NIFTEX() ]: ethers.utils.parseEther('0.01'),
    [ await modules.crowdsale.PCT_ETH_TO_CURVE()  ]: ethers.utils.parseEther('0.25'),
    [ await bondingcurve.PCT_FEE_NIFTEX()         ]: ethers.utils.parseEther('0'),
    [ await bondingcurve.PCT_FEE_ARTIST()         ]: ethers.utils.parseEther('0.001'),
    [ await bondingcurve.PCT_FEE_SUPPLIERS()      ]: ethers.utils.parseEther('0.003'),
    [ await bondingcurve.LIQUIDITY_TIMELOCK()     ]: 2592000,
  }))
  {
    console.log(` - ${key}: ${value}`)
    await governance.setGlobalConfig(key, value);
  }

  console.log("setting global only keys");

  for ([ key, value ] of Object.entries({
    [ await shardedwallet.ALLOW_GOVERNANCE_UPGRADE() ]: true,
    [ await modules.crowdsale.PCT_SHARDS_NIFTEX()    ]: true,
    [ await bondingcurve.PCT_FEE_NIFTEX()            ]: true,
  }))
  {
    console.log(` - ${key}: ${value}`)
    await governance.setGlobalKey(key, value);
  }

	const DEFAULT_ADMIN_ROLE = await governance.DEFAULT_ADMIN_ROLE();

	await governance.grantRole(
		DEFAULT_ADMIN_ROLE,
		process.env.MULTISIG_ADDRESS
	);

	await governance.renounceRole(
		DEFAULT_ADMIN_ROLE,
		deployer.address
	);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
