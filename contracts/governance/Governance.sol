// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "./IGovernance.sol";
import "../ShardedWallet.sol";

contract BasicGovernance is IGovernance, AccessControl
{
    using SafeMath for uint256;

    bytes32 public constant MODULE_ROLE = bytes32(uint256(keccak256("MODULE_ROLE")) - 1);
    uint256 public override ACTION_DURATION;
    uint256 public override ACTION_REQUIRED;
    uint256 public override BUYOUT_DURATION;
    uint256 public override BUYOUT_REQUIRED;

    constructor(
        uint256 action_duration,
        uint256 action_required,
        uint256 buyout_duration,
        uint256 buyout_required)
    {
        AccessControl._setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        ACTION_DURATION = action_duration;
        ACTION_REQUIRED = action_required;
        BUYOUT_DURATION = buyout_duration;
        BUYOUT_REQUIRED = buyout_required;
    }

    function isModule(address module)
    external view override returns (bool)
    {
        return AccessControl.hasRole(MODULE_ROLE, module);
    }

    function isAuthorized(address wallet, address user)
    external view override returns (bool)
    {
        return ShardedWallet(payable(wallet)).balanceOf(user) >= Math.max(ShardedWallet(payable(wallet)).totalSupply().mul(ACTION_REQUIRED).div(10**18), 1);
    }


}

contract UpdatableGovernance is BasicGovernance
{
    constructor(
        uint256 action_duration,
        uint256 action_required,
        uint256 buyout_duration,
        uint256 buyout_required)
    BasicGovernance(
        action_duration,
        action_required,
        buyout_duration,
        buyout_required)
    {
    }

    function setActionDuration(uint256 newvalue)
    external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        // TODO: emit
        ACTION_DURATION = newvalue;
    }

    function setActionRequired(uint256 newvalue)
    external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        // TODO: emit
        ACTION_REQUIRED = newvalue;
    }

    function setBuyoutDuration(uint256 newvalue)
    external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        // TODO: emit
        BUYOUT_DURATION = newvalue;
    }

    function setBuyoutRequired(uint256 newvalue)
    external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        // TODO: emit
        BUYOUT_REQUIRED = newvalue;
    }
}
