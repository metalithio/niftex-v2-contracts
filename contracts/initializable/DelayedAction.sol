// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

enum ActionType
{
    CALL,
    DELEGATECALL
}

abstract contract DelayedAction
{
    mapping(bytes32 => uint256) private _delayedActionValidAt;
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

        require(_delayedActionValidAt[id] == 0);
        _delayedActionValidAt[id] = block.timestamp + _delayedActionDuration;

        // emit ActionScheduled(id, actiontype, to, value, data);
        return id;
    }

    function _execute(ActionType actiontype, address to, uint256 value, bytes memory data)
    internal virtual returns (bool)
    {
        bytes32 id = _hash(actiontype, to, value, data);

        require(_delayedActionValidAt[id] > 0 && _delayedActionValidAt[id] < block.timestamp);
        delete _delayedActionValidAt[0];

        if (actiontype == ActionType.CALL)
        {
            (bool success, bytes memory returndata) = to.call{value: value}(data);
            require(success, string(returndata));
        }
        else if (actiontype == ActionType.DELEGATECALL)
        {
            (bool success, bytes memory returndata) = to.delegatecall(data);
            require(success, string(returndata));
        }
        else
        {
            revert();
        }

        // emit ActionExecuted(id, actiontype, to, value, data);
        return true;
    }

    function _cancel(bytes32 id)
    internal virtual returns (bool)
    {
        delete _delayedActionValidAt[id];

        // emit ActionCancelled(id);
        return true;
    }

}
