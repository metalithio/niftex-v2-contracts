// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Address.sol";
import "../utils/Timers.sol";
import "./ModuleBase.sol";

contract BuyoutModule is ModuleBase, Timers
{
    using SafeMath for uint256;

    bytes32 public constant BUYOUT_DURATION_KEY = bytes32(uint256(keccak256("BUYOUT_DURATION_KEY")) - 1);

    mapping(address => address) internal _proposers;
    mapping(address => uint256) internal _prices;

    event BuyoutOpened(address indexed wallet, address proposer, uint256 pricePerShare);
    event BuyoutClosed(address indexed wallet, address closer);
    event BuyoutClaimed(address indexed wallet, address user);
    event BuyoutFinalized(address indexed wallet);
    event BuyoutResetted(address indexed wallet);

    function openBuyout(address wallet, uint256 pricePerShare)
    external payable onlyAuthorized(wallet, msg.sender) onlyBeforeTimer(bytes32(uint256(wallet)))
    {
        uint256 ownedshares = ShardedWallet(payable(wallet)).balanceOf(msg.sender);
        uint256 buyoutprice = ShardedWallet(payable(wallet)).totalSupply().sub(ownedshares).mul(pricePerShare);

        Timers._startTimer(bytes32(uint256(wallet)), ShardedWallet(payable(wallet)).governance().getConfig(wallet, BUYOUT_DURATION_KEY));
        _proposers[wallet] = msg.sender;
        _prices[wallet] = pricePerShare;

        ShardedWallet(payable(wallet)).moduleTransferOwnership(address(this));
        ShardedWallet(payable(wallet)).moduleTransfer(msg.sender, address(this), ownedshares);
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));

        emit BuyoutOpened(wallet, msg.sender, pricePerShare);
    }

    function closeBuyout(address wallet)
    external payable onlyAuthorized(wallet, msg.sender) onlyDuringTimer(bytes32(uint256(wallet)))
    {
        address proposer      = _proposers[wallet];
        uint256 pricepershare = _prices[wallet];
        uint256 lockedshares  = ShardedWallet(payable(wallet)).balanceOf(address(this));
        uint256 buyoutprice   = ShardedWallet(payable(wallet)).totalSupply().sub(lockedshares).mul(pricepershare);
        uint256 stopprice     = lockedshares.mul(pricepershare);

        Timers._stopTimer(bytes32(uint256(wallet)));
        delete _proposers[wallet];
        delete _prices[wallet];

        ShardedWallet(payable(wallet)).renounceOwnership();
        ShardedWallet(payable(wallet)).moduleTransfer(address(this), msg.sender, lockedshares);
        Address.sendValue(payable(proposer), buyoutprice.add(stopprice));
        Address.sendValue(msg.sender, msg.value.sub(stopprice));

        emit BuyoutClosed(wallet, msg.sender);
    }

    function claimBuyout(address wallet, address user)
    external onlyAfterTimer(bytes32(uint256(wallet)))
    {
        uint256 shares = ShardedWallet(payable(wallet)).balanceOf(user);
        ShardedWallet(payable(wallet)).moduleBurn(user, shares);
        Address.sendValue(payable(user), shares.mul(_prices[wallet]));

        emit BuyoutClaimed(wallet, user);
    }

    function finalizeBuyout(address wallet)
    external onlyAfterTimer(bytes32(uint256(wallet)))
    {
        ShardedWallet(payable(wallet)).transferOwnership(_proposers[wallet]);
        delete _proposers[wallet];

        emit BuyoutFinalized(wallet);
    }

    function resetBuyout(address wallet)
    external onlyAfterTimer(bytes32(uint256(wallet)))
    {
        require(_proposers[wallet] == address(0)); // only reset after finalize

        uint256 lockedshares = ShardedWallet(payable(wallet)).balanceOf(address(this));
        require(lockedshares == ShardedWallet(payable(wallet)).totalSupply()); // all other shares have been claimed
        ShardedWallet(payable(wallet)).moduleBurn(address(this), lockedshares); // burn last shares

        Timers._resetTimer(bytes32(uint256(wallet)));
        delete _prices[wallet];

        emit BuyoutResetted(wallet);
    }
}
