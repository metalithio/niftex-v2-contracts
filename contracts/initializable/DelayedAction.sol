// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../utils/WithTimers.sol";

enum ActionType
{
    CALL,
    DELEGATECALL
}

abstract contract DelayedAction is WithTimers
{
    uint256 private _delayedActionDuration;

    function _initialize(uint256 duration_)
    internal virtual
    {
        _delayedActionDuration = duration_;
    }

    function _hash(ActionType actiontype, address to, uint256 value, bytes memory data)
    internal virtual returns (bytes32)
    {
        return keccak256(abi.encodePacked(actiontype, to, value, data));
    }

    function _schedule(ActionType actiontype, address to, uint256 value, bytes memory data)
    internal virtual returns (bytes32)
    {
        bytes32 id = _hash(actiontype, to, value, data);

        require(WithTimers._beforeTimer(id));
        WithTimers._startTimer(id, _delayedActionDuration);

        // TODO: emit ActionScheduled(id, actiontype, to, value, data);
        return id;
    }

    function _execute(ActionType actiontype, address to, uint256 value, bytes memory data)
    internal virtual returns (bool)
    {
        bytes32 id = _hash(actiontype, to, value, data);

        // solhint-disable-next-line not-rely-on-time
        require(WithTimers._afterTimer(id));
        WithTimers._cleanTimer(id);

        if (actiontype == ActionType.CALL) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory returndata) = to.call{value: value}(data);
            require(success, string(returndata));
        } else if (actiontype == ActionType.DELEGATECALL) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory returndata) = to.delegatecall(data);
            require(success, string(returndata));
        } else {
            revert();
        }

        // TODO: emit ActionExecuted(id, actiontype, to, value, data);
        return true;
    }

    function _cancel(bytes32 id)
    internal virtual returns (bool)
    {
        WithTimers._stopTimer(id);

        // TODO: emit ActionCancelled(id);
        return true;
    }

    function delayedActionDuration()
    public view returns (uint256)
    {
        return _delayedActionDuration;
    }
}
