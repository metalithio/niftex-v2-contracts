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

	// !TODO fee should be retrieved from another contract where NIFTEX DAO governs
	uint256 internal _feePctToSuppliers = 75; // 1 -> 1000 (1% is 100)
	uint256 internal _feePctToNiftex = 25; // 1 -> 1000 (0.25% is 25)

	// are these needed? all we do is add subtract
	// needed for fees?

	struct ethSuppliers {
		uint256 _totalSuppliedEthPlusFeesToSuppliers;
		uint256 _ethFeesToNiftex;
		mapping(address => uint256) _mappingEthLPTokens;
		uint256 _totalEthLPTokens;
	}

	struct shardSuppliers {
		uint256 _totalSuppliedShardsPlusFeesToSuppliers;
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
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = msg.value;
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = suppliedShards;

		_ethSuppliers._mappingEthLPTokens[msg.sender] = msg.value;
		_ethSuppliers._totalEthLPTokens = msg.value;

		_shardSuppliers._mappingShardLPTokens[msg.sender] = suppliedShards;
		_shardSuppliers._totalShardLPTokens = suppliedShards;

		emit Initialized(shardRegistryAddress, address(this));
	}

	function buyShards(
		uint256 shardAmount
	) public payable {
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiRequired = newY.sub(_y);
		uint256 weiRequiredBeforeNiftex = weiRequired.div(1000).times(uint256(1000).add(_feePctToSuppliers));
		uint256 weiRequiredAfterNiftex = weiRequired.div(1000).times(uint256(1000).add(_feePctToSuppliers).add(_feePctToNiftex));

		uint256 actualShardsBeforeNiftex = _x.sub(_k.div(_y.add(weiRequiredBeforeNiftex)));
		uint256 actualShardsAfterNiftex = _x.sub(_k.div(_y.add(weiRequiredAfterNiftex)));

		weiRequired = weiRequiredAfterNiftex;

		require(
			_shardRegistry.balanceOf(address(this)) >= actualShardsAfterNiftex,
			"1"
		);
		require(weiRequired <= msg.value, "2");
		require(msg.value >= weiRequired, "3");

		newX = _x.sub(actualShardsAfterNiftex);
		newY = _k.div(newY);

		_y = newY;
		_x = newX;

		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(actualShardsBeforeNiftex.sub(shardAmount));
		_shardSuppliers._shardFeesToNiftex = _shardSuppliers._shardFeesToNiftex.add(actualShardsAfterNiftex.sub(actualShardsBeforeNiftex));

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

		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(weiPayout.mul(_feePctToSuppliers).div(1000));
		_ethSuppliers._ethFeesToNiftex = _ethSuppliers._ethFeesToNiftex.add(weiPayout.mul(_feePctToNiftex).div(1000));

		weiPayout = weiPayout.mul(uint256(1000).sub(_feePctToNiftex).sub(_feePctToSuppliers)).div(1000);

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

	function calcEthPayoutForShardLP(uint256 shardAmount) public view returns (uint256) {
		uint256 newX = _x.add(shardAmount);
		uint256 newY = _k.div(newX);
		assert(newY > 0);
		assert(newX > 0);
		uint256 weiPayout = _y.sub(newY);

		return weiPayout;
	}

	function calcShardPayoutForEthLP(uint256 ethAmount) public view returns (uint256) {
		uint256 newY = _y.add(ethAmount);
		uint256 newX = _k.div(newY);
		assert(newY > 0);
		assert(newX > 0);
		uint256 shardPayout = _x.sub(newX);

		return shardPayout;
	}

	function calcNewShardLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingShardPool = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers;
		uint256 proportion = addedAmount.mul(1000).div(existingShardPool.add(addedAmount));
		uint256 newShardLPTokensToIssue = proportion.div(uint256(1000).sub(proportion)).mul(existingShardPool);
		return newShardLPTokensToIssue;
	}

	function calcNewEthLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingEthPool = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers;
		uint256 proportion = addedAmount.mul(1000).div(existingEthPool.add(addedAmount));
		uint256 newEthLPTokensToIssue = proportion.div(uint256(1000).sub(proportion)).mul(existingEthPool);
		return newEthLPTokensToIssue;
	}

	function supplyShards(uint256 shardAmount) external {
		require(_shardRegistry.transferFrom(msg.sender, address(this), shardAmount));

		uint256 newShardLPTokensToIssue = calcNewShardLPTokensToIssue(shardAmount);
		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].add(newShardLPTokensToIssue);
		_shardSuppliers._totalShardLPTokens = _shardSuppliers._totalShardLPTokens.add(newShardLPTokensToIssue);
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(shardAmount);

		emit ShardsSupplied(shardAmount, msg.sender);
	}

	function supplyEther() external payable {
		require(
			msg.value > 0,
			"[supplyEther] No ETH supplied in this transaction"
			);

		uint256 newEthLPTokensToIssue = calcNewEthLPTokensToIssue(msg.value);
		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].add(newEthLPTokensToIssue);
		_ethSuppliers._totalEthLPTokens = _ethSuppliers._totalEthLPTokens.add(newEthLPTokensToIssue);
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(msg.value);

		emit EtherSupplied(msg.value, msg.sender);
	}

	function withdrawSuppliedShards(uint256 shardAmount) external {
		uint256 maxShardsToWithdraw = _shardSuppliers._mappingShardLPTokens[msg.sender].div(_shardSuppliers._totalShardLPTokens).times(_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers);
		require(
			shardAmount <= maxShardsToWithdraw,
			"Cannot withdraw more than your current amount of shards in the pool"
		);

		uint256 shardsToSell;

		uint256 curveBalance = _shardRegistry.balanceOf(address(this));
		if (curveBalance < shardAmount) {
			shardsToSell = shardAmount.sub(curveBalance);
		}

		uint256 ethPayout = calcEthPayoutForShardLP(shardsToSell);

		// !WARNING are there edge cases where this could fail and the person is blocked from withdrawing?
		require(ethPayout <= address(this).balance);

		uint256 otherShardLPTokens = _shardSuppliers._totalShardLPTokens.sub(_shardSuppliers._mappingShardLPTokens[msg.sender]);
		uint256 remainingShardsOfCurrentLP = maxShardsToWithdraw.sub(shardAmount);
		uint256 remainingShardsOfOtherLPs = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.sub(maxShardsToWithdraw);
		uint256 newShardLPTokensOfCurrentLP = remainingShardsOfCurrentLP.div(remainingShardsOfOtherLPs).times(otherShardLPTokens);

		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.sub(shardAmount);
		_shardSuppliers._totalShardLPTokens = otherShardLPTokens.add(newShardLPTokensOfCurrentLP);
		_shardSuppliers._mappingShardLPTokens[msg.sender] = newShardLPTokensOfCurrentLP;

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
		uint256 maxEthToWithdraw = _ethSuppliers._mappingEthLPTokens[msg.sender].div(_ethSuppliers._totalEthLPTokens).times(_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers);

		require(
			ethAmount <= maxEthToWithdraw,
			"Cannot withdraw more than your current amount of eth in the pool"
		);

		uint256 ethToSellOnMarket;

		if (address(this).balance < ethAmount) {
			ethToSellOnMarket = ethAmount.sub(address(this).balance);
		}

		uint256 shardPayout = calcShardPayoutForEthLP(ethToSellOnMarket);

		require(shardPayout <= _shardRegistry.balanceOf(address(this)));

		uint256 otherEthLPTokens = _ethSuppliers._totalEthLPTokens.sub(_ethSuppliers._mappingEthLPTokens[msg.sender]);
		uint256 remainingEthOfCurrentLP = maxEthToWithdraw.sub(ethAmount);
		uint256 remainingEthOfOtherLPs = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.sub(maxEthToWithdraw);
		uint256 newEthLPTokensOfCurrentLP = remainingEthOfCurrentLP.div(remainingEthOfOtherLPs).times(otherEthLPTokens);

		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.sub(ethAmount);
		_ethSuppliers._totalEthLPTokens = otherEthLPTokens.add(newEthLPTokensOfCurrentLP);
		_ethSuppliers._mappingEthLPTokens[msg.sender] = newEthLPTokensOfCurrentLP;

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

	function getEthSuppliers() external view returns (uint256, uint256, uint256) {
		return (_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers, _ethSuppliers._totalEthLPTokens, _ethSuppliers._ethFeesToNiftex);
	}

	function getShardSuppliers() external view returns (uint256, uint256, uint256) {
		return (_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers, _shardSuppliers._totalShardLPTokens, _shardSuppliers._shardFeesToNiftex);
	}
}
