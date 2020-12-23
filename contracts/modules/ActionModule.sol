// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../utils/WithTimers.sol";
import "./ModuleBase.sol";

contract ActionModule is ModuleBase, WithTimers
{
    event ActionScheduled(address indexed wallet, bytes32 indexed id, uint256 i, address to, uint256 value, bytes data);
    event ActionExecuted(address indexed wallet, bytes32 indexed id, uint256 i, address to, uint256 value, bytes data);
    event ActionCancelled(address indexed wallet, bytes32 indexed id);

    function schedule(address wallet, address[] memory to, uint256[] memory value, bytes[] memory data, uint256 duration)
    public onlyAuthorized(wallet, msg.sender) returns (bytes32)
    {
        require(duration >= ShardedWallet(wallet).governance().ACTION_DURATION());
        require(to.length == value.length);
        require(to.length == data.length);
        bytes32 id  = keccak256(abi.encode(to, value, data));
        bytes32 uid = keccak256(abi.encode(wallet, id));

        WithTimers._startTimer(uid, duration);

        for (uint256 i = 0; i < to.length; ++i) {
            emit ActionScheduled(wallet, id, i, to[i], value[i], data[i]);
        }

        return id;
    }

    function execute(address wallet, address[] memory to, uint256[] memory value, bytes[] memory data)
    public onlyAuthorized(wallet, msg.sender) returns (bool)
    {
        require(to.length == value.length);
        require(to.length == data.length);
        bytes32 id  = keccak256(abi.encode(to, value, data));
        bytes32 uid = keccak256(abi.encode(wallet, id));

        WithTimers._resetTimer(uid);

        for (uint256 i = 0; i < to.length; ++i) {
            ShardedWallet(wallet).moduleExecute(to[i], value[i], data[i]);
            emit ActionExecuted(wallet, id, i, to[i], value[i], data[i]);
        }

        return true;
    }

    function cancel(address wallet, bytes32 id)
    public onlyAuthorized(wallet, msg.sender) returns (bool)
    {
        bytes32 uid = keccak256(abi.encode(wallet, id));

        WithTimers._stopTimer(uid);

        emit ActionCancelled(wallet, id);

        return true;
    }
}
