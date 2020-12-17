// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface IGovernance
{
    function ACTION_DURATION() external returns (uint256);
    function ACTION_REQUIRED() external returns (uint256);
    function BUYOUT_DURATION() external returns (uint256);
}
