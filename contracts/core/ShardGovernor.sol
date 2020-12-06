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
		address[][] paramAddresses,
		// [][] tokenIds (per registry)
		// liqProviderCutInShards
		// artistCutInShards
		// pricePerShardInWei
		// shardAmountOffered
		// offeringDeadline
		// cap
		uint[][] paramNumbers
		string calldata name,
		string calldata symbol,
		bool buyoutDisabled,
	) public {
		address factory = IConstants(_constantsAddress).upfrontSaleFactoryAddress();
		// dynamically choose from fixed sale type: fixed price, auction, skip...
		address upfrontSaleAddress = IUpFrontSaleFactory(factory).deploy(...);
		_fracId++;
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
			buyoutDisabled: buyoutDisabled
		});;
	}

	// assumes no singleton for upfront sales
	function distributeShards(uint fracId, uint recipient) {
		f = fractionMapping[fracId];
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
