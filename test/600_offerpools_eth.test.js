const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

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
		ERC20:     { artifact: artifacts.require('ERC20Mock'),   args: [ 'ERC20Mock', '20']                                      },
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
		// Extra module (OfferPools)
		this.modules.offerpools = await artifacts.require('OfferPools').new(this.modules.factory.address, this.governance.address);
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

	describe('Workflow ETH', function () {
		before(async function() {
			await this.mocks.erc721.mint(user1, 1);
		});

		describe('#1 Deposit and create Pool', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.offerpools.depositETH(this.mocks.erc721.address, 1, { from: user2, value: web3.utils.toWei('8') });
				instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == 'NewPool').args.pool);
			});
			after(async function () {
				assert.equal(await this.modules.offerpools.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                      this.modules.offerpools.address);
				assert.equal(await instance.name(),                                                                       'OfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                     'OPW');
				assert.equal(await instance.decimals(),                                                                   '18');
				assert.equal(await instance.totalSupply(),                                                                web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                             web3.utils.toWei('8'));
				assert.equal(await web3.eth.getBalance(this.modules.offerpools.address),                                  web3.utils.toWei('8'));
			});
		});

		describe('#2 Deposit', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.offerpools.depositETH(this.mocks.erc721.address, 1, { from: user3, value: web3.utils.toWei('2') });
			});
			after(async function () {
				assert.equal(await this.modules.offerpools.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                      this.modules.offerpools.address);
				assert.equal(await instance.name(),                                                                       'OfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                     'OPW');
				assert.equal(await instance.decimals(),                                                                   '18');
				assert.equal(await instance.totalSupply(),                                                                web3.utils.toWei('10'));
				assert.equal(await instance.balanceOf(user2),                                                             web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user3),                                                             web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.offerpools.address),                                  web3.utils.toWei('10'));
			});
		});

		describe('#3 Withdraw', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.offerpools.withdrawETH(this.mocks.erc721.address, 1, web3.utils.toWei('2'), { from: user2 });
			});
			after(async function () {
				assert.equal(await this.modules.offerpools.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                      this.modules.offerpools.address);
				assert.equal(await instance.name(),                                                                       'OfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                     'OPW');
				assert.equal(await instance.decimals(),                                                                   '18');
				assert.equal(await instance.totalSupply(),                                                                web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                             web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                             web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.offerpools.address),                                  web3.utils.toWei('8'));
			});
		});

		describe('#4 AcceptOffer', function () {
			it('perform', async function () {
				await this.mocks.erc721.approve(this.modules.offerpools.address, 1, { from: user1 });
				const { receipt } = await this.modules.offerpools.acceptOffer(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS, web3.utils.toWei('8'), { from: user1 });
			});
			after(async function () {
				assert.equal(await this.modules.offerpools.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), constants.ZERO_ADDRESS);
				assert.equal(await instance.owner(),                                                                      constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                                                                       'OfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                     'OPW');
				assert.equal(await instance.decimals(),                                                                   '18');
				assert.equal(await instance.totalSupply(),                                                                web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                             web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                             web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.offerpools.address),                                  web3.utils.toWei('0'));
			});
		});
	});
});
