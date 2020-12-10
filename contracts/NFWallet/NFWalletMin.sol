// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract NFWalletMin is IERC721Receiver
{
    address public registry;

    constructor()
    {
        registry = address(0xdead);
    }

    receive()
    external payable
    {
        /* Emit event ? */
    }

    function initialize(address registry_)
    public
    {
        require(registry == address(0), "NFWalletMin: alrady initialized");
        registry = registry_;
    }

    function owner()
    public view returns (address)
    {
        return IERC721(registry).ownerOf(uint256(address(this)));
    }

    function execute(address to, uint256 value, bytes calldata data)
    public
    {
        require(msg.sender == owner(), "NFWalletMin: access restricted to NFT owner");
        (bool success, bytes memory returndata) = to.call{value: value}(data);
        require(success, string(returndata));
    }

    function delegate(address to, bytes calldata data)
    public
    {
        require(msg.sender == owner(), "NFWalletMin: access restricted to NFT owner");
        (bool success, bytes memory returndata) = to.delegatecall(data);
        require(success, string(returndata));
    }

    function onERC721Received(address, address, uint256, bytes calldata)
    external pure override returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}
