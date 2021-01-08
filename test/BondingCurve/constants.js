const BigNumber = require('bignumber.js');

const SHARD_SUPPLY = new BigNumber(1000);
const UNSOLD_SHARDS =  new BigNumber(700);
const SUPPLIED_SHARDS =  new BigNumber(500);
const SUPPLIED_ETH =  new BigNumber(10);
const INITIAL_PRICE_WEI =  new BigNumber('1000000000000000000');

const STARTING_X = UNSOLD_SHARDS;
const STARTING_Y = STARTING_X.times(INITIAL_PRICE_WEI);

const SHARDS_BOUGHT = 10;

module.exports = {
	SHARD_SUPPLY,
	UNSOLD_SHARDS,
	SUPPLIED_SHARDS,
	SUPPLIED_ETH,
	INITIAL_PRICE_WEI,
	STARTING_X,
	STARTING_Y,
	SHARDS_BOUGHT,
}