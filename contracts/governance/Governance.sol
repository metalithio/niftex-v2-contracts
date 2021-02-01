// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "../wallet/ShardedWallet.sol";
import "./IGovernance.sol";

contract BasicGovernance is IGovernance, AccessControl
{
    using SafeMath for uint256;

    bytes32 public constant MODULE_ROLE         = bytes32(uint256(keccak256("MODULE_ROLE")) - 1);
    bytes32 public constant AUTHORIZATION_RATIO = bytes32(uint256(keccak256("AUTHORIZATION_RATIO")) - 1);

    mapping(address => mapping(bytes32 => uint256)) internal _config;
    mapping(bytes4  => address) internal _staticcalls;

    constructor()
    {
        AccessControl._setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function isModule(address /*wallet*/, address module)
    public view override returns (bool)
    {
        return AccessControl.hasRole(MODULE_ROLE, module);
    }

    function isAuthorized(address wallet, address user)
    public view override returns (bool)
    {
        return ShardedWallet(payable(wallet)).balanceOf(user) >= Math.max(ShardedWallet(payable(wallet)).totalSupply().mul(getConfig(wallet, AUTHORIZATION_RATIO)).div(10**18), 1);
    }

    function getModule(address /*wallet*/, bytes4 sig)
    public view override returns (address)
    {
        return _staticcalls[sig];
    }

    function setModule(bytes4 sig, address value)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _staticcalls[sig] = value;
        // TODO: emit
    }

    function getConfig(address wallet, bytes32 key)
    public view override returns (uint256)
    {
				if (_config[wallet][key] == 0) {
					// global
					return _config[getNiftexWallet()][key];
				} else {
					// local
        	return _config[wallet][key];
				}
    }

    function setConfig(address wallet, bytes32 key, uint256 value)
    public
    {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender) {
					_config[wallet][key] = value;
				} else if (_config[getNiftexWallet()][key] == 0) {
					_config[msg.sender][key] = value;
				}
        // TODO: emit
    }

    function getNiftexWallet() public view override returns(address) {
        return AccessControl.getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }
}
