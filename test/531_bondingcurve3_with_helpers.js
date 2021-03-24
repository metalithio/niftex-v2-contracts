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

	describe('cBuyer1 Buy 70 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.buy(
				instance.address,
				cBuyer1,
				{
					from: cBuyer1,
					value: web3.utils.toWei('0.070'), // 70*0.001
				}
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
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.070'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('70'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('0'));
		});
	});

	describe('cBuyer2 Buy 30 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.buy(
				instance.address,
				cBuyer2,
				{
					from: cBuyer2,
					value: web3.utils.toWei('0.030'), // 30*0.001
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
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('70'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('30'));
		});

		// Not necessary, all shards have been sold.
		it('Move till end of crowdsale', async function () {
			await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 50400 ], id: 0 }, () => {});
		});
	});

	describe('cBuyer1 redeem 70 shards in crowdsale', function () {
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
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('70'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('930'));;
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('30'));
		});
	});

	describe('cBuyer2 redeem 30 shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.redeem(
				instance.address,
				cBuyer2,
				{
					from: cBuyer2,
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
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('70'));
			assert.equal(await instance.balanceOf(cBuyer2),                                                   web3.utils.toWei('30'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('900'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('820'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('0'));
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
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('70'));
			assert.equal(await instance.balanceOf(cBuyer2),                                                   web3.utils.toWei('30'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('80'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0.100'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('80'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('0'));
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
			assert.equal(await instance.balanceOf(cBuyer1),                                                   web3.utils.toWei('70'));
			assert.equal(await instance.balanceOf(cBuyer2),                                                   web3.utils.toWei('30'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),                            web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.modules.crowdsale.address),                           web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, nftOwner),              web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.premintShards(instance.address, CURVE_PREMINT_RESERVE), web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer1),                web3.utils.toWei('0'));
			assert.equal(await this.modules.crowdsale.boughtShards(instance.address, cBuyer2),                web3.utils.toWei('0'));
		});
	});

	describe('mBuyer1 buy more than maxFractionsToBuyWei fractions', () => {
		it('perform', async() => {
			const bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			const maxFractionsToBuyWei = getMaxFractionsToBuyWei(bondingCurveVariables);
			// the utils round down, safe to plus 2 to test (instead of plus 1)
			const amount = new BigNumber(maxFractionsToBuyWei).plus(2).toFixed();

			const maxCost     = web3.utils.toWei('10');
			await expectRevert.unspecified(curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: maxCost }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('80'));
		});
	});

	describe('mBuyer1 buy exactly 5 fractions, with 1 wei less than enough at value', () => {
		let bondingCurveVariablesAfter;
		let amount;
		it('perform', async() => {
			const bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			amount = web3.utils.toWei('5');
			const requiredEth = ethForExactFractionsBuyWei(Object.assign(bondingCurveVariables,{fractionsToBuy: amount}));
			const maxCost = requiredEth;
			await expectRevert.unspecified(curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: new BigNumber(requiredEth).minus(1).toFixed() }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('80'));
			assert.equal(await instance.balanceOf(mBuyer1),        							 '0');
		});
	});

	describe('mBuyer1 buy exactly 5 fractions, with 1 wei less than enough at maxCost', () => {
		let bondingCurveVariablesAfter;
		let amount;
		it('perform', async() => {
			const bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			amount = web3.utils.toWei('5');
			const requiredEth = ethForExactFractionsBuyWei(Object.assign(bondingCurveVariables,{fractionsToBuy: amount}));
			const maxCost = new BigNumber(requiredEth).minus(1).toFixed();
			await expectRevert.unspecified(curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: requiredEth }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('80'));
			assert.equal(await instance.balanceOf(mBuyer1),        							 '0');
		});
	});

	describe('mBuyer1 buy exactly 5 fractions with just enough eth', () => {
		let bondingCurveVariablesAfter;
		let bondingCurveVariables;
		let amount;
		let requiredEth;
		it('perform', async() => {
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			amount = web3.utils.toWei('5');
			requiredEth = ethForExactFractionsBuyWei(Object.assign(bondingCurveVariables,{fractionsToBuy: amount}));
			const maxCost = requiredEth;

			await curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: requiredEth });

			bondingCurveVariablesAfter = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('75'));
			assert.equal(await instance.balanceOf(mBuyer1),        							 amount);
			assert.equal(bondingCurveVariablesAfter.ethInCurve,       new BigNumber(bondingCurveVariables.ethInCurve).plus(requiredEth).toFixed());
		});
	});

	describe('mBuyer1 buy exactly 5 fractions with 1 eth surplus', () => {
		let bondingCurveVariablesAfter;
		let bondingCurveVariables;
		let amount;
		let requiredEth;
		let fracBalanceOfBuyerBefore;
		it('perform', async() => {
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			amount = web3.utils.toWei('5');
			fracBalanceOfBuyerBefore = (await instance.balanceOf(mBuyer1)).toString(10);
			requiredEth = ethForExactFractionsBuyWei(Object.assign(bondingCurveVariables,{fractionsToBuy: amount}));
			const maxCost = requiredEth;

			await curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: new BigNumber(requiredEth).plus(tenPow(18)).toFixed() });

			bondingCurveVariablesAfter = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        new BigNumber(bondingCurveVariables.fractionsInCurve).minus(amount).toFixed());
			assert.equal(await instance.balanceOf(mBuyer1),        							 new BigNumber(fracBalanceOfBuyerBefore).plus(amount).toFixed());
			assert.equal(bondingCurveVariablesAfter.ethInCurve,                  new BigNumber(bondingCurveVariables.ethInCurve).plus(requiredEth).toFixed());
		});
	});

	describe('mBuyer1 buy exactly 5 fractions with 0 eth', () => {
		let bondingCurveVariablesAfter;
		let bondingCurveVariables;
		let requiredEth;
		it('perform', async() => {
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			amount = web3.utils.toWei('5');
			requiredEth = ethForExactFractionsBuyWei(Object.assign(bondingCurveVariables,{fractionsToBuy: amount}));
			const maxCost = requiredEth;

			await expectRevert.unspecified(curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: '0' }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('70'));
			// assert.equal(await instance.balanceOf(mBuyer1),        							 amount);
			// assert.equal(bondingCurveVariablesAfter.ethInCurve,       new BigNumber(bondingCurveVariables.ethInCurve).plus(requiredEth).toFixed());
		});
	});

	describe('mBuyer1 buy exactly maxFractionsToBuyWei fractions', () => {
		let bondingCurveVariables;
		let bondingCurveVariablesAfter;
		let amount;
		let fracBalanceOfBuyerBefore;
		it('perform', async() => {
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			const maxFractionsToBuyWei = getMaxFractionsToBuyWei(bondingCurveVariables);
			fracBalanceOfBuyerBefore = (await instance.balanceOf(mBuyer1)).toString(10);

			amount = new BigNumber(maxFractionsToBuyWei).plus(0).toFixed();
			const maxCost = web3.utils.toWei('10');
			await curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: maxCost });

			bondingCurveVariablesAfter = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(bondingCurveVariablesAfter.fractionsInCurve,            new BigNumber(bondingCurveVariables.fractionsInCurve).minus(amount).toFixed());
			assert.equal(await instance.balanceOf(mBuyer1),                      new BigNumber(fracBalanceOfBuyerBefore).plus(amount).toFixed());
		});
	});

	describe('mBuyer1 sells more than mBuyer1 balance', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;

		it('perform', async() => {
			fracBalanceOfSellerBefore = await instance.balanceOf(mBuyer1);
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
			fractionsToSell   = new BigNumber(fracBalanceOfSellerBefore).plus(1).toFixed();

			const minPayout   = web3.utils.toWei('0'); // TODO (.05)
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const sellPromise = instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				fractionsToSell,
				data,
				{ from: mBuyer1 }
			);

			await expectRevert.unspecified(sellPromise);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        bondingCurveVariables.fractionsInCurve);
		});
	});

	describe('mBuyer2 has 0 fractions, try to sell 1 fraction', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;

		it('perform', async() => {
			fracBalanceOfSellerBefore = await instance.balanceOf(mBuyer2);
			bondingCurveVariables = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
			fractionsToSell   = web3.utils.toWei('1');

			const minPayout   = web3.utils.toWei('0'); // TODO (.05)
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const sellPromise = instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				fractionsToSell,
				data,
				{ from: mBuyer2 }
			);

			await expectRevert.unspecified(sellPromise);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        bondingCurveVariables.fractionsInCurve);
		});
	});

	describe('mBuyer1 sells all his fractions, minPayout just 1 wei more than expectedEthToGet', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;
		let expectedEthToGet;

		it('perform', async() => {
			fracBalanceOfSellerBefore = await instance.balanceOf(mBuyer1);
			fractionsToSell   = new BigNumber(fracBalanceOfSellerBefore).toFixed();

			bcCoreVariablesBefore = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
			expectedEthToGet = ethForExactFractionsSellWei(Object.assign(bcCoreVariablesBefore, { fractionsToSell }));
			const minPayout   = new BigNumber(expectedEthToGet).plus(1).toFixed();
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const sellPromise = instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				fractionsToSell,
				data,
				{ from: mBuyer1 }
			);

			await expectRevert.unspecified(sellPromise);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(await instance.balanceOf(curveInstance.address),        bcCoreVariablesBefore.fractionsInCurve);
		});

		// it('Move till end of timelock', async function () {
		// 	await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
		// });
	});

	describe('mBuyer1 sells all his fractions', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;
		let expectedEthToGet;

		it('perform', async() => {
			fracBalanceOfSellerBefore = await instance.balanceOf(mBuyer1);
			fractionsToSell   = new BigNumber(fracBalanceOfSellerBefore).toFixed();

			bcCoreVariablesBefore = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
			expectedEthToGet = ethForExactFractionsSellWei(Object.assign(bcCoreVariablesBefore, { fractionsToSell }));
			const minPayout   = expectedEthToGet;
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const { receipt } = await instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				fractionsToSell,
				data,
				{ from: mBuyer1 }
			);
			console.log('sellShards(approveAndCall) gasUsed: ', receipt.gasUsed);

			bcCoreVariablesAfter = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
			assert.equal(bcCoreVariablesAfter.fractionsInCurve,                  new BigNumber(bcCoreVariablesBefore.fractionsInCurve).plus(fractionsToSell).toFixed());
			assert.equal(await instance.balanceOf(mBuyer1),                      new BigNumber(fracBalanceOfSellerBefore).minus(fractionsToSell).toFixed());
		});

		// it('Move till end of timelock', async function () {
		// 	await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
		// });
	});

	describe('nftOwner sells maxFractionsToSellWei+1', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;
		let expectedEthToGet;

		it('perform', async() => {
			bcCoreVariablesBefore = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			fracBalanceOfSellerBefore = await instance.balanceOf(nftOwner);
			fractionsToSell   = getMaxFractionsToSellWei(bcCoreVariablesBefore);

			expectedEthToGet = ethForExactFractionsSellWei(Object.assign(bcCoreVariablesBefore, { fractionsToSell }));
			const minPayout   = new BigNumber(expectedEthToGet).plus(1).toFixed();
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const sellPromise = instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				new BigNumber(fractionsToSell).plus(1).toFixed(),
				data,
				{ from: nftOwner }
			);

			await expectRevert.unspecified(sellPromise);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                     fracBalanceOfSellerBefore.toString(10));
		});

		// it('Move till end of timelock', async function () {
		// 	await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
		// });
	});

	describe('nftOwner sells exactly maxFractionsToSellWei', () => {
		let fracBalanceOfSellerBefore;
		let bcCoreVariablesBefore;
		let bcCoreVariablesAfter;
		let fractionsToSell;
		let expectedEthToGet;

		it('perform', async() => {
			bcCoreVariablesBefore = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});

			fracBalanceOfSellerBefore = await instance.balanceOf(nftOwner);
			fractionsToSell   = getMaxFractionsToSellWei(bcCoreVariablesBefore);

			expectedEthToGet = ethForExactFractionsSellWei(Object.assign(bcCoreVariablesBefore, { fractionsToSell }));
			const minPayout   = expectedEthToGet;
			const selector    = web3.eth.abi.encodeFunctionSignature('sellShards(uint256,uint256)');
			const data        = web3.eth.abi.encodeParameters([ 'bytes4', 'uint256' ], [ selector, minPayout ]);
			const { receipt } = await instance.methods['approveAndCall(address,uint256,bytes)'](
				curveInstance.address,
				fractionsToSell,
				data,
				{ from: nftOwner }
			);
			console.log('sellShards(approveAndCall) gasUsed: ', receipt.gasUsed);

			bcCoreVariablesAfter = await getBondingCurveCoreVariables({
				bondingCurveInstance: curveInstance,
				shardedWalletInstance: instance,
				governanceInstance,
				web3,
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
			assert.equal(bcCoreVariablesAfter.fractionsInCurve,                  new BigNumber(bcCoreVariablesBefore.fractionsInCurve).plus(fractionsToSell).toFixed());
			assert.equal(await instance.balanceOf(nftOwner),                      new BigNumber(fracBalanceOfSellerBefore).minus(fractionsToSell).toFixed());
		});

		// it('Move till end of timelock', async function () {
		// 	await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
		// });
	});
});

