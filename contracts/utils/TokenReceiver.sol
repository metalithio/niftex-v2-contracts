// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

contract TokenReceiver
{
    event ERC721Received(address indexed token, address indexed operator, address indexed from, uint256 tokenId);
    event ERC777Received(address indexed token, address indexed operator, address indexed from, uint256 amount);
    event ERC1155Received(address indexed token, address indexed operator, address indexed from, uint256 id, uint256 value);

    // ERC721
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
    external returns (bytes4)
    {
        emit ERC721Received(msg.sender, operator, from, tokenId);
        return this.onERC721Received.selector;
    }

    // ERC777
    function tokensReceived(address operator, address from, address, uint256 amount, bytes calldata, bytes calldata)
    external
    {
        emit ERC777Received(msg.sender, operator, from, amount);
    }

    // ERC1155
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata)
    external returns(bytes4)
    {
        emit ERC1155Received(msg.sender, operator, from, id, value);
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address operator, address from, uint256[] calldata ids, uint256[] calldata values, bytes calldata)
    external returns(bytes4)
    {
        for (uint256 i = 0; i < ids.length; ++i) {
            emit ERC1155Received(msg.sender, operator, from, ids[i], values[i]);
        }
        return this.onERC1155BatchReceived.selector;
    }
}
