// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../utils/CloneFactory.sol";
import "./ShardedWallet.sol";

contract ShardedWalletFactory is CloneFactory
{
    constructor()
    CloneFactory(address(new ShardedWallet()))
    {}

    function mintWallet(
        address               governance_,
        address               owner_,
        string       calldata name_,
        string       calldata symbol_)
    external returns (address instance)
    {
        instance = _clone();
        ShardedWallet(payable(instance)).initialize(governance_, owner_, name_, symbol_);
    }
}
