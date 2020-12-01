/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155Holder.sol";


contract Executor {

	// pattern based on https://github.com/compound-finance/compound-protocol/blob/db12e09c10578f8b244848adccf6b8ae64479b7b/contracts/Timelock.sol
	function execute(
		address target,
		uint value,
		string memory signature, // what is this?
		bytes memory data
	) internal payable returns (bytes memory) {

		bytes memory callData;

		if (bytes(signature).length == 0) {
				callData = data;
		} else {
				callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
		}

		(bool success, bytes memory returnData) = target.call.value(value)(callData);
		require(success, "Transaction execution reverted.");

		// event

		return returnData;
	}

}
