const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const BigNumber = require('bignumber.js');
const {
	tenPow,
	getMaxFractionsToBuyWei,
	ethForExactFractionsBuyWei,
	ethForExactFractionsSellWei,
	getMaxFractionsToSellWei,
} = require('../utils/bondingCurveHelpers');

/*
	Fixed price sale: 0.001 ETH, 1000 fractions total supply
	Initial balance after fixed price sale:
		nftOwner: 820 fractions
		curve: 80 fractions
		cBuyer1: 70 fractions
		cBuyer2: 30 fractions
*/

const incrementCalls = 10;
const buyAmount = '10';

contract('Workflow', function (accounts) {
	const [ admin, nftOwner, cBuyer1, cBuyer2, mBuyer1, mBuyer2, artist, newAdmin, claimant1, claimant2 ] = accounts;
	const CURVE_PREMINT_RESERVE = '0x3cc5B802b34A42Db4cBe41ae3aD5c06e1A4481c9';

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const BondingCurve         = artifacts.require('BondingCurve3');
	const Governance           = artifacts.require('Governance');
	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')         },
		Buyout:        { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale:     { artifact: artifacts.require('FixedPriceSaleModule') },
		Factory:       { artifact: artifacts.require('ShardedWalletFactory') },
		Multicall:     { artifact: artifacts.require('MulticallModule')      },
		TokenReceiver: { artifact: artifacts.require('TokenReceiverModule')  },
	};
	const Mocks = {
		ERC721:    { artifact: artifacts.require('ERC721Mock'),  args: [ 'ERC721Mock', '721']                                    },
		// ERC777:    { artifact: artifacts.require('ERC777Mock'),  args: [ admin, web3.utils.toWei('1'), 'ERC777Mock', '777', [] ] }, // needs erc1820registry
		ERC1155:   { artifact: artifacts.require('ERC1155Mock'), args: [ '' ]                                                    },
	};

	let instance;
	let curveInstance;
	let governanceInstance;

	before(async function () {
		// Deploy factory
		this.template     = await ShardedWallet.new();
		this.bondingcurve = await BondingCurve.new();
		// Deploy governance
		this.governance = await Governance.new();
		governanceInstance = this.governance;
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
		await this.governance.setGlobalConfig(await this.modules.action.ACTION_AUTH_RATIO(),    web3.utils.toWei('0.01'));
		await this.governance.setGlobalConfig(await this.modules.buyout.BUYOUT_AUTH_RATIO(),    web3.utils.toWei('0.01'));
		await this.governance.setGlobalConfig(await this.modules.action.ACTION_DURATION(),      50400);
		await this.governance.setGlobalConfig(await this.modules.buyout.BUYOUT_DURATION(),      50400);
		await this.governance.setGlobalConfig(await this.modules.crowdsale.CURVE_TEMPLATE(),    this.bondingcurve.address);
		await this.governance.setGlobalConfig(await this.modules.crowdsale.PCT_SHARDS_NIFTEX(), web3.utils.toWei('0.0')); // 0% eth to niftex
		await this.governance.setGlobalConfig(await this.modules.crowdsale.PCT_ETH_TO_CURVE(),  web3.utils.toWei('0.20')); // 20% eth from crowdsale to bonding curve
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_NIFTEX(),         web3.utils.toWei('0.001')); // 0% to niftex initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_ARTIST(),         web3.utils.toWei('0.001')); // 0.1% to artist initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_SUPPLIERS(),      web3.utils.toWei('0.003')); // 0.3% to providers initially
		await this.governance.setGlobalConfig(await this.bondingcurve.LIQUIDITY_TIMELOCK(),     100800); // timelock for 1 month

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
				this.governance.address, // governance_
				nftOwner,                // owner_
				'Tokenized NFT',         // name_
				'TNFT',                  // symbol_
				constants.ZERO_ADDRESS,  // artistWallet_
				{ from: nftOwner }
			);
			instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == 'NewInstance').args.instance);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                    nftOwner);
			assert.equal(await instance.name(),                                     'Tokenized NFT');
			assert.equal(await instance.symbol(),                                   'TNFT');
			assert.equal(await instance.decimals(),                                 '18');
			assert.equal(await instance.totalSupply(),                              web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(instance.address),                web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                        web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),  web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Prepare tokens', function () {
		it('perform', async function () {
			await this.mocks.erc721.mint(instance.address, 1);
			await this.mocks.erc1155.mint(instance.address, 1, 1, '0x');
		});

		after(async function () {
			assert.equal(await instance.owner(),                                    nftOwner);
			assert.equal(await instance.name(),                                     'Tokenized NFT');
			assert.equal(await instance.symbol(),                                   'TNFT');
			assert.equal(await instance.decimals(),                                 '18');
			assert.equal(await instance.totalSupply(),                              web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(instance.address),                web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                        web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),  web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Setup crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.setup(
				instance.address,
				nftOwner,
				web3.utils.toWei('0.001'),
				50400,
				web3.utils.toWei('1000'),
				[
					[ nftOwner,                                             web3.utils.toWei('820') ],
					[ await this.modules.crowdsale.CURVE_PREMINT_RESERVE(), web3.utils.toWei('80')  ],
				],
				{ from: nftOwner }
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              this.modules.crowdsale.address);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('1000'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
		});
	});

	describe('cBuyer1 Buy 100 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.buy(
				instance.address,
				cBuyer1,
				{
					from: cBuyer1,
					value: web3.utils.toWei('0.1'), // 70*0.001
				}
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('1000'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.1'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('100'));
		});
	});

	describe('cBuyer1 redeem 100 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.redeem(
				instance.address,
				cBuyer1,
				{
					from: cBuyer1,
				}
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('100'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('900'));;
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.remainingShards(instance.address),                      web3.utils.toWei('0'));
		});
	});

	describe('nftOwner redeem 820 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.redeem(
				instance.address,
				nftOwner,
				{
					from: nftOwner,
				}
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('100'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('80'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
		});
	});

	describe('withdraw and trigger bonding curve', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.withdraw(instance.address, { from: nftOwner });
			expectEvent(receipt, 'NewBondingCurve', { wallet: instance.address });
			curveInstance = await BondingCurve.at(receipt.logs.find(({ event }) => event == 'NewBondingCurve').args.curve);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
			console.log('curveInstance:', curveInstance.address);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('100'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
		});
	});

	describe(`buy shards and add shard liquidity in increments of ${buyAmount} shards`, () => {
		it('buy and add liquidity', async() => {
			await instance.approve(curveInstance.address, constants.MAX_UINT256, { from: mBuyer1 });
			for (x of new Array(incrementCalls).fill(1)) {
				const amount = web3.utils.toWei(buyAmount);
				const maxCost = web3.utils.toWei('10');
				const { logs } = await curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: maxCost });
				const { cost } = logs.find(({ event }) => event === 'ShardsBought').args;
				const price = new BigNumber(cost).div(new BigNumber(amount));

				const { receipt } = await curveInstance.supplyShards(amount, { from: mBuyer1 });

				const curve       = await curveInstance.curve();
				const etherInPool = await web3.eth.getBalance(curveInstance.address);
				const shardInPool = await instance.balanceOf(curveInstance.address);
				console.log(`price: ${price.toFixed()} | etherInPool: ${web3.utils.fromWei(etherInPool)} | shardsInPool: ${web3.utils.fromWei(shardInPool)}`);
			}
		});
	});

	describe('remove liquidity and sell shards in increments', () => {
		it('remove and sell shards', async() => {
			const shardLPTokensAmount = await curveInstance.getShardLPTokens(mBuyer1);
			for (x of new Array(incrementCalls).fill(1)) {
				const remaining = await curveInstance.getShardLPTokens(mBuyer1);
				if (remaining > 0) {
					const { receipt, logs } = await curveInstance.withdrawSuppliedShards(
						shardLPTokensAmount.div(new BN(incrementCalls)),
						{ from: mBuyer1 }
					);
					const { shards } = logs.find(({ event }) => event === 'ShardsWithdrawn').args;

					const minPayout   = web3.utils.toWei('0'); // TODO (.05)
					const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
					const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
					const { receipt: sellReceipt } = await instance.methods['approveAndCall(address,uint256,bytes)'](
						curveInstance.address,
						shards,
						data,
						{ from: mBuyer1 }
					);

					const typesArray = [{
						type: 'uint256', name: 'amount'
					}, {
						type: 'uint256', name: 'payout'
					}];
					const { amount, payout } = web3.eth.abi.decodeParameters(typesArray, sellReceipt.rawLogs[3].data);

					const price = new BigNumber(payout).div(new BigNumber(amount));

					const curve       = await curveInstance.curve();
					const etherInPool = await web3.eth.getBalance(curveInstance.address);
					const shardInPool = await instance.balanceOf(curveInstance.address);
					console.log(`price: ${price.toFixed()} | etherInPool: ${web3.utils.fromWei(etherInPool)} | shardsInPool: ${web3.utils.fromWei(shardInPool)}`);
				}
			}
		});
	});
});
