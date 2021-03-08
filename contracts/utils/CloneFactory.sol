// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";

abstract contract CloneFactory
{
    address immutable public template;

    event NewInstance(address instance);

    constructor(address template_) { template = template_; }

    function _clone()
    internal returns (address instance)
    {
        instance = Clones.clone(template);
        emit NewInstance(instance);
    }

    function _cloneDeterministic(bytes32 salt)
    internal returns (address instance)
    {
        instance = Clones.cloneDeterministic(template, salt);
        emit NewInstance(instance);
    }

    function _predictDeterministicAddress(bytes32 salt)
    internal view returns (address predicted)
    {
        predicted = Clones.predictDeterministicAddress(template, salt);
    }
}
