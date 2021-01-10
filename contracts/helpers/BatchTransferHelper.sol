// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract BatchTransferHelper
{
    function batchTransferERC721(
        address to,
        address[] calldata registries,
        uint256[] calldata ids)
    external
    {
        require(registries.length == ids.length);
        for (uint256 i = 0; i < registries.length; ++i)
        {
            IERC721(registries[i]).transferFrom(msg.sender, to, ids[i]);
        }
    }

    function batchTransferERC1155(
        address to,
        address[]   calldata registries,
        uint256[][] calldata ids,
        uint256[][] calldata amounts,
        bytes[]     calldata data)
    external
    {
        require(registries.length == ids.length);
        require(registries.length == amounts.length);
        require(registries.length == data.length);
        for (uint256 i = 0; i < registries.length; ++i)
        {
            IERC1155(registries[i]).safeBatchTransferFrom(msg.sender, to, ids[i], amounts[i], data[i]);
        }
    }

}
