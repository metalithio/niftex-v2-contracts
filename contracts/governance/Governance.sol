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
    bytes32 public constant MINTING_SHARD_FEE  = bytes32(uint256(keccak256("MINTING_SHARD_FEE")) - 1);

    mapping(bytes32 => uint256) internal _config;
    mapping(bytes32 => uint256) internal _configCap;
    mapping(bytes4  => address) internal _staticcalls;
    address public _niftexWallet;


    constructor()
    {
        AccessControl._setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _niftexWallet = msg.sender;
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

    function getConfig(address /*wallet*/, bytes32 key)
    public view override returns (uint256)
    {
        return _config[key];
    }

    function setConfig(bytes32 key, uint256 value)
    public
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        if (_configCap[key] > 0 && value > _configCap[key]) {
           _config[key] = _configCap[key];
        } else {
           _config[key] = value
        }  
        
        // TODO: emit
    }
    // useful for pct variables. pct must be <= 10000
    function setConfigCap(bytes32 key, uint256 cap) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _configCap[key] = cap;
    }

    function getKeyInBytes(string memory key) public view returns(bytes32) {
        return bytes32(uint256(keccak256(key)) - 1);
    }

    function changeAdmin(address newAdmin) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        AccessControl._setupRole(DEFAULT_ADMIN_ROLE, newAdmin);
        AccessControl.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _niftexWallet = newAdmin;
    }

    function calcMintingShardFee(uint256 shardAmount) public view returns (uint256) {
        uint256 pctShardFee = getConfig(address(0), MINTING_SHARD_FEE);
        return shardAmount.mul(pctShardFee).div(10000);
    }
}
