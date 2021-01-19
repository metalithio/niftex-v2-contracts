// const BigNumber = require('bignumber.js');

// const BondingCurve = artifacts.require("BondingCurve");

// const ShardedWallet        = artifacts.require('ShardedWallet');
// const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
// const Governance           = artifacts.require('BasicGovernance');

// let registryInstance;
// let curveInstance;


// const SHARD_SUPPLY = new BigNumber(1000).times(1e18);
// const SHARD_SOLD_IN_CROWDSALE = new BigNumber(300).times(1e18);
// const INITIAL_VALUATION = new BigNumber(60).times(1e18);
// const PCT_ETH_TO_BONDING_CURVE = new BigNumber(200).div(1000);
// const PCT_SHARDS_TO_BONDING_CURVE = new BigNumber(100).div(1000);

// const SHARD_SUBSCRIBER_1_PCT = new BigNumber(400).div(1000);
// const SHARD_SUBSCRIBER_2_PCT = new BigNumber(600).div(1000);
// const MAX_UINT = new BigNumber(2).pow(256).minus(1);

// 0xd9145CCE52D386f254917e481eB44e9943F39138
// 0xd9145CCE52D386f254917e481eB44e9943F39138

// contract("BondingCurve.sol stand-alone test", async accounts => {

// 	it("mint tokens to accounts 0,1,2", async () => {

// 		const governance = await Governance.new();
// 		const factory = await ShardedWalletFactory.new();
// 		const { receipt } = await factory.mintWallet(
// 			governance.address,      // governance_
// 			accounts[0],                        // owner_
// 			'PEPECASH',              // name_
// 			'PEPECASH',                       // symbol_
// 		);
// 		registryInstance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == "NewInstance").args.instance);

// 		// !NOTE CHEAT: add EOA wallet as module 
// 		governance.grantRole(await governance.MODULE_ROLE(), accounts[0]);

// 		const ownerRemainingShards = SHARD_SUPPLY.minus(SHARD_SOLD_IN_CROWDSALE);
// 		const ethSoldInCrowdsale = SHARD_SOLD_IN_CROWDSALE.div(SHARD_SUPPLY).times(INITIAL_VALUATION);
// 		const subscriberOneShards = SHARD_SUBSCRIBER_1_PCT.times(SHARD_SOLD_IN_CROWDSALE);
// 		const subscriberTwoShards = SHARD_SUBSCRIBER_2_PCT.times(SHARD_SOLD_IN_CROWDSALE);


// 		await registryInstance.moduleMint(accounts[0], ownerRemainingShards);
// 		await registryInstance.moduleMint(accounts[1], subscriberOneShards);
// 		await registryInstance.moduleMint(accounts[2], subscriberTwoShards);
// 	});

// 	it("Construct and initialize the bonding curve", async () => {
// 		const nftOwnerShardBalance = await registryInstance.balanceOf(accounts[0]);
// 		const suppliedShards = new BigNumber(nftOwnerShardBalance).times(PCT_SHARDS_TO_BONDING_CURVE);
// 		const shardRegistryAddress = registryInstance.address;
// 		const owner = accounts[0];
// 		// const artistWallet = "0x0000000000000000000000000000000000000000";
// 		const artistWallet = accounts[4];
// 		const niftexWallet = accounts[3];
// 		const initialPriceInWei = INITIAL_VALUATION.div(SHARD_SUPPLY).times(1e18);
// 		const minShard0 = new BigNumber(300).times(1e18);

// 		const ethToBondingCurve = SHARD_SOLD_IN_CROWDSALE.div(SHARD_SUPPLY).times(INITIAL_VALUATION).times(PCT_ETH_TO_BONDING_CURVE);
// 		curveInstance = await BondingCurve.new({ from: accounts[0] });

// 		await registryInstance.approve(
// 			curveInstance.address,
// 			MAX_UINT,
// 			{ from: accounts[0]}
// 		);

