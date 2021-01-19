/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../wallet/ShardedWallet.sol";
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _x;
	uint256 internal _p; // last price per shard
	// !TODO fee should be retrieved from another contract where NIFTEX DAO governs
	uint256 internal _ethInPool = 0;

	bytes32 public constant PCT_FEE_TO_NIFTEX = bytes32(uint256(keccak256("PCT_FEE_TO_NIFTEX")) - 1);
	bytes32 public constant PCT_FEE_TO_ARTIST= bytes32(uint256(keccak256("PCT_FEE_TO_ARTIST")) - 1);
	bytes32 public constant PCT_FEE_TO_SUPPLIERS= bytes32(uint256(keccak256("PCT_FEE_TO_SUPPLIERS")) - 1);
	bytes32 public constant PCT_MIN_SHARD_0= bytes32(uint256(keccak256("PCT_MIN_SHARD_0")) - 1);
	bytes32 public constant LIQUIDITY_TIMELOCK= bytes32(uint256(keccak256("LIQUIDITY_TIMELOCK")) - 1);

	struct ethSuppliers {
		uint256 _totalSuppliedEthPlusFeesToSuppliers;
		uint256 _ethFeesToNiftex;
		uint256 _ethFeesToArtist;
		mapping(address => uint256) _mappingEthLPTokens;
		uint256 _totalEthLPTokens;
	}

	struct shardSuppliers {
		uint256 _totalSuppliedShardsPlusFeesToSuppliers;
		uint256 _shardFeesToNiftex;
		uint256 _shardFeesToArtist;
		mapping(address => uint256) _mappingShardLPTokens;
		uint256 _totalShardLPTokens;
	}

	struct shardedWalletDetails {
		address wallet;
		address recipient;
		uint256 timelockDeadline;
	}

	ethSuppliers internal _ethSuppliers;
	shardSuppliers internal _shardSuppliers;
	shardedWalletDetails internal _shardedWalletDetails;
	// uint256 internal _timelockDeadline;
	// address internal _recipient;
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
		uint256 suppliedShards,
		address wallet, // shardedWallet instance 
		address recipient, // recipient from crowdsale
		uint256 initialPriceInWei
	) public payable {
		// assumes ERC20.approve
		// can also be used for WETH
		// wrap in require?
		_shardedWalletDetails.wallet = wallet;
		_shardedWalletDetails.recipient = recipient;
		_shardedWalletDetails.timelockDeadline = block.timestamp.add(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, LIQUIDITY_TIMELOCK));
		// can create the bonding curve without transferring shards.
		if (suppliedShards > 0) {
			ShardedWallet(payable(_shardedWalletDetails.wallet)).transferFrom(msg.sender, address(this), suppliedShards);
		}
		
		_x = (ShardedWallet(payable(_shardedWalletDetails.wallet)).totalSupply().mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_MIN_SHARD_0)).div(10000)).add(suppliedShards);
		_p = initialPriceInWei;
		
		_shardSuppliers._mappingShardLPTokens[address(this)] = suppliedShards;
		_shardSuppliers._totalShardLPTokens = suppliedShards;
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = suppliedShards;

		_ethSuppliers._mappingEthLPTokens[address(this)] = msg.value;
		_ethSuppliers._totalEthLPTokens = msg.value;
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = msg.value;

		// in case selfdestruct happens, the ETH from selfdestruct will forever be stuck in the bonding curve
		_ethInPool = _ethInPool.add(msg.value);

		emit Initialized(_shardedWalletDetails.wallet, address(this));
	}

	function getExternalFee() internal view returns (uint256) {
		uint256 externalFees = ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_NIFTEX);
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() != address(0)) {
			externalFees = externalFees.add(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_ARTIST));
		} 

		return externalFees;
	}

	// no need to add default fallback non-payable function in Solidity 0.7.0
	// address(this).balance will only be updated via specified function in this contract

	function buyShards(
		uint256 shardAmount,
		uint256 maxEthForShardAmount
	) public payable {
		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);

		uint256 shardAmountAfterFee = shardAmount.mul(uint256(10000))
																						.add(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS))
																						.add(getExternalFee())
																						.div(10000);
		uint256 newXAfterFee = _x.sub(shardAmountAfterFee);
		uint256 newYAfterFee = k.div(newXAfterFee);
		assert(newXAfterFee > 0);
		assert(newYAfterFee > 0);

		uint256 weiRequired = newYAfterFee.sub(y);

		require(
			maxEthForShardAmount >= weiRequired
			);

		require(
			ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist) >= shardAmountAfterFee
		);

		require(
			weiRequired <= msg.value
		);

		newXAfterFee = _x.sub(shardAmount);
		// newYAfterFee = k.div(newXAfterFee);

		_p = newYAfterFee.mul(1e18).div(newXAfterFee);
		_x = _x.sub(shardAmount.mul(
			uint256(10000)
			.add(getExternalFee())
		).div(10000));

		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(shardAmount.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS)).div(10000));
		_shardSuppliers._shardFeesToNiftex = _shardSuppliers._shardFeesToNiftex.add(shardAmount.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_NIFTEX)).div(10000));
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() != address(0)) {
			_shardSuppliers._shardFeesToArtist = _shardSuppliers._shardFeesToArtist.add(shardAmount.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_ARTIST)).div(10000));
		}
		

		_ethInPool = _ethInPool.add(weiRequired);

		ShardedWallet(payable(_shardedWalletDetails.wallet)).transfer(msg.sender, shardAmount);

		if (msg.value > weiRequired) {
			// !TODO guard against msg.sender being contract
			(bool success, ) = msg.sender.call{
				value: msg.value.sub(weiRequired)
			}("");
			require(success);
		}

		emit ShardsBought(shardAmount, weiRequired, msg.sender);
	}

	function sellShards(
		uint256 shardAmount,
		uint256 minEthForShardAmount
	) public {
		require(
			ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(msg.sender) >= shardAmount
		);

		uint256 y = _x.mul(_p).div(1e18);
		uint256 k = y.mul(_x);

		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiPayout = y.sub(newY);

		require(
			weiPayout <= minEthForShardAmount
		);

		require(
			weiPayout <= _ethInPool.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist)
		);

		_x = newX;
		_p = newY.mul(1e18).div(newX);

		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(weiPayout.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS)).div(10000));
		_ethSuppliers._ethFeesToNiftex = _ethSuppliers._ethFeesToNiftex.add(weiPayout.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_NIFTEX)).div(10000));
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() != address(0)) {
			_ethSuppliers._ethFeesToArtist = _ethSuppliers._ethFeesToArtist.add(weiPayout.mul(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_ARTIST)).div(10000));
		}
		

		_ethInPool = _ethInPool.sub(weiPayout);
		require(ShardedWallet(payable(_shardedWalletDetails.wallet)).transferFrom(msg.sender, address(this), shardAmount));

		weiPayout = weiPayout.mul(uint256(10000)
			.sub(ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS))
			.sub(getExternalFee())
		).div(10000);

		// !TODO guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: weiPayout
		}("");
		require(success);

		emit ShardsSold(shardAmount, weiPayout, msg.sender);
	}

	function calcNewShardLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingShardPool = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers;
		if (existingShardPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(10000).div(existingShardPool.add(addedAmount));
		uint256 newShardLPTokensToIssue = proportion.mul(existingShardPool).div(uint256(10000).sub(proportion));
		return newShardLPTokensToIssue;
	}

	function calcNewEthLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingEthPool = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers;
		if (existingEthPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(10000).div(existingEthPool.add(addedAmount));
		uint256 newEthLPTokensToIssue = proportion.mul(existingEthPool).div(uint256(10000).sub(proportion));
		return newEthLPTokensToIssue;
	}

	function calcShardsForEthSuppliers() public view returns (uint256) {
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist) < _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers) {
			return 0;
		} 

		return ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist).sub(_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers);
	}

	function calcEthForShardSuppliers() public view returns (uint256) {
		if (_ethInPool.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist) < _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			return 0;
		}

		return _ethInPool.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist).sub(_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers);
	}

	function supplyShards(uint256 shardAmount) external {
		require(
			ShardedWallet(payable(_shardedWalletDetails.wallet)).transferFrom(msg.sender, address(this), shardAmount)
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
			msg.value > 0
			);

		uint256 newEthLPTokensToIssue = calcNewEthLPTokensToIssue(msg.value);
		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].add(newEthLPTokensToIssue);
		_ethSuppliers._totalEthLPTokens = _ethSuppliers._totalEthLPTokens.add(newEthLPTokensToIssue);
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(msg.value);

		_ethInPool = _ethInPool.add(msg.value);

		emit EtherSupplied(msg.value, msg.sender);
	}

	function withdrawSuppliedShards(uint256 shardLPTokensAmount) external returns (uint256, uint256) {
		require(
			shardLPTokensAmount > 0
		);

		require(
			_shardSuppliers._mappingShardLPTokens[msg.sender] >= shardLPTokensAmount
			);

		uint256 shardsToWithdraw;
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist) <= _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers) {
			shardsToWithdraw = (ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist)).mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);
		} else {
			shardsToWithdraw = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);
		}

		uint256 ethPayout = calcEthForShardSuppliers().mul(shardLPTokensAmount).div(_shardSuppliers._totalShardLPTokens);

		//!TODO I am unsure if shard0 should sub actualShardsToWithdraw (based on current balance of bonding curve) or maxShardsToWithdraw (based on _totalSuppliedShardsPlusFeesToSuppliers)
		_x = _x.sub(shardsToWithdraw);

		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].sub(shardLPTokensAmount);
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.mul(_shardSuppliers._totalShardLPTokens.sub(shardLPTokensAmount)).div(_shardSuppliers._totalShardLPTokens);
		_shardSuppliers._totalShardLPTokens = _shardSuppliers._totalShardLPTokens.sub(shardLPTokensAmount);

	
		ShardedWallet(payable(_shardedWalletDetails.wallet)).transfer(msg.sender, shardsToWithdraw);

		if (ethPayout > 0) {
			_ethInPool = _ethInPool.sub(ethPayout);
			(bool success, ) = msg.sender.call{
				value: ethPayout
			}("");
			require(success);
		}

		emit ShardsWithdrawn(ethPayout, shardsToWithdraw, msg.sender);

		return (ethPayout, shardsToWithdraw);
	}

	function withdrawSuppliedEther(uint256 ethLPTokensAmount) external returns (uint256, uint256) {
		require(
			ethLPTokensAmount > 0
		);

		require(
			_ethSuppliers._mappingEthLPTokens[msg.sender] >= ethLPTokensAmount
			);

		uint256 ethToWithdraw;
		if (_ethInPool.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist) <= _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			ethToWithdraw = (_ethInPool.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist)).mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);
		} else {
			ethToWithdraw = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);
		}

		uint256 shardPayout = calcShardsForEthSuppliers().mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);

		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].sub(ethLPTokensAmount);
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.mul(_ethSuppliers._totalEthLPTokens.sub(ethLPTokensAmount)).div(_ethSuppliers._totalEthLPTokens);
		_ethSuppliers._totalEthLPTokens = _ethSuppliers._totalEthLPTokens.sub(ethLPTokensAmount);
		if (shardPayout > 0) {
			_x = _x.sub(shardPayout);
		}

		_ethInPool = _ethInPool.sub(ethToWithdraw);
		// guard against msg.sender being contract
		(bool success, ) = msg.sender.call{
			value: ethToWithdraw
		}("");
		require(success);

		if (shardPayout > 0) {
			ShardedWallet(payable(_shardedWalletDetails.wallet)).transfer(msg.sender, shardPayout);
		}
		
		emit EtherWithdrawn(ethToWithdraw, shardPayout, msg.sender);

		return (ethToWithdraw, shardPayout);
	}

	function transferShardLPTokens(uint256 shardLPTokensAmount, address recipient) public {
		require(
			_shardSuppliers._mappingShardLPTokens[msg.sender] >= shardLPTokensAmount
			);

		_shardSuppliers._mappingShardLPTokens[msg.sender] = _shardSuppliers._mappingShardLPTokens[msg.sender].sub(shardLPTokensAmount);
		_shardSuppliers._mappingShardLPTokens[recipient] = _shardSuppliers._mappingShardLPTokens[recipient].add(shardLPTokensAmount);

		emit TransferShardLPTokens(msg.sender, recipient, shardLPTokensAmount);
	}

	function transferEthLPTokens(uint256 ethLPTokensAmount, address recipient) public {
		require(
			_ethSuppliers._mappingEthLPTokens[msg.sender] >= ethLPTokensAmount
		);

		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].sub(ethLPTokensAmount);
		_ethSuppliers._mappingEthLPTokens[recipient] = _ethSuppliers._mappingEthLPTokens[recipient].add(ethLPTokensAmount);

		emit TransferEthLPTokens(msg.sender, recipient, ethLPTokensAmount);
	}

	function withdrawNiftexOrArtistFees(address recipient) public {
		require(
			msg.sender == ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() ||
			msg.sender == ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getNiftexWallet()
		);

		uint256 shardFees;
		uint256 ethFees;

		if (msg.sender == ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet()) {
			shardFees = _shardSuppliers._shardFeesToArtist;
			ethFees = _ethSuppliers._ethFeesToArtist;

			_shardSuppliers._shardFeesToArtist = 0;
			_ethSuppliers._ethFeesToArtist = 0;
		} else if (msg.sender == ShardedWallet(payable(_shardedWalletDetails.wallet)).governance().getNiftexWallet()) {
			shardFees = _shardSuppliers._shardFeesToNiftex;
			ethFees = _ethSuppliers._ethFeesToNiftex;

			_shardSuppliers._shardFeesToNiftex = 0;
			_ethSuppliers._ethFeesToNiftex = 0;
		}

		_ethInPool = _ethInPool.sub(ethFees);
		(bool success, ) = address(recipient).call{
			value: ethFees
		}("");
		require(success);

		ShardedWallet(payable(_shardedWalletDetails.wallet)).transfer(recipient, shardFees);
	}

	function transferTimelockLiquidity(address recipient) public {
		require(_shardedWalletDetails.recipient == msg.sender && block.timestamp > _shardedWalletDetails.timelockDeadline);
		require(_shardSuppliers._mappingShardLPTokens[address(this)] > 0 || _ethSuppliers._mappingEthLPTokens[address(this)] >0);

		_shardSuppliers._mappingShardLPTokens[recipient] = _shardSuppliers._mappingShardLPTokens[recipient].add(_shardSuppliers._mappingShardLPTokens[address(this)]);
		_ethSuppliers._mappingEthLPTokens[recipient] = _ethSuppliers._mappingEthLPTokens[recipient].add(_ethSuppliers._mappingEthLPTokens[address(this)]);

		_shardSuppliers._mappingShardLPTokens[address(this)] = 0;
		_ethSuppliers._mappingEthLPTokens[address(this)] = 0;
	}

	function getCurrentPrice() external view returns (uint256) {
		return _p;
	}

	function getCurveCoordinates() external view returns (uint256, uint256) {
		return (_x, _p);
	}

	function getEthSuppliers() external view returns (uint256, uint256, uint256, uint256) {
		return (_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers, _ethSuppliers._totalEthLPTokens, _ethSuppliers._ethFeesToNiftex, _ethSuppliers._ethFeesToArtist);
	}

	function getShardSuppliers() external view returns (uint256, uint256, uint256, uint256) {
		return (_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers, _shardSuppliers._totalShardLPTokens, _shardSuppliers._shardFeesToNiftex, _shardSuppliers._shardFeesToArtist);
	}

	function getEthLPTokens(address owner) public view returns (uint256) {
		return _ethSuppliers._mappingEthLPTokens[owner];
	}

	function getShardLPTokens(address owner) public view returns (uint256) {
		return _shardSuppliers._mappingShardLPTokens[owner];
	}

	function getEthInPool() public view returns (uint256) {
		return _ethInPool;
	}
}