const getBondingCurveCoreVariables =  async ({
	bondingCurveInstance,
	shardedWalletInstance,
	governanceInstance,
	web3,
}) => {

	const curveCoordinates = await bondingCurveInstance.curve();
	const x = curveCoordinates[0].toString(10);
	const k = curveCoordinates[1].toString(10);

	const fractionsInCurve = await shardedWalletInstance.balanceOf(bondingCurveInstance.address);
	const ethInCurve = await web3.eth.getBalance(bondingCurveInstance.address);

	const artistWallet = await shardedWalletInstance.artistWallet();

	const feeToNiftex = await governanceInstance.getConfig(bondingCurveInstance.address, await bondingCurveInstance.PCT_FEE_NIFTEX());
	const feeToArtist = await governanceInstance.getConfig(bondingCurveInstance.address, await bondingCurveInstance.PCT_FEE_ARTIST());
	const feeToProviders = await governanceInstance.getConfig(bondingCurveInstance.address, await bondingCurveInstance.PCT_FEE_SUPPLIERS());

	const decimals = 18;
	const bondingCurveAddress = bondingCurveInstance.address;
	const ethSuppliers = await bondingCurveInstance.getEthSuppliers();
	const shardSuppliers = await bondingCurveInstance.getShardSuppliers();

	const ethSupplied = ethSuppliers[0].toString(10);
	const ethLPTokens = ethSuppliers[1].toString(10);
	const fractionsSupplied = shardSuppliers[0].toString(10);
	const fractionLPTokens = shardSuppliers[1].toString(10);
	const ethForNiftex = ethSuppliers[2].toString(10);
	const ethForArtist = ethSuppliers[3].toString(10);
	const fractionsForNiftex = shardSuppliers[2].toString(10);
	const fractionsForArtist = shardSuppliers[3].toString(10);
	const timelockEthLPTokens = await bondingCurveInstance.getEthLPTokens(bondingCurveInstance.address);
	const timelockFractionLPTokens = await bondingCurveInstance.getShardLPTokens(bondingCurveInstance.address);
	const recipientAddress = await bondingCurveInstance.recipient();
	const timelockDeadline = await bondingCurveInstance.deadline();

	const dataToReturn = Object.assign({
		x,
		k,
		fractionsInCurve: fractionsInCurve.toString(10), // wei
		ethInCurve: ethInCurve.toString(10), // wei
		feeToProviders: feeToProviders.toString(10),
		feeToNiftex: feeToNiftex.toString(10),
		feeToArtist: artistWallet === constants.ZERO_ADDRESS ? '0': feeToArtist.toString(10),
		decimals,
		bondingCurveAddress,
		ethSupplied, // wei
		ethLPTokens, // wei, always 1e18
		fractionsSupplied, // wei
		fractionLPTokens, // wei, always 1e18
		ethForNiftex, // wei, always 1e18
		ethForArtist, // wei, always 1e18
		fractionsForNiftex, // wei, depends on erc20 decimals
		fractionsForArtist, // wei, depends on erc20 decimals
		timelockEthLPTokens: timelockEthLPTokens.toString(10), // wei, always 1e18
		timelockFractionLPTokens: timelockFractionLPTokens.toString(10), // wei, always 1e18
		recipientAddress,
		timelockDeadline: timelockDeadline.toString(10)// time in seconds
	});

	return dataToReturn;
}
