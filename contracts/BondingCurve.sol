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
	mapping(address => uint256) internal _mapSuppliedEth;
	mapping(address => uint256) internal _mapSuppliedShards;


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
		_mapSuppliedEth[msg.sender] = msg.value;
		_mapSuppliedShards[msg.sender] = suppliedShards;
		_totalSuppliedEth = msg.value;
		_totalSuppliedShards = suppliedShards;
	}

	function buy(
		uint256 shardAmount,
	) public payable {
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

		if (minEthForShardAmount > 0) {
			require(weiPayout >= minEthForShardAmount);
		}
		
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

	function calcEthPayoutForSellShards (
		uint256 shardAmount
		) external view returns (uint256) { 
		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		uint256 weiPayout = _y.sub(newY);

		return weiPayout;
	} 

	function calcShardPayoutForSellEth (
		uint256 ethAmount
		) external view returns (uint256) { 
		uint256 newY = _y.add(ethAmount);
		uint256 newX = k.div(newY);
		uint256 shardPayout = _x.sub(newX);

		return shardPayout;
	} 

	function supplyShards(
		uint256 shardAmount
	) public {
		ERC20(_shardRegistryAddress).transferFrom(owner, address(this), shardAmount);
		_mapSuppliedShards[msg.sender] += shardAmount;
		_totalSuppliedShards += shardAmount;
	}

	function supplyEther() public payable {
		_mapSuppliedEth[msg.sender] = msg.value;
		_totalSuppliedEth += msg.value;
	}

	function withdrawSuppliedShards(
		uint256 shardAmount
	) {
		require(
			shardAmount <= _mapSuppliedShards[msg.sender],
			"Cannot withdraw more than deposited amount of shards"
			);
		
		uint256 memory shardsToSellOnMarket = 0;

		if (_shardsInPoolInWei < shardAmount) {
			shardsToSellOnMarket = shardAmount - _shardsInPoolInWei;
		}

		uint256 memory ethPayout = calcEthPayoutForSellShards(shardsToSellOnMarket);

		require(ethPayout <= _ethInPoolInWei);

		_totalSuppliedShards -= shardAmount;
		_mapSuppliedShards[msg.sender] -= shardAmount;

		_shardsInPoolInWei -= shardAmount.sub(shardsToSellOnMarket);
		ERC20(_shardRegistryAddress).transferFrom(address(this), msg.sender, shardAmount.sub(shardsToSellOnMarket));
		sell(shardsToSellOnMarket, 0);
	}

	function withdrawSuppliedEther(
		uint256 ethAmount
		) {
		require(
			ethAmount <= _mapSuppliedEth[msg.sender],
			"Cannot withdraw more than deposited amount of eth"
			);

		uint256 memory ethToSellOnMarket = 0;

		if (_ethInPoolInWei < ethAmount) {
			ethToSellOnMarket = ethAmount.sub(_ethInPoolInWei);
		}

		uint256 memory shardPayout = calcShardPayoutForSellEth(ethToSellOnMarket);

		require(shardPayout <= _shardsInPoolInWei);

		_totalSuppliedEth -= ethAmount;
		_mapSuppliedEth[msg.sender] -= ethAmount;

		_ethInPoolInWei -= ethAmount.sub(ethToSellOnMarket);
		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call.value(ethAmount.sub(ethToSellOnMarket))("");
		require(success, "[sell] ETH transfer failed.");
		// oh well need another buy shards with eth input for this function...
		buy(shardPayout);
	}

	function currentPrice() external returns (uint) {
		return _y.div(_x);
	}
}
