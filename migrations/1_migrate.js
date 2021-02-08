const TokenizedNFTFactory = artifacts.require('TokenizedNFTFactory')
const TokenizedNFT        = artifacts.require('TokenizedNFT')
const NFTBatch            = artifacts.require('NFTBatch')

module.exports = async function(deployer, network, accounts)
{
	console.log('# web3 version:', web3.version);
	const chainid   = await web3.eth.net.getId();
	const chaintype = await web3.eth.net.getNetworkType();
	console.log('Chainid is:', chainid);
	console.log('Chaintype is:', chaintype);
	console.log('Deployer is:', accounts[0]);

	await deployer.deploy(TokenizedNFT);
	await deployer.deploy(TokenizedNFTFactory, (await TokenizedNFT.deployed()).address);
	await deployer.deploy(NFTBatch);
};
