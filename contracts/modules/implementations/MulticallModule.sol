// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../ModuleBase.sol";

contract MulticallModule is IModule, ModuleBase
{
    string constant public override name = type(MulticallModule).name;

    function batch(address wallet, address[] calldata to, uint256[] calldata value, bytes[] calldata data)
    external onlyOwner(wallet, msg.sender)
    {
        require(to.length == value.length);
        require(to.length == data.length);
        for (uint256 i = 0; i < to.length; ++i)
        {
            ShardedWallet(payable(wallet)).moduleExecute(to[i], value[i], data[i]);
        }
    }
}
