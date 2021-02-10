// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "../../initializable/BondingCurve.sol";
import "../../governance/IGovernance.sol";
import "../../utils/Timers.sol";
import "../ModuleBase.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract FixedPriceSaleModule is IModule, ModuleBase, Timers
{
    using SafeMath for uint256;

    string public constant override name = type(FixedPriceSaleModule).name;

    // address public constant CURVE_PREMINT_RESERVE   = address(uint160(uint256(keccak256("CURVE_PREMINT_RESERVE")) - 1));
    address public constant CURVE_PREMINT_RESERVE   = 0x3cc5B802b34A42Db4cBe41ae3aD5c06e1A4481c9;
    // bytes32 public constant PCT_ETH_TO_CURVE        = bytes32(uint256(keccak256("PCT_ETH_TO_CURVE")) - 1);
    bytes32 public constant PCT_ETH_TO_CURVE        = 0xd6b8be26fe56c2461902fe9d3f529cdf9f02521932f09d2107fe448477d59e9f;
    // bytes32 public constant PCT_SHARDS_NIFTEX       = bytes32(uint256(keccak256("PCT_SHARDS_NIFTEX")) - 1);
    bytes32 public constant PCT_SHARDS_NIFTEX       = 0xfbbd159a3fa06a90e6706a184ef085e653f08384af107f1a8507ee0e3b341aa6;
    // bytes32 public constant CURVE_TEMPLATE          = bytes32(uint256(keccak256("CURVE_TEMPLATE")) - 1);
    bytes32 public constant CURVE_TEMPLATE          = 0x3cec7c13345ae32e688f81840d184c63978bb776762e026e7e61d891bb2dd84b;

    mapping(ShardedWallet => address)                     public recipients;
    mapping(ShardedWallet => uint256)                     public prices;
    mapping(ShardedWallet => uint256)                     public balance;
    mapping(ShardedWallet => uint256)                     public remainingShards;
    mapping(ShardedWallet => mapping(address => uint256)) public premintShards;
    mapping(ShardedWallet => mapping(address => uint256)) public boughtShards;

    event ShardsPrebuy(ShardedWallet indexed wallet, address indexed receiver, uint256 count);
    event ShardsBought(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event ShardsRedeemedSuccess(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event ShardsRedeemedFailure(ShardedWallet indexed wallet, address indexed from, address to, uint256 count);
    event OwnershipReclaimed(ShardedWallet indexed wallet, address indexed from, address to);
    event Withdraw(ShardedWallet indexed wallet, address indexed from, address to, uint256 value);
    event NewBondingCurve(ShardedWallet indexed wallet, address indexed curve);

    modifier onlyCrowdsaleActive(ShardedWallet wallet)
    {
        require(_duringTimer(bytes32(uint256(address(wallet)))) && remainingShards[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleFinished(ShardedWallet wallet)
    {
        require(_afterTimer(bytes32(uint256(address(wallet)))) || remainingShards[wallet] == 0);
        _;
    }

    modifier onlyCrowdsaleFailled(ShardedWallet wallet)
    {
        require(_afterTimer(bytes32(uint256(address(wallet)))) && remainingShards[wallet] > 0);
        _;
    }

    modifier onlyCrowdsaleSuccess(ShardedWallet wallet)
    {
        require(remainingShards[wallet] == 0);
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
        uint256               duration, // !TODO controlled by Governance.sol possibly?
        uint256               totalSupply,
        Allocation[] calldata premints)
    external onlyBeforeTimer(bytes32(uint256(address(wallet)))) onlyOwner(wallet, msg.sender)
    {
        require(wallet.totalSupply() == 0);
        wallet.moduleMint(address(this), totalSupply);
        wallet.moduleTransferOwnership(address(this));

        Timers._startTimer(bytes32(uint256(address(wallet))), duration);

        {
            uint256 amount = totalSupply.mul(wallet.governance().getConfig(address(wallet), PCT_SHARDS_NIFTEX)).div(10**18);
            address niftex = wallet.governance().getNiftexWallet();
            premintShards[wallet][niftex] = amount;
            totalSupply = totalSupply.sub(amount);
            emit ShardsPrebuy(wallet, niftex, amount);
        }

        // Allocate the premints
        for (uint256 i = 0; i < premints.length; ++i)
        {
            premintShards[wallet][premints[i].receiver] = premints[i].amount;
            totalSupply = totalSupply.sub(premints[i].amount);
            emit ShardsPrebuy(wallet, premints[i].receiver, premints[i].amount);
        }

        // Sanity check, guaranties that the crowdsale will get enought value
        // to initialize the bounding curve
        require(premintShards[wallet][CURVE_PREMINT_RESERVE] <= totalSupply);

        recipients[wallet] = recipient;
        prices[wallet] = price;
        remainingShards[wallet] = totalSupply;
    }

    function buy(ShardedWallet wallet, address to)
    external payable onlyCrowdsaleActive(wallet)
    {
        uint256 decimals = wallet.decimals();
        uint256 price = prices[wallet];
        uint256 count = Math.min(msg.value.mul(10**decimals).div(price), remainingShards[wallet]);
        uint256 value = count.mul(price).div(10**decimals);

        balance[wallet] = balance[wallet].add(value);
        boughtShards[wallet][to] = boughtShards[wallet][to].add(count);
        remainingShards[wallet] = remainingShards[wallet].sub(count);

        Address.sendValue(msg.sender, msg.value.sub(value));
        emit ShardsBought(wallet, msg.sender, to, count);
    }

    function redeem(ShardedWallet wallet, address to)
    external onlyCrowdsaleFinished(wallet)
    {
        require(to != CURVE_PREMINT_RESERVE);

        uint256 decimals = wallet.decimals();
        uint256 premint  = premintShards[wallet][to];
        uint256 bought   = boughtShards[wallet][to];
        delete premintShards[wallet][to];
        delete boughtShards[wallet][to];

        if (remainingShards[wallet] == 0) { // crowdsaleSuccess
            uint256 shards = premint.add(bought);
            wallet.transfer(to, shards);
            emit ShardsRedeemedSuccess(wallet, msg.sender, to, shards);
        } else {
            uint256 value = bought.mul(prices[wallet]).div(10**decimals);
            balance[wallet] = balance[wallet].sub(value);
            Address.sendValue(payable(to), value);
            emit ShardsRedeemedFailure(wallet, msg.sender, to, bought);
        }
    }

    function _makeCurve(ShardedWallet wallet, uint256 valueToCurve, uint256 shardsToCurve)
    internal returns (address)
    {
        IGovernance governance = wallet.governance();
        address     template   = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE)));

        if (template != address(0)) {
            address curve = Clones.cloneDeterministic(template, bytes32(uint256(uint160(address(wallet)))));
            wallet.approve(curve, shardsToCurve);
            BondingCurve(curve).initialize{value: valueToCurve}(
                shardsToCurve,
                address(wallet),
                recipients[wallet],
                prices[wallet]
            );
            emit NewBondingCurve(wallet, curve);
            return curve;
        } else {
            return address(0);
        }
    }

    function withdraw(ShardedWallet wallet)
    public onlyCrowdsaleFinished(wallet)
    {
        address to = recipients[wallet];
        if (remainingShards[wallet] == 0) { // crowdsaleSuccess
            uint256     shardsToCurve = premintShards[wallet][CURVE_PREMINT_RESERVE];
            uint256     valueToCurve  = balance[wallet].mul(wallet.governance().getConfig(address(wallet),PCT_ETH_TO_CURVE)).div(10**18);
            uint256     value         = balance[wallet].sub(valueToCurve);
            address     curve         = _makeCurve(wallet, valueToCurve, shardsToCurve);
            delete balance[wallet];
            delete premintShards[wallet][CURVE_PREMINT_RESERVE];

            if (curve == address(0)) {
                wallet.transfer(payable(to), shardsToCurve);
                value = value.add(valueToCurve);
            }

            Address.sendValue(payable(to), value);
            emit Withdraw(wallet, msg.sender, to, value);
        } else {
            wallet.transferOwnership(to);
            emit OwnershipReclaimed(wallet, msg.sender, to);
        }
    }

    function cleanup(ShardedWallet wallet)
    external onlyCrowdsaleFinished(wallet)
    {
        require(balance[wallet] == 0); // failure + redeems
        wallet.moduleBurn(address(this), wallet.totalSupply());
        Timers._resetTimer(bytes32(uint256(address(wallet))));
    }

    function deadline(ShardedWallet wallet)
    external view returns (uint256)
    {
        return _getDeadline(bytes32(uint256(address(wallet))));
    }
}
