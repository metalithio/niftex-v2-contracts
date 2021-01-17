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

    function setup(ShardedWallet wallet, Allocation[] calldata mints)
    external onlyOwner(wallet, msg.sender)
    {
        require(wallet.totalSupply() == 0);
        wallet.moduleTransferOwnership(address(0));
        for (uint256 i = 0; i < mints.length; ++i)
        {
            wallet.moduleMint(mints[i].receiver, mints[i].amount);
        }
    }
}
