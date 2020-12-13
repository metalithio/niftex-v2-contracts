// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";
import "../utils/WithTimers.sol";
import "./ERC20.sol";

abstract contract ERC20Buyout is ERC20, WithTimers
{
    using SafeMath for uint256;

    bytes32 internal constant _ERC20BUYOUT_TIMER_ = bytes32(uint256(keccak256("_ERC20BUYOUT_TIMER_")) - 1);
    address private _buyoutProposer;
    uint256 private _buyoutPrice;

    function _openBuyout(uint256 pricePerShare, uint256 duration)
    internal onlyBeforeTimer(_ERC20BUYOUT_TIMER_)
    {
        require(balanceOf(msg.sender) > 0);
        // prepare
        uint256 ownedshares = ERC20.balanceOf(msg.sender);
        uint256 buyoutprice = ERC20.totalSupply().sub(ownedshares).mul(pricePerShare);
        // record buyout
        WithTimers._startTimer(_ERC20BUYOUT_TIMER_, duration);
        _buyoutProposer = msg.sender;
        _buyoutPrice = pricePerShare;
        // lock shares
        ERC20._transfer(msg.sender, address(this), ownedshares);
        // refund
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));
        // TODO: emit Event
    }

    function _closeBuyout()
    internal onlyDuringTimer(_ERC20BUYOUT_TIMER_)
    {
        require(balanceOf(msg.sender) > 0);
        require(msg.sender != _buyoutProposer);
        // prepare
        address proposer     = _buyoutProposer;
        uint256 lockedshares = ERC20.balanceOf(address(this));
        uint256 buyoutprice  = ERC20.totalSupply().sub(lockedshares).mul(_buyoutPrice);
        uint256 stopprice    = lockedshares.mul(_buyoutPrice);
        // clean buyout
        WithTimers._stopTimer(_ERC20BUYOUT_TIMER_);
        delete _buyoutProposer;
        delete _buyoutPrice;
        // transfer shares
        ERC20._transfer(address(this), msg.sender, lockedshares);
        // refund
        Address.sendValue(payable(proposer), buyoutprice.add(stopprice)); // send deposit back + buy shares
        Address.sendValue(msg.sender, msg.value.sub(stopprice)); // refund extra
        // TODO: emit Event
    }

    function _claimBuyout(address to)
    internal onlyAfterTimer(_ERC20BUYOUT_TIMER_)
    {
        // prepare
        uint256 shares = balanceOf(to);
        // burn shares
        ERC20._burn(to, shares);
        // refund
        Address.sendValue(payable(to), shares.mul(_buyoutPrice));
        // TODO: emit Event
    }

    function _resetBuyout()
    internal onlyAfterTimer(_ERC20BUYOUT_TIMER_)
    {
        require(msg.sender == _buyoutProposer);
        delete _buyoutProposer;
    }

    function buyoutProposer()
    public view returns (address)
    {
        return _buyoutProposer;
    }

    function buyoutPrice()
    public view returns (uint256)
    {
        return _buyoutPrice;
    }
}
