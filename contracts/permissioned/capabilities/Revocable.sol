pragma solidity ^0.8.0;

import "contracts/initializable/ERC20.sol";
import "../roles/RevokerRole.sol";

contract Revocable is ERC20, RevokerRole {

  event Revoke(address indexed revoker, address indexed from, uint256 amount);

  function _revoke(
    address _from,
    uint256 _amount
  )
    internal
    returns (bool)
  {
    ERC20._transfer(_from, msg.sender, _amount);
    emit Revoke(msg.sender, _from, _amount);
    return true;
  }

  /**
  Allow Admins to revoke tokens from any address
    */
  function revoke(address from, uint256 amount) public onlyRevoker returns (bool) {
      return _revoke(from, amount);
  }
}