/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";
import "./Executor.sol";


contract Custodian is ERC721Holder, ERC115Holder, Executor {

	///////////////////
	// APPROVAL PATTERN
	// Benefits: loop transfer per registry, control, potential cost reduction for owner
	// Potential issues: more implementation/compatibility issues
	// Could be combined with free transfer pattern to cover all assets...
	// in which case confirmCustody() should only call the registries that transferToCustody()...
	// did not cover

	address[] private _nftRegistryAddresses;
	uint[] private _assetType;
	mapping(address => uint[]) _registryTokenIdMapping;
	// ERC1155-only
	mapping(address => uint[]) _valueMapping;
	bytes memory _data;

	address[] _nonStandardRegistries;
	uint _custodyStage;

	function transferToCustody() {
		require(_nftRegistryAddresses.length > 0);
		for (uint x = 0; x < _nftRegistryAddresses.length; x++) {
			uint[] tokenIds = registryTokenIdMapping[_nftRegistryAddresses[x]];
			if (assetType == 1) {
				for (uint y = 0; y < tokenIds.length; y++) {
						IERC721(_nftRegistryAddresses[x]).transferFrom(owner, address(this), tokenIds[y]);
				}
			} else if (assetType == 2) {
				uint[] values = valueMapping[_nftRegistryAddresses[x]];
				IERC1155(_nftRegistryAddresses[x]).safeBatchTransferFrom(
					owner,
					address(this),
					tokenIds,
					values,
					data[x]
				)
			} else if (assetType == 3) {
				// skip, this is a nonstandard asset - check ownership via confirmCustody()
			}
		}
		_custodyStage = 1;
	}
	///////////////////

	///////////////////
	// FREE TRANSFER + CUSTODY CHECK PATTERN
	// Benefits: implementation agnostic, confirm ownership of anything
	// Potential issues: requires selector whitelist, more expensive?

	address[] private _nftRegistryAddresses;
	uint[] private assetType;
	uint[] private implementationType;
	mapping(address => uint[]) registryTokenIdMapping;

	address[] _nonStandardRegistries;

	function confirmCustody() internal {
		require(
			_custodyStage == 1 ||
			_nftRegistryAddresses.length > 0 && _nftRegistryAddresses.length == _nonStandardRegistries.length
		);
		// get whitelist
		callableFunctions = constantsContract.callableFunctions();
		for (uint x = 0; x < _nonStandardRegistries.length; x++) {
			address registryAddress = _nonStandardRegistries[x];
			// the selector is an ownerOf-type function
			selector = callableFunctions[implementationType[x]];
			uint[] tokenIds = registryTokenIdMapping[registryAddress];
			for (uint y = 0; y < tokenIds.length; y++) {
				// reference https://ethereum.stackexchange.com/questions/88069/what-does-the-function-abi-encodewithselectorbytes4-selector-returns-by
				// THE ARGUMENT AND RETURN TYPE ARE STILL ASSUMED... won't work for ERC1155
				bytes memory callData = abi.encodeWithSelector(selector, tokenIds[y])
				(bool success, bytes memory returnData) = address(registryAddress).staticcall(callData);
				address owner = abi.decode(returnData, (address));
				assert(owner == address(this));
			}
		}
		_custodyStage = 2;
	}

	///////////////////

	// can only be called in scenarios where NFT can leave contract i.e. after shotgun
	function release(
		address target,
		uint value,
		string memory signature, // what is this?
		bytes memory data
	) {
		require(buyoutSuccessful || saleExpired, "[Custodian] Conditions not met");
		execute(target, value, signature, data);
	}

	function batchRelease(
		address[] targets,
		uint[] values,
		string[] memory signatures,
		bytes memory data
	) {
		require(buyoutSuccessful, "[Custodian] Conditions not met");
		for (uint x = 0; x < targets.length; x++) {
			execute(targets[x], values[x], signatures[x], data[x]);
		}
	}

	// more options:
	// targets = 1, all NFTs are from single registry
	// mass transfer function built into registry?
}
