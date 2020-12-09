module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },
  mocha: {
    timeout: 10000,
  },
  compilers: {
    solc: {
      version: "0.7.5",
      settings: {
      optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
};
