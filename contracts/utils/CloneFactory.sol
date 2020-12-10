// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./ERC1167.sol";

abstract contract CloneFactory
{
    address master;

    event NewInstance(address instance);

    constructor(address master_) { master = master_; }

    function _clone()
    internal returns (address instance)
    {
        instance = ERC1167.clone(master);
        emit NewInstance(instance);
    }

    function _clone2(bytes32 salt)
    internal returns (address instance)
    {
        instance = ERC1167.clone2(master, salt);
        emit NewInstance(instance);
    }
}
