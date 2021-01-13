// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../utils/CloneFactory.sol";
import "./BondingCurve.sol";

contract BondingCurveFactory is CloneFactory
{
    constructor()
    CloneFactory(address(new BondingCurve()))
    {}

    function deployBondingCurve()
    external payable returns (address instance)
    {
        instance = _clone();
    }
}
