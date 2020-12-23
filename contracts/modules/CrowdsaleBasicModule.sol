// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "./ModuleBase.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract CrowdsaleBasicModule is ModuleBase
{
    function setup(address wallet, Allocation[] calldata mints)
    external onlyOwner(wallet, msg.sender)
    {
        require(ShardedWallet(wallet).totalSupply() == 0);
        ShardedWallet(wallet).moduleTransferOwnership(address(0));
        for (uint256 i = 0; i < mints.length; ++i)
        {
            ShardedWallet(wallet).moduleMint(mints[i].receiver, mints[i].amount);
        }
    }

    function retreive(address wallet)
    external
    {
        ShardedWallet(wallet).moduleBurn(msg.sender, Math.max(ShardedWallet(wallet).totalSupply(), 1));
        ShardedWallet(wallet).moduleTransferOwnership(msg.sender);
    }
}
