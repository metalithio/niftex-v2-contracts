/*
	Calculation utils only, no web3 calls here, no async/await
*/

const BigNumber = require("bignumber.js");

const solidityConstants = Object.assign({
	ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
	MAX_UINT256: new BigNumber(2)
		.pow(256)
		.minus(1)
		.toFixed()
});

const tenPow = exp => {
	return new BigNumber(10).pow(exp);
};

/* ======== start BUY/SELL FRACTIONS ====== */
const getMaxFractionsToBuyWei = ({
	fractionsInCurve,
	feeToNiftex,
	feeToArtist,
	feeToProviders,
	fractionsForNiftex,
	fractionsForArtist,
	k,
	x,
}) => {
	let maxFractions = new BigNumber(x).minus(1).times(tenPow(18).plus(feeToNiftex).plus(feeToArtist)).div(tenPow(18).plus(feeToArtist).plus(feeToNiftex).plus(feeToProviders));

	if (maxFractions.gte(fractionsInCurve)) {
		maxFractions = fractionsInCurve;
	}

	return new BigNumber(maxFractions)
		.minus(fractionsForNiftex)
		.minus(fractionsForArtist)
		.times(tenPow(18))
		.div(
			tenPow(18)
				.plus(feeToNiftex)
				.plus(feeToArtist)
				// .plus(feeToProviders)
		)
		.integerValue(BigNumber.ROUND_DOWN);
};

const getMaxFractionsToSellWei = ({
	x,
	k,
	ethInCurve,
	ethForNiftex,
	ethForArtist
}) => {
	const oldY = new BigNumber(k).div(x).integerValue(BigNumber.ROUND_DOWN);
	let newY = oldY.minus(ethInCurve);
	if (newY.lt(0)) {
		newY = new BigNumber(1);
	}

	const newX = new BigNumber(k).div(newY).integerValue(BigNumber.ROUND_DOWN);

	return newX.minus(x);
};

const getCurrentPriceWei = ({ x, k }) => {
	const y = new BigNumber(k).div(x).integerValue(BigNumber.ROUND_DOWN);
	return y
		.times(tenPow(18))
		.div(x)
		.integerValue(BigNumber.ROUND_DOWN);
};

// buy shards
const ethForExactFractionsBuyWei = ({
	fractionsToBuy,
	x,
	k,
	feeToProviders,
	feeToNiftex,
	feeToArtist
}) => {
	const fractionsAfterFee = new BigNumber(fractionsToBuy)
		.times(
			tenPow(18)
				.plus(feeToProviders)
				.plus(feeToArtist)
				.plus(feeToNiftex)
		)
		.div(tenPow(18));
	const oldY = new BigNumber(k).div(x).integerValue(BigNumber.ROUND_DOWN);
	const newX = new BigNumber(x).minus(fractionsAfterFee);
	const newY = new BigNumber(k).div(newX).integerValue(BigNumber.ROUND_DOWN);

	return newY.minus(oldY);
};

// sell shards
const ethForExactFractionsSellWei = ({
	fractionsToSell,
	x,
	k,
	feeToProviders,
	feeToNiftex,
	feeToArtist
}) => {
	const oldY = new BigNumber(k).div(x).integerValue(BigNumber.ROUND_DOWN);
	const newX = new BigNumber(x).plus(fractionsToSell);
	const newY = new BigNumber(k).div(newX).integerValue(BigNumber.ROUND_DOWN);

	const ethBeforeFee = oldY.minus(newY);
	const ethAfterFee = ethBeforeFee
		.times(tenPow(18).minus(feeToNiftex).minus(feeToArtist).minus(feeToProviders))
		.div(
			tenPow(18)
		)
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();
	return ethAfterFee;
};

// export const

const getBuyFractionsExecutionDetails = ({
	pctTolerance = "0.01", // 1%
	fractionsToBuy,
	x,
	k,
	feeToProviders,
	feeToNiftex,
	feeToArtist
}) => {
	const weiRequired = ethForExactFractionsBuyWei({
		fractionsToBuy,
		x,
		k,
		feeToProviders,
		feeToNiftex,
		feeToArtist
	});

	const weiRequiredAfterTolerance = weiRequired
		.times(new BigNumber(1).plus(pctTolerance))
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();

	return {
		maxWeiForFractionAmount: weiRequiredAfterTolerance,
		fractionAmount: fractionsToBuy
	};
};

