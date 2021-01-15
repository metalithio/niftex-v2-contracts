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
    bytes32 public constant PCT_ETH_TO_BONDING_CURVE = bytes32(uint256(keccak256("PCT_ETH_TO_BONDING_CURVE")) - 1);

    mapping(address => address)                     public recipients;
    mapping(address => uint256)                     public prices;
    mapping(address => uint256)                     public balance;
    mapping(address => uint256)                     public remainingsShares;
    mapping(address => mapping(address => uint256)) public premintShares;
    mapping(address => mapping(address => uint256)) public boughtShares;
    address                                         public bondingCurveFactory;
    mapping(address => uint256)                     public ethToBondingCurve;

    event SharesBought(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedSuccess(address indexed token, address indexed from, address to, uint256 count);
    event SharesRedeemedFaillure(address indexed token, address indexed from, address to, uint256 count);
    event OwnershipReclaimed(address indexed token, address indexed from, address to);
    event Withdraw(address indexed token, address indexed from, address to, uint256 value);


    modifier onlyCrowdsaleActive(address wallet)
    {
        require(_duringTimer(bytes32(uint256(wallet))) && remainingsShares[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleFinished(address wallet)
    {
        require(_afterTimer(bytes32(uint256(wallet))) || remainingsShares[wallet] == 0);
        _;
    }

    modifier onlyCrowdsaleFailled(address wallet)
    {
        require(_afterTimer(bytes32(uint256(wallet))) && remainingsShares[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleSuccess(address wallet)
    {
        require(remainingsShares[wallet] == 0);
        _;
    }

    modifier onlyRecipient(address wallet)
    {
        require(recipients[wallet] == msg.sender);
        _;
    }

    constructor(address _bondingCurveFactory) {
        bondingCurveFactory = _bondingCurveFactory;
    }

    function setup(
        address wallet,
        address recipient,
        uint256 price,
        uint256 duration,
        uint256 totalSupply,
        Allocation[] calldata premints)
    external onlyBeforeTimer(bytes32(uint256(wallet))) onlyOwner(wallet, msg.sender)
    {
        require(ShardedWallet(payable(wallet)).totalSupply() == 0);
        // avoid creating bonding curve if the crowdsale only sells 0 fractions
        require(
            totalSupply > 0,
            "[setup] Cannot trigger crowdsale selling 0 fractions"
        );
        ShardedWallet(payable(wallet)).moduleTransferOwnership(address(0));

        Timers._startTimer(bytes32(uint256(wallet)), duration);

        for (uint256 i = 0; i < premints.length; ++i)
        {
            Allocation memory premint = premints[i];
            premintShares[wallet][premint.receiver] = premint.amount;
            totalSupply = totalSupply.sub(premint.amount);
        }

        // calculate fractions for bonding curve factory at this stage
        uint256 pctEthToBondingCurve = ShardedWallet(payable(wallet)).governance().getConfig(PCT_ETH_TO_BONDING_CURVE);
        ethToBondingCurve[wallet] = pctEthToBondingCurve;
        premintShares[wallet][bondingCurveFactory] = premintShares[wallet][recipient].mul(pctEthToBondingCurve).div(10000);
        premintShares[wallet][recipient] = premintShares[wallet][recipient].sub(premintShares[wallet][bondingCurveFactory]);

        recipients[wallet] = recipient;
        prices[wallet] = price;
        remainingsShares[wallet] = totalSupply;
    }

    function initializeBondingCurve(address wallet) public {
        require(
            remainingsShares[wallet] == 0,
            "[initializeBondingCurve] Crowdsale still proceeds or fails"
        );

        uint256 ethAmount = ethToBondingCurve[wallet];
        uint256 shardAmount = premintShares[wallet][bondingCurveFactory];

        ethToBondingCurve[wallet] = 0;
        premintShares[wallet][bondingCurveFactory] = 0;

        ShardedWallet(payable(wallet)).moduleMint(bondingCurveFactory, shardAmount);
        Address.sendValue(payable(bondingCurveFactory), ethAmount);

        IBondingCurveFactory(bondingCurveFactory).mintBondingCurve(
            /*
                suppliedShards,
                wallet,
                nftOwner,
                artistWallet,
                niftexWallet,
                initialPriceInWei,
                minShard0
            */
            );
    }

    function buy(address wallet, address to)
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

    function redeem(address wallet, address to)
    external onlyCrowdsaleFinished(wallet)
    {
        uint256 premint = premintShares[wallet][to];
        uint256 bought  = boughtShares[wallet][to];
        delete premintShares[wallet][to];
        delete boughtShares[wallet][to];

        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256 shares = premint.add(bought);
            ShardedWallet(payable(wallet)).moduleMint(to, shares);
            emit SharesRedeemedSuccess(wallet, msg.sender, to, shares);
        } else {
            uint256 value = bought.mul(prices[wallet]);
            balance[wallet] = balance[wallet].sub(value);
            Address.sendValue(payable(to), value);
            emit SharesRedeemedFaillure(wallet, msg.sender, to, bought);
        }
    }

    function withdraw(address wallet, address to)
    external onlyCrowdsaleFinished(wallet) onlyRecipient(wallet)
    {
        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            // can only get remaining eth after putting some to bonding curve
            uint256 value = balance[wallet].sub(ethToBondingCurve);
            delete balance[wallet];
            Address.sendValue(payable(to), value);
            emit Withdraw(wallet, msg.sender, to, value);
        } else {
            ShardedWallet(payable(wallet)).moduleTransferOwnership(to);
            emit OwnershipReclaimed(wallet, msg.sender, to);
        }
    }

    function retreive(address wallet)
    external
    {
        ShardedWallet(payable(wallet)).moduleBurn(msg.sender, Math.max(ShardedWallet(payable(wallet)).totalSupply(), 1));
        ShardedWallet(payable(wallet)).moduleTransferOwnership(msg.sender);
    }

    function cleanup(address wallet)
    external onlyCrowdsaleFinished(wallet)
    {
        require(balance[wallet] == 0); // either success + withdraw or faillure + redeems
        Timers._resetTimer(bytes32(uint256(wallet)));
    }

    function deadline(address wallet)
    external view returns (uint256)
    {
        return _getDeadline(bytes32(uint256(wallet)));
    }
}
