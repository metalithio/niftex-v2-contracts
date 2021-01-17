// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../utils/CloneFactory.sol";
import "./ShardedWallet.sol";

contract ShardedWalletFactory is CloneFactory
{
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private _wallets;

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
        _wallets.add(instance);
    }

    function isWallet(address wallet) external view returns (bool) {
        return _wallets.contains(wallet);
    }

    function getWallet(uint256 id) external view returns (address) {
        return _wallets.at(id);
    }

    function walletCount() external view returns (uint256) {
        return _wallets.length();
    }
}