const getSellFractionsExecutionDetails = ({
	pctTolerance = "0.01", // 1%
	fractionsToSell,
	x,
	k,
	feeToProviders,
	feeToNiftex,
	feeToArtist
}) => {
	const weiRequired = ethForExactFractionsSellWei({
		fractionsToSell,
		x,
		k,
		feeToProviders,
		feeToNiftex,
		feeToArtist
	});

	// !TODO2: After deploy BondingCurve2.sol, change the function headers
	// and inputs. Will need to read BondingCurve2.sol thoroughly...

	const weiRequiredAfterTolerance = weiRequired
		.times(new BigNumber(1).minus(pctTolerance))
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();

	return {
		minWeiForFractionAmount: weiRequiredAfterTolerance,
		fractionAmount: fractionsToSell
	};
};

/* ======== end BUY/SELL FRACTIONS ====== */

/* ======== start LIQUIDITY MANAGEMENT ====== */
const getEthLPTokensToMint = ({
	ethToProvide, // wei
	ethSupplied, // wei
	ethLPTokens
}) => {
	if (new BigNumber(ethSupplied).eq(0)) {
		return ethToProvide;
	}

	const proportion = new BigNumber(ethToProvide)
		.times(tenPow(18))
		.div(new BigNumber(ethSupplied).plus(ethToProvide))
		.integerValue(BigNumber.ROUND_DOWN);
	return new BigNumber(proportion)
		.times(ethLPTokens)
		.div(tenPow(18).minus(proportion))
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();
};

const getFractionLPTokensToMint = ({
	fractionsToProvide,
	fractionsSupplied,
	fractionLPTokens
}) => {
	if (new BigNumber(fractionsSupplied).eq(0)) {
		return fractionsToProvide;
	}

	const proportion = new BigNumber(fractionsToProvide)
		.times(tenPow(18))
		.div(new BigNumber(fractionsSupplied).plus(fractionsToProvide))
		.integerValue(BigNumber.ROUND_DOWN);
	return new BigNumber(proportion)
		.times(fractionLPTokens)
		.div(tenPow(18).minus(proportion))
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();
};

const getMaxFractionsToProvide = ({ x, fractionsInCurve }) => {
	/*
		require(_curve.k.div(_curve.x).sub(address(this).balance) >= 0);
	*/

	if (new BigNumber(x).lt(fractionsInCurve)) {
		return "0";
	}

	return new BigNumber(x).minus(fractionsInCurve).toFixed();
	// return solidityConstants.MAX_UINT256;
};

const getMaxEthToProvide = ({ x, k, ethInCurve }) => {
	/*
		require(_curve.k.div(_curve.x).sub(address(this).balance) >= 0);
	*/
	const y = new BigNumber(k).div(x).integerValue(BigNumber.ROUND_DOWN);

	if (new BigNumber(y).lt(ethInCurve)) {
		return "0";
	}

	return new BigNumber(y).minus(ethInCurve).toFixed();
	// return solidityConstants.MAX_UINT256;
};

const getAssetsToWithdrawForEthLP = ({
	ethInCurve,
	ethSupplied,
	fractionsInCurve,
	fractionsSupplied,
	ethLPTokens,
	fractionsForNiftex,
	fractionsForArtist,
	ethForNiftex,
	ethForArtist,
	ethLPTokensToWithdraw
}) => {
	/*
		function withdrawSuppliedEther(uint256 amount) external returns (uint256, uint256) {
	    require(amount > 0);

	    uint256 etherLPTokenSupply = etherLPToken.totalSupply();

	    uint256 balance = address(this).balance
	    .sub(_etherLPExtra.feeToNiftex)
	    .sub(_etherLPExtra.feeToArtist);

	    uint256 value = (balance <= _etherLPExtra.underlyingSupply)
	    ? balance.mul(amount).div(etherLPTokenSupply)
	    : _etherLPExtra.underlyingSupply.mul(amount).div(etherLPTokenSupply);

	    uint256 payout = calcShardsForEthSuppliers()
	    .mul(amount)
	    .div(etherLPTokenSupply);
		}
	*/

	const balance = new BigNumber(ethInCurve)
		.minus(ethForNiftex)
		.minus(ethForArtist);
	const ethToWithdraw = balance.lte(ethSupplied)
		? balance
				.times(ethLPTokensToWithdraw)
				.div(ethLPTokens)
				.integerValue(BigNumber.ROUND_DOWN)
				.toFixed()
		: new BigNumber(ethSupplied)
				.times(ethLPTokensToWithdraw)
				.div(ethLPTokens)
				.integerValue(BigNumber.ROUND_DOWN)
				.toFixed();

	const fractionsToWithdraw = new BigNumber(
		fractionsForEthSuppliers({
			fractionsInCurve,
			fractionsSupplied,
			fractionsForNiftex,
			fractionsForArtist
		})
	)
		.times(ethLPTokensToWithdraw)
		.div(ethLPTokens)
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();

	return {
		ethToWithdraw,
		fractionsToWithdraw
	};
};