// 		const initializeTxn = await curveInstance.initialize(
// 			suppliedShards,
// 			shardRegistryAddress,
// 			owner,
// 			artistWallet,
// 			niftexWallet,
// 			initialPriceInWei,
// 			minShard0,
// 			{
// 				from: accounts[0],
// 				value: ethToBondingCurve
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);
// 		console.log('initializeTxn.gasUsed: ', initializeTxn.receipt.gasUsed);
// 		console.log(`accounts[0] put ${suppliedShards.div(1e18).toFixed()} Shards and ${ethToBondingCurve.div(1e18).toFixed()} ETH to the curve`);
// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	})

// 	it("accounts[1] buy 50 shards", async() => {
// 		const shardAmount = new BigNumber(50).times(1e18);
// 		const maxEthForShardAmount = new BigNumber(10).times(1e18);


// 		const buyShardsTxn = await curveInstance.buyShards(
// 			shardAmount,
// 			maxEthForShardAmount,
// 			{
// 				from: accounts[1],
// 				value: maxEthForShardAmount
// 			}
// 			);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

// 		console.log('buyShards gasUsed: ', buyShardsTxn.receipt.gasUsed);
// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	})

// 	it("accounts[2] sell 80 shards", async() => {
// 		const shardAmount = new BigNumber(80).times(1e18);
// 		const minEthForShardAmount = new BigNumber(10).times(1e18);

// 		const approveTxn = await registryInstance.approve(
// 			curveInstance.address,
// 			MAX_UINT,
// 			{ from: accounts[2]}
// 		);

// 		const sellShardsTxn = await curveInstance.sellShards(
// 			shardAmount,
// 			minEthForShardAmount,
// 			{
// 				from: accounts[2],
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

// 		console.log('ERC20 approveTxn.gasUsed:', approveTxn.receipt.gasUsed);
// 		console.log('sellShardsTxn.gasUsed: ', sellShardsTxn.receipt.gasUsed);
// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	})

// 	it("accounts[1] provides 3 ETH liquidity", async() => {
// 		const supplyEtherTxn = await curveInstance.supplyEther(
// 			{
// 				from: accounts[1],
// 				value: new BigNumber(3).times(1e18)
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);
// 		console.log('supplyEtherTxn.gasUsed:', supplyEtherTxn.receipt.gasUsed);
// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	});

// 	it("accounts[2] provides 100 Shards liquidity", async() => {
// 		const supplyShardsTxn = await curveInstance.supplyShards(
// 			new BigNumber(100).times(1e18),
// 			{
// 				from: accounts[2],
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);
// 		console.log('supplyShardsTxn.gasUsed:', supplyShardsTxn.receipt.gasUsed);
// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	});

// 	it("ETH LP tokens of accounts[0], accounts[1], accounts[2]", async() => {
// 		const accountZero = await curveInstance.getEthLPTokens(accounts[0]);
// 		const accountOne = await curveInstance.getEthLPTokens(accounts[1]);
// 		const accountTwo = await curveInstance.getEthLPTokens(accounts[2]);

// 		console.log('ethLPTokens accounts[0]', new BigNumber(accountZero).div(1e18).toFixed());
// 		console.log('ethLPTokens accounts[1]', new BigNumber(accountOne).div(1e18).toFixed());
// 		console.log('ethLPTokens accounts[2]', new BigNumber(accountTwo).div(1e18).toFixed());
// 	});

// 	it("Shard LP tokens of accounts[0], accounts[1], accounts[2]", async() => {
// 		const accountZero = await curveInstance.getShardLPTokens(accounts[0]);
// 		const accountOne = await curveInstance.getShardLPTokens(accounts[1]);
// 		const accountTwo = await curveInstance.getShardLPTokens(accounts[2]);

// 		console.log('getShardLPTokens accounts[0]', new BigNumber(accountZero).div(1e18).toFixed());
// 		console.log('getShardLPTokens accounts[1]', new BigNumber(accountOne).div(1e18).toFixed());
// 		console.log('getShardLPTokens accounts[2]', new BigNumber(accountTwo).div(1e18).toFixed());
// 	});

