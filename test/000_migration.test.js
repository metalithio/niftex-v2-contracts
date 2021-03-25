const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

contract('Workflow', function (accounts) {
	const [ deployer, multisig ] = accounts;

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const Governance           = artifacts.require('Governance');
	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')            },
		Buyout:        { artifact: artifacts.require('BuyoutModule')            },
		Crowdsale:     { artifact: artifacts.require('BasicDistributionModule') },
		Factory:       { artifact: artifacts.require('ShardedWalletFactory')    },
		Multicall:     { artifact: artifacts.require('MulticallModule')         },
		TokenReceiver: { artifact: artifacts.require('TokenReceiverModule')     },
	};
	const Mocks = {
		ERC721:    { artifact: artifacts.require('ERC721Mock'),  args: [ 'ERC721Mock', '721']                                    },
		// ERC777:    { artifact: artifacts.require('ERC777Mock'),  args: [ admin, web3.utils.toWei('1'), 'ERC777Mock', '777', [] ] }, // needs erc1820registry
		ERC1155:   { artifact: artifacts.require('ERC1155Mock'), args: [ '' ]                                                    },
	};

	let instance;

	before(async function () {
		// Deploy template
		this.template = await ShardedWallet.new();
		// Deploy governance
		this.governance = await Governance.new();
		// Deploy modules
		this.modules = await Object.entries(Modules).reduce(async (acc, [ key, { artifact, args } ]) => ({
			...await acc,
			[key.toLowerCase()]: await artifact.new(this.template.address, ...(this.extraargs || []))
		}), Promise.resolve({}));
		// whitelist modules
		await this.governance.initialize(); // Performed by proxy
		for ({ address } of Object.values(this.modules))
		{
			await this.governance.grantRole(await this.governance.MODULE_ROLE(), address);
		}
		// set config
		await this.governance.setGlobalConfig(await this.modules.action.ACTION_AUTH_RATIO(), web3.utils.toWei('0.01'));
		await this.governance.setGlobalConfig(await this.modules.buyout.BUYOUT_AUTH_RATIO(), web3.utils.toWei('0.01'));
		await this.governance.setGlobalConfig(await this.modules.action.ACTION_DURATION(), 50400);
		await this.governance.setGlobalConfig(await this.modules.buyout.BUYOUT_DURATION(), 50400);
		for (funcSig of Object.keys(this.modules.tokenreceiver.methods).map(web3.eth.abi.encodeFunctionSignature))
		{
			await this.governance.setGlobalModule(funcSig, this.modules.tokenreceiver.address);
		}
		// Deploy Mocks
		this.mocks = await Object.entries(Mocks).reduce(async (acc, [ key, { artifact, args } ]) => ({ ...await acc, [key.toLowerCase()]: await artifact.new(...(args || [])) }), Promise.resolve({}));
		// Verbose
		const { gasUsed: gasUsedTemplate } = await web3.eth.getTransactionReceipt(this.template.transactionHash);
		console.log('template deployment:', gasUsedTemplate);
		const { gasUsed: gasUsedFactory } = await web3.eth.getTransactionReceipt(this.modules.factory.transactionHash);
		console.log('factory deployment:', gasUsedFactory);
	});

	it('Modules metadata', async function () {
		for ([ name, module ] of Object.entries(this.modules))
		{
			console.log('>>', name, await module.name());
		}
	});

	describe('Admin migration', function () {
		before(async function () {
			expect(await this.governance.hasRole(constants.ZERO_BYTES32, deployer)).to.be.equal(true);
			expect(await this.governance.hasRole(constants.ZERO_BYTES32, multisig)).to.be.equal(false);
			expect(await this.governance.getNiftexWallet()).to.be.equal(deployer);
		});
		it('perform', async function () {
			await this.governance.grantRole(constants.ZERO_BYTES32, multisig, { from: deployer });
			await this.governance.renounceRole(constants.ZERO_BYTES32, deployer, { from: deployer });
		});

		after(async function () {
			expect(await this.governance.hasRole(constants.ZERO_BYTES32, deployer)).to.be.equal(false);
			expect(await this.governance.hasRole(constants.ZERO_BYTES32, multisig)).to.be.equal(true);
			expect(await this.governance.getNiftexWallet()).to.be.equal(multisig);
		});
	});
});
