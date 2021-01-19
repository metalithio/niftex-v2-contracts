const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const BigNumber = require('bignumber.js');

const BondingCurve = artifacts.require('BondingCurve');
contract('Workflow', function (accounts) {
	const [ admin, nftOwner, cBuyer1, cBuyer2, mBuyer1, mBuyer2, artist, newAdmin, claimant1, claimant2 ] = accounts;

	const ShardedWallet        = artifacts.require('ShardedWallet');
	const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
	const Governance           = artifacts.require('BasicGovernance');
	const Modules = {
		Action:        { artifact: artifacts.require('ActionModule')         },
		Buyout:        { artifact: artifacts.require('BuyoutModule')         },
		Crowdsale:     { artifact: artifacts.require('CrowdsaleFixedPriceModule') },
		Multicall:     { artifact: artifacts.require('MulticallModule')      },
		TokenReceiver: { artifact: artifacts.require('TokenReceiverModuke')  },
		BondingCurve: { artifact: artifacts.require('BondingCurve') }
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
		this.factory = await ShardedWalletFactory.new();
		// Deploy & whitelist modules
		this.governance = await Governance.new();
		this.modules = await Object.entries(Modules).reduce(async (acc, [ key, { artifact, args } ]) => ({ ...await acc, [key.toLowerCase()]: await artifact.new(...(args || [])) }), Promise.resolve({}));
		for ({ address } of Object.values(this.modules))
		{
			await this.governance.grantRole(await this.governance.MODULE_ROLE(), address);
		}
		// set config
		await this.governance.setConfig(await this.governance.AUTHORIZATION_RATIO(), web3.utils.toWei('0.01'));
		await this.governance.setConfig(await this.modules.action.ACTION_DURATION_KEY(), 50400);
		await this.governance.setConfig(await this.modules.buyout.BUYOUT_DURATION_KEY(), 50400);

		await this.governance.setConfigAddress(await this.modules.crowdsale.CURVE_TEMPLATE_KEY(), this.modules.bondingcurve.address);
		await this.governance.setConfig(await this.modules.crowdsale.PCT_ETH_TO_CURVE(), 2000); // 20% eth to bonding curve

		await this.governance.setConfig(await this.modules.bondingcurve.PCT_FEE_TO_NIFTEX(), 0); // 0% to niftex initially
		await this.governance.setConfig(await this.modules.bondingcurve.PCT_FEE_TO_ARTIST(), 10); // 0.1% to artist initially
		await this.governance.setConfig(await this.modules.bondingcurve.PCT_FEE_TO_SUPPLIERS(), 30); // 0.3% to providers initially
		await this.governance.setConfig(await this.modules.bondingcurve.PCT_MIN_SHARD_0(), 2500);
		await this.governance.setConfig(await this.modules.bondingcurve.LIQUIDITY_TIMELOCK(), 100800); // timelock for 1 month

		for (funcSig of Object.keys(this.modules.tokenreceiver.methods).map(web3.eth.abi.encodeFunctionSignature))
		{
			await this.governance.setModule(funcSig, this.modules.tokenreceiver.address);
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
				nftOwner,                        // owner_
				'Tokenized NFT',              // name_
				'TNFT',                       // symbol_
				constants.ZERO_ADDRESS,                            // artistWallet_
				{ from: nftOwner }
			);
			instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == "NewInstance").args.instance);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 nftOwner);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           '0');
			assert.equal(await instance.balanceOf(instance.address),             '0');
			assert.equal(await instance.balanceOf(nftOwner),                     '0');
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),'0');
		});
	});

	describe('Prepare tokens', function () {
		it('perform', async function () {
			await this.mocks.erc721.mint(instance.address, 1);
			await this.mocks.erc1155.mint(instance.address, 1, 1, '0x');
		});

		after(async function () {
			assert.equal(await instance.owner(),                                 nftOwner);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           '0');
			assert.equal(await instance.balanceOf(instance.address),             '0');
			assert.equal(await instance.balanceOf(nftOwner),                     '0');
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),'0');
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
				[[ nftOwner, web3.utils.toWei('900') ]],
				{ from: nftOwner }
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});


		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             '0');
			assert.equal(await instance.balanceOf(nftOwner),                     '0');
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),web3.utils.toWei('1000'));
		});
	});

	describe('Buy all shards in crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.buy(
				instance.address,
				cBuyer1,
				{ 
					from: cBuyer1,
					value: new BigNumber('100').times(0.001).times(1e18).toFixed() 
				}
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});


		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             '0');
			assert.equal(await instance.balanceOf(nftOwner),                     '0');
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),web3.utils.toWei('1000'));
		});

		it('Move till end of crowdsale', async function () {
			await web3.currentProvider.send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [ 50400 ], id: 0 }, () => {});
		});
	});

	describe('withdraw and trigger bonding curve', function () {
		it('perform', async function () {
			const { receipt } = await this.modules.crowdsale.withdraw(
				instance.address,
				nftOwner,
				{ 
					from: nftOwner,
				}
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
			curveInstance = receipt.logs[0].args.curve;
		});


		after(async function () {
			assert.equal(await instance.owner(),                                 constants.ZERO_ADDRESS);
			assert.equal(await instance.name(),                                  'Tokenized NFT');
			assert.equal(await instance.symbol(),                                'TNFT');
			assert.equal(await instance.decimals(),                              '18');
			assert.equal(await instance.totalSupply(),                           web3.utils.toWei('1000'));
			assert.equal(await instance.balanceOf(instance.address),             '0');
			assert.equal(await instance.balanceOf(nftOwner),                     web3.utils.toWei('0'));
			assert.equal(await instance.balanceOf(curveInstance),         web3.utils.toWei('20'));
			assert.equal(await instance.balanceOf(this.modules.crowdsale.address),web3.utils.toWei('980'));
		});
	});

	describe('mBuyer1 buy 5 shards', () => {
		it("perform", async() => {
			const shardAmount = new BigNumber(5).times(1e18);
			const maxEthForShardAmount = new BigNumber(10).times(1e18);
			const curve = await BondingCurve.at(curveInstance);

			const buyShardsTxn = await curve.buyShards(
				shardAmount,
				maxEthForShardAmount,
				{
					from: mBuyer1,
					value: maxEthForShardAmount
				}
				);

			const curveCoordinates = await curve.getCurveCoordinates();
			const ethInPool = await curve.getEthInPool();
			const shardsInPool = await instance.balanceOf(curveInstance);

			console.log('buyShards gasUsed: ', buyShardsTxn.receipt.gasUsed);
			console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
			console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
		})
	})
});