const fractionsForEthSuppliers = ({
	fractionsInCurve,
	fractionsSupplied,
	fractionsForNiftex,
	fractionsForArtist
}) => {
	/*
		function calcShardsForEthSuppliers() public view returns (uint256) {
	    uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
	    .sub(_shardLPExtra.feeToNiftex)
	    .sub(_shardLPExtra.feeToArtist);
	    return balance < _shardLPExtra.underlyingSupply ? 0 : balance - _shardLPExtra.underlyingSupply;
		}
	*/
	const balance = new BigNumber(fractionsInCurve)
		.minus(fractionsForNiftex)
		.minus(fractionsForArtist);
	return balance.lt(fractionsSupplied)
		? "0"
		: balance.minus(fractionsSupplied).toFixed();
};

const getAssetsToWithdrawForFractionLP = ({
	ethInCurve,
	ethSupplied,
	fractionsInCurve,
	fractionsSupplied,
	fractionLPTokens,
	fractionsForNiftex,
	fractionsForArtist,
	ethForNiftex,
	ethForArtist,
	fractionLPTokensToWithdraw
}) => {
	/*
		function withdrawSuppliedShards(uint256 amount) external returns (uint256, uint256) {
	    require(amount > 0);

	    uint256 shardLPTokenSupply = shardLPToken.totalSupply();

	    uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
	    .sub(_shardLPExtra.feeToNiftex)
	    .sub(_shardLPExtra.feeToArtist);

	    uint256 shards = (balance <= _shardLPExtra.underlyingSupply)
	    ? balance.mul(amount).div(shardLPTokenSupply)
	    : _shardLPExtra.underlyingSupply.mul(amount).div(shardLPTokenSupply);

	    uint256 payout = calcEthForShardSuppliers()
	    .mul(amount)
	    .div(shardLPTokenSupply);
		}
	*/
	const balance = new BigNumber(fractionsInCurve)
		.minus(fractionsForNiftex)
		.minus(fractionsForArtist);

	const fractionsToWithdraw = balance.lte(fractionsSupplied)
		? balance
				.times(fractionLPTokensToWithdraw)
				.div(fractionLPTokens)
				.integerValue(BigNumber.ROUND_DOWN)
				.toFixed()
		: new BigNumber(fractionsSupplied)
				.times(fractionLPTokensToWithdraw)
				.div(fractionLPTokens)
				.integerValue(BigNumber.ROUND_DOWN)
				.toFixed();

	const ethToWithdraw = new BigNumber(
		ethForFractionSuppliers({
			ethInCurve,
			ethSupplied,
			ethForNiftex,
			ethForArtist
		})
	)
		.times(fractionLPTokensToWithdraw)
		.div(fractionLPTokens)
		.integerValue(BigNumber.ROUND_DOWN)
		.toFixed();

	return {
		ethToWithdraw,
		fractionsToWithdraw
	};
};

const ethForFractionSuppliers = ({
	ethInCurve,
	ethSupplied,
	ethForNiftex,
	ethForArtist
}) => {
	/*
		function calcEthForShardSuppliers() public view returns (uint256) {
	    uint256 balance = address(this).balance
	    .sub(_etherLPExtra.feeToNiftex)
	    .sub(_etherLPExtra.feeToArtist);
	    return balance < _etherLPExtra.underlyingSupply ? 0 : balance - _etherLPExtra.underlyingSupply;
		}
	*/

	const balance = new BigNumber(ethInCurve)
		.minus(ethForNiftex)
		.minus(ethForArtist);
	return balance.lt(ethSupplied) ? "0" : balance.minus(ethSupplied).toFixed();
};

/* ======== end LIQUIDITY MANAGEMENT ====== */

module.exports = {
	tenPow,
	getMaxFractionsToBuyWei,
	ethForExactFractionsBuyWei,
	ethForExactFractionsSellWei,
}
