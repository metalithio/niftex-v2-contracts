// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../../utils/Timers.sol";
import "../ModuleBase.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract CrowdsaleFixedPriceModule is IModule, ModuleBase, Timers
{
    using SafeMath for uint256;

    string public constant override name = type(CrowdsaleFixedPriceModule).name;

    mapping(ShardedWallet => address)                     public recipients;
    mapping(ShardedWallet => uint256)                     public prices;
    mapping(ShardedWallet => uint256)                     public balance;
    mapping(ShardedWallet => uint256)                     public remainingsShares;
    mapping(ShardedWallet => mapping(address => uint256)) public premintShares;
    mapping(ShardedWallet => mapping(address => uint256)) public boughtShares;

    event SharesBought(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event SharesRedeemedSuccess(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event SharesRedeemedFaillure(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event OwnershipReclaimed(ShardedWallet indexed wallet, address indexed from, address to);
    event Withdraw(ShardedWallet indexed wallet, address indexed from, address to, uint256 value);


    modifier onlyCrowdsaleActive(ShardedWallet wallet)
    {
        require(_duringTimer(bytes32(uint256(address(wallet)))) && remainingsShares[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleFinished(ShardedWallet wallet)
    {
        require(_afterTimer(bytes32(uint256(address(wallet)))) || remainingsShares[wallet] == 0);
        _;
    }

    modifier onlyCrowdsaleFailled(ShardedWallet wallet)
    {
        require(_afterTimer(bytes32(uint256(address(wallet)))) && remainingsShares[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleSuccess(ShardedWallet wallet)
    {
        require(remainingsShares[wallet] == 0);
        _;
    }

    modifier onlyRecipient(ShardedWallet wallet)
    {
        require(recipients[wallet] == msg.sender);
        _;
    }

    function setup(
        ShardedWallet         wallet,
        address               recipient,
        uint256               price,
        uint256               duration,
        uint256               totalSupply,
        Allocation[] calldata premints)
    external onlyBeforeTimer(bytes32(uint256(address(wallet)))) onlyOwner(wallet, msg.sender)
    {
        require(wallet.totalSupply() == 0);
        wallet.moduleTransferOwnership(address(0));

        Timers._startTimer(bytes32(uint256(address(wallet))), duration);

        for (uint256 i = 0; i < premints.length; ++i)
        {
            Allocation memory premint = premints[i];
            premintShares[wallet][premint.receiver] = premint.amount;
            totalSupply = totalSupply.sub(premint.amount);
        }
        recipients[wallet] = recipient;
        prices[wallet] = price;
        remainingsShares[wallet] = totalSupply;
    }

    function buy(ShardedWallet wallet, address to)
    external payable onlyCrowdsaleActive(wallet)
    {
        uint256 price = prices[wallet];
        uint256 count = Math.min(msg.value.div(price), remainingsShares[wallet]);
        uint256 value = count.mul(price);

        balance[wallet] = balance[wallet].add(value);
        boughtShares[wallet][to] = boughtShares[wallet][to].add(count);
        remainingsShares[wallet] = remainingsShares[wallet].sub(count);

        Address.sendValue(msg.sender, msg.value.sub(value));
        emit SharesBought(wallet, msg.sender, to, count);
    }

    function redeem(ShardedWallet wallet, address to)
    external onlyCrowdsaleFinished(wallet)
    {
        uint256 premint = premintShares[wallet][to];
        uint256 bought  = boughtShares[wallet][to];
        delete premintShares[wallet][to];
        delete boughtShares[wallet][to];

        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256 shares = premint.add(bought);
            wallet.moduleMint(to, shares);
            emit SharesRedeemedSuccess(wallet, msg.sender, to, shares);
        } else {
            uint256 value = bought.mul(prices[wallet]);
            balance[wallet] = balance[wallet].sub(value);
            Address.sendValue(payable(to), value);
            emit SharesRedeemedFaillure(wallet, msg.sender, to, bought);
        }
    }

    function withdraw(ShardedWallet wallet, address to)
    external onlyCrowdsaleFinished(wallet) onlyRecipient(wallet)
    {
        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256 value = balance[wallet];
            delete balance[wallet];
            Address.sendValue(payable(to), value);
            emit Withdraw(wallet, msg.sender, to, value);
        } else {
            wallet.moduleTransferOwnership(to);
            emit OwnershipReclaimed(wallet, msg.sender, to);
        }
    }

    function cleanup(ShardedWallet wallet)
    external onlyCrowdsaleFinished(wallet)
    {
        require(balance[wallet] == 0); // either success + withdraw or faillure + redeems
        Timers._resetTimer(bytes32(uint256(address(wallet))));
    }

    function deadline(ShardedWallet wallet)
    external view returns (uint256)
    {
        return _getDeadline(bytes32(uint256(address(wallet))));
    }
}