// 	it("accounts[0] sell 150 shards", async() => {
// 		const shardAmount = new BigNumber(150).times(1e18);
// 		const minEthForShardAmount = new BigNumber(20).times(1e18);

// 		await curveInstance.sellShards(
// 			shardAmount,
// 			minEthForShardAmount,
// 			{
// 				from: accounts[0],
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	})

// 	it("accounts[0] sell 50 shards", async() => {
// 		const shardAmount = new BigNumber(50).times(1e18);
// 		const minEthForShardAmount = new BigNumber(20).times(1e18);

// 		await curveInstance.sellShards(
// 			shardAmount,
// 			minEthForShardAmount,
// 			{
// 				from: accounts[0],
// 			}
// 		);

// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
// 	})

// 	for (let i = 0; i < 3; i++) {
// 		it(`accounts[${i}] withdraw ETH liquidity`, async() => {
// 			const ethLPTokensAmount = await curveInstance.getEthLPTokens(accounts[i]);
// 			console.log(`accounts[${i}]'s ethLPTokensAmount: ${ethLPTokensAmount.toString(10)}`);
// 			const withdrawEth = await curveInstance.withdrawSuppliedEther(ethLPTokensAmount, { from: accounts[i]});
// 			const withdrawEthLiquidity = withdrawEth.logs[0].args;
// 			console.log('withdrawEth.gasUsed:', withdrawEth.receipt.gasUsed);
// 			console.log(
// 				`accounts[${i}] withdraw ${new BigNumber(withdrawEthLiquidity[0]).div(1e18).toFixed()} ETH and ${new BigNumber(withdrawEthLiquidity[1]).div(1e18).toFixed()} Shards`
// 				);
// 		})
// 	}

// 	for (let i = 0; i < 3; i++) {
// 		it(`accounts[${i}] withdraw Shard liquidity`, async() => {
// 			const shardLPTokensAmount = await curveInstance.getShardLPTokens(accounts[i]);
// 			console.log(`accounts[${i}]'s shardLPTokensAmount: ${shardLPTokensAmount.toString(10)}`);
// 			const withdrawShard = await curveInstance.withdrawSuppliedShards(shardLPTokensAmount, { from: accounts[i]});
// 			const withdrawShardLiquidity = withdrawShard.logs[0].args;
// 			console.log('withdrawShard.gasUsed:', withdrawShard.receipt.gasUsed);
// 			console.log(
// 				`accounts[${i}] withdraw ${new BigNumber(withdrawShardLiquidity[0]).div(1e18).toFixed()} ETH and ${new BigNumber(withdrawShardLiquidity[1]).div(1e18).toFixed()} Shards`
// 				);
// 		})
// 	}

// 	it('check if ethInPool and shardsInPool are both the remaining for artist and NIFTEX', async() => {
// 		const curveCoordinates = await curveInstance.getCurveCoordinates();
// 		const ethInPool = await curveInstance.getEthInPool();
// 		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

// 		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
// 		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');

// 		const ethSuppliers = await curveInstance.getEthSuppliers();
// 		console.log('ethSuppliers (suppliedEthPlusFees, ethLPTokens, ethFeesToNiftex, ethFeesToArtist): ', new BigNumber(ethSuppliers[0]).div(1e18).toFixed(), new BigNumber(ethSuppliers[1]).div(1e18).toFixed(), new BigNumber(ethSuppliers[2]).div(1e18).toFixed(), new BigNumber(ethSuppliers[3]).div(1e18).toFixed());

// 		const shardSuppliers = await curveInstance.getShardSuppliers();
// 		console.log('shardSuppliers (suppliedShardPlusFees, shardLPTokens, shardFeesToNiftex, shardFeesToArtist): ', new BigNumber(shardSuppliers[0]).div(1e18).toFixed(), new BigNumber(shardSuppliers[1]).div(1e18).toFixed(), new BigNumber(shardSuppliers[2]).div(1e18).toFixed(), new BigNumber(shardSuppliers[3]).div(1e18).toFixed());
// 	})
// });
