// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NFWalletMin
{
    IERC721 public registry;

    constructor()
    {
        registry = IERC721(address(0xdead));
    }

    receive()
    external payable
    {
        /* Emit event ? */
    }

    function owner()
    public view returns (address)
    {
        return registry.ownerOf(uint256(address(this)));
    }

    function initialize(address registry_)
    external virtual
    {
        require(address(registry) == address(0), "NFWalletMin: alrady initialized");
        registry = IERC721(registry_);
    }

    function execute(address to, uint256 value, bytes calldata data)
    external virtual
    {
        require(msg.sender == owner(), "NFWalletMin: access restricted to NFT owner");
        (bool success, bytes memory returndata) = to.call{value: value}(data);
        require(success, string(returndata));
    }

    function delegate(address to, bytes calldata data)
    external virtual
    {
        require(msg.sender == owner(), "NFWalletMin: access restricted to NFT owner");
        (bool success, bytes memory returndata) = to.delegatecall(data);
        require(success, string(returndata));
    }

    // ERC721
    function onERC721Received(address, address, uint256, bytes calldata)
    external pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    // ERC777
    function tokensReceived(address, address, address, uint256, bytes calldata, bytes calldata)
    external pure
    {}

    // ERC1155
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
    external pure returns(bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
    external pure returns(bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
