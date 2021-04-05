pragma solidity ^0.8.0;

import "./OwnerRole.sol";

contract WhitelisterRole is OwnerRole {
		using Roles for Roles.Role;

    event WhitelisterAdded(address indexed addedWhitelister, address indexed addedBy);
    event WhitelisterRemoved(address indexed removedWhitelister, address indexed removedBy);

    Roles.Role private _whitelisters;

    modifier onlyWhitelister() {
        require(isWhitelister(msg.sender), "WhitelisterRole: caller does not have the Whitelister role");
        _;
    }

    function isWhitelister(address account) public view returns (bool) {
        return _whitelisters.has(account);
    }

    function _addWhitelister(address account) internal {
        _whitelisters.add(account);
        emit WhitelisterAdded(account, msg.sender);
    }

    function _removeWhitelister(address account) internal {
        _whitelisters.remove(account);
        emit WhitelisterRemoved(account, msg.sender);
    }

    function addWhitelister(address account) public TS_onlyOwner {
        _addWhitelister(account);
    }

    function removeWhitelister(address account) public TS_onlyOwner {
        _removeWhitelister(account);
    }
}
