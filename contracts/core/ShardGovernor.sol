/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// questions
// should we store all assets of a type in one contract, or each their own?
// e.g. store NFTs in singleton or not, ETH raises in singleton or not

pragma solidity ^0.6.0;

import "./interfaces/IERC20Factory.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IUpfrontSaleFactory.sol";
import "./interfaces/IUpfrontSale.sol";
import "./interfaces/IConstants.sol";
import "./interfaces/ICustodian.sol";

contract ShardGovernor {

	uint _fracId;

	struct Fractions {
		address[] nftRegistryAddresses;
		uint[][] tokenIds
		address ownerAddress
		address[][] artistWalletAddresses;
		address registryAddress;
		address upfrontSaleAddress;
		string name;
		string symbol;
		uint cap;
		bool buyoutDisabled;
	}

	mapping(uint => Fractions) _fractionMapping;

	address _constantsAddress;

	// pull niftexWalletAddress from constants
	constructor(constantsAddress) {
		_constantsAddress = constantsAddress;
	}

	function newShards(
		// [] nftRegistryAddresses
		// payable ownerAddress (?)
		// niftexWalletAddress
		// artistWalletAddress
		// factoryAddress
		// [] upfrontSaleParams
		address[][] paramAddresses,
		// [][] tokenIds (per registry)
		// liqProviderCutInShards
		// artistCutInShards
		// offeringDeadline
		// cap
		// upfrontSaleType
		// [] upfrontSaleParams -> pricePerShardInWei, shardAmountOffered
		uint[][] paramNumbers
		string calldata name,
		string calldata symbol,
		bool buyoutDisabled,
	) public {
		_fracId++;
		IConstants c = IConstants(_constantsAddress);
		// dynamically choose from fixed sale type: fixed price, auction, skip...
		address upfrontSaleAddress = IConstants(_constantsAddress).getUpfrontSaleContract(
			// upfront sale type
			// 1 - fixed price sale
			// 2 - skip - directly to bonding curve with arbitrary price
			// 3 - auction
			// 4 - etc
			paramNumbers[2][0]
		);
		IUpfrontSale(upfrontSaleAddress).newSale(
			fracId,
			paramAddresses[2], // upfrontSaleParams
			paramNumbers[3] // upfrontSaleParams
		);
		fractionMapping[_fracId] = Fractions({
			nftRegistryAddresses: paramAddresses[0],
			tokenIds: paramNumbers[?],
			ownerAddress: paramAddresses[1][0],
			artistAddresses: paramAddresses[?],
			registryAddress: registryAddress,
			upfrontSaleAdddress: upfrontSaleAddress,
			name: name,
			symbol: symbol,
			cap: paramNumbers[1][0],
			buyoutDisabled: buyoutDisabled,
			upfrontSaleType: paramNumbers[2][0] // does this need to be documented?
		});;
	}

	/* function windDownSale(fracId) {
		f = fractionMapping[fracId];
		(bool expired) = IUpfrontSale.hasExpired(fracId);
		require(expired);

	} */

	// assumes no singleton for upfront sales
	function distributeShards(uint fracId, uint recipient) {
		f = fractionMapping[fracId];
		require(IUpfrontSale(f.upfrontSaleAddress).isCompleted());
		if (f.registryAddress == address(0)) {
			// should mint everything upfront to avoid user confusion
			// + automatically mint to niftex wallet/artists?
			address factory = IConstants(_constantsAddress).erc20FactoryAddress();
			IERC20 registry = IERC20Factory(factory).deploy(
				f.name,
				f.symbol,
				f.cap,
				address(this) // desiredOwner
			);
			f.registryAddress = address(registry);
			// deploy bonding curve too?
		} else {
			IERC20 registry = IERC20(f.registryAddress);
		}
		// mark as claimed in UpfrontSale
		uint shardAmount = IUpfrontSale(f.upfrontSaleAddress).getShardAmount(recipient);
		registry.mint(recipient, shardAmount);
	}

	function getBuyoutParams(uint fracId) public view returns (address, uint, bool) {
		return (
			fractionMapping[fracId].registryAddress,
			fractionMapping[fracId].cap,
			fractionMapping[fracId].buyoutDisabled
		);
	}

}
