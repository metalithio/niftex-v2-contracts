// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../utils/WithTimers.sol";

abstract contract DelayedAction is WithTimers
{
    event ActionScheduled(bytes32 indexed id, uint256 i, address to, bytes data);
    event ActionExecuted(bytes32 indexed id, uint256 i, address to, bytes data);
    event ActionCancelled(bytes32 indexed id);

    function _hash(address[] memory to, bytes[] memory data)
    internal virtual returns (bytes32)
    {
        return keccak256(abi.encode(to, data));
    }

    function _schedule(address[] memory to, bytes[] memory data, uint256 duration)
    internal virtual returns (bytes32)
    {
        require(to.length == data.length);
        bytes32 id = _hash(to, data);

        require(WithTimers._beforeTimer(id));
        WithTimers._startTimer(id, duration);

        for (uint256 i = 0; i < to.length; ++i) {
            emit ActionScheduled(id, i, to[i], data[i]);
        }

        return id;
    }

    function _execute(address[] memory to, bytes[] memory data)
    internal virtual returns (bool)
    {
        require(to.length == data.length);
        bytes32 id = _hash(to, data);

        WithTimers._resetTimer(id);

        for (uint256 i = 0; i < to.length; ++i) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory returndata) = to[i].call(data[i]);
            require(success, string(returndata));

            emit ActionExecuted(id, i, to[i], data[i]);
        }

        return true;
    }

    function _cancel(bytes32 id)
    internal virtual returns (bool)
    {
        WithTimers._stopTimer(id);

        emit ActionCancelled(id);
        return true;
    }
}
