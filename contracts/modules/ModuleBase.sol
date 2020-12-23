// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "../ShardedWallet.sol";

abstract contract ModuleBase
{
    modifier onlyAuthorized(address wallet, address user)
    {
        require(ShardedWallet(wallet).governance().isAuthorized(wallet, user));
        _;
    }

    modifier onlyOwner(address wallet, address user)
    {
        require(ShardedWallet(wallet).owner() == user);
        _;
    }
}
