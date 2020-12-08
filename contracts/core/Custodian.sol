/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";
import "./Executor.sol";


contract Custodian is ERC721Holder, ERC115Holder, Executor {

	struct CustodySet {
		address[] nftRegistryAddresses,
		// 1: 721
		// 2: 1155
		// 3: nonstandard, requires confirmCustody()
		uint[][] tokenIds,
		uint[] assetTypes,
		uint[][] values, // 1155
		uint[] implementationTypes, // to find selector for nonstandard assets
		uint custodyStage // 1 = approve step done, 2 = completely done
	}

	mapping(uint => CustodySet) _setMapping;

	function newSet(
		uint fracId,
		address[] nftRegistryAddresses,
		uint[][] tokenIds,
		uint[] assetTypes,
		uint[][] values,
		uint[] implementationTypes
	) external {
		// require only governor
		_setMapping[fracId] = CustodySet(
			nftRegistryAddresses,
			tokenIds,
			assetTypes,
			values,
			implementationTypes
		});
	}

	///////////////////
	// APPROVAL PATTERN
	// Benefits: loop transfer per registry, control, potential cost reduction for owner
	// Potential issues: more implementation/compatibility issues
	// Could be combined with free transfer pattern to cover all assets...
	// in which case confirmCustody() should only call the registries that transferToCustody()...
	// did not cover

	function transferToCustody(uint fracId) {
		CustodySet c = setMapping[fracId];
		require(c.nftRegistryAddresses.length > 0);
		for (uint x = 0; x < c.nftRegistryAddresses.length; x++) {
			address registry = c.nftRegistryAddresses[x];
			uint[] tokenIds = c.tokenIds[x];
			if (assetType == 1) {
				for (uint y = 0; y < tokenIds.length; y++) {
						IERC721(registry).transferFrom(owner, address(this), tokenIds[x]);
				}
			} else if (assetType == 2) {
				IERC1155(registry).safeBatchTransferFrom(
					owner,
					address(this),
					tokenIds,
					c.values[x],
					"" // "data", arbitrary
				)
			} else if (assetType == 3) {
				// skip, this is a nonstandard asset - check ownership via confirmCustody()
			}
		}
		c.custodyStage = 1;
	}
	///////////////////

	///////////////////
	// FREE TRANSFER + CUSTODY CHECK PATTERN
	// Benefits: implementation agnostic, confirm ownership of anything
	// Potential issues: requires selector whitelist, more expensive?

	function confirmCustody(uint fracId) internal {
		CustodySet c = setMapping[fracId];
		require(
			c.custodyStage == 1 ||
			c.nftRegistryAddresses.length > 0 && c.nftRegistryAddresses.length == c.nonStandardRegistries.length
		);
		// get whitelist
		selectors = constantsContract.getSelectors();
		uint index;
		for (uint x = 0; x < c.assetTypes.length; x++) {
			if (c.assetTypes[x] == 3) {
				// the selector is an ownerOf-type function
				selector = selectors[c.implementationTypes[index]];
				index++;
				uint[] tokenIds = c.tokenIds[x];
				for (uint y = 0; y < tokenIds.length; y++) {
					// reference https://ethereum.stackexchange.com/questions/88069/what-does-the-function-abi-encodewithselectorbytes4-selector-returns-by
					// THE ARGUMENT AND RETURN TYPE ARE STILL ASSUMED... won't work for ERC1155
					bytes memory callData = abi.encodeWithSelector(selector, tokenIds[y])
					(bool success, bytes memory returnData) = address(registryAddress).staticcall(callData);
					address owner = abi.decode(returnData, (address));
					require(owner == address(this));
				}
			}
		}
		c.custodyStage = 2;
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

	function getCustodianStage(uint fracId) returns (uint) {
		return tokenIdMapping[fracId].custodyStage;
	}

	// more options:
	// targets = 1, all NFTs are from single registry
	// mass transfer function built into registry?
}
