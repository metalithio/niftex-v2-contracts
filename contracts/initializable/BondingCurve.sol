/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../wallet/ShardedWallet.sol";
import "../governance/IGovernance.sol";


contract BondingCurve {

	using SafeMath for uint256;

	uint256 internal _x;
	uint256 internal _p; // last price per shard
	// !TODO fee should be retrieved from another contract where NIFTEX DAO governs

	// bytes32 public constant PCT_FEE_TO_NIFTEX    = bytes32(uint256(keccak256("PCT_FEE_TO_NIFTEX")) - 1);
	bytes32 public constant PCT_FEE_TO_NIFTEX    = 0x7145253e522281154ff5a4858195caf5383bff763db0241d79f1fb5c74db4f26;
	// bytes32 public constant PCT_FEE_TO_ARTIST    = bytes32(uint256(keccak256("PCT_FEE_TO_ARTIST")) - 1);
	bytes32 public constant PCT_FEE_TO_ARTIST    = 0x7a685f3ff12f1b7204575ecb08e31b2c40983b278bce2e1efb080f3673b0356d;
	// bytes32 public constant PCT_FEE_TO_SUPPLIERS = bytes32(uint256(keccak256("PCT_FEE_TO_SUPPLIERS")) - 1);
	bytes32 public constant PCT_FEE_TO_SUPPLIERS = 0x6de5efbdcfb6f45ae3d7205700e1e3fe90a2441758cdacb2730fe9e4c824340b;
	// bytes32 public constant PCT_MIN_PROVIDED_SHARDS      = bytes32(uint256(keccak256("PCT_MIN_PROVIDED_SHARDS")) - 1);
	bytes32 public constant PCT_MIN_PROVIDED_SHARDS = 0x2886806cfaeaffef9ad015d45f6f2b865c8f2e4478c1c1fa88f385940fd06a09;
	// bytes32 public constant LIQUIDITY_TIMELOCK   = bytes32(uint256(keccak256("LIQUIDITY_TIMELOCK")) - 1);
	bytes32 public constant LIQUIDITY_TIMELOCK   = 0x4babff57ebd34f251a515a845400ed950a51f0a64c92e803a3e144fc40623fa8;

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
		uint256 decimals;
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
		_shardedWalletDetails.decimals = ShardedWallet(payable(_shardedWalletDetails.wallet)).decimals();
		// can create the bonding curve without transferring shards.
		if (suppliedShards > 0) {
			ShardedWallet(payable(_shardedWalletDetails.wallet)).transferFrom(msg.sender, address(this), suppliedShards);
		}

		_x = suppliedShards;
		_p = initialPriceInWei;

		_shardSuppliers._mappingShardLPTokens[address(this)] = suppliedShards;
		_shardSuppliers._totalShardLPTokens = suppliedShards;
		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = suppliedShards;

		_ethSuppliers._mappingEthLPTokens[address(this)] = msg.value;
		_ethSuppliers._totalEthLPTokens = msg.value;
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = msg.value;

		emit Initialized(_shardedWalletDetails.wallet, address(this));
	}

	function getExternalFee(uint256 _feeToNiftex, uint256 _feeToArtist, bool _hasArtistWallet) internal pure returns (uint256) {
		uint256 externalFees = _feeToNiftex;
		if (_hasArtistWallet) {
			externalFees = externalFees.add(_feeToArtist);
		}

		return externalFees;
	}

	// no need to add default fallback non-payable function in Solidity 0.7.0
	// address(this).balance will only be updated via specified function in this contract

	function buyShards(
		uint256 shardAmount,
		uint256 maxEthForShardAmount
	) public payable {
		uint256 y = _x.mul(_p).div(10**_shardedWalletDetails.decimals);
		uint256 k = y.mul(_x);

		uint256[3] memory fees;
		{
			IGovernance governance = ShardedWallet(payable(_shardedWalletDetails.wallet)).governance();
			address owner = ShardedWallet(payable(_shardedWalletDetails.wallet)).owner();
			uint256 totalSupply = ShardedWallet(payable(_shardedWalletDetails.wallet)).totalSupply();
			require(_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers >= totalSupply.mul(governance.getConfig(_shardedWalletDetails.wallet, PCT_MIN_PROVIDED_SHARDS)).div(10**18));
			// pause if someone else reclaimed the ownership of shardedWallet
			require(owner == address(0) || governance.isModule(_shardedWalletDetails.wallet, owner));

			fees[0] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS);
			fees[1] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_NIFTEX);
			fees[2] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_ARTIST);
		}

		bool hasArtistWallet = ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() != address(0);

		uint256 shardAmountAfterFee = shardAmount.mul(
			uint256(10**18)
			.add(fees[0])
			.add(getExternalFee(fees[1], fees[2], hasArtistWallet))
		).div(10**18);

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

		_p = newYAfterFee.mul(10**_shardedWalletDetails.decimals).div(newXAfterFee);
		_x = _x.sub(shardAmount.mul(
			uint256(10**18)
			.add(getExternalFee(fees[1], fees[2], hasArtistWallet))
		).div(10**18));

		_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers.add(shardAmount.mul(fees[0]).div(10**18));
		_shardSuppliers._shardFeesToNiftex = _shardSuppliers._shardFeesToNiftex.add(shardAmount.mul(fees[1]).div(10**18));
		if (hasArtistWallet) {
			_shardSuppliers._shardFeesToArtist = _shardSuppliers._shardFeesToArtist.add(shardAmount.mul(fees[2]).div(10**18));
		}

		ShardedWallet(payable(_shardedWalletDetails.wallet)).transfer(msg.sender, shardAmount);

		if (msg.value > weiRequired) {
			Address.sendValue(msg.sender, msg.value.sub(weiRequired));
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

		uint256 y = _x.mul(_p).div(10**_shardedWalletDetails.decimals);
		uint256 k = y.mul(_x);

		IGovernance governance = ShardedWallet(payable(_shardedWalletDetails.wallet)).governance();
		address owner = ShardedWallet(payable(_shardedWalletDetails.wallet)).owner();

		// pause if someone else reclaimed the ownership of shardedWallet
		require(owner == address(0) || governance.isModule(_shardedWalletDetails.wallet, owner));

		uint256[3] memory fees;
		fees[0] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_SUPPLIERS);
		fees[1] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_NIFTEX);
		fees[2] = governance.getConfig(_shardedWalletDetails.wallet, PCT_FEE_TO_ARTIST);

		bool hasArtistWallet = ShardedWallet(payable(_shardedWalletDetails.wallet)).artistWallet() != address(0);

		uint256 newX = _x.add(shardAmount);
		uint256 newY = k.div(newX);
		assert(newY > 0);
		assert(newX > 0);

		uint256 weiPayout = y.sub(newY);

		require(
			weiPayout <= minEthForShardAmount
		);

		require(
			weiPayout <= address(this).balance.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist)
		);

		_x = newX;
		_p = newY.mul(10**_shardedWalletDetails.decimals).div(newX);

		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(weiPayout.mul(fees[0]).div(10**18));
		_ethSuppliers._ethFeesToNiftex = _ethSuppliers._ethFeesToNiftex.add(weiPayout.mul(fees[1]).div(10**18));
		if (hasArtistWallet) {
			_ethSuppliers._ethFeesToArtist = _ethSuppliers._ethFeesToArtist.add(weiPayout.mul(fees[2]).div(10**18));
		}

		require(ShardedWallet(payable(_shardedWalletDetails.wallet)).transferFrom(msg.sender, address(this), shardAmount));

		weiPayout = weiPayout.mul(uint256(10**18)
			.sub(fees[0])
			.sub(getExternalFee(fees[1], fees[2], hasArtistWallet))
		).div(10**18);

		Address.sendValue(msg.sender, weiPayout);

		emit ShardsSold(shardAmount, weiPayout, msg.sender);
	}

	function calcNewShardLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingShardPool = _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers;
		if (existingShardPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(10**18).div(existingShardPool.add(addedAmount));
		uint256 newShardLPTokensToIssue = proportion.mul(existingShardPool).div(uint256(10**18).sub(proportion));
		return newShardLPTokensToIssue;
	}

	function calcNewEthLPTokensToIssue(uint256 addedAmount) public view returns (uint256) {
		uint256 existingEthPool = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers;
		if (existingEthPool == 0) {
			return addedAmount;
		}
		uint256 proportion = addedAmount.mul(10**18).div(existingEthPool.add(addedAmount));
		uint256 newEthLPTokensToIssue = proportion.mul(existingEthPool).div(uint256(10**18).sub(proportion));
		return newEthLPTokensToIssue;
	}

	function calcShardsForEthSuppliers() public view returns (uint256) {
		if (ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist) < _shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers) {
			return 0;
		}

		return ShardedWallet(payable(_shardedWalletDetails.wallet)).balanceOf(address(this)).sub(_shardSuppliers._shardFeesToNiftex).sub(_shardSuppliers._shardFeesToArtist).sub(_shardSuppliers._totalSuppliedShardsPlusFeesToSuppliers);
	}

	function calcEthForShardSuppliers() public view returns (uint256) {
		if (address(this).balance.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist) < _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			return 0;
		}

		return address(this).balance.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist).sub(_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers);
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

		// ether to provide plus eth in pool should be less than y (_x*_p)
		require(
			(_x.mul(_p).div(10**_shardedWalletDetails.decimals)).sub(address(this).balance) >= 0
			);

		uint256 newEthLPTokensToIssue = calcNewEthLPTokensToIssue(msg.value);
		_ethSuppliers._mappingEthLPTokens[msg.sender] = _ethSuppliers._mappingEthLPTokens[msg.sender].add(newEthLPTokensToIssue);
		_ethSuppliers._totalEthLPTokens = _ethSuppliers._totalEthLPTokens.add(newEthLPTokensToIssue);
		_ethSuppliers._totalSuppliedEthPlusFeesToSuppliers = _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers.add(msg.value);

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
			Address.sendValue(msg.sender, ethPayout);
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
		if (address(this).balance.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist) <= _ethSuppliers._totalSuppliedEthPlusFeesToSuppliers) {
			ethToWithdraw = (address(this).balance.sub(_ethSuppliers._ethFeesToNiftex).sub(_ethSuppliers._ethFeesToArtist)).mul(ethLPTokensAmount).div(_ethSuppliers._totalEthLPTokens);
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

		Address.sendValue(msg.sender, ethToWithdraw);

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

		Address.sendValue(payable(recipient), ethFees);

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

	function decimals() public view returns (uint256) {
		return _shardedWalletDetails.decimals;
	}

	function getEthInPool() public view returns (uint256) {
		return address(this).balance;
	}
}
