/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

pragma solidity ^0.6.0;


contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _y; // Hypothetical ETH to satisfy k
	uint256 internal _x; // Shards in the curve
	uint256 internal _k;

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
		IERC20(shardRegistryAddress).transferFrom(owner, address(this), suppliedShards);
		_x = unsoldShards;
		_y = unsoldShards.mul(initialPriceInWei);
		_k = _x.mul(_y);
		_shardRegistryAddress = shardRegistryAddress;
		_mapSuppliedEth[msg.sender] = msg.value;
		_mapSuppliedShards[msg.sender] = suppliedShards;
		_totalSuppliedEth = msg.value;
		_totalSuppliedShards = suppliedShards;
	}

	function buyShards(
		uint256 shardAmount
	) public payable {
		require(shardAmount >= IERC20(_shardRegistryAddress).balanceOf(address(this)));
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = _k.div(newX);
		uint weiRequired = newY.sub(_y);
		require(weiRequired <= msg.value);
		require(msg.value >= weiRequired);

		_y = newY;
		_x = newX;

		IERC20(_shardRegistryAddress).transfer(msg.sender, shardAmount);

		// refund extra ETH back to buyers
		if (msg.value > weiRequired) {
			// guard against msg.sender being contract
			(bool success, ) = msg.sender.call{
				value: msg.value.sub(weiRequired)
			}("");
			require(success, "[buy] ETH transfer failed.");
		}
	}

	function sellShards(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		// check user shard balance first?
		uint256 newX = _x.add(shardAmount);
		uint256 newY = _k.div(newX);
		uint weiPayout = _y.sub(newY);

		if (minEthForShardAmount > 0) {
			require(weiPayout >= minEthForShardAmount);
		}

		require(weiPayout <= address(this).balance);

		_y = newY;
		_x = newX;

		IERC20(_shardRegistryAddress).transferFrom(msg.sender, address(this), shardAmount);

		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: weiPayout
		}("");
		require(success, "[sell] ETH transfer failed.");


	}

	function calcEthPayoutForSellShards (
		uint256 shardAmount
	) public view returns (uint256) {
		uint256 newX = _x.add(shardAmount);
		uint256 newY = _k.div(newX);
		uint256 weiPayout = _y.sub(newY);

		return weiPayout;
	}

	function calcShardPayoutForSellEth (
		uint256 ethAmount
	) public view returns (uint256) {
		uint256 newY = _y.add(ethAmount);
		uint256 newX = _k.div(newY);
		uint256 shardPayout = _x.sub(newX);

		return shardPayout;
	}

	function supplyShards(
		uint256 shardAmount
	) public {
		IERC20(_shardRegistryAddress).transferFrom(msg.sender, address(this), shardAmount);
		_mapSuppliedShards[msg.sender] += shardAmount;
		_totalSuppliedShards += shardAmount;
	}

	function supplyEther() public payable {
		_mapSuppliedEth[msg.sender] = msg.value;
		_totalSuppliedEth += msg.value;
	}

	function withdrawSuppliedShards(
		uint256 shardAmount
	) external {
		require(
			shardAmount <= _mapSuppliedShards[msg.sender],
			"Cannot withdraw more than deposited amount of shards"
			);

		uint256 shardsToSellOnMarket = 0;

		if (IERC20(_shardRegistryAddress).balanceOf(address(this)) < shardAmount) {
			shardsToSellOnMarket = shardAmount - IERC20(_shardRegistryAddress).balanceOf(address(this));
		}

		uint256 ethPayout = calcEthPayoutForSellShards(shardsToSellOnMarket);

		require(ethPayout <= address(this).balance);

		_totalSuppliedShards -= shardAmount;
		_mapSuppliedShards[msg.sender] -= shardAmount;

		IERC20(_shardRegistryAddress).transfer(msg.sender, shardAmount.sub(shardsToSellOnMarket));
		sellShards(shardsToSellOnMarket, 0);
	}

	function withdrawSuppliedEther(
		uint256 ethAmount
	) external {
		require(
			ethAmount <= _mapSuppliedEth[msg.sender],
			"Cannot withdraw more than deposited amount of eth"
			);

		uint256 ethToSellOnMarket = 0;

		if (address(this).balance < ethAmount) {
			ethToSellOnMarket = ethAmount.sub(address(this).balance);
		}

		uint256 shardPayout = calcShardPayoutForSellEth(ethToSellOnMarket);

		require(shardPayout <= IERC20(_shardRegistryAddress).balanceOf(address(this)));

		_totalSuppliedEth -= ethAmount;
		_mapSuppliedEth[msg.sender] -= ethAmount;

		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: ethAmount.sub(ethToSellOnMarket)
		}("");
		require(success, "[sell] ETH transfer failed.");
		// oh well need another buy shards with eth input for this function...
		buyShards(shardPayout);
	}

	function currentPrice() external view returns (uint) {
		return _y.div(_x);
	}
}
