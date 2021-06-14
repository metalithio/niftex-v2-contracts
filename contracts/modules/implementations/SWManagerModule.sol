// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../ModuleBase.sol";

contract SWManagerModule is IModule, ModuleBase
{
    string public constant override name = type(SWManagerModule).name;

    modifier isAllowed() {
        require(ShardedWallet(payable(msg.sender)).owner() == address(0));
        _;
    }

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    function updateArtistWallet(address newArtistWallet) public isAllowed {
        ShardedWallet(payable(msg.sender)).updateArtistWallet(newArtistWallet);
    }

    function updateGovernance(address newGovernance) public isAllowed {
        ShardedWallet(payable(msg.sender)).updateGovernance(newGovernance);
    }
}
