// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../../utils/CloneFactory.sol";
import "../ModuleBase.sol";

contract TokenVestingFactory is CloneFactory
{
    string public constant override name = type(TokenVestingFactory).name;

    constructor(address vestingTemplate) CloneFactory(vestingTemplate) {}

    function mintTokenVesting(
        address beneficiary, 
        uint256 start, 
        uint256 cliffDuration, 
        uint256 duration, 
        bool revocable
    )

    external returns (address instance)
    {
        instance = _clone();
        TokenVesting(instance).initialize(
            beneficiary,
            start,
            cliffDuration,
            duration,
            revocable
        );
    }
}
