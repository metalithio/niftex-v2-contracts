/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

// questions
// what is cheaper/better: saving contract to state or instantiating every time?
// should we store all assets of a type in one contract, or each their own?
// e.g. store NFTs in singleton or not, ETH raises in singleton or not

pragma solidity ^0.6.0;


contract ShardGovernor {

	uint private _fracId;
	ERC20Factory erc20Factory;
	UpfrontSaleFactory upfrontSaleFactory;
	BuyoutFactory buyoutFactory;

	struct Fractions {
		address[] nftRegistryAddresses;
		uint[][] tokenIds
		address ownerAddress
		address[][] artistWalletAddresses;
		address registryAddress;
		address upfrontSaleAddress;
		address[] buyouts;
	}

	mapping(uint => Fractions) fractionMapping;

	// pull niftexWalletAddress from constants

	constructor() {}

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
		bool shotgunDisabled,
	) public {
		// dynamically choose from fixed sale type: fixed price, auction, skip...
		address upfrontSaleAddress = upfrontSaleFactory.deploy(...);
		_fracId++;
		Fractions f = Fractions({
			nftRegistryAddresses: paramAddresses[0],
			tokenIds: paramNumbers[?],
			ownerAddress: paramAddresses[1][0],
			artistAddresses: paramAddresses[?],
			registryAddress: registryAddress,
			upfrontSaleAdddress: upfrontSaleAddress
		});
		fractionMapping[_fracId] = f;
	}

	// assumes no singleton for upfront sales
	function distributeShards(uint fracId, uint recipient) {
		f = fractionMapping[fracId];
		UpfrontSale s = UpfrontSale(f.upfrontSaleAddress);
		if (s.registryAddress == address(0)) {
			// should mint everything upfront to avoid user confusion
			// + automatically mint to niftex wallet/artists?
			ERC20 registry = erc20Factory.deploy(...);
			// deploy bonding curve too?
		} else {
			ERC20 registry = ERC20(f.registryAddress);
		}
		// mark as claimed in UpfrontSale
		uint shardAmount = s.getShardAmount(recipient);
		registry.mint(recipient, shardAmount);
	}

	// assumes approve
	// assumes governor does shard custody for buyout
	function newBuyout(uint fracId, address claimant) public payable {
		f = fractionMapping[fracId];
		ERC20 registry = ERC20(f.registryAddress);
		uint balance = registry.balanceOf(claimant);
		require(balance > 1% of supply);
		registry.transferFrom(claimant, address(this), balance);
		address buyoutAddress = buyoutFactory.deploy(...);
		f.buyouts.push(buyoutAddress);
	}

}
