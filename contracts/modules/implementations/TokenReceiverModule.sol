// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "../IModule.sol";

contract TokenReceiverModule is IModule, ERC165, IERC721Receiver, IERC777Recipient, IERC1155Receiver
{
    string public constant override name = type(TokenReceiverModule).name;

    constructor()
    {
        _registerInterface(type(IERC721Receiver).interfaceId);
        _registerInterface(type(IERC777Recipient).interfaceId);
        _registerInterface(type(IERC1155Receiver).interfaceId);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
    external override pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    function tokensReceived(address, address, address, uint256, bytes calldata, bytes calldata)
    external override pure
    {
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
    external override pure returns(bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
    external override pure returns(bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
