const BondingCurve = artifacts.require("BondingCurve");
const ShardRegistry = artifacts.require("ERC20PresetMinterPauser");

const SHARD_SUPPLY = 1000;
const UNSOLD_SHARDS = 700;
const SUPPLIED_SHARDS = 500;
const SHARD_REGISTRY_ADDRESS = '';
const INITIAL_PRICE_WEI = 10**18; // 1 ETH?

let registryInstance;
let curveInstance;

contract("Bonding curve test", async accounts => {

	it("should return a shard balance of 1000", async () => {
		curveInstance = await BondingCurve.deployed();
		registryInstance = await ShardRegistry.new(
			'TestTokens',
			'TEST',
			{ from: accounts[0] }
		);
		await registryInstance.mint(accounts[0], 1000);
		const balance = await registryInstance.balanceOf.call(accounts[0]);
		assert.equal(balance.valueOf(), 1000);
	});

	it("should return an approved balance of 500", async () => {
		await registryInstance.approve(curveInstance.address, 500);
		const approved = await registryInstance.allowance.call(
			accounts[0],
			curveInstance.address
		);
		assert.equal(approved.valueOf(), 500);
	});


	// it("should return price 1/300", async () => {
	// 	const instance = await BondingCurve.deployed();
	// 	await BondingCurve.initialize(
	// 		UNSOLD_SHARDS,
	// 		SUPPLIED_SHARDS,
	// 		SHARD_REGISTRY_ADDRESS,
	// 		accounts[0] //owner,
	// 		INITIAL_PRICE_WEI
	// 	);
	// 	const price = await BondingCurve.currentPrice();
	// 	console.log(price)
	// });
});
