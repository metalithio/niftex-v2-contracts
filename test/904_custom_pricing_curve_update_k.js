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

contract('CustomPricingCurve manual check - curve deployer: CustomPricingCurveDeployer, updateK properly', function (accounts) {
	const [ admin, nftOwner, cBuyer1, cBuyer2, mBuyer1, mBuyer2, artist, newAdmin, claimant1, claimant2 ] = accounts;
	const CURVE_PREMINT_RESERVE = '0x3cc5B802b34A42Db4cBe41ae3aD5c06e1A4481c9';

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const Governance           = artifacts.require('Governance');
	const CustomPricingCurveDeployer = artifacts.require('CustomPricingCurveDeployer');
	const BondingCurve         = artifacts.require('CustomPricingCurve');

	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')         },
		Buyout:        { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale:     { artifact: artifacts.require('FixedPriceSaleModule') },
		BasicDistribution:     { artifact: artifacts.require('BasicDistributionModule') },
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
		this.customPricingCurveDeployer = await CustomPricingCurveDeployer.new(this.template.address);
		// Deploy governance
		this.governance = await Governance.new();
		console.log(this.template.address , 'sw template');
		console.log(this.bondingcurve.address, 'curve template');
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
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_NIFTEX(),         web3.utils.toWei('0.001')); // 0% to niftex initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_ARTIST(),         web3.utils.toWei('0.001')); // 0.1% to artist initially
		await this.governance.setGlobalConfig(await this.bondingcurve.PCT_FEE_SUPPLIERS(),      web3.utils.toWei('0.003')); // 0.3% to providers initially
		await this.governance.setGlobalConfig(await this.customPricingCurveDeployer.CURVE_TEMPLATE_CUSTOM_PRICING(),this.bondingcurve.address);

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

	describe('Setup basic distribution module', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.basicdistribution.setup(
				instance.address,
				[[ nftOwner, web3.utils.toWei('1000') ]],
				{ from: nftOwner }
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
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('1000'));
		});
	});

	describe('Schedule action - factory.createCurve via governance', function () {
		it('perform', async function () {
			const to    = this.customPricingCurveDeployer.address;
			const value = web3.utils.toWei('0');
			const data  = this.customPricingCurveDeployer.contract.methods.createCurve(
				instance.address,
				web3.utils.toWei('80'),
				nftOwner,
				nftOwner,
				'160000000000000000000000000000000000000', // k
				'400000000000000000000', // x
				'0'
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
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('1000'));
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
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('1000'));
		});
	});

	describe('Execute action - factory.createCurve via governance', function () {
		it('perform', async function () {
			const to    = this.customPricingCurveDeployer.address;
			const value = web3.utils.toWei('0');
			const data  = this.customPricingCurveDeployer.contract.methods.createCurve(
				instance.address,
				web3.utils.toWei('80'),
				nftOwner,
				nftOwner,
				'160000000000000000000000000000000000000', // k
				'400000000000000000000', // x
				'0'
			).encodeABI();

			const predicted = predictClone(
				this.bondingcurve.address,      // template
				instance.address,               // salt
				this.customPricingCurveDeployer.address, // deployer
			);

			await instance.approve(predicted, web3.utils.toWei('400'), { from: nftOwner });
			const { receipt } = await this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: nftOwner });
			expectEvent(receipt, 'ActionExecuted', { id, i: '0', to, value, data });

			

			curveInstance = await BondingCurve.at(predicted);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
		});
	});

	describe('newAdmin directly curveInstance.updateK, should fail', function () {
		it('perform', async function () {
			await expectRevert.unspecified(curveInstance.updateK('1000000000000000000000000000000000000000', { from: newAdmin }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
		});
	});

	describe('nftOwner directly curveInstance.updateK, should fail as his asset is still under timelock', function () {
		it('perform', async function () {
			const shardLPTokenBal = await curveInstance.getShardLPTokens(nftOwner);
			const shardLPTokenSupply = await(await ShardedWallet.at(await curveInstance.shardLPToken())).totalSupply();

			console.log({
				shardLPTokenBal: new BigNumber(shardLPTokenBal).toFixed(),
				shardLPTokenSupply: new BigNumber(shardLPTokenSupply).toFixed()
			});

			await expectRevert.unspecified(curveInstance.updateK('1000000000000000000000000000000000000000', { from: nftOwner }));
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
		});
	});

	describe('Schedule action - curveInstance.updateK via governance', function () {
		it('perform', async function () {
			const to    = curveInstance.address;
			const value = web3.utils.toWei('0');

			const data  = curveInstance.contract.methods.updateK(
				'1000000000000000000000000000000000000000'
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
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
		});
	});

	describe('Wait action - curveInstance.updateK via governance', function () {
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
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
		});
	});

	describe('Execute action - curveInstance.updateK via governance', function () {
		it('perform', async function () {
			const to    = curveInstance.address;
			const value = web3.utils.toWei('0');

			const data  = curveInstance.contract.methods.updateK(
				'1000000000000000000000000000000000000000'
			).encodeABI();

			const { receipt } = await this.modules.action.execute(instance.address, [ to ], [ value ], [ data ], { from: nftOwner });
			expectEvent(receipt, 'ActionExecuted', { id, i: '0', to, value, data });

			const predicted = predictClone(
				this.bondingcurve.address,      // template
				instance.address,               // salt
				this.customPricingCurveDeployer.address, // deployer
			);

			curveInstance = await BondingCurve.at(predicted);

			console.log({
				k: new BigNumber((await curveInstance.curve()).k).toFixed(),
				x: new BigNumber((await curveInstance.curve()).x).toFixed()
			});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
			assert.equal((await curveInstance.curve()).k,                                                     '1000000000000000000000000000000000000000');
			assert.equal((await curveInstance.curve()).x,                                                  		web3.utils.toWei('1000'));
		});
	});

	describe('Wait till after timelock', function () {
		it('perform', async function () {
			await web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_increaseTime', params: [ 100800 ], id: 0 }, () => {});
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
			assert.equal((await curveInstance.curve()).k,                                                     '1000000000000000000000000000000000000000');
			assert.equal((await curveInstance.curve()).x,                                                  		web3.utils.toWei('1000'));
		});
	});

	describe('nftOwner withdraw timelock liquidity', function(){
		it('perform', async function () {
			await curveInstance.transferTimelockLiquidity();
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
			assert.equal((await curveInstance.curve()).k,                                                     '1000000000000000000000000000000000000000');
			assert.equal((await curveInstance.curve()).x,                                                  		web3.utils.toWei('1000'));
		});
	})

	describe('nftOwner directly curveInstance.updateKAndX, should pass as he effectively owns 100% fraction supply', function () {
		it('perform', async function () {
			await curveInstance.updateKAndX('160000000000000000000000000000000000000', web3.utils.toWei('400'),{ from: nftOwner });
		});

		after(async function () {
			assert.equal(await instance.owner(),                                                              constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                                               'Tokenized NFT');
			assert.equal(await instance.symbol(),                                                             'TNFT');
			assert.equal(await instance.decimals(),                                                           '18');
			assert.equal(await instance.totalSupply(),                                                        web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),                                          web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(nftOwner),                                                  web3.utils.toWei('920'));
			assert.equal((await curveInstance.curve()).k,                                                     '160000000000000000000000000000000000000');
			assert.equal((await curveInstance.curve()).x,                                                  		web3.utils.toWei('400'));
		});
	});
});
