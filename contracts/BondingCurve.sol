/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

pragma solidity ^0.6.0;


contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _y;
	uint256 internal _x;
	uint256 internal _k;

	// are these needed? all we do is add subtract
	// needed for fees?

	struct ethSuppliers {
		uint256 _totalSuppliedEth;
		uint256 _ethFeesToSuppliers;
		uint256 _ethFeesToNiftex;
		mapping(address => uint256) _mappingEthLPTokens;
		uint256 _totalEthLPTokens;
	}

	struct shardSuppliers {
		uint256 _totalSuppliedShards;
		uint256 _shardFeesToSuppliers;
		uint256 _shardFeesToNiftex;
		mapping(address => uint256) _mappingShardLPTokens;
		uint256 _totalShardLPTokens;
	}

	ethSuppliers internal _ethSuppliers;
	shardSuppliers internal _shardSuppliers;
	
	IERC20 internal _shardRegistry;

	event Initialized(address, address);
	event ShardsBought(uint256, address);
	event ShardsSold(uint256, address);
	event ShardsSupplied(uint256, address);
	event EtherSupplied(uint256, address);
	event ShardsWithdrawn(uint256, uint256, address);
	event EtherWithdrawn(uint256, uint256, address);

	function initialize(
		uint256 unsoldShards,
		uint256 suppliedShards,
		address shardRegistryAddress,
		address owner,
		uint256 initialPriceInWei
	) public payable {
		require(
			msg.sender == owner,
			"[initialize] only owner can initialize"
		);

		require(
			msg.value > 0,
			"[initialize] requires ETH to bootstrap this bonding curve"
			);
		// assumes ERC20.approve
		// can also be used for WETH
		// wrap in require?
		_shardRegistry = IERC20(shardRegistryAddress);
		require(
			_shardRegistry.transferFrom(owner, address(this), suppliedShards),
			"[initialize] initialization token transfer failed"
		);
		_x = unsoldShards;
		_y = unsoldShards.mul(initialPriceInWei);
		assert(_x > 0);
		assert(_y > 0);
		_k = _x.mul(_y);
		_ethSuppliers._totalSuppliedEth = msg.value;
		_shardSuppliers._totalSuppliedShards = suppliedShards;

		_ethSuppliers._mappingEthLPTokens[msg.sender] = msg.value;
		_ethSuppliers._totalEthLPTokens = msg.value;

		_shardSuppliers._mappingShardLPTokens[msg.sender] = suppliedShards;
		_shardSuppliers._totalShardLPTokens = suppliedShards;
		
		emit Initialized(shardRegistryAddress, address(this));
	}

	function buyShards(
		uint256 shardAmount
	) public payable {
		require(
			_shardRegistry.balanceOf(address(this)) >= shardAmount,
			"1"
		);

		uint256 newX = _x.sub(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiRequired = newY.sub(_y);
		require(weiRequired <= msg.value, "2");
		require(msg.value >= weiRequired, "3");

		_y = newY;
		_x = newX;

		_shardRegistry.transfer(msg.sender, shardAmount);

		if (msg.value > weiRequired) {
			// !TODO guard against msg.sender being contract
			(bool success, ) = msg.sender.call{
				value: msg.value.sub(weiRequired)
			}("");
			require(success, "[buy] ETH transfer failed.");
		}

		emit ShardsBought(shardAmount, msg.sender);
	}

	function sellShards(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		require(_shardRegistry.balanceOf(msg.sender) >= shardAmount);

		uint256 newX = _x.add(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiPayout = _y.sub(newY);

		if (minEthForShardAmount > 0) {
			require(weiPayout >= minEthForShardAmount);
		}

		require(weiPayout <= address(this).balance);

		_y = newY;
		_x = newX;

		require(_shardRegistry.transferFrom(msg.sender, address(this), shardAmount));

		// !TODO guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: weiPayout
		}("");
		require(success, "[sell] ETH transfer failed.");

		emit ShardsSold(shardAmount, msg.sender);
	}

	function calcEthRequiredForShardBuy(uint256 shardAmount) public view returns (uint256) {
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);
		uint256 ethRequired = newY.sub(_y);

		return ethRequired;
	}

	function calcShardRequiredForEthSale(uint256 ethAmount) public view returns (uint256) {
		uint256 newY = _y.sub(ethAmount);
		uint256 newX = _k.div(newY);
		assert(newY > 0);
		assert(newX > 0);
		uint256 shardsRequired = newX.sub(_x);

		return shardsRequired;
	}

	function calcEthPayoutForShardSale(uint256 shardAmount) public view returns (uint256) {
		uint256 newX = _x.add(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);
		uint256 weiPayout = _y.sub(newY);

		return weiPayout;
	}

	function calcShardPayoutForEthSale(uint256 ethAmount) public view returns (uint256) {
		uint256 newY = _y.add(ethAmount);
		uint256 newX = _k.div(newY);
		assert(newY > 0);
		assert(newX > 0);
		uint256 shardPayout = _x.sub(newX);

		return shardPayout;
	}

	function supplyShards(uint256 shardAmount) external {
		require(_shardRegistry.transferFrom(msg.sender, address(this), shardAmount));

		_totalSuppliedShards = _totalSuppliedShards.add(shardAmount);

		emit ShardsSupplied(shardAmount, msg.sender);
	}

	function supplyEther() external payable {
		_totalSuppliedEth = _totalSuppliedEth.add(msg.value);

		emit EtherSupplied(msg.value, msg.sender);
	}

	function withdrawSuppliedShards(uint256 shardAmount) external {
		// require(
		// 	shardAmount <= _mapSuppliedShards[msg.sender],
		// 	"Cannot withdraw more than deposited amount of shards"
		// );

		uint256 shardsToSell;

		uint256 curveBalance = _shardRegistry.balanceOf(address(this));
		if (curveBalance < shardAmount) {
			shardsToSell = shardAmount.sub(curveBalance);
		}

		uint256 ethPayout = calcEthPayoutForShardSale(shardsToSell);

		// !WARNING are there edge cases where this could fail and the person is blocked from withdrawing?
		require(ethPayout <= address(this).balance);

		_totalSuppliedShards = _totalSuppliedShards.sub(shardAmount);
		_mapSuppliedShards[msg.sender] = _mapSuppliedShards[msg.sender].sub(shardAmount);

		// Adjust x/y to compensate for ether leaving the curve
		if (ethPayout > 0) {
			_y = _y.sub(ethPayout);
			_x = _k.div(_y);
		}

		assert(_y > 0);
		assert(_x > 0);

		uint256 shardsToTransfer = shardAmount.sub(shardsToSell);
		require(_shardRegistry.transfer(msg.sender, shardsToTransfer));
		(bool success, ) = msg.sender.call{
			value: ethPayout
		}("");
		require(success, "[buy] ETH transfer failed.");

		emit ShardsWithdrawn(shardsToTransfer, ethPayout, msg.sender);
	}

	function withdrawSuppliedEther(uint256 ethAmount) external {
		// require(
		// 	ethAmount <= _mapSuppliedEth[msg.sender],
		// 	"Cannot withdraw more than deposited amount of eth"
		// );

		uint256 ethToSellOnMarket;

		if (address(this).balance < ethAmount) {
			ethToSellOnMarket = ethAmount.sub(address(this).balance);
		}

		uint256 shardPayout = calcShardPayoutForEthSale(ethToSellOnMarket);

		require(shardPayout <= _shardRegistry.balanceOf(address(this)));

		_totalSuppliedEth -= ethAmount;
		_mapSuppliedEth[msg.sender] -= ethAmount;

		// Adjust x/y to compensate for ether leaving the curve
		if (shardPayout > 0) {
			_x = _x.sub(shardPayout);
			_y = _k.div(_x);
		}

		assert(_y > 0);
		assert(_x > 0);

		uint256 ethToSend = ethAmount.sub(ethToSellOnMarket);
		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: ethToSend
		}("");
		require(success, "[sell] ETH transfer failed.");
		require(_shardRegistry.transfer(msg.sender, shardPayout));

		emit EtherWithdrawn(ethToSend, shardPayout, msg.sender);
	}

	function getCurrentPrice() external view returns (uint256) {
		return _y.div(_x);
	}

	function getCurveCoordinates() external view returns (uint256, uint256, uint256) {
		return (_x, _y, _k);
	}

	function getTotalSuppliedEth() external view returns (uint256) {
		return _totalSuppliedEth;
	}

	function getTotalSuppliedShards() external view returns (uint256) {
		return _totalSuppliedShards;
	}
}
