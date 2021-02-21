const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  // Deploy Factory
  const Factory = await ethers.getContractFactory("ShardedWalletFactory");
  const factory = await Factory.deploy();
  console.log(`Factory address: ${factory.address}`);

  // Deploy Governance
  const Governance = await ethers.getContractFactory("Governance");
  // const governance = await Governance.deploy();
  const governance = await upgrades.deployProxy(Governance);
  await governance.deployed();
  console.log(`Governance address: ${governance.address}`);

  // Deploy BondingCurve
  const BondingCurve = await ethers.getContractFactory("BondingCurve");
  const bondingcurve = await BondingCurve.deploy();
  console.log(`BondingCurve address: ${bondingcurve.address}`);

  // Deploy and whitelist modules
  console.log("Deploying modules:");
  const MODULE_ROLE = await governance.MODULE_ROLE();
  const modules = await Object.entries({
    "action":        "ActionModule",
    "buyout":        "BuyoutModule",
    "crowdsale":     "FixedPriceSaleModule",
    "multicall":     "MulticallModule",
    "tokenreceiver": "TokenReceiverModule",
    "basicdistribution": "BasicDistributionModule",
  }).reduce(
    async (accAsPromise, [key, name ]) => {
      const acc    = await accAsPromise;
      const Module = await ethers.getContractFactory(name);
      const module = await Module.deploy();
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
    [ await modules.action.ACTION_AUTH_RATIO()          ]: ethers.utils.parseEther('0.01'),
    [ await modules.buyout.BUYOUT_AUTH_RATIO()          ]: ethers.utils.parseEther('0.01'),
    [ await modules.action.ACTION_DURATION()            ]: 50400,
    [ await modules.buyout.BUYOUT_DURATION()            ]: 50400,
    [ await modules.crowdsale.CURVE_TEMPLATE()          ]: bondingcurve.address,
    [ await modules.crowdsale.PCT_SHARDS_NIFTEX()       ]: ethers.utils.parseEther('0.0'),
    [ await modules.crowdsale.PCT_ETH_TO_CURVE()        ]: ethers.utils.parseEther('0.20'),
    [ await bondingcurve.PCT_FEE_NIFTEX()               ]: ethers.utils.parseEther('0.001'),
    [ await bondingcurve.PCT_FEE_ARTIST()               ]: ethers.utils.parseEther('0.001'),
    [ await bondingcurve.PCT_FEE_SUPPLIERS()            ]: ethers.utils.parseEther('0.003'),
    [ await bondingcurve.LIQUIDITY_TIMELOCK()           ]: 100800,
  }))
  {
    console.log(` - ${key}: ${value}`)
    await governance.setGlobalConfig(key, value);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
