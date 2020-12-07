/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "./interfaces/IConstants.sol";


contract FixedPriceSale {

	using SafeMath for uint256;

	struct Sale {
		uint deadline,
		uint pricePerShardInWei,
		uint shardAmountOffered
		uint contributionTargetInWei,
		uint totalWeiContributed
		mapping(address => uint) private contributionsinWei,
		bool isCompleted
	}

	mapping(uint => Sale) saleMapping;

	constructor() {}

	function newSale(uint fracId, address[] addressParams, uint[] uintParams) {
		uint duration = IConstants(_constantsAddress).getSaleDuration(1);
		saleMapping[fracId] = Sale({
			deadline: block.timestamp.add(1 * duration days),
			pricePerShardInWei: uintParams[0],
			shardAmountOffered: uintParams[1],
			contributionTargetInWei: (pricePerShardInWei.mul(shardAmountOffered)).div(10**18)
		});
	}

	function contribute(uint fracId) external payable {
		Sale s = saleMapping[fracId];
		// ...
		s.isCompleted = true;
	}

	function hasExpired(uint fracId) public returns (bool, Sale) {
		Sale s = saleMapping[fracId];
		uint contribution = s.contributionsInWei[contributor];
		if (block.timestamp > s.deadline && s.totalWeiContributed < s.contributionTargetInWei) {
			return (true, s);
		}
		return (false, s);
	}

	function refund(uint fracId, address contributor) {
		(bool expired, Sale s) = hasExpired(fracId);
		require(expired);
		uint contribution s.contributionsinWei[contributor];
		require(contribution > 0);
		// make sure this changes in mapping
		s.contributionsInWei[contributor] = 0;
		(bool success, ) = contributor.call.value(contribution)("");
		require(success, "[contribute] Transfer failed.");
	}

}
