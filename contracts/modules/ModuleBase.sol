// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../utils/Multicall.sol";
import "../wallet/ShardedWallet.sol";
import "./IModule.sol";

abstract contract ModuleBase is IModule, Multicall
{
    address immutable public walletTemplate;

    constructor(address walletTemplate_)
    {
        walletTemplate = walletTemplate_;
    }

    modifier onlyShardedWallet(ShardedWallet wallet)
    {
        require(isClone(walletTemplate, address(wallet)));
        _;
    }

    modifier onlyAuthorized(ShardedWallet wallet, address user)
    {
        require(wallet.governance().isAuthorized(address(wallet), user));
        _;
    }

    modifier onlyOwner(ShardedWallet wallet, address user)
    {
        require(wallet.owner() == user);
        _;
    }

    function isClone(address target, address query)
    internal view returns (bool result)
    {
        bytes20 targetBytes = bytes20(target);
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x363d3d373d3d3d363d7300000000000000000000000000000000000000000000)
            mstore(add(clone, 0xa), targetBytes)
            mstore(add(clone, 0x1e), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)

            let other := add(clone, 0x40)
            extcodecopy(query, other, 0, 0x2d)
            result := and(
                eq(mload(clone), mload(other)),
                eq(mload(add(clone, 0xd)), mload(add(other, 0xd)))
            )
        }
    }
}
