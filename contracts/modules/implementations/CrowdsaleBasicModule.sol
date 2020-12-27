// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../ModuleBase.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract CrowdsaleBasicModule is IModule, ModuleBase
{
    string public constant override name = type(CrowdsaleBasicModule).name;

    function setup(address wallet, Allocation[] calldata mints)
    external onlyOwner(wallet, msg.sender)
    {
        require(ShardedWallet(payable(wallet)).totalSupply() == 0);
        ShardedWallet(payable(wallet)).moduleTransferOwnership(address(0));
        for (uint256 i = 0; i < mints.length; ++i)
        {
            ShardedWallet(payable(wallet)).moduleMint(mints[i].receiver, mints[i].amount);
        }
    }

    function retreive(address wallet)
    external
    {
        ShardedWallet(payable(wallet)).moduleBurn(msg.sender, Math.max(ShardedWallet(payable(wallet)).totalSupply(), 1));
        ShardedWallet(payable(wallet)).moduleTransferOwnership(msg.sender);
    }
}
