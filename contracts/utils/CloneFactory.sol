// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./ERC1167.sol";

abstract contract CloneFactory
{
    address private _cloneFactoryMaster;

    event NewInstance(address instance);

    constructor(address master_) { _cloneFactoryMaster = master_; }

    function _clone()
    internal returns (address instance)
    {
        instance = ERC1167.clone(_cloneFactoryMaster);
        emit NewInstance(instance);
    }

    function _clone2(bytes32 salt)
    internal returns (address instance)
    {
        instance = ERC1167.clone2(_cloneFactoryMaster, salt);
        emit NewInstance(instance);
    }
}
