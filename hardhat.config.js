require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-solhint');
require('@openzeppelin/hardhat-upgrades');
require('solidity-coverage');
require('dotenv').config();

module.exports = {
  solidity: {
		version: '0.8.1',
		settings: {
			optimizer: {
				enabled: true,
				runs: 999,
			},
    },
  },
  networks: {},
};

if ([ 'INFURA_URL', 'NIFTEX_PRIVATE_KEY' ].every(key => key in process.env)) {
  // Replace this private key with your Ropsten account private key
  // To export your private key from Metamask, open Metamask and
  // go to Account Details > Export Private Key
  // Be aware of NEVER putting real Ether into testing accounts
  module.exports.networks.rinkeby = {
    url: process.env.INFURA_URL,
    accounts: [
      process.env.NIFTEX_PRIVATE_KEY.startsWith('0x')
        ? process.env.NIFTEX_PRIVATE_KEY
        : '0x' + process.env.NIFTEX_PRIVATE_KEY,
    ],
  }
}
