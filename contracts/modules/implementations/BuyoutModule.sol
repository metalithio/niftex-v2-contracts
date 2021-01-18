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

    bytes32 public constant BUYOUT_DURATION_KEY = bytes32(uint256(keccak256("BUYOUT_DURATION_KEY")) - 1);

    mapping(ShardedWallet => address) internal _proposers;
    mapping(ShardedWallet => uint256) internal _prices;
    mapping(ShardedWallet => uint256) internal _deposit;

    event BuyoutOpened(ShardedWallet indexed wallet, address proposer, uint256 pricePerShare);
    event BuyoutClosed(ShardedWallet indexed wallet, address closer);
    event BuyoutClaimed(ShardedWallet indexed wallet, address user);
    event BuyoutFinalized(ShardedWallet indexed wallet);

    function openBuyout(ShardedWallet wallet, uint256 pricePerShare)
    external payable onlyAuthorized(wallet, msg.sender) onlyBeforeTimer(bytes32(uint256(address(wallet))))
    {
        uint256 ownedshares = wallet.balanceOf(msg.sender);
        uint256 buyoutprice = wallet.totalSupply().sub(ownedshares).mul(pricePerShare);

        Timers._startTimer(bytes32(uint256(address(wallet))), wallet.governance().getConfig(address(wallet), BUYOUT_DURATION_KEY));
        _proposers[wallet] = msg.sender;
        _prices[wallet] = pricePerShare;
        _deposit[wallet] = buyoutprice;

        wallet.moduleTransferOwnership(address(this));
        wallet.moduleTransfer(msg.sender, address(this), ownedshares);
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));

        emit BuyoutOpened(wallet, msg.sender, pricePerShare);
    }

    function closeBuyout(ShardedWallet wallet)
    external payable onlyAuthorized(wallet, msg.sender) onlyDuringTimer(bytes32(uint256(address(wallet))))
    {
        uint256 pricepershare = _prices[wallet];
        uint256 lockedshares  = wallet.balanceOf(address(this));
        uint256 buyshares     = msg.value.div(pricepershare).min(lockedshares);
        uint256 buyprice      = buyshares.mul(pricepershare);

        _deposit[wallet]      = _deposit[wallet].add(buyprice);

        wallet.moduleTransfer(address(this), msg.sender, buyshares);

        if (buyshares == lockedshares)
        {
            Timers._stopTimer(bytes32(uint256(address(wallet))));
            wallet.renounceOwnership();
            Address.sendValue(payable(_proposers[wallet]), _deposit[wallet]);

            delete _proposers[wallet];
            delete _prices[wallet];
            delete _deposit[wallet];

            emit BuyoutClosed(wallet, msg.sender);
        }

        Address.sendValue(msg.sender, msg.value.sub(buyprice));
    }

    function claimBuyout(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        uint256 shares = wallet.balanceOf(msg.sender);
        uint256 value  = shares.mul(_prices[wallet]);

        _deposit[wallet] = _deposit[wallet].sub(value);

        wallet.moduleBurn(msg.sender, shares);
        Address.sendValue(payable(msg.sender), value);

        emit BuyoutClaimed(wallet, msg.sender);
    }

    function finalizeBuyout(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        // Warning: do NOT burn the locked shares, this would allow the last holder to retreive ownership of the wallet
        require(_proposers[wallet] != address(0));
        wallet.moduleTransferOwnership(_proposers[wallet]);
        delete _proposers[wallet];

        emit BuyoutFinalized(wallet);
    }
}
