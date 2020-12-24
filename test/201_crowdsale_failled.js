const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
	const Governance           = artifacts.require('BasicGovernance');
	const Modules = {
		Action:    { artifact: artifacts.require('ActionModule')         },
		Buyout:    { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale: { artifact: artifacts.require('CrowdsaleBasicModule') },
	};
	const Mocks = {
		ERC721:    { artifact: artifacts.require('ERC721Mock'),  args: [ 'ERC721Mock', '721']                                    },
		// ERC777:    { artifact: artifacts.require('ERC777Mock'),  args: [ admin, web3.utils.toWei('1'), 'ERC777Mock', '777', [] ] }, // needs erc1820registry
		ERC1155:   { artifact: artifacts.require('ERC1155Mock'), args: [ '' ]                                                    },
	};

	let instance;

	before(async function () {
		// Deploy factory
		this.factory = await ShardedWalletFactory.new();
		// Deploy & whitelist modules
		this.governance = await Governance.new();
		this.modules = await Object.entries(Modules).reduce(async (acc, [ key, { artifact, args } ]) => ({ ...await acc, [key.toLowerCase()]: await artifact.new(...(args || [])) }), Promise.resolve({}));
		for ({ address } of Object.values(this.modules))
		{
			await this.governance.grantRole(await this.governance.MODULE_ROLE(), address);
		}
		// write config
		await this.governance.writeConfig(await this.governance.AUTHORIZATION_RATIO(), web3.utils.toWei('0.01'));
		await this.governance.writeConfig(await this.modules.action.ACTION_DURATION(), 50400);
		await this.governance.writeConfig(await this.modules.buyout.BUYOUT_DURATION(), 50400);
		// Deploy Mocks
		this.mocks = await Object.entries(Mocks).reduce(async (acc, [ key, { artifact, args } ]) => ({ ...await acc, [key.toLowerCase()]: await artifact.new(...(args || [])) }), Promise.resolve({}));
		// Verbose
		const { gasUsed } = await web3.eth.getTransactionReceipt(this.factory.transactionHash);
		console.log('factory deployment:', gasUsed);
	});

	describe('Initialize', function () {
		it('perform', async function () {
			const { receipt } = await this.factory.mintWallet(
				this.governance.address,      // governance_
				user1,                        // owner_
				'Tokenized NFT',              // name_
				'TNFT',                       // symbol_
			);
			instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == "NewInstance").args.instance);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
		});
	});

	describe('Prepare tokens', function () {
		it('perform', async function () {
			await this.mocks.erc721.mint(instance.address, 1);
			await this.mocks.erc1155.mint(instance.address, 1, 1, '0x');
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.mocks.erc721.ownerOf(1),                instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
		});
	});

	// describe('Setup crowdsale', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await instance.startCrowdsale(
	// 			this.crowdsale.address,         // crowdsale
	// 			this.crowdsale.contract.methods.setup(
	// 				user1,                        // recipient
	// 				web3.utils.toWei('0.01'),     // price
	// 				3600,                         // duration
	// 				20,                           // totalSupply
	// 				[[ user1, 8 ], [ user2, 2 ]], // premint
	// 			).encodeABI(),
	// 			{ from: user1 }
	// 		);
	// 		console.log('tx.receipt.gasUsed:', receipt.gasUsed);
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '0');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
	//
	// describe('Buy shard', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await this.crowdsale.buy(instance.address, other1, { from: other1, value: web3.utils.toWei('0.01')})
	// 		expectEvent(receipt, 'SharesBought', { token: instance.address, from: other1, to: other1, count: '1' });
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '0');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0.01'));
	// 	});
	// });
	//
	// describe('Wait deadline', function () {
	// 	it('perform', async function () {
	// 		const deadline = await this.crowdsale.deadlines(instance.address);
	// 		await web3.currentProvider.send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [ Number(deadline) - (await web3.eth.getBlock("latest")).timestamp ], id: 0 }, () => {});
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '0');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0.01'));
	// 	});
	// });
	//
	// describe('redeem', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await this.crowdsale.redeem(instance.address, other1, { from: other1 });
	// 		expectEvent(receipt, 'SharesRedeemedFaillure', { token: instance.address, from: other1, to: other1, count: '1' });
	// 		// expectEvent(receipt, 'Transfer', { from: instance.address, to: other1, value: '1' });
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '0');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
	//
	// describe('withdraw', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await this.crowdsale.withdraw(instance.address, user1, { from: user1 });
	// 		expectEvent(receipt, 'OwnershipReclaimed', { token: instance.address, from: user1, to: user1 });
	// 		// expectEvent(receipt, 'OwnershipTransferred', { from: this.crowdsale.address, to: user1 });
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            user1);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '0');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
});
