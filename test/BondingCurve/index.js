const BigNumber = require('bignumber.js');

const BondingCurve = artifacts.require("BondingCurve");
const ShardRegistry = artifacts.require("ERC20PresetMinterPauser");

let registryInstance;
let curveInstance;


const SHARD_SUPPLY = new BigNumber(1000).times(1e18);
const SHARD_SOLD_IN_CROWDSALE = new BigNumber(300).times(1e18);
const INITIAL_VALUATION = new BigNumber(60).times(1e18);
const PCT_ETH_TO_BONDING_CURVE = new BigNumber(200).div(1000);
const PCT_SHARDS_TO_BONDING_CURVE = new BigNumber(100).div(1000);

const SHARD_SUBSCRIBER_1_PCT = new BigNumber(400).div(1000);
const SHARD_SUBSCRIBER_2_PCT = new BigNumber(600).div(1000);
const MAX_UINT = new BigNumber(2).pow(256).minus(1);

contract("BondingCurve.sol stand-alone test", async accounts => {

	it("mint tokens to accounts 0,1,2", async () => {
		registryInstance = await ShardRegistry.new(
			'PEPECASH',
			'PEPECASH',
			{ from: accounts[0] }
		);
		
		const ownerRemainingShards = SHARD_SUPPLY.minus(SHARD_SOLD_IN_CROWDSALE);
		const ethSoldInCrowdsale = SHARD_SOLD_IN_CROWDSALE.div(SHARD_SUPPLY).times(INITIAL_VALUATION);
		const subscriberOneShards = SHARD_SUBSCRIBER_1_PCT.times(SHARD_SOLD_IN_CROWDSALE);
		const subscriberTwoShards = SHARD_SUBSCRIBER_2_PCT.times(SHARD_SOLD_IN_CROWDSALE);


		await registryInstance.mint(accounts[0], ownerRemainingShards);
		await registryInstance.mint(accounts[1], subscriberOneShards);
		await registryInstance.mint(accounts[2], subscriberTwoShards);
	});

	it("Construct and initialize the bonding curve", async () => {
		const nftOwnerShardBalance = await registryInstance.balanceOf(accounts[0]);
		const suppliedShards = new BigNumber(nftOwnerShardBalance).times(PCT_SHARDS_TO_BONDING_CURVE);
		const shardRegistryAddress = registryInstance.address;
		const owner = accounts[0];
		const artistWallet = "0x0000000000000000000000000000000000000000";
		const niftexWallet = accounts[3];
		const initialPriceInWei = INITIAL_VALUATION.div(SHARD_SUPPLY).times(1e18);
		const minShard0 = new BigNumber(300).times(1e18);

		const ethToBondingCurve = SHARD_SOLD_IN_CROWDSALE.div(SHARD_SUPPLY).times(INITIAL_VALUATION).times(PCT_ETH_TO_BONDING_CURVE);
		curveInstance = await BondingCurve.new({ from: accounts[0] });

		await registryInstance.approve(
			curveInstance.address,
			MAX_UINT,
			{ from: accounts[0]}
		);

		await curveInstance.initialize(
			suppliedShards,
			shardRegistryAddress,
			owner,
			artistWallet,
			niftexWallet,
			initialPriceInWei,
			minShard0,
			{ 
				from: accounts[0],
				value: ethToBondingCurve
			}
		);

		const curveCoordinates = await curveInstance.getCurveCoordinates();
		const ethInPool = await web3.eth.getBalance(curveInstance.address);
		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);
		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
	})

	it("accounts[1] buy 50 shards", async() => {
		const shardAmount = new BigNumber(50).times(1e18);
		const maxEthForShardAmount = new BigNumber(10).times(1e18);


		await curveInstance.buyShards(
			shardAmount,
			maxEthForShardAmount,
			{
				from: accounts[1],
				value: maxEthForShardAmount
			}
			);

		const curveCoordinates = await curveInstance.getCurveCoordinates();
		const ethInPool = await web3.eth.getBalance(curveInstance.address);
		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
	})

	it("accounts[2] sell 80 shards", async() => {
		const shardAmount = new BigNumber(80).times(1e18);
		const minEthForShardAmount = new BigNumber(10).times(1e18);

		await registryInstance.approve(
			curveInstance.address,
			MAX_UINT,
			{ from: accounts[2]}
		);

		await curveInstance.sellShards(
			shardAmount,
			minEthForShardAmount,
			{
				from: accounts[2],
			}
		);

		const curveCoordinates = await curveInstance.getCurveCoordinates();
		const ethInPool = await web3.eth.getBalance(curveInstance.address);
		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
	})

	it("accounts[1] provides 3 ETH liquidity", async() => {
		await curveInstance.supplyEther(
			{ 
				from: accounts[1],
				value: new BigNumber(3).times(1e18)
			}
		);
		
		const curveCoordinates = await curveInstance.getCurveCoordinates();
		const ethInPool = await web3.eth.getBalance(curveInstance.address);
		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
	});

	it("accounts[2] provides 100 Shards liquidity", async() => {
		await curveInstance.supplyShards(
			new BigNumber(100).times(1e18),
			{ 
				from: accounts[2],
			}
		);
		
		const curveCoordinates = await curveInstance.getCurveCoordinates();
		const ethInPool = await web3.eth.getBalance(curveInstance.address);
		const shardsInPool = await registryInstance.balanceOf(curveInstance.address);

		console.log(new BigNumber(curveCoordinates[0]).toFixed(), new BigNumber(curveCoordinates[1]).toFixed(), "_x, _p");
		console.log(new BigNumber(ethInPool).div(1e18).toFixed(), new BigNumber(shardsInPool).div(1e18).toFixed(), 'ethInPool, shardsInPool');
	});

	it("ETH LP tokens of accounts[0], accounts[1], accounts[2]", async() => {
		const accountZero = await curveInstance.getEthLPTokens(accounts[0]);
		const accountOne = await curveInstance.getEthLPTokens(accounts[1]);
		const accountTwo = await curveInstance.getEthLPTokens(accounts[2]);

		const ethSuppliers = await curveInstance.getEthSuppliers();

		const newEthLPTokens = await curveInstance.calcNewEthLPTokensToIssue(new BigNumber(3).times(1e18));
		console.log('newEthLPTokens: ',newEthLPTokens.toString(10))
		console.log('ethSuppliers: ', ethSuppliers[0].toString(10), ethSuppliers[1].toString(10), ethSuppliers[2].toString(10))
		console.log('ethLPTokens accounts[0]', new BigNumber(accountZero).div(1e18).toFixed());
		console.log('ethLPTokens accounts[1]', new BigNumber(accountOne).div(1e18).toFixed());
		console.log('ethLPTokens accounts[2]', new BigNumber(accountTwo).div(1e18).toFixed());
	});

	it("Shard LP tokens of accounts[0], accounts[1], accounts[2]", async() => {
		const accountZero = await curveInstance.getShardLPTokens(accounts[0]);
		const accountOne = await curveInstance.getShardLPTokens(accounts[1]);
		const accountTwo = await curveInstance.getShardLPTokens(accounts[2]);


		console.log('getShardLPTokens accounts[0]', new BigNumber(accountZero).div(1e18).toFixed());
		console.log('getShardLPTokens accounts[1]', new BigNumber(accountOne).div(1e18).toFixed());
		console.log('getShardLPTokens accounts[2]', new BigNumber(accountTwo).div(1e18).toFixed());
	});
});
