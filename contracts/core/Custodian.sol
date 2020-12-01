/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";
import "./Executor.sol";


contract Custodian is ERC721Holder, ERC115Holder, Executor {

	///////////////////
	// APPROVAL PATTERN
	// Potential issues: more implementation/compatibility issues
	// Could be combined with free transfer pattern to cover all assets

	address[] private _nftRegistryAddresses;
	uint[] private assetType;
	mapping(address => uint[]) registryTokenIdMapping;
	// ERC1155-only
	mapping(address => uint[]) valueMapping;
	bytes[] memory data;

	function custody() {
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
			}
		}
	}
	///////////////////

	///////////////////
	// FREE TRANSFER + CUSTODY CHECK PATTERN
	// Potential issues: requires selector whitelist, more expensive

	address[] private _nftRegistryAddresses;
	uint[] private implementationType;
	mapping(address => uint[]) custodyAssets;


	function confirmCustody() {
		callableFunctions = paramContract.callableFunctions();
		for (uint x = 0; x < _nftRegistryAddresses.length; x++) {
			selector = callableFunctions[implementationType[x]];
			uint[] tokenIds = custodyAssets[_nftRegistryAddresses[x]];
			for (uint y = 0; y < tokenIds.length; y++) {
				bytes memory callData = abi.encodeWithSelector(selector, owner, tokenIds[y])
				(bool success, bytes memory returnData) = target.call.value(0)(callData);
			}
		}
	}

	///////////////////

	// can only be called in scenarios where NFT can leave contract i.e. after shotgun
	function release(
		address target,
		uint value,
		string memory signature, // what is this?
		bytes memory data
	) {
		require(buyoutSuccessful, "[Custodian] Conditions not met");
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
