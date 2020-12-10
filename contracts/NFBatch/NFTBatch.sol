// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

struct NFT
{
    address registry;
    uint256 tokenId;
}

contract NFTBatch is ERC721, IERC721Receiver
{
    using Counters for Counters.Counter;

    Counters.Counter          internal counter;
    bool                      internal onReceiveEnabled;
    mapping(uint256 => NFT[]) public   batchToTokenList;

    modifier withReceiver()
    {
        onReceiveEnabled = true;
        _;
        onReceiveEnabled = false;
    }

    constructor() ERC721("NFT Batchs as NFTs", "NFTBatch") {}

    function wrap(NFT[] calldata tokens)
    public withReceiver() returns (uint256)
    {
        counter.increment();
        uint256 id = counter.current();

        _mint(msg.sender, id);
        for (uint256 i = 0; i < tokens.length; ++i)
        {
            NFT memory token = tokens[i];
            IERC721(token.registry).safeTransferFrom(msg.sender, address(this), token.tokenId);
            batchToTokenList[id].push(token);
        }

        return id;
    }

    function unwrap(uint256 id, address to)
    public
    {
        require(msg.sender == ownerOf(id));

        _burn(id);
        NFT[] storage tokens = batchToTokenList[id];
        for (uint256 i = 0; i < tokens.length; ++i)
        {
            NFT memory token = tokens[i];
            IERC721(token.registry).safeTransferFrom(address(this), to, token.tokenId);
        }
        delete batchToTokenList[id];
    }

    function onERC721Received(address, address, uint256, bytes calldata)
    external view override returns (bytes4)
    {
        require(onReceiveEnabled);
        return IERC721Receiver.onERC721Received.selector;
    }
}
