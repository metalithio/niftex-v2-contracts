// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../../utils/CloneFactory.sol";
import "../ModuleBase.sol";

contract ShardedWalletFactory is IModule, ModuleBase, CloneFactory
{
    string public constant override name = type(ShardedWalletFactory).name;

    constructor(address walletTemplate) ModuleBase(walletTemplate) CloneFactory(walletTemplate) {}

    function mintWallet(
        address               governance_,
        address               owner_,
        string       calldata name_,
        string       calldata symbol_,
        address               artistWallet_
    )
    external returns (address instance)
    {
        instance = _clone();
        ShardedWallet(payable(instance)).initialize(governance_, owner_, name_, symbol_, artistWallet_);
    }
}
