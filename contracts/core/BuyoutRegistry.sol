/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IConstants.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IShardGovernor.sol";


contract BuyoutRegistry {

	using SafeMath for uint256;

	enum BuyoutStatus { Pending, Completed }
	enum BuyoutWinner { None, Claimant, Counterclaimant }

	struct Buyout {
		address initialClaimantAddress,
		uint initialClaimantBalance,
		uint fracId,
		uint initialOfferInWei,
		uint pricePerShardInWei,
		uint deadlineTimestamp,
		BuyoutStatus status,
		BuyoutWinner winner,
		uint counterWeiContributed,
		address[] counterclaimants,
		mapping(address => uint) counterclaimContribs
	}

	address _constantsAddress;

	mapping(uint => Buyout[]) _buyoutMapping;

	constructor(
		address constantsAddress
	) public payable {
		_constantsAddress = constantsAddress;
		// constants: buyout duration, threshold for triggering buyout
		// get balance and require above threshold
	}

	function newBuyout(
		uint fracId,
		address initialClaimantAddress,
	) payable {
		(
			address governor,
			uint balanceThreshold,
			address custodian,
			uint buyoutDuration
		) = IConstants(_constantsAddress).getBuyoutParams();

		(
			address registry,
			uint cap,
			bool buyoutDisabled
		) = IShardGovernor(governor).getBuyoutParams(fracId);

		require(!buyoutDisabled);

		Buyout b = getLatestBuyout(fracId);
		require(b.status == BuyoutStatus.Completed);

		IERC20 registry = IERC20(registry);
		uint balance = registry.balanceOf(initialClaimantAddress);

		require(balance >= balanceThreshold);

		registry.transferFrom(claimant, custodian, balance);
		_buyoutMapping[fracId].push(Buyout({
			fracId: fracId,
			initialClaimantBalance: balance,
			initialClaimantAddress: initialClaimantAddress,
			initialOfferInWei: msg.value,
			pricePerShardInWei:  = (msg.value.mul(10**18)).div(cap.sub(balance));
			deadlineTimestamp: block.timestamp.add(1 * duration days);
			status: BuyoutStatus.Pending,
			winner: BuyoutWinner.none
		}));
	}

	// have to make sure the data IN the mapping gets changed
	function getLatestBuyout(fracId) returns (Buyout) {
		uint length = _buyoutMapping[fracId].length
		return buyoutMapping[fracId][length - 1];
	}

	function counterCommitEther(uint fracId, address contributor) {
		Buyout b = getLatestBuyout(fracId);
		if (b.counterclaimContribs[contributor] == 0) {
			b.counterclaimants.push(contributor);s
		}
		b.counterclaimContribs[contributor] = b.counterclaimContribs[contributor].add(msg.value);
		b.counterWeiContributed = b.counterWeiContributed.add(msg.value);
		if (b.counterWeiContributed == getRequireedWeiForCOunterclaim()) {
			b.claimWinner = BuyoutWinner.CounterClaimant;
			b.claimStatus = BuyoutStatus.Completed;
		}
	}

	// ...

}
