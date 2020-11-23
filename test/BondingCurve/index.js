// const BigNumber = require('bignumber.js');

// const BondingCurve = artifacts.require("BondingCurve");
// const ShardRegistry = artifacts.require("ERC20PresetMinterPauser");

// const SHARD_SUPPLY = new BigNumber(1000);
// const UNSOLD_SHARDS =  new BigNumber(700);
// const SUPPLIED_SHARDS =  new BigNumber(500);
// const SUPPLIED_ETH =  new BigNumber(10);
// const INITIAL_PRICE_WEI =  new BigNumber('1000000000000000000');

// const STARTING_X = UNSOLD_SHARDS;
// const STARTING_Y = STARTING_X.times(INITIAL_PRICE_WEI);

// const SHARDS_BOUGHT = 10;

// let registryInstance;
// let curveInstance;

// function calcEthRequiredForShardBuy(shardAmount) {
// 	const newX = STARTING_X.minus(shardAmount); // 690
// 	const newY = (STARTING_X.times(STARTING_Y)).div(newX); // 710.144
// 	const ethRequired = newY.minus(STARTING_Y); // 10.144
// 	return ethRequired.div(10**18).toFixed(18, 1);
// }

// contract("Bonding curve testing", async accounts => {

// 	it("registry should return a shard balance of 1000", async () => {
// 		registryInstance = await ShardRegistry.new(
// 			'TestTokens',
// 			'TEST',
// 			{ from: accounts[0] }
// 		);
// 		curveInstance = await BondingCurve.new({ from: accounts[0] });
// 		await registryInstance.mint(accounts[0], SHARD_SUPPLY);
// 		const balance = await registryInstance.balanceOf(accounts[0]);
// 		assert.equal(balance.valueOf(), SHARD_SUPPLY.valueOf());
// 	});

// 	it("registry should return an approved balance of 500", async () => {
// 		// curveInstance = await BondingCurve.deployed();
// 		await registryInstance.approve(curveInstance.address, SUPPLIED_SHARDS);
// 		const approved = await registryInstance.allowance.call(
// 			accounts[0],
// 			curveInstance.address
// 		);
// 		assert.equal(approved.valueOf(), SUPPLIED_SHARDS.valueOf());
// 	});

// 	it(`curve should return price ${INITIAL_PRICE_WEI} after setup`, async () => {
// 		await curveInstance.initialize(
// 			UNSOLD_SHARDS,
// 			SUPPLIED_SHARDS,
// 			registryInstance.address,
// 			accounts[0], // owner
// 			INITIAL_PRICE_WEI,
// 			{ value: SUPPLIED_ETH.times(10**18) }
// 		);
// 		const price = await curveInstance.currentPrice();
// 		assert.equal(price.valueOf(), INITIAL_PRICE_WEI.valueOf());

// 		const coords = await curveInstance.getCurveCoordinates();
// 	});

// 	it(`curve should return shards balance of ${SUPPLIED_SHARDS} after setup`, async () => {
// 		const balance = await registryInstance.balanceOf(curveInstance.address);
// 		assert.equal(balance.valueOf(), SUPPLIED_SHARDS.valueOf());
// 	});

// 	it(`curve should return eth balance of ${SUPPLIED_ETH} after setup`, async () => {
// 		let balance = await web3.eth.getBalance(curveInstance.address);
// 		balance = new BigNumber(balance).div(10**18);
// 		assert.equal(balance.valueOf(), SUPPLIED_ETH.valueOf());
// 	});

// 	it("buy", async () => {
// 		const weiRequired = await curveInstance.calcEthRequiredForShardBuy.call(10);
// 		const ethRequired = new BigNumber(weiRequired).div(10**18);
// 		assert.equal(ethRequired.valueOf(), calcEthRequiredForShardBuy(10).valueOf());

// 		await curveInstance.buyShards(
// 			SHARDS_BOUGHT,
// 			{ from: accounts[1], value: ethRequired.times(10**18) }
// 		);

// 		const buyerShardBalance = await registryInstance.balanceOf(accounts[1]);
// 		assert.equal(buyerShardBalance.valueOf(), SHARDS_BOUGHT.valueOf());

// 		let curveEthBalance = await web3.eth.getBalance(curveInstance.address);
// 		curveEthBalance = new BigNumber(curveEthBalance).div(10**18);
// 		assert.equal(curveEthBalance, SUPPLIED_ETH.plus(ethRequired).valueOf());

// 		const coords = await curveInstance.getCurveCoordinates();
// 		// x
// 		assert.equal(coords['0'].valueOf(), STARTING_X.minus(SHARDS_BOUGHT).valueOf());
// 		// y
// 		assert.equal(coords['1'].valueOf(), STARTING_Y.plus(weiRequired).valueOf());
// 		// k
// 		const k = new BigNumber(coords['2']); // not sure why this is needed
// 		assert.equal(k.valueOf(), STARTING_X.times(STARTING_Y).valueOf());
// 	});

// 	// buy scenario with too much ether sent
// });
