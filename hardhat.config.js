require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-solhint");
require("solidity-coverage");
require('@openzeppelin/hardhat-upgrades');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.7.5",
  settings: {
    optimizer: {
      enabled: true,
      runs: 999,
    },
  },
};
