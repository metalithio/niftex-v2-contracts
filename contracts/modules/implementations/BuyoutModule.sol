// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Address.sol";
import "../../utils/Timers.sol";
import "../ModuleBase.sol";

contract BuyoutModule is IModule, ModuleBase, Timers
{
    using Math     for uint256;
    using SafeMath for uint256;

    string public constant override name = type(BuyoutModule).name;

    // bytes32 public constant BUYOUT_DURATION = bytes32(uint256(keccak256("BUYOUT_DURATION")) - 1);
    bytes32 public constant BUYOUT_DURATION = 0x2b0302f2fecc31c4abdae5dbfeb4ffb88f5e75f2102ec01dda9073a9330d6b1c;

    mapping(ShardedWallet => address) internal _proposers;
    mapping(ShardedWallet => uint256) internal _prices;
    mapping(ShardedWallet => uint256) public _deposit;

    event BuyoutOpened(ShardedWallet indexed wallet, address proposer, uint256 pricePerShard);
    event BuyoutClosed(ShardedWallet indexed wallet, address closer);
    event BuyoutClaimed(ShardedWallet indexed wallet, address user);
    event BuyoutFinalized(ShardedWallet indexed wallet);

    function openBuyout(ShardedWallet wallet, uint256 pricePerShard)
    external payable onlyAuthorized(wallet, msg.sender) onlyBeforeTimer(bytes32(uint256(address(wallet))))
    {
        uint256 decimals    = wallet.decimals();
        uint256 ownedshards = wallet.balanceOf(msg.sender);
        uint256 buyoutprice = wallet.totalSupply().sub(ownedshards).mul(pricePerShard).div(10**decimals);

        Timers._startTimer(bytes32(uint256(address(wallet))), wallet.governance().getConfig(address(wallet), BUYOUT_DURATION));
        _proposers[wallet] = msg.sender;
        _prices[wallet] = pricePerShard;
        _deposit[wallet] = buyoutprice;

        wallet.moduleTransferOwnership(address(this));
        wallet.moduleTransfer(msg.sender, address(this), ownedshards);
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));

        emit BuyoutOpened(wallet, msg.sender, pricePerShard);
    }

    function closeBuyout(ShardedWallet wallet)
    external payable onlyAuthorized(wallet, msg.sender) onlyDuringTimer(bytes32(uint256(address(wallet))))
    {
        uint256 decimals      = wallet.decimals();
        uint256 pricePerShard = _prices[wallet];
        uint256 lockedShards  = wallet.balanceOf(address(this));
        uint256 buyShards     = msg.value.mul(10**decimals).div(pricePerShard).min(lockedShards);
        uint256 buyprice      = buyShards.mul(pricePerShard).div(10**decimals);
        _deposit[wallet]      = _deposit[wallet].add(buyprice);

        if (buyShards == lockedShards)
        {
            Timers._stopTimer(bytes32(uint256(address(wallet))));
            wallet.renounceOwnership();
            Address.sendValue(payable(_proposers[wallet]), _deposit[wallet]);

            delete _proposers[wallet];
            delete _prices[wallet];
            delete _deposit[wallet];

            emit BuyoutClosed(wallet, msg.sender);
        }

        wallet.transfer(msg.sender, buyShards);
        Address.sendValue(msg.sender, msg.value.sub(buyprice));
    }

    function claimBuyout(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        uint256 decimals      = wallet.decimals();
        uint256 pricePerShard = _prices[wallet];
        uint256 shards        = wallet.balanceOf(msg.sender);
        uint256 value         = shards.mul(pricePerShard).div(10**decimals);

        wallet.moduleBurn(msg.sender, shards);
        Address.sendValue(payable(msg.sender), value);

        emit BuyoutClaimed(wallet, msg.sender);
    }

    function claimBuyoutBackup(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        uint256 decimals      = wallet.decimals();
        uint256 pricePerShard = _prices[wallet];
        uint256 shards        = wallet.balanceOf(msg.sender);
        uint256 value         = shards.mul(pricePerShard).div(10**decimals);

        wallet.burnFrom(msg.sender, shards);
        Address.sendValue(payable(msg.sender), value);

        emit BuyoutClaimed(wallet, msg.sender);
    }

    function finalizeBuyout(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        // Warning: do NOT burn the locked shards, this would allow the last holder to retrieve ownership of the wallet
        require(_proposers[wallet] != address(0));
        wallet.transferOwnership(_proposers[wallet]);
        delete _proposers[wallet];
        delete _deposit[wallet];

        emit BuyoutFinalized(wallet);
    }
}
