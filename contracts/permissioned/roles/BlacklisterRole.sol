pragma solidity ^0.8.0;

import "./OwnerRole.sol";

contract BlacklisterRole is OwnerRole {
		using Roles for Roles.Role;

    event BlacklisterAdded(address indexed addedBlacklister, address indexed addedBy);
    event BlacklisterRemoved(address indexed removedBlacklister, address indexed removedBy);

    Roles.Role private _Blacklisters;

    modifier onlyBlacklister() {
        require(isBlacklister(msg.sender), "BlacklisterRole missing");
        _;
    }

    function isBlacklister(address account) public view returns (bool) {
        return _Blacklisters.has(account);
    }

    function _addBlacklister(address account) internal {
        _Blacklisters.add(account);
        emit BlacklisterAdded(account, msg.sender);
    }

    function _removeBlacklister(address account) internal {
        _Blacklisters.remove(account);
        emit BlacklisterRemoved(account, msg.sender);
    }

    function addBlacklister(address account) public TS_onlyOwner {
        _addBlacklister(account);
    }

    function removeBlacklister(address account) public TS_onlyOwner {
        _removeBlacklister(account);
    }

}
