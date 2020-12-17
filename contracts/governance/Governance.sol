// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "../initializable/Ownable.sol";
import "./IGovernance.sol";

contract BasicGovernance is IGovernance
{
    uint256 public override ACTION_DURATION;
    uint256 public override BUYOUT_DURATION;

    constructor(uint256 action_duration, uint256 buyout_duration)
    {
        ACTION_DURATION = action_duration;
        BUYOUT_DURATION = buyout_duration;
    }
}

contract OwnableGovernance is BasicGovernance, Ownable
{
    constructor(uint256 action_duration, uint256 buyout_duration)
    BasicGovernance(action_duration, buyout_duration)
    {
        Ownable._setOwner(msg.sender);
    }

    function setActionDuration(uint256 newvalue)
    external onlyOwner()
    {
        // TODO: emit
        ACTION_DURATION = newvalue;
    }

    function setBuyoutDuration(uint256 newvalue)
    external onlyOwner()
    {
        // TODO: emit
        BUYOUT_DURATION = newvalue;
    }
}
