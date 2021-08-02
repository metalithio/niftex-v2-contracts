const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, bidder1, bidder2, bidder3 ] = accounts;

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const Governance           = artifacts.require('Governance');
	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')            },
		Buyout:        { artifact: artifacts.require('BuyoutModule')            },
		Crowdsale:     { artifact: artifacts.require('BasicDistributionModule') },
		Factory:       { artifact: artifacts.require('ShardedWalletFactory')    },
		Multicall:     { artifact: artifacts.require('MulticallModule')         },
		TokenReceiver: { artifact: artifacts.require('TokenReceiverModule')     },
		NftBid:        { artifact: artifacts.require('NftBidModule')            },
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
		// Extra module (MagneticPool)
		this.modules.magneticpool = await artifacts.require('MagneticPool').new(this.modules.factory.address, this.governance.address);
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
		await this.governance.setGlobalConfig(await this.modules.nftbid.NFT_TRANSFER_FEE_NIFTEX(), web3.utils.toWei('0.01')); // 1% niftex fee
		await this.governance.setGlobalConfig(await this.modules.nftbid.NFT_TRANSFER_FEE_ARTIST(), web3.utils.toWei('0.025')); // 2.5% artist fee
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

	describe('Initialize', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.factory.mintWallet(
				this.governance.address,      // governance_
				user1,                        // owner_
				'Tokenized NFT',              // name_
				'TNFT',                       // symbol_
				constants.ZERO_ADDRESS        // artistWallet_
			);
			instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == 'NewInstance').args.instance);
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

	describe('Setup basic distribution module', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.setup(
				instance.address,
				[[ user1, 8 ], [ user2, 2 ]],
				{ from: user1 }
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '10');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.mocks.erc721.ownerOf(1),                instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
		});
	});

	describe('Workflow NftBidModule ETH - ERC721', function () {
		before(async function() {
			await this.mocks.erc721.mint(user1, 1);
		});

		describe('#0 Create Pool', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.createPool(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS, // use ETH
					'MyOfferPoolWallet',
					'MOPW',
					constants.ZERO_ADDRESS, // artist
				);
				instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == 'NewPool').args.pool);
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                       'MOPW');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('0'));
				assert.equal(await this.mocks.erc721.ownerOf(1),                                                            user1);
			});
		});

		describe('#1 Deposit', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.depositETH(this.mocks.erc721.address, 1, { from: user2, value: web3.utils.toWei('8') });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                       'MOPW');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('8'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('8'));
				assert.equal(await this.mocks.erc721.ownerOf(1),                                                            user1);
			});
		});

		describe('#2 Deposit', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.depositETH(this.mocks.erc721.address, 1, { from: user3, value: web3.utils.toWei('2') });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                       'MOPW');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('10'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('10'));
				assert.equal(await this.mocks.erc721.ownerOf(1),                                                            user1);
			});
		});

		describe('#3 Withdraw', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.withdrawETH(this.mocks.erc721.address, 1, web3.utils.toWei('2'), { from: user2 });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                       'MOPW');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('8'));
				assert.equal(await this.mocks.erc721.ownerOf(1),                                                            user1);
			});
		});

		describe('#4 AcceptOfferERC721', function () {
			it('perform', async function () {
				await this.mocks.erc721.approve(this.modules.magneticpool.address, 1, { from: user1 });
				const { receipt } = await this.modules.magneticpool.acceptOfferERC721(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS, web3.utils.toWei('8'), { from: user1 });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc721.address, 1, constants.ZERO_ADDRESS), constants.ZERO_ADDRESS);
				assert.equal(await instance.owner(),                                                                        constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWallet');
				assert.equal(await instance.symbol(),                                                                       'MOPW');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('0'));
				assert.equal(await this.mocks.erc721.ownerOf(1),                                                            instance.address);
			});
		});
	});

	describe('Workflow NftBidModule ETH - ERC1155', function () {
		before(async function() {
			await this.mocks.erc1155.mint(user1, 1, 100, '0x');
		});

		describe('#0 Create Pool', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.createPool(
					this.mocks.erc1155.address,
					1,
					constants.ZERO_ADDRESS, // use ETH
					'MyOfferPoolWalletERC1155',
					'MOPW1155',
					constants.ZERO_ADDRESS, // artist
				);
				instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == 'NewPool').args.pool);
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS),instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWalletERC1155');
				assert.equal(await instance.symbol(),                                                                       'MOPW1155');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('0'));
				assert.equal(await this.mocks.erc1155.balanceOf(user1, 1),                                                  100);
			});
		});

		describe('#1 Deposit', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.depositETH(this.mocks.erc1155.address, 1, { from: user2, value: web3.utils.toWei('8') });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS),instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWalletERC1155');
				assert.equal(await instance.symbol(),                                                                       'MOPW1155');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('8'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('8'));
				assert.equal(await this.mocks.erc1155.balanceOf(user1, 1),                                                  100);
			});
		});

		describe('#2 Deposit', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.depositETH(this.mocks.erc1155.address, 1, { from: user3, value: web3.utils.toWei('2') });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS),instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWalletERC1155');
				assert.equal(await instance.symbol(),                                                                       'MOPW1155');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('10'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('10'));
				assert.equal(await this.mocks.erc1155.balanceOf(user1, 1),                                                  100);
			});
		});

		describe('#3 Withdraw', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.magneticpool.withdrawETH(this.mocks.erc1155.address, 1, web3.utils.toWei('2'), { from: user2 });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS),instance.address);
				assert.equal(await instance.owner(),                                                                        this.modules.magneticpool.address);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWalletERC1155');
				assert.equal(await instance.symbol(),                                                                       'MOPW1155');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('8'));
				assert.equal(await this.mocks.erc1155.balanceOf(user1, 1),                                                  100);
			});
		});

		describe('#4 AcceptOfferERC1155', function () {
			it('perform', async function () {
				await this.mocks.erc1155.setApprovalForAll(this.modules.magneticpool.address, true, { from: user1 });
				const { receipt } = await this.modules.magneticpool.acceptOfferERC1155(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS, web3.utils.toWei('8'), '0x', { from: user1 });
			});
			after(async function () {
				assert.equal(await this.modules.magneticpool.getPool(this.mocks.erc1155.address, 1, constants.ZERO_ADDRESS),constants.ZERO_ADDRESS);
				assert.equal(await instance.owner(),                                                                        constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                                                                         'MyOfferPoolWalletERC1155');
				assert.equal(await instance.symbol(),                                                                       'MOPW1155');
				assert.equal(await instance.decimals(),                                                                     '18');
				assert.equal(await instance.totalSupply(),                                                                  web3.utils.toWei('8'));
				assert.equal(await instance.balanceOf(user2),                                                               web3.utils.toWei('6'));
				assert.equal(await instance.balanceOf(user3),                                                               web3.utils.toWei('2'));
				assert.equal(await web3.eth.getBalance(this.modules.magneticpool.address),                                  web3.utils.toWei('0'));
				assert.equal(await this.mocks.erc1155.balanceOf(user1, 1),                                                  99);
			});
		});
	});
});
