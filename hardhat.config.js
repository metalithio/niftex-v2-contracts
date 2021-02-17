require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-solhint");
require("solidity-coverage");
require('@openzeppelin/hardhat-upgrades');
require('dotenv').config();

const INFURA_URL = process.env.INFURA_URL;

// Replace this private key with your Ropsten account private key
// To export your private key from Metamask, open Metamask and
// go to Account Details > Export Private Key
// Be aware of NEVER putting real Ether into testing accounts
const NIFTEX_PRIVATE_KEY = process.env.NIFTEX_PRIVATE_KEY;

module.exports = {
  solidity: "0.7.5",
  settings: {
    optimizer: {
      enabled: true,
      runs: 999,
    },
  },
  networks: {
    rinkeby: {
      url: `${INFURA_URL}`,
      accounts: [`0x${NIFTEX_PRIVATE_KEY}`]
    }
  }
};
