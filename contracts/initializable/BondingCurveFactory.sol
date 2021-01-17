// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../utils/CloneFactory.sol";
import "./BondingCurve.sol";

contract BondingCurveFactory is CloneFactory
{
    constructor()
    CloneFactory(address(new BondingCurve()))
    {}

    // allowed Crowdsale module to receive money
    receive() external payable {
        // not throw any errors here 
        // hence if someone else sends ETH here will be stuck forever
    }

    function mintBondingCurve(
       uint256 suppliedShards,
       address wallet,
       address nftOwner,
       address artistWallet,
       address niftexWallet,
       uint256 initialPriceInWei,
       uint256 minShard0,
       uint256 ethToSend
    )
    external returns (address instance)
    {   
        bytes32 keyCrowdsaleRole = ShardedWallet(wallet).governance().getKeyInBytes("CROWDSALE_ROLE");
        require(
          ShardedWallet(wallet).governance().hasRole(keyCrowdsaleRole, msg.sender);
          "[mintBondingCurve] Must be a crowdsale contract to initialize this bonding curve"
          );
        instance = _clone();
        ShardedWallet(payable(wallet)).approve(instance, suppliedShards);
        BondingCurve(payable(instance)).initialize.value(ethToSend)(
            suppliedShards,
            wallet,
            nftOwner,
            artistWallet,
            niftexWallet,
            initialPriceInWei,
            minShard0
        );
    }
}
