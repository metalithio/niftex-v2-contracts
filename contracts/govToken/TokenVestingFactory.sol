// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../utils/CloneFactory.sol";
import "./TokenVesting.sol";

contract TokenVestingFactory is CloneFactory
{
    string public constant name = type(TokenVestingFactory).name;

    constructor(address vestingTemplate) CloneFactory(vestingTemplate) {}

    event MintTokenVesting(address indexed _instance, address _beneficiary);

    function mintTokenVesting(
        address beneficiary, 
        uint256 start, 
        uint256 cliffDuration, 
        uint256 duration, 
        bool revocable,
        address owner
    )

    external returns (address instance)
    {
        instance = _clone();
        TokenVesting(instance).initialize(
            beneficiary,
            start,
            cliffDuration,
            duration,
            revocable,
            owner
        );

        emit MintTokenVesting(instance, beneficiary);
    }
}
