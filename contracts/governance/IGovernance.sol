// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

interface IGovernance
{
    function isModule(address,address) external view returns (bool);
    function isAuthorized(address,address) external view returns (bool);
    function readConfig(address,bytes32) external view returns (uint256);
}
