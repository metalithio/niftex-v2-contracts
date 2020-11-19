/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

pragma solidity ^0.6.0;


contract BondingCurve {
	using SafeMath for uint256;

	uint256 internal _y; // Hypothetical ETH to satisfy k
	uint256 internal _x; // Shards in the curve

	uint256 internal _currentPrice;

	function initialize(
		uint256 initialShardSupply,
		address shardRegistryAddress,
		address owner,
		uint256 initialPriceInWei
	) public payable {
		require(msg.sender == owner);
		// assumes ERC20.approve
		// can also be used for WETH
		// wrap in require?
		ERC20(shardRegistryAddress).transferFrom(owner, address(this), initialShardSupply);
		_x = initialShardSupply;
		_y = initialShardSupply.mul(initialPriceInWei);
	}

	function buy(
		uint256 shardAmount,
		uint256 maxEthForShardAmount
	) public {
		uint256 k = _y.mul(_x);
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = k.div(newX);
		uint weiRequired = newY.sub(_y);
		require(weiRequired <= maxEthForShardAmount);
		require(msg.value >= weiRequired);

		_y = newY;
		_x = newX;

		ERC20(shardRegistryAddress).transfer(address(this), msg.sender, shardAmount);
		if (msg.value > weiRequired) {
			// guard against msg.sender being contract
			(bool success, ) = msg.sender.call.value(weiRequired.sub(msg.value))("");
			require(success, "[buy] ETH transfer failed.");
		}
	}

	function sell(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		// check user shard balance first?
		uint256 k = _y.mul(_x);
		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		uint weiPayout = _y.sub(newY);

		require(weiPayout >= minEthForShardAmount);

		_y = newY;
		_x = newX;

		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call.value(weiPayout)("");
		require(success, "[sell] ETH transfer failed.");
	}

	function supplyToken() {

	}

	function supplyEther() {

	}

	function withdrawSuppliedToken() {

	}

	function withdrawSuppliedEther() {

	}

	function currentPrice() external returns (uint) {
		return _y.div(_x);
	}
}
