// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "../wallet/ShardedWallet.sol";
import "./IGovernance.sol";

contract BasicGovernance is IGovernance, AccessControl
{
    using SafeMath for uint256;

    bytes32 public immutable MODULE_ROLE         = bytes32(uint256(keccak256("MODULE_ROLE")) - 1);
    bytes32 public immutable AUTHORIZATION_RATIO = bytes32(uint256(keccak256("AUTHORIZATION_RATIO")) - 1);
    address public immutable GLOBAL_CONFIG       = address(0);

    mapping(address => mapping(bytes32 => uint256)) internal _config;
    mapping(address => mapping(address => bool   )) internal _modules;
    mapping(address => mapping(bytes4  => address)) internal _staticcalls;
    mapping(bytes32 => bool) internal _globalOnlyKeys;

    constructor()
    {
        AccessControl._setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function isModule(address wallet, address module)
    public view override returns (bool)
    {
        return AccessControl.hasRole(MODULE_ROLE, module) || _modules[wallet][module];
    }

    function enableModuleForWallet(address wallet, address module, bool authorized)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _modules[wallet][module] = authorized;
        // TODO: emit
    }

    function isAuthorized(address wallet, address user)
    public view override returns (bool)
    {
        return ShardedWallet(payable(wallet)).balanceOf(user) >= Math.max(ShardedWallet(payable(wallet)).totalSupply().mul(getConfig(wallet, AUTHORIZATION_RATIO)).div(10**18), 1);
    }

    function getModule(address wallet, bytes4 sig)
    public view override returns (address)
    {
        address global = _staticcalls[GLOBAL_CONFIG][sig];
        address local  = _staticcalls[wallet][sig];
        return _globalOnlyKeys[bytes32(sig)] || local == address(0) ? global : local;
    }

    function setModule(bytes4 sig, address value)
    public
    {
        _staticcalls[msg.sender][sig] = value;
        // TODO: emit
    }

    function setGlobalModule(bytes4 sig, address value)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _staticcalls[GLOBAL_CONFIG][sig] = value;
        // TODO: emit
    }

    function getConfig(address wallet, bytes32 key)
    public view override returns (uint256)
    {
        uint256 global = _config[GLOBAL_CONFIG][key];
        uint256 local  = _config[wallet][key];
        return _globalOnlyKeys[key] || local == 0 ? global : local;
    }

    function setConfig(bytes32 key, uint256 value)
    public
    {
        _config[msg.sender][key] = value;
        // TODO: emit
    }

    function setGlobalConfig(bytes32 key, uint256 value)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _config[GLOBAL_CONFIG][key] = value;
        // TODO: emit
    }

    function getGlobalOnlyKey(bytes32 key)
    public view returns (bool)
    {
        return _globalOnlyKeys[key];
    }

    function setGlobalKey(bytes32 key, bool value)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _globalOnlyKeys[key] = value;
    }

    function getNiftexWallet() public view override returns(address) {
        return AccessControl.getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }
}
