// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../ShardedWallet.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract PixedPriceCrowdsale
{
    using SafeMath for uint256;

    mapping(address => uint256)                     public deadlines;
    mapping(address => address)                     public recipients;
    mapping(address => uint256)                     public prices;
    mapping(address => uint256)                     public balance;
    mapping(address => uint256)                     public remainingsShares;
    mapping(address => mapping(address => uint256)) public premintShares;
    mapping(address => mapping(address => uint256)) public boughtShares;

    event SharesBought(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedSuccess(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedFaillure(address indexed token, address indexed from, address to, uint256 count);
    event OwnershipReclaimed(address indexed token, address indexed from, address to);
    event Withdraw(address indexed token, address indexed from, address to, uint256 value);

    modifier crowdsaleActive(address token)
    {
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp < deadlines[token] && remainingsShares[token] > 0);
        _;
    }

    modifier crowdsaleFinished(address token)
    {
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp >= deadlines[token] || remainingsShares[token] == 0);
        _;
    }

    modifier crowdsaleFailled(address token)
    {
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp >= deadlines[token] && remainingsShares[token] > 0);
        _;
    }

    modifier crowdsaleSuccess(address token)
    {
        require(remainingsShares[token] == 0);
        _;
    }

    modifier onlyRecipient(address token)
    {
        require(recipients[token] == msg.sender);
        _;
    }

    function setup(
        address               recipient,
        uint256               price,
        uint256               duration,
        uint256               totalSupply,
        Allocation[] calldata premints)
    external
    {
        address token = msg.sender;
        require(deadlines[token] == 0);

        // solhint-disable-next-line not-rely-on-time
        deadlines[token] = block.timestamp + duration;
        recipients[token] = recipient;
        prices[token] = price;
        balance[token] = 0;

        for (uint256 i = 0; i < premints.length; ++i)
        {
            Allocation memory premint = premints[i];
            premintShares[token][premint.receiver] = premint.amount;
            totalSupply = totalSupply.sub(premint.amount);
        }
        remainingsShares[token] = totalSupply;
    }

    function buy(address token, address to)
    external payable crowdsaleActive(token)
    {
        uint256 price = prices[token];
        uint256 count = Math.min(msg.value.div(price), remainingsShares[token]);
        uint256 value = count.mul(price);

        balance[token] = balance[token].add(value);
        boughtShares[token][to] = boughtShares[token][to].add(count);
        remainingsShares[token] = remainingsShares[token].sub(count);

        Address.sendValue(msg.sender, msg.value.sub(value));
        emit SharesBought(token, msg.sender, to, count);
    }

    function redeem(address token, address to)
    external crowdsaleFinished(token)
    {
        uint256 premint = premintShares[token][to];
        uint256 bought  = boughtShares[token][to];
        delete premintShares[token][to];
        delete boughtShares[token][to];

        if (remainingsShares[token] == 0) { // crowdsaleSuccess
            ShardedWallet(token).mint(to, premint.add(bought));
            emit SharesRedeemedSuccess(token, msg.sender, to, premint.add(bought));
        } else {
            Address.sendValue(payable(to), bought.mul(prices[token]));
            emit SharesRedeemedFaillure(token, msg.sender, to, bought);
        }
    }

    function withdraw(address token, address to)
    external crowdsaleFinished(token) onlyRecipient(token)
    {
        uint256 value = balance[token];
        delete balance[token];

        if (remainingsShares[token] == 0) { // crowdsaleSuccess
            Address.sendValue(payable(to), value);
            emit Withdraw(token, msg.sender, to, value);
        } else {
            ShardedWallet(token).transferOwnership(to);
            emit OwnershipReclaimed(token, msg.sender, to);
        }
    }
}
