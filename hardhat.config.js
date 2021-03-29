require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-solhint');
require('@openzeppelin/hardhat-upgrades');
require('solidity-coverage');
require('dotenv').config();

module.exports = {
  solidity: {
		version: '0.8.3',
		settings: {
			optimizer: {
				enabled: true,
				runs: 999,
			},
    },
  },
  networks: {},
};

module.exports.networks.rinkeby = {
  url: process.env.RINKEBY_INFURA_URL,
  accounts: [
    process.env.RINKEBY_PRIVATE_KEY.startsWith('0x')
      ? process.env.RINKEBY_PRIVATE_KEY
      : '0x' + process.env.RINKEBY_PRIVATE_KEY,
  ],
}

module.exports.networks.mainnet = {
  url: process.env.MAINNET_INFURA_URL,
  accounts: [
    process.env.MAINNET_PRIVATE_KEY.startsWith('0x')
      ? process.env.MAINNET_PRIVATE_KEY
      : '0x' + process.env.MAINNET_PRIVATE_KEY,
  ],
}
