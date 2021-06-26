const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const BigNumber = require('bignumber.js');

function predictClone(template, salt, deployer) {
	return web3.utils.toChecksumAddress(
		web3.utils.keccak256(Buffer.concat([
			Buffer.from('ff', 'hex'),
			Buffer.from(web3.utils.padLeft(deployer, 40).substr(2), 'hex'),
			Buffer.from(web3.utils.padLeft(salt, 64).substr(2), 'hex'),
			Buffer.from(
				web3.utils.keccak256(Buffer.concat([
					Buffer.from('3d602d80600a3d3981f3363d3d373d3d3d363d73', 'hex'),
					Buffer.from(web3.utils.padLeft(template, 40).substr(2), 'hex'),
					Buffer.from('5af43d82803e903d91602b57fd5bf3', 'hex'),
				])).substr(2),
				'hex'
			),
		]))
		.substr(-40)
	);
}

contract('CurveForV2Assets manual check - curve deployer: CustomPricingCurveDeployer', function (accounts) {
	const [ admin, nftOwner, cBuyer1, cBuyer2, mBuyer1, mBuyer2, artist, newAdmin, claimant1, claimant2 ] = accounts;
	const CURVE_PREMINT_RESERVE = '0x3cc5B802b34A42Db4cBe41ae3aD5c06e1A4481c9';

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const Governance           = artifacts.require('Governance');
	const CurveFactory         = artifacts.require('CurveFactoryForV2Assets');
	const CustomPricingCurveDeployer = artifacts.require('CustomPricingCurveDeployer');
	const BondingCurve         = artifacts.require('CurveForV2Assets');

	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')         },
		Buyout:        { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale:     { artifact: artifacts.require('FixedPriceSaleModuleNew') },
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

	before(async function () {
		// Deploy factory
		this.template     = await ShardedWallet.new();
		this.bondingcurve = await BondingCurve.new();
		this.curvefactory = await CurveFactory.new(this.template.address);
		this.customPricingCurveDeployer = await CustomPricingCurveDeployer.new(this.template.address);
		// Deploy governance
		this.governance = await Governance.new();
		console.log(this.template.address , 'sw template');
		console.log(this.bondingcurve.address, 'curve template');
		console.log(this.curvefactory.address, 'curve factory address');
		console.log(this.governance.address, 'governance.address');
		console.log(this.customPricingCurveDeployer.address, 'custom pricing curve deployer address');
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
		await this.governance.setGlobalConfig(await this.modules.crowdsale.PCT_ETH_TO_CURVE(),  web3.utils.toWei('0.20')); // 20% eth from crowdsale to bonding curve
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_NIFTEX(),         web3.utils.toWei('0.001')); // 0% to niftex initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_ARTIST(),         web3.utils.toWei('0.001')); // 0.1% to artist initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_SUPPLIERS(),      web3.utils.toWei('0.003')); // 0.3% to providers initially
		await this.governance.setGlobalConfig(await this.bondingcurve.LIQUIDITY_TIMELOCK(),     100800); // timelock for 1 month
		await this.governance.setGlobalConfig(await this.modules.crowdsale.CURVE_FACTORY_V2_ASSETS(), this.curvefactory.address);
		await this.governance.setGlobalConfig(await this.curvefactory.CURVE_TEMPLATE_V2_ASSETS(),this.bondingcurve.address);
		await this.governance.setGlobalConfig(await this.curvefactory.CURVE_STRETCH(), 12);
		// grant role for CustomPricingCurveDeployer,  as CURVE_DEPLOYER
		await this.governance.grantRole(await this.curvefactory.CURVE_DEPLOYER(), this.customPricingCurveDeployer.address);
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

	describe('nftOwner directly curvefactory.createCurve, should fail', function () {
		it('perform', async function () {
			const predicted = predictClone(
				this.bondingcurve.address,      // template
				instance.address,               // salt
				this.curvefactory.address, // deployer
			);

			console.log('predicted', predicted);

			await instance.approve(predicted, web3.utils.toWei('400'), { from: nftOwner });
			await expectRevert.unspecified(this.curvefactory.createCurve(
				instance.address,
				web3.utils.toWei('400'),
				nftOwner,
				nftOwner,
				web3.utils.toWei('1'), // k
				web3.utils.toWei('1') // x
				))
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

	describe('Schedule action - factory.createCurve via governance', function () {
		it('perform', async function () {
			const to    = this.customPricingCurveDeployer.address;
			const value = web3.utils.toWei('0');
			console.log(
				instance.address,
				web3.utils.toWei('400'),
				nftOwner,
				nftOwner,
				'160000000000000000000000000000000000000', // k
				'400000000000000000000' // x
			);
			const data  = this.customPricingCurveDeployer.contract.methods.createCurve(
				web3.utils.toWei('400'),
				nftOwner,
				nftOwner,
				'160000000000000000000000000000000000000', // k
				'400000000000000000000' // x
			).encodeABI();

			console.log('data', data);
			id = web3.utils.keccak256(web3.eth.abi.encodeParameters(
				[ 'address[]', 'uint256[]', 'bytes[]' ],
				[[ to ], [ value ], [ data ]],
			));
			uid = web3.utils.keccak256(web3.eth.abi.encodeParameters(
				[ 'address', 'bytes32' ],
				[ instance.address, id ],
			));

			const { receipt } = await this.modules.action.schedule(instance.address, [ to ], [ value ], [ data ], { from: nftOwner });
			expectEvent(receipt, 'TimerStarted', { timer: uid });
			expectEvent(receipt, 'ActionScheduled', { wallet: instance.address, uid, id, i: '0', to, value, data });
			deadline = receipt.logs.find(({ event }) => event == 'TimerStarted').args.deadline;
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

	describe('Wait action - factory.createCurve via governance', function () {
		it('perform', async function () {
			await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ Number(deadline) - (await web3.eth.getBlock('latest')).timestamp ], id: 0 }, () => {});
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

	describe('Execute action - factory.createCurve via governance', function () {
		it('perform', async function () {
			const to    = this.customPricingCurveDeployer.address;
			const value = web3.utils.toWei('0');
			const data  = this.customPricingCurveDeployer.contract.methods.createCurve(
				web3.utils.toWei('400'),
				nftOwner,
				nftOwner,
				'160000000000000000000000000000000000000', // k
				'400000000000000000000' // x
			).encodeABI();

			const { receipt } = await this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: nftOwner });
			expectEvent(receipt, 'ActionExecuted', { id, i: '0', to, value, data });
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('420'));
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

	// describe('mBuyer1 buy 5 shards', () => {
	// 	it('perform', async() => {
	// 		const amount      = web3.utils.toWei('5');
	// 		const maxCost     = web3.utils.toWei('10');
	// 		const { receipt } = await curveInstance.buyShards(amount, maxCost, { from: mBuyer1, value: maxCost });
	// 		console.log('buyShards gasUsed: ', receipt.gasUsed);

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('75'));
	// 	});
	// });

	// describe('cBuyer1 buy 5 shards', () => {
	// 	it('perform', async() => {
	// 		const amount      = web3.utils.toWei('5');
	// 		const maxCost     = web3.utils.toWei('10');
	// 		const { receipt } = await curveInstance.buyShards(amount, maxCost, { from: cBuyer1, value: maxCost });
	// 		console.log('buyShards gasUsed: ', receipt.gasUsed);

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('70'));
	// 	});
	// });

	// describe('cBuyer2 supply 30 shards', () => {
	// 	it('perform', async() => {
	// 		const amount      = web3.utils.toWei('30');
	// 		await instance.approve(curveInstance.address, constants.MAX_UINT256, { from: cBuyer2 });
	// 		const { receipt } = await curveInstance.supplyShards(amount, { from: cBuyer2 });
	// 		console.log('supplyShards gasUsed: ', receipt.gasUsed);

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('100'));
	// 	});
	// });

	// describe('cBuyer1 supply 0.001 ETH', () => {
	// 	it('perform', async() => {
	// 		const value       = web3.utils.toWei('.001');
	// 		const { receipt } = await curveInstance.supplyEther({ from: cBuyer1, value });
	// 		console.log('supplyEther gasUsed: ', receipt.gasUsed);

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('100'));
	// 	});
	// });

	// describe('mBuyer1 sells 5 shards', () => {
	// 	it('perform', async() => {
	// 		const amount      = web3.utils.toWei('5');
	// 		const minPayout   = web3.utils.toWei('0'); // TODO (.05)
	// 		await instance.approve(curveInstance.address, constants.MAX_UINT256, { from: mBuyer1 });
	// 		const { receipt } = await curveInstance.sellShards(amount, minPayout, { from: mBuyer1 });
	// 		console.log('sellShards gasUsed: ', receipt.gasUsed);

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('105'));
	// 	});

	// 	it('Move till end of timelock', async function () {
	// 		await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
	// 	});
	// });

	// describe('nftOwner transfer timelock', () => {
	// 	it('perform', async() => {
	// 		const buyShardsTxn = await curveInstance.transferTimelockLiquidity();

	// 		const curve       = await curveInstance.curve();
	// 		const etherInPool = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool = await instance.balanceOf(curveInstance.address);
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 		});
	// 	});

	// 	after(async function () {
	// 		assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
	// 		assert.equal(await instance.name(),                                  'Tokenized NFT');
	// 		assert.equal(await instance.symbol(),                                'TNFT');
	// 		assert.equal(await instance.decimals(),                              '18');
	// 		assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
	// 		assert.equal(await instance.balanceOf(instance.address),             web3.utils.toWei('0'));
	// 		assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('820'));
	// 		assert.equal(await instance.balanceOf(curveInstance.address),        web3.utils.toWei('105'));
	// 	});
	// });

	// const LPAccounts = [ nftOwner, cBuyer1, cBuyer2 ];

	// describe('3 LPs withdraw liquidity', () => {
	// 	for (let i = 0; i < 3; i++) {
	// 		it(`${LPAccounts[i]} withdraw ETH liquidity`, async() => {
	// 			const ethLPTokensAmount = await curveInstance.getEthLPTokens(LPAccounts[i]);
	// 			console.log(`${LPAccounts[i]}'s ethLPTokensAmount: ${ethLPTokensAmount.toString()}`);

	// 			if (ethLPTokensAmount > 0) {
	// 				const { receipt, logs } = await curveInstance.withdrawSuppliedEther(ethLPTokensAmount, { from: LPAccounts[i]});
	// 				console.log('withdrawEth.gasUsed:', receipt.gasUsed);

	// 				const { value, payout } = logs.find(({ event }) => event === 'EtherWithdrawn').args;
	// 				console.log(`${LPAccounts[i]} withdraw ${web3.utils.fromWei(value)} ETH and ${web3.utils.fromWei(payout)} Shards`);
	// 			} else {
	// 				await expectRevert.unspecified(curveInstance.withdrawSuppliedEther(ethLPTokensAmount, { from: LPAccounts[i]}));
	// 			}
	// 		});
	// 	}

	// 	for (let i = 0; i < 3; i++) {
	// 		it(`${LPAccounts[i]} withdraw Shard liquidity`, async() => {
	// 			const shardLPTokensAmount = await curveInstance.getShardLPTokens(LPAccounts[i]);
	// 			console.log(`${LPAccounts[i]}'s shardLPTokensAmount: ${shardLPTokensAmount.toString()}`);

	// 			if (shardLPTokensAmount > 0) {
	// 				const { receipt, logs } = await curveInstance.withdrawSuppliedShards(shardLPTokensAmount, { from: LPAccounts[i]});
	// 				console.log('withdrawShard.gasUsed:', receipt.gasUsed);

	// 				const { payout, shards } = logs.find(({ event }) => event === 'ShardsWithdrawn').args;
	// 				console.log(`${LPAccounts[i]} withdraw ${web3.utils.fromWei(payout)} ETH and ${web3.utils.fromWei(shards)} Shards`);
	// 			} else {
	// 				await expectRevert.unspecified(curveInstance.withdrawSuppliedShards(shardLPTokensAmount, { from: LPAccounts[i]}));
	// 			}
	// 		});
	// 	}

	// 	it('check if ethInPool and shardsInPool are both the remaining for artist and NIFTEX', async() => {
	// 		const curve          = await curveInstance.curve();
	// 		const etherInPool    = await web3.eth.getBalance(curveInstance.address);
	// 		const shardInPool    = await instance.balanceOf(curveInstance.address);
	// 		const ethSuppliers   = await curveInstance.getEthSuppliers();
	// 		const shardSuppliers = await curveInstance.getShardSuppliers();
	// 		console.log({
	// 			x:           curve[0].toString(),
	// 			k:           curve[1].toString(),
	// 			etherInPool: web3.utils.fromWei(etherInPool),
	// 			shardInPool: web3.utils.fromWei(shardInPool),
	// 			ethSuppliers: {
	// 				underlyingSupply: web3.utils.fromWei(ethSuppliers[0]),
	// 				totalSupply:      web3.utils.fromWei(ethSuppliers[1]),
	// 				feeToNiftex:      web3.utils.fromWei(ethSuppliers[2]),
	// 				feeToArtist:      web3.utils.fromWei(ethSuppliers[3]),
	// 			},
	// 			shardSuppliers: {
	// 				underlyingSupply: web3.utils.fromWei(shardSuppliers[0]),
	// 				totalSupply:      web3.utils.fromWei(shardSuppliers[1]),
	// 				feeToNiftex:      web3.utils.fromWei(shardSuppliers[2]),
	// 				feeToArtist:      web3.utils.fromWei(shardSuppliers[3]),
	// 			},
	// 		});
	// 	});
	// });
});
