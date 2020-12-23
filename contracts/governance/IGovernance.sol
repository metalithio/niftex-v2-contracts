// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface IGovernance
{
    function isModule(address) external view returns (bool);
    function isAuthorized(address, address) external view returns (bool);

    function ACTION_DURATION() external view returns (uint256);
    function ACTION_REQUIRED() external view returns (uint256);
    function BUYOUT_DURATION() external view returns (uint256);
    function BUYOUT_REQUIRED() external view returns (uint256);
}
