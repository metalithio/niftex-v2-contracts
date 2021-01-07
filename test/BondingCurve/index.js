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

contract("BondingCurve.sol stand-alone test", async accounts => {

	it("registry should return a shard balance of 1000", async () => {
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

		const balance = await registryInstance.balanceOf(accounts[0]);
		console.log(await registryInstance.balanceOf(accounts[0]));
		console.log(await registryInstance.balanceOf(accounts[0]));
		console.log(await registryInstance.balanceOf(accounts[0]));
		assert.equal(balance.valueOf(), SHARD_SUPPLY.valueOf());
	});

	// buy scenario with too much ether sent
});
