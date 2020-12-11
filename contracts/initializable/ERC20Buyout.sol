// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";
import "./ERC20.sol";

abstract contract ERC20Buyout is ERC20
{
    using SafeMath for uint256;

    address private _buyoutProposer;
    uint256 private _buyoutPrice;
    uint256 private _buyoutDeadline;
    uint256 private _buyoutDuration;

    modifier beforeBuyout()
    {
        require(_buyoutProposer == address(0));
        _;
    }

    modifier duringBuyout()
    {
        require(_buyoutProposer != address(0) && block.timestamp < _buyoutDeadline);
        _;
    }

    modifier successfullBuyout()
    {
        require(_buyoutProposer != address(0) && block.timestamp >= _buyoutDeadline);
        _;
    }

    function _initialize(uint256 duration_)
    internal virtual
    {
        if (duration_ == 0)
        {
            _buyoutProposer = address(0xdead); // lock buyout
        }
        else
        {
            _buyoutDuration = duration_;
        }
    }

    function openBuyout(uint256 pricePerShare)
    external payable beforeBuyout()
    {
        require(balanceOf(msg.sender) > 0);
        // prepare
        uint256 ownedshares   = ERC20.balanceOf(msg.sender);
        uint256 buyoutprice   = ERC20.totalSupply().sub(ownedshares).mul(pricePerShare);
        // lock shares
        ERC20._transfer(msg.sender, address(this), ownedshares);
        // record buyout
        // solhint-disable-next-line not-rely-on-time
        _buyoutDeadline = block.timestamp.add(_buyoutDuration);
        _buyoutProposer = msg.sender;
        _buyoutPrice = pricePerShare;
        // refund
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));
        // emit Event
    }

    function closeBuyout()
    external payable duringBuyout()
    {
        require(balanceOf(msg.sender) > 0);
        require(msg.sender != _buyoutProposer);
        // prepare
        uint256 lockedshares = ERC20.balanceOf(address(this));
        uint256 buyoutprice  = ERC20.totalSupply().sub(lockedshares).mul(_buyoutPrice);
        uint256 stopprice    = lockedshares.mul(_buyoutPrice);
        // transfer shares
        ERC20._transfer(address(this), msg.sender, lockedshares);
        // refund
        Address.sendValue(payable(_buyoutProposer), buyoutprice.add(stopprice)); // send deposit back + buy shares
        Address.sendValue(msg.sender, msg.value.sub(stopprice)); // refund extra
        // refund
        delete _buyoutProposer;
        delete _buyoutPrice;
        delete _buyoutDeadline;
        // emit Event
    }

    function claimBuyout(address to)
    external successfullBuyout()
    {
        // prepare
        uint256 shares = balanceOf(msg.sender);
        // burn shares
        ERC20._burn(msg.sender, shares);
        // refund
        Address.sendValue(payable(to), shares.mul(_buyoutPrice));
        // emit Event
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

    function buyoutDeadline()
    public view returns (uint256)
    {
        return _buyoutDeadline;
    }

    function buyoutDuration()
    public view returns (uint256)
    {
        return _buyoutDuration;
    }
}
