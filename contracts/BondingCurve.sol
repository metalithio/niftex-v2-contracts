/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

pragma solidity ^0.6.0;


contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _y; // Hypothetical ETH to satisfy k
	uint256 internal _x; // Shards in the curve
	uint256 internal _k;
	uint256 internal _ethInPoolInWei;
	uint256 internal _shardsInPoolInWei;
	uint256 internal _totalSuppliedEth;
	uint256 internal _totalSuppliedShards;

	address internal _shardRegistryAddress;
	mapping(address => uint256) internal _mapETHLPTokens;
	mapping(address => uint256) internal _mapShardLPTokens;


	function initialize(
		uint256 unsoldShards,
		uint256 suppliedShards,
		address shardRegistryAddress,
		address owner,
		uint256 initialPriceInWei
	) public payable {
		require(msg.sender == owner);
		// assumes ERC20.approve
		// can also be used for WETH
		// wrap in require?
		ERC20(shardRegistryAddress).transferFrom(owner, address(this), suppliedShards);
		_x = unsoldShards;
		_y = unsoldShards.mul(initialPriceInWei);
		_k = _x.mul(_y);
		_ethInPoolInWei = msg.value;
		_shardsInPoolInWei = suppliedShards;
		_shardRegistryAddress = shardRegistryAddress;
		_mapETHLPTokens[msg.sender] = msg.value;
		_mapShardLPTokens[msg.sender] = suppliedShards;
		_totalSuppliedEth = msg.value;
		_totalSuppliedShards = suppliedShards;
	}

	function buy(
		uint256 shardAmount,
	) public {
		require (shardAmount >= _shardsInPoolInWei);
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = k.div(newX);
		uint weiRequired = newY.sub(_y);
		require(weiRequired <= msg.value);
		require(msg.value >= weiRequired);

		_y = newY;
		_x = newX;

		ERC20(_shardRegistryAddress).transfer(address(this), msg.sender, shardAmount);
		_ethInPoolInWei += weiRequired;
		_shardsInPoolInWei -= shardAmount;

		// refund extra ETH back to buyers
		if (msg.value > weiRequired) {
			// guard against msg.sender being contract
			(bool success, ) = msg.sender.call.value(msg.value.sub(weiRequired))("");
			require(success, "[buy] ETH transfer failed.");
		}
	}

	function sell(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		// check user shard balance first?
		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		uint weiPayout = _y.sub(newY);

		require(weiPayout >= minEthForShardAmount);
		require(weiPayout <= _ethInPoolInWei);

		_y = newY;
		_x = newX;

		ERC20(_shardRegistryAddress).transferFrom(msg.sender, address(this), shardAmount);

		_ethInPoolInWei -= weiPayout;
		_shardsInPoolInWei += shardAmount;
		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call.value(weiPayout)("");
		require(success, "[sell] ETH transfer failed.");
	}

	function supplyShards(
		uint256 shardAmount
	) {
		ERC20(_shardRegistryAddress).transferFrom(owner, address(this), shardAmount);

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
