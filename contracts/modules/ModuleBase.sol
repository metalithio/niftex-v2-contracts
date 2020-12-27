// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "../wallet/ShardedWallet.sol";
import "./IModule.sol";

abstract contract ModuleBase is IModule
{
    modifier onlyAuthorized(address wallet, address user)
    {
        require(ShardedWallet(payable(wallet)).governance().isAuthorized(wallet, user));
        _;
    }

    modifier onlyOwner(address wallet, address user)
    {
        require(ShardedWallet(payable(wallet)).owner() == user);
        _;
    }
}
