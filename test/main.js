const BondingCurve = artifacts.require("BondingCurve");
const ShardRegistry = artifacts.require("ERC20PresetMinterPauser");

const SHARD_SUPPLY = 1000;
const UNSOLD_SHARDS = 700;
const SUPPLIED_SHARDS = 500;
const SUPPLIED_ETH = 10;
const SHARD_REGISTRY_ADDRESS = '';
const INITIAL_PRICE_WEI = 1; // 1 ETH?

let registryInstance;
let curveInstance;

contract("Bonding curve setup", async accounts => {

	it("registry should return a shard balance of 1000", async () => {
		registryInstance = await ShardRegistry.new(
			'TestTokens',
			'TEST',
			{ from: accounts[0] }
		);
		curveInstance = await BondingCurve.new({ from: accounts[0] });
		await registryInstance.mint(accounts[0], SHARD_SUPPLY);
		const balance = await registryInstance.balanceOf.call(accounts[0]);
		assert.equal(balance.valueOf(), SHARD_SUPPLY);
	});

	it("registry should return an approved balance of 500", async () => {
		// curveInstance = await BondingCurve.deployed();
		await registryInstance.approve(curveInstance.address, SUPPLIED_SHARDS);
		const approved = await registryInstance.allowance.call(
			accounts[0],
			curveInstance.address
		);
		assert.equal(approved.valueOf(), SUPPLIED_SHARDS);
	});

	it(`curve should return price ${INITIAL_PRICE_WEI} after setup`, async () => {
		await curveInstance.initialize(
			UNSOLD_SHARDS,
			SUPPLIED_SHARDS,
			registryInstance.address,
			accounts[0], // owner
			INITIAL_PRICE_WEI,
			{ value: web3.utils.toWei(SUPPLIED_ETH.toString(), "ether") }
		);
		const price = await curveInstance.currentPrice();
		assert.equal(price.valueOf(), INITIAL_PRICE_WEI);
	});

	it(`curve should return shards balance of ${SUPPLIED_SHARDS} after setup`, async () => {
		const balance = await registryInstance.balanceOf.call(curveInstance.address);
		assert.equal(balance.valueOf(), SUPPLIED_SHARDS);
	});

	it(`curve should return eth balance of ${SUPPLIED_ETH} after setup`, async () => {
		let balance = await web3.eth.getBalance(curveInstance.address);
		balance = web3.utils.fromWei(balance, 'ether');
		assert.equal(balance.valueOf(), SUPPLIED_ETH);
	});
});
