// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "../ModuleBase.sol";

contract ERC20ManagerModule is IModule, ModuleBase
{
    using SafeMath for uint256;

    string public constant override name = type(ERC20ManagerModule).name;

    function mint(address account, uint256 amount) public {
        ShardedWallet(msg.sender).moduleMint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        ShardedWallet(msg.sender).moduleBurn(account, amount);
    }

    function transfer(address from, address to, uint256 amount) public {
        ShardedWallet(msg.sender).moduleTransfer(from, to, amount);
    }
}
