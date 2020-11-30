/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// SPDX-License-Identifier: AGPL-3.0-or-later

// SPDX-License-Identifier: MIT


/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow
 * checks.
 *
 * Arithmetic operations in Solidity wrap on overflow. This can easily result
 * in bugs, because programmers usually assume that an overflow raises an
 * error, which is the standard behavior in high level programming languages.
 * `SafeMath` restores this intuition by reverting the transaction when an
 * operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     *
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     *
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     *
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     *
     * - Multiplication cannot overflow.
     */
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts with custom message on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b > 0, errorMessage);
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mod(a, b, "SafeMath: modulo by zero");
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts with custom message when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b != 0, errorMessage);
        return a % b;
    }
}
// SPDX-License-Identifier: MIT


/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

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
