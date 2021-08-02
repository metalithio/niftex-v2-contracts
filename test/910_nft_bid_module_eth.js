const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const BigNumber = require('bignumber.js');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3, artist ] = accounts;

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
	let offerDeadline;
	let setApprovalForAll = null;

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
				artist,                       // artistWallet_
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
		describe('other1 bids 5 ETH', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.nftbid.bidWithETH(
					this.mocks.erc721.address,
					1,
					{
						from: other1,
						value: web3.utils.toWei('5')
					}
				);
			});
			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('5'));
			});
		});

		describe('other1 withdraws bid', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.nftbid.withdrawBidETH(
					this.mocks.erc721.address,
					1,
					{
						from: other1,
					}
				);
			});
			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('0'));
			});
		});

		describe('other1 bids 1 ETH', function () {
			it('perform', async function () {
				const { receipt } = await this.modules.nftbid.bidWithETH(
					this.mocks.erc721.address,
					1,
					{
						from: other1,
						value: web3.utils.toWei('1')
					}
				);
			});
			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('1'));
			});
		});

		describe('other2 bids 10 ETH', function () {
			let diffOther1Bal = '0';
			it('perform', async function () {
				const other1PrevBal = await web3.eth.getBalance(other1);
				const { receipt } = await this.modules.nftbid.bidWithETH(
					this.mocks.erc721.address,
					1,
					{
						from: other2,
						value: web3.utils.toWei('10')
					}
				);

				const other1Bal = await web3.eth.getBalance(other1);

				diffOther1Bal = new BigNumber(other1Bal).minus(other1PrevBal).toFixed();
			});
			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
				assert.equal(diffOther1Bal,                                         web3.utils.toWei('1'));
			});
		});

		describe('compile setApprovalForAll data for ActionModule', function() {
			it('perform', async function() {
				const to = this.mocks.erc721.address;
				const value = web3.utils.toWei('0');
				const data = this.mocks.erc721.contract.methods.setApprovalForAll(this.modules.nftbid.address, true).encodeABI();

				setApprovalForAll = {
					to,
					value,
					data
				}
			})
		});

		describe('Schedule action - acceptOfferERC721 with invalid deadline', function () {
			it('perform', async function () {
				offerDeadline   = Math.round(new Date().valueOf()/1000) - 10000;
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('10'),
					offerDeadline
				).encodeABI();

				// console.log('data', data);
				id = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address[]', 'uint256[]', 'bytes[]' ],
					[[ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ]],
				));
				uid = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address', 'bytes32' ],
					[ instance.address, id ],
				));

				const { receipt } = await this.modules.action.schedule(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 });
				expectEvent(receipt, 'TimerStarted', { timer: uid });
				expectEvent(receipt, 'ActionScheduled', { wallet: instance.address, uid, id, i: '1', to, value, data });
				deadline = receipt.logs.find(({ event }) => event == 'TimerStarted').args.deadline;
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Wait action - acceptOfferERC721 with invalid deadline', function () {
			it('perform', async function () {
				await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ Number(deadline) - (await web3.eth.getBlock('latest')).timestamp ], id: 0 }, () => {});
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Execute action - acceptOfferERC721 with invalid deadline', function () {
			it('perform', async function () {
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('10'),
					offerDeadline
				).encodeABI();

				await expectRevert.unspecified(this.modules.action.execute(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 }))

				// const { receipt } = await this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: user1 });
				// expectEvent(receipt, 'ActionExecuted', { id, i: '0', to, value, data });
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Schedule action - acceptOfferERC721 with min amount higher than highest bid', function () {
			it('perform', async function () {
				offerDeadline = (await web3.eth.getBlock('latest')).timestamp + 100000;
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('12'),
					offerDeadline
				).encodeABI();

				// console.log('data', data);
				id = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address[]', 'uint256[]', 'bytes[]' ],
					[[ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ]],
				));
				uid = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address', 'bytes32' ],
					[ instance.address, id ],
				));

				const { receipt } = await this.modules.action.schedule(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 });
				expectEvent(receipt, 'TimerStarted', { timer: uid });
				expectEvent(receipt, 'ActionScheduled', { wallet: instance.address, uid, id, i: '1', to, value, data });
				deadline = receipt.logs.find(({ event }) => event == 'TimerStarted').args.deadline;
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Wait action - acceptOfferERC721 with min amount higher than highest bid', function () {
			it('perform', async function () {
				await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ Number(deadline) - (await web3.eth.getBlock('latest')).timestamp ], id: 0 }, () => {});
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Execute action - acceptOfferERC721 with min amount higher than highest bid', function () {
			it('perform', async function () {
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('12'),
					offerDeadline
				).encodeABI();

				await expectRevert.unspecified(this.modules.action.execute(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 }))

				// const { receipt } = await this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: user1 });
				// expectEvent(receipt, 'ActionExecuted', { id, i: '0', to, value, data });
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Schedule action - acceptOfferERC721 with right min amount and deadline', function () {
			it('perform', async function () {
				offerDeadline = (await web3.eth.getBlock('latest')).timestamp + 100000;
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('10'),
					offerDeadline
				).encodeABI();

				// console.log('data', data);
				id = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address[]', 'uint256[]', 'bytes[]' ],
					[[ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ]],
				));
				uid = web3.utils.keccak256(web3.eth.abi.encodeParameters(
					[ 'address', 'bytes32' ],
					[ instance.address, id ],
				));

				const { receipt } = await this.modules.action.schedule(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 });
				expectEvent(receipt, 'TimerStarted', { timer: uid });
				expectEvent(receipt, 'ActionScheduled', { wallet: instance.address, uid, id, i: '1', to, value, data });
				deadline = receipt.logs.find(({ event }) => event == 'TimerStarted').args.deadline;
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Wait action - acceptOfferERC721 with right min amount and deadline', function () {
			it('perform', async function () {
				await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ Number(deadline) - (await web3.eth.getBlock('latest')).timestamp ], id: 0 }, () => {});
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		instance.address);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('0'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('10'));
			});
		});

		describe('Execute action - acceptOfferERC721 with right min amount and deadline', function () {
			let diffAdmin = '0';
			let diffArtist = '0';
			it('perform', async function () {
				const adminBalBefore = await web3.eth.getBalance(admin);
				const artistBalBefore = await web3.eth.getBalance(artist);
				const to    = this.modules.nftbid.address;
				const value = web3.utils.toWei('0');
				const data  = this.modules.nftbid.contract.methods.acceptERC721(
					this.mocks.erc721.address,
					1,
					constants.ZERO_ADDRESS,
					web3.utils.toWei('10'),
					offerDeadline
				).encodeABI();

				// await expectRevert.unspecified(this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: user1 }))

				const { receipt } = await this.modules.action.execute(instance.address, [ setApprovalForAll.to, to ], [ setApprovalForAll.value, value ], [ setApprovalForAll.data, data ], { from: user1 });
				expectEvent(receipt, 'ActionExecuted', { id, i: '1', to, value, data });

				const adminBalAfter = await web3.eth.getBalance(admin);
				const artistBalAfter = await web3.eth.getBalance(artist);

				diffAdmin = new BigNumber(adminBalAfter).minus(adminBalBefore).toFixed();
				diffArtist = new BigNumber(artistBalAfter).minus(artistBalBefore).toFixed();
			});

			after(async function () {
				assert.equal(await instance.owner(),                            		constants.ZERO_ADDRESS);
				assert.equal(await instance.name(),                             		'Tokenized NFT');
				assert.equal(await instance.symbol(),                           		'TNFT');
				assert.equal(await instance.decimals(),                         		'18');
				assert.equal(await instance.totalSupply(),                      		'10');
				assert.equal(await instance.balanceOf(instance.address),        		'0');
				assert.equal(await instance.balanceOf(user1),                   		'8');
				assert.equal(await instance.balanceOf(user2),                   		'2');
				assert.equal(await instance.balanceOf(user3),                   		'0');
				assert.equal(await instance.balanceOf(other1),                  		'0');
				assert.equal(await instance.balanceOf(other2),                  		'0');
				assert.equal(await instance.balanceOf(other3),                  		'0');
				assert.equal(await this.mocks.erc721.ownerOf(1),                		other2);
				assert.equal(await web3.eth.getBalance(instance.address),       		web3.utils.toWei('9.65'));
				assert.equal(diffAdmin,       		                                  web3.utils.toWei('0.1'));
				assert.equal(diffArtist,       		                                  web3.utils.toWei('0.25'));
				assert.equal(await web3.eth.getBalance(this.modules.nftbid.address),web3.utils.toWei('0'));
			});
		});
	});
});
