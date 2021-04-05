pragma solidity ^0.8.0;

import "../roles/OwnerRole.sol";

contract EscrowerRole is OwnerRole {
		using Roles for Roles.Role;

    event EscrowerAdded(address indexed addedEscrow, address indexed addedBy);
    event EscrowerRemoved(address indexed removedEscrow, address indexed removedBy);

    Roles.Role private _escrowers;

    modifier onlyEscrower() {
        require(isEscrower(msg.sender), "EscrowerRole: caller does not have the Escrow role");
        _;
    }

    function isEscrower(address account) public view returns (bool) {
        return _escrowers.has(account);
    }

    function _addEscrower(address account) internal {
        _escrowers.add(account);
        emit EscrowerAdded(account, msg.sender);
    }

    function _removeEscrower(address account) internal {
        _escrowers.remove(account);
        emit EscrowerRemoved(account, msg.sender);
    }

    function addEscrower(address account) public TS_onlyOwner {
        _addEscrower(account);
    }

    function removeEscrower(address account) public TS_onlyOwner {
        require(msg.sender != account, "Escrowers cannot remove themselves as Escrower");
        _removeEscrower(account);
    }

}
