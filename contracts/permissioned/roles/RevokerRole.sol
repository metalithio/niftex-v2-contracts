pragma solidity ^0.8.0;

import "./OwnerRole.sol";

contract RevokerRole is OwnerRole {
		using Roles for Roles.Role;

    event RevokerAdded(address indexed addedRevoker, address indexed addedBy);
    event RevokerRemoved(address indexed removedRevoker, address indexed removedBy);

    Roles.Role private _revokers;

    modifier onlyRevoker() {
        require(isRevoker(msg.sender), "RevokerRole: caller does not have the Revoker role");
        _;
    }

    function isRevoker(address account) public view returns (bool) {
        return _revokers.has(account);
    }

    function _addRevoker(address account) internal {
        _revokers.add(account);
        emit RevokerAdded(account, msg.sender);
    }

    function _removeRevoker(address account) internal {
        _revokers.remove(account);
        emit RevokerRemoved(account, msg.sender);
    }

    function addRevoker(address account) public TS_onlyOwner {
        _addRevoker(account);
    }

    function removeRevoker(address account) public TS_onlyOwner {
        _removeRevoker(account);
    }
}
