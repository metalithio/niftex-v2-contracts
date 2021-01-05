/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;


contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _x;
	uint256 internal _p; // last price per shard

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
	event ShardsBought(uint256, uint256, address);
	event ShardsSold(uint256, uint256, address);
	event ShardsSupplied(uint256, address);
	event EtherSupplied(uint256, address);
	event ShardsWithdrawn(uint256, uint256, address);
	event EtherWithdrawn(uint256, uint256, address);
	event TransferEthLPTokens(address, address, uint256);
	event TransferShardLPTokens(address, address, uint256);

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
		// can create the bonding curve without transferring shards.
		if (suppliedShards > 0) {
			require(
				_shardRegistry.transferFrom(owner, address(this), suppliedShards),
				"[initialize] initialization token transfer failed"
			);
		}
		
		_x = unsoldShards;
		// !TODO should get 1e18 based on current IERC20 decimals instead of hardcoding here...
		_y = unsoldShards.mul(initialPriceInWei).div(1e18);
		assert(_x > 0);
		assert(_y > 0);
		_p = initialPriceInWei;
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = msg.value;
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = suppliedShards;

		_ethSuppliers._mappingEthLPTokens[msg.sender] = msg.value;
		_ethSuppliers._totalEthLPTokens = msg.value;

		_shardSuppliers._mappingShardLPTokens[msg.sender] = suppliedShards;
		_shardSuppliers._totalShardLPTokens = suppliedShards;

		emit Initialized(shardRegistryAddress, address(this));
	}

	// no need to add default fallback non-payable function in Solidity 0.7.0
	// address(this).balance will only be updated via specified function in this contract

	function buyShards(
		uint256 shardAmount,
		uint256 maxEthForShardAmount
	) public payable {
		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);

		uint256 shardAmountBeforeNiftexFee = shardAmount.mul(uint256(1000).add(_feePctToSuppliers)).div(1000);
		uint256 shardAmountAfterFee = shardAmount.mul(uint256(1000).add(_feePctToSuppliers).add(_feePctToNiftex)).div(1000);
		uint256 newXAfterFee = _x.sub(shardAmountAfterFee);
		uint256 newYAfterFee = k.div(newXAfterFee);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiRequired = newYAfterFee.sub(y);

		require(
			maxEthForShardAmount >= weiRequired,
			"[buyShards] maxEthForShardAmount is not enough to get desired amount of shards"
			);

		require(
			_shardRegistry.balanceOf(address(this)) >= shardAmountAfterFee,
			"[buyShards] not having enough shards in the curve"
		);

		require(
			weiRequired <= msg.value,
			"[buyShards] user not putting enough eth to buy shards"
		);

		uint256 newP = newXAfterFee.div(newYAfterFee);
		_p = newP;

		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(shardAmountBeforeNiftexFee.sub(shardAmount));
		_shardSuppliers._shardFeesToNiftex = _shardSuppliers._shardFeesToNiftex.add(shardAmountAfterFee.sub(shardAmountBeforeNiftexFee));

		_shardRegistry.transfer(msg.sender, shardAmount);

		if (msg.value > weiRequired) {
			// !TODO guard against msg.sender being contract
			(bool success, ) = msg.sender.call{
				value: msg.value.sub(weiRequired)
			}("");
			require(success, "[buy] ETH transfer failed.");
		}

		emit ShardsBought(shardAmount, weiRequired, msg.sender);
	}

	function sellShards(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		require(
			_shardRegistry.balanceOf(msg.sender) >= shardAmount,
			"[sellShards] user does not have enough balance to execute this trade"
		);

		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);

		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiPayout = _y.sub(newY);

		require(
			weiPayout >= minEthForShardAmount,
			"[sellShards] minEthForShardAmount is bigger than actual weiPayout"
		);

		require(weiPayout <= address(this).balance);

		_x = newX;
		_p = newX.div(newY);

		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(weiPayout.mul(_feePctToSuppliers).div(1000));
		_ethSuppliers._ethFeesToNiftex = _ethSuppliers._ethFeesToNiftex.add(weiPayout.mul(_feePctToNiftex).div(1000));

		require(_shardRegistry.transferFrom(msg.sender, address(this), shardAmount));

		weiPayout = weiPayout.mul(uint256(1000).sub(_feePctToNiftex).sub(_feePctToSuppliers)).div(1000);

		// !TODO guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: weiPayout
		}("");
		require(success, "[sell] ETH transfer failed.");

		emit ShardsSold(shardAmount, weiPayout, msg.sender);
	}

	function calcEthRequiredForShardBuy(uint256 shardAmount) public view returns (uint256) {
		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);
		uint256 newX = _x.sub(shardAmount);
		uint256 newY = k.div(newX);
		assert(newY > 0);
		assert(newX > 0);
		uint256 ethRequired = newY.sub(y);

		return ethRequired;
	}

	function calcShardRequiredForEthSale(uint256 ethAmount) public view returns (uint256) {
		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);
		uint256 newY = _y.sub(ethAmount);
		uint256 newX = k.div(newY);
		assert(newY > 0);
		assert(newX > 0);
		uint256 shardsRequired = newX.sub(_x);

		return shardsRequired;
	}

	function calcNewShardLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingShardPool = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers;
		if (existingShardPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(1000).div(existingShardPool.add(addedAmount));
		uint256 newShardLPTokensToIssue = proportion.div(uint256(1000).sub(proportion)).mul(existingShardPool);
		return newShardLPTokensToIssue;
	}

	function calcNewEthLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingEthPool = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers;
		if (existingEthPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(1000).div(existingEthPool.add(addedAmount));
		uint256 newEthLPTokensToIssue = proportion.div(uint256(1000).sub(proportion)).mul(existingEthPool);
		return newEthLPTokensToIssue;
	}

	function calcShardsForETHSuppliers() public view returns (uint256) {
		if (_shardRegistry.balanceOf(address(this)) < _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers) {
			return 0;
		} 

		return _shardRegistry.balanceOf(address(this)).sub(_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers);
	}

	function calcEthForShardSuppliers() public view returns (uint256) {
		if (address(this).balance < _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			return 0;
		}

		return address(this).balance.sub(_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers);
	}

	function supplyShards(uint256 shardAmount) external {
		require(
			_shardRegistry.transferFrom(msg.sender, address(this), shardAmount),
			"[supplyShards] Suppliers has not approved this contract or do not have enough shards"
		);

		uint256 newShardLPTokensToIssue = calcNewShardLPTokensToIssue(shardAmount);
		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].add(newShardLPTokensToIssue);
		_shardSuppliers._totalShardLPTokens = _shardSuppliers._totalShardLPTokens.add(newShardLPTokensToIssue);
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(shardAmount);

		_x = _x.add(shardAmount);

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

	function withdrawSuppliedShards(uint256 shardLPTokensAmount) external {
		require(
			_shardSuppliers._mappingShardLPTokens[msg.sender] >= shardLPTokensAmount,
			"[withdrawSuppliedShards] Cannot withdraw more than your amount of shardLPTokens"
			);

		uint256 shardsToWithdraw;
		if (_shardRegistry.balanceOf(address(this)) <= _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers) {
			shardsToWithdraw = _shardRegistry.balanceOf(address(this)).mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);
		} else {
			shardsToWithdraw = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);
		}

		uint256 ethPayout = calcEthForShardSuppliers().mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);

		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].sub(shardLPTokensAmount);
		_shardSuppliers._totalShardLPTokens = _shardSuppliers._totalShardLPTokens.sub(shardLPTokensAmount);
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.sub(shardsToWithdraw);


		//!TODO I am unsure if shard0 should sub actualShardsToWithdraw (based on current balance of bonding curve) or maxShardsToWithdraw (based on _totalSuppliedShardsPlusFeesToSuppliers)
		_x = _x.sub(shardsToWithdraw);

		require(
			_shardRegistry.transferFrom(address(this), msg.sender, shardsToWithdraw)
		);

		if (ethPayout > 0) {
			(bool success, ) = msg.sender.call{
				value: ethPayout
			}("");
			require(success, "[withdrawSuppliedShards] ETH transfer failed.");
		}

		emit ShardsWithdrawn(shardsToWithdraw, ethPayout, msg.sender);
	}

	function withdrawSuppliedEther(uint256 ethLPTokensAmount) external {
		require(
			_shardSuppliers._mappingEthLPTokens[msg.sender] >= ethLPTokensAmount,
			"[withdrawSuppliedEther] Cannot withdraw more than your amount of ethLPTokens"
			);

		uint256 ethToWithdraw;
		if (address(this).balance <= _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			ethToWithdraw = address(this).balance.mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);
		} else {
			ethToWithdraw = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);
		}

		uint256 shardPayout = calcShardsForEthSuppliers().mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);

		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].sub(ethLPTokensAmount);
		_ethSuppliers._totalEthLPTokens = _ethSuppliers._totalEthLPTokens.sub(ethLPTokensAmount);
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.sub(ethToWithdraw);

		if (shardPayout > 0) {
			_x = _x.sub(shardPayout);
		}
		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: ethToWithdraw
		}("");
		require(success, "[sell] ETH transfer failed.");

		if (shardPayout > 0) {
			require(
				_shardRegistry.transferFrom(address(this), msg.sender, shardPayout);
				);
		}
		
		emit EtherWithdrawn(ethToWithdraw, shardPayout, msg.sender);
	}

	function transferShardLPTokens(uint256 shardLPTokensAmount, address recipient) public view {
		require(
			_shardSuppliers._mappingShardLPTokens[msg.sender] >= shardLPTokensAmount,
			"[transferShardLPTokens] user does not own this many shardLPTokensAmount"
			);

		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].sub(shardLPTokensAmount);
		_shardSuppliers._mappingShardLPTokens[recipient] = _shardSuppliers._mappingShardLPTokens[recipient].add(shardLPTokensAmount);

		emit TransferShardLPTokens(msg.sender, recipient, shardLPTokensAmount);
	}

	function transferEthLPTokens(uint256 ethLPTokensAmount, address recipient) public view {
		require(
			_ethSuppliers._mappingEthLPTokens[msg.sender] >= ethLPTokensAmount,
			"[transferEthLPTokens] user does not own this many ethLPTokensAmount"
			);

		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].sub(ethLPTokensAmount);
		_ethSuppliers._mappingEthLPTokens[recipient] = _ethSuppliers._mappingEthLPTokens[recipient].add(ethLPTokensAmount);

		emit TransferEthLPTokens(msg.sender, recipient, ethLPTokensAmount);
	}

	function getCurrentPrice() external view returns (uint256) {
		return _p;
	}

	function getCurveCoordinates() external view returns (uint256, uint256) {
		return (_x, _p);
	}

	function getEthSuppliers() external view returns (uint256, uint256, uint256) {
		return (_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers, _ethSuppliers._totalEthLPTokens, _ethSuppliers._ethFeesToNiftex);
	}

	function getShardSuppliers() external view returns (uint256, uint256, uint256) {
		return (_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers, _shardSuppliers._totalShardLPTokens, _shardSuppliers._shardFeesToNiftex);
	}

	function getEthLPTokens(address owner) public view returns (uint256) {
		return _ethSuppliers._mappingEthLPTokens[owner];
	}

	function getShardLPTokens(address owner) public view returns (uint256) {
		return _shardSuppliers._mappingShardLPTokens[owner];
	}
 }
