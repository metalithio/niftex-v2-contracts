const { ethers, upgrades } = require("hardhat");

const PROXY      = '0x04D29b2C66Fd69c5227F0436FD5fd93ac9902B9A';
const PROXYADMIN = '0xeE7C701521b8Ce2D5a670f3926943e957D4A4E87';
const MULTISIG   = '0x1fB1B8336ae744D6a319e91b5cb8E19b79240D1B';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ${ethers.constants.EtherSymbol}`);

  // prepare upgrade
  const Governance     = await ethers.getContractFactory("Governance");
  const Governance2    = await ethers.getContractFactory("Governance2");
  const instance       = await Governance.attach(PROXY);
  const implementation = await upgrades.prepareUpgrade(instance, Governance2);

  // prepare mutlisig call
  const ProxyAdminInterface = new ethers.utils.Interface([ 'function upgrade(address,address)' ]);
  const tx = {
    from: MULTISIG,
    to:   PROXYADMIN,
    data: ProxyAdminInterface.encodeFunctionData('upgrade', [ PROXY, implementation ]),
  };

  console.log('Transaction to send:');
  console.log(JSON.stringify(tx, null, 4));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
