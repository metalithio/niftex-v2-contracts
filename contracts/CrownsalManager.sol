// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract CrowdsaleManager
{
    using SafeMath for uint256;

    mapping(address => address)                     recipients;
    mapping(address => uint256)                     deadlines;
    mapping(address => uint256)                     prices;
    mapping(address => uint256)                     remainings;
    mapping(address => uint256)                     balance;
    mapping(address => mapping(address => uint256)) shares;

    event SharesBought(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedSuccess(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedFaillure(address indexed token, address indexed from, address to, uint256 count);
    event SharesClaimed(address indexed token, address indexed from, address to, uint256 count);
    event Withdraw(address indexed token, address indexed from, address to, uint256 value);

    modifier crowdsaleActive(address token)
    {
        require(block.timestamp < deadlines[token] && remainings[token] > 0);
        _;
    }

    modifier crowdsaleFinished(address token)
    {
        require(block.timestamp >= deadlines[token] || remainings[token] == 0);
        _;
    }

    modifier crowdsaleFailled(address token)
    {
        require(block.timestamp >= deadlines[token] && remainings[token] > 0);
        _;
    }

    modifier crowdsaleSuccess(address token)
    {
        require(remainings[token] == 0);
        _;
    }

    modifier onlyRecipient(address token)
    {
        require(recipients[token] == msg.sender);
        _;
    }

    function setup(address token, address recipient, uint256 price, uint256 duration)
    external
    {
        require(msg.sender == Ownable(token).owner());
        require(deadlines[token] == 0);

        deadlines[token] = block.timestamp + duration;
        recipients[token] = recipient;
        prices[token] = price;
        remainings[token] = IERC20(token).allowance(token, address(this));
    }

    function buy(address token, address to)
    external payable crowdsaleActive(token)
    {
        uint256 price = prices[token];
        uint256 count = Math.min(msg.value.div(price), remainings[token]);
        uint256 value = count.mul(price);

        balance[token] = balance[token].add(value);
        shares[token][to] = shares[token][to].add(count);
        remainings[token] = remainings[token].sub(count);

        Address.sendValue(msg.sender, msg.value.sub(value));
        emit SharesBought(token, msg.sender, to, count);
    }

    function redeem(address token, address to)
    external crowdsaleFinished(token)
    {
        uint256 count = shares[token][to];
        delete shares[token][to];

        if (remainings[token] == 0) // crowdsaleSuccess
        {
            IERC20(token).transferFrom(token, to, count);
            emit SharesRedeemedSuccess(token, msg.sender, to, count);
        }
        else
        {
            Address.sendValue(payable(to), count.mul(prices[token]));
            emit SharesRedeemedFaillure(token, msg.sender, to, count);
        }
    }

    function claim(address token, address to)
    external crowdsaleFailled(token) onlyRecipient(token)
    {
        uint256 count = IERC20(token).allowance(token, address(this));
        IERC20(token).transferFrom(token, to, count);
        emit SharesClaimed(token, msg.sender, to, count);
    }

    function withdraw(address token, address to)
    external crowdsaleSuccess(token) onlyRecipient(token)
    {
        uint256 value = balance[token];
        delete balance[token];

        Address.sendValue(payable(to), value);
        emit Withdraw(token, msg.sender, to, value);
    }
}
