const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
	const Governance           = artifacts.require('BasicGovernance');
	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')         },
		Buyout:        { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale:     { artifact: artifacts.require('CrowdsaleBasicModule') },
		TokenReceiver: { artifact: artifacts.require('TokenReceiverModuke')  },
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
		for (funcSig of Object.keys(this.modules.tokenreceiver.methods).map(web3.eth.abi.encodeFunctionSignature))
		{
			await this.governance.writeModule(funcSig, this.modules.tokenreceiver.address);
		}
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
	// describe('Buy rest', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await this.crowdsale.buy(instance.address, other2, { from: other2, value: web3.utils.toWei('1')})
	// 		expectEvent(receipt, 'SharesBought', { token: instance.address, from: other2, to: other2, count: '9' });
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
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0.10'));
	// 	});
	// });
	//
	// describe('Withdraw', function () {
	// 	it('perform', async function () {
	// 		const { receipt } = await this.crowdsale.withdraw(instance.address, user1, { from: user1 });
	// 		expectEvent(receipt, 'Withdraw', { token: instance.address, from: user1, to: user1, value: web3.utils.toWei('0.10') });
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
	// describe('redeem', function () {
	// 	it('perform', async function () {
	// 		for ([ account, value ] of [[ user1, '8' ], [ user2, '2' ], [ other1, '1' ], [ other2, '9' ]])
	// 		{
	// 			const { receipt } = await this.crowdsale.redeem(instance.address, account, { from: account });
	// 			expectEvent(receipt, 'SharesRedeemedSuccess', { token: instance.address, from: account, to: account, count: value });
	// 			// expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: account, value: value });
	// 		}
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '20');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '8');
	// 		assert.equal(await instance.balanceOf(user2),                   '2');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '1');
	// 		assert.equal(await instance.balanceOf(other2),                  '9');
	// 		assert.equal(await instance.balanceOf(other3),                  '0');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
	//
	// describe('Transfers', function () {
	// 	it('perform', async function () {
	// 		for (from of [ user1, user2, other1, other2 ])
	// 		{
	// 			await instance.transfer(other3, await instance.balanceOf(from), { from });
	// 		}
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '20');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '20');
	// 		assert.equal(await this.nft.ownerOf(1),                         instance.address);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
	//
	// describe('Execute (get NFT)', function () {
	// 	it('perform', async function () {
	// 		await instance.execute(
	// 			[ this.nft.address ],
	// 			[ this.nft.contract.methods.safeTransferFrom(instance.address, other3, 1).encodeABI() ],
	// 			{ from: other3 }
	// 		);
	// 	});
	//
	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                            this.crowdsale.address);
	// 		assert.equal(await instance.name(),                             'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                           'TNFT');
	// 		assert.equal(await instance.decimals(),                         '18');
	// 		assert.equal(await instance.totalSupply(),                      '20');
	// 		assert.equal(await instance.balanceOf(instance.address),        '0');
	// 		assert.equal(await instance.balanceOf(user1),                   '0');
	// 		assert.equal(await instance.balanceOf(user2),                   '0');
	// 		assert.equal(await instance.balanceOf(user3),                   '0');
	// 		assert.equal(await instance.balanceOf(other1),                  '0');
	// 		assert.equal(await instance.balanceOf(other2),                  '0');
	// 		assert.equal(await instance.balanceOf(other3),                  '20');
	// 		assert.equal(await this.nft.ownerOf(1),                         other3);
	// 		assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
	// 		assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
	// 	});
	// });
});
