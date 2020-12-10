// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../utils/CloneFactory.sol";
import "./NFWalletMin.sol";

contract NFWalletMinFactory is CloneFactory, ERC721
{
    constructor()
    ERC721("Minimal Non Fungible Wallet", "mNFW")
    CloneFactory(address(new NFWalletMin()))
    {}

    function mintWallet(address to) public returns (address instance)
    {
        instance = _clone();
        _mint(to, uint256(instance));
    }
}
