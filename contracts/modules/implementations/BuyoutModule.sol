// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Address.sol";
import "../../utils/Timers.sol";
import "../ModuleBase.sol";

contract BuyoutModule is IModule, ModuleBase, Timers
{
    using SafeMath for uint256;

    string public constant override name = type(BuyoutModule).name;

    bytes32 public constant BUYOUT_DURATION_KEY = bytes32(uint256(keccak256("BUYOUT_DURATION_KEY")) - 1);

    mapping(ShardedWallet => address) internal _proposers;
    mapping(ShardedWallet => uint256) internal _prices;

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

        wallet.moduleTransferOwnership(address(this));
        wallet.moduleTransfer(msg.sender, address(this), ownedshares);
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));

        emit BuyoutOpened(wallet, msg.sender, pricePerShare);
    }

    function closeBuyout(ShardedWallet wallet)
    external payable onlyAuthorized(wallet, msg.sender) onlyDuringTimer(bytes32(uint256(address(wallet))))
    {
        address proposer      = _proposers[wallet];
        uint256 pricepershare = _prices[wallet];
        uint256 lockedshares  = wallet.balanceOf(address(this));
        uint256 buyoutprice   = wallet.totalSupply().sub(lockedshares).mul(pricepershare);
        uint256 stopprice     = lockedshares.mul(pricepershare);

        Timers._stopTimer(bytes32(uint256(address(wallet))));
        delete _proposers[wallet];
        delete _prices[wallet];

        wallet.renounceOwnership();
        wallet.moduleTransfer(address(this), msg.sender, lockedshares);
        Address.sendValue(payable(proposer), buyoutprice.add(stopprice));
        Address.sendValue(msg.sender, msg.value.sub(stopprice));

        emit BuyoutClosed(wallet, msg.sender);
    }

    function claimBuyout(ShardedWallet wallet, address user)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        uint256 shares = wallet.balanceOf(user);
        wallet.moduleBurn(user, shares);
        Address.sendValue(payable(user), shares.mul(_prices[wallet]));

        emit BuyoutClaimed(wallet, user);
    }

    function finalizeBuyout(ShardedWallet wallet)
    external onlyAfterTimer(bytes32(uint256(address(wallet))))
    {
        require(_proposers[wallet] != address(0));
        wallet.moduleTransferOwnership(_proposers[wallet]);
        delete _proposers[wallet];

        emit BuyoutFinalized(wallet);
    }
}
