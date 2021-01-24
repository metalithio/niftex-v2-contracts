// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../../initializable/BondingCurve.sol";
import "../../governance/IGovernance.sol";
import "../../utils/ERC1167.sol";
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

    // address public constant CURVE_PREMINT_RESERVE = address(uint160(uint256(keccak256("CURVE_PREMINT_RESERVE")) - 1));
    address public constant CURVE_PREMINT_RESERVE = 0x3cc5B802b34A42Db4cBe41ae3aD5c06e1A4481c9;
    // bytes32 public constant PCT_ETH_TO_CURVE      = bytes32(uint256(keccak256("PCT_ETH_TO_CURVE")) - 1);
    bytes32 public constant PCT_ETH_TO_CURVE      = 0xd6b8be26fe56c2461902fe9d3f529cdf9f02521932f09d2107fe448477d59e9f;
    // bytes32 public constant CURVE_TEMPLATE_KEY    = bytes32(uint256(keccak256("CURVE_TEMPLATE_KEY")) - 1);
    bytes32 public constant CURVE_TEMPLATE_KEY    = 0xa54b8f5412e457a4cf09be0c646e265f0357e8fca2d539fe7302c431422cd77d;

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
    event BoundingCurve(ShardedWallet indexed wallet, address indexed curve);

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
        uint256               duration, // !TODO sth governed by Governance.sol
        uint256               totalSupply,
        Allocation[] calldata premints)
    external onlyBeforeTimer(bytes32(uint256(address(wallet)))) onlyOwner(wallet, msg.sender)
    {
        require(wallet.totalSupply() == 0);
        wallet.moduleMint(address(this), totalSupply);
        wallet.moduleTransferOwnership(address(0));

        Timers._startTimer(bytes32(uint256(address(wallet))), duration);

        for (uint256 i = 0; i < premints.length; ++i)
        {
            Allocation memory premint = premints[i];
            premintShares[wallet][premint.receiver] = premint.amount;
            totalSupply = totalSupply.sub(premint.amount);
        }

        /**
        * Compute the number of shares that should be reserved for the bounding
        * curve. if to much shares are reserved to the bounding curve, the
        * crowdsale ETH wouldn't be enough to setup the bounding curve
        */
        uint256 sharesToCurve = totalSupply.mul(wallet.governance().getConfig(address(wallet), PCT_ETH_TO_CURVE)).div(10000); // TODO: base 10000?
        require(sharesToCurve <= totalSupply);

        premintShares[wallet][CURVE_PREMINT_RESERVE] = sharesToCurve;
        premintShares[wallet][recipient] = premintShares[wallet][recipient].sub(sharesToCurve);
        recipients[wallet] = recipient;
        prices[wallet] = price;
        remainingsShares[wallet] = totalSupply;
    }

    function buy(ShardedWallet wallet, address to)
    external payable onlyCrowdsaleActive(wallet)
    {
        uint256 decimals = wallet.decimals();
        uint256 price = prices[wallet];
        uint256 count = Math.min(msg.value.mul(10**decimals).div(price), remainingsShares[wallet]);
        uint256 value = count.mul(price).div(10**decimals);

        balance[wallet] = balance[wallet].add(value);
        boughtShares[wallet][to] = boughtShares[wallet][to].add(count);
        remainingsShares[wallet] = remainingsShares[wallet].sub(count);

        Address.sendValue(msg.sender, msg.value.sub(value));
        emit SharesBought(wallet, msg.sender, to, count);
    }

    function redeem(ShardedWallet wallet, address to)
    external onlyCrowdsaleFinished(wallet)
    {
        require(to != CURVE_PREMINT_RESERVE);

        uint256 decimals = wallet.decimals();
        uint256 premint  = premintShares[wallet][to];
        uint256 bought   = boughtShares[wallet][to];
        delete premintShares[wallet][to];
        delete boughtShares[wallet][to];

        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256 shares = premint.add(bought);
            wallet.transfer(to, shares);
            emit SharesRedeemedSuccess(wallet, msg.sender, to, shares);
        } else {
            uint256 value = bought.mul(prices[wallet]).div(10**decimals);
            balance[wallet] = balance[wallet].sub(value);
            Address.sendValue(payable(to), value);
            emit SharesRedeemedFaillure(wallet, msg.sender, to, bought);
        }
    }

    function _makeCurve(ShardedWallet wallet, uint256 valueToCurve, uint256 sharesToCurve)
    internal returns (address)
    {
        IGovernance governance = wallet.governance();
        address     template   = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE_KEY)));

        if (template != address(0)) {
            address curve = ERC1167.clone2(template, bytes32(uint256(uint160(address(wallet)))));
            wallet.approve(curve, sharesToCurve);
            BondingCurve(curve).initialize{value: valueToCurve}(
                sharesToCurve,
                address(wallet),
                recipients[wallet],
                prices[wallet]
            );
            emit BoundingCurve(wallet, curve);
            return curve;
        } else {
            return address(0);
        }
    }

    function withdraw(ShardedWallet wallet)
    public onlyCrowdsaleFinished(wallet)
    {
        address to = recipients[wallet];
        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256     sharesToCurve = premintShares[wallet][CURVE_PREMINT_RESERVE];
            uint256     valueToCurve  = sharesToCurve.mul(prices[wallet]).div(10**wallet.decimals());
            uint256     value         = balance[wallet].sub(valueToCurve);
            address     curve         = _makeCurve(wallet, valueToCurve, sharesToCurve);
            delete balance[wallet];
            delete premintShares[wallet][CURVE_PREMINT_RESERVE];

            if (curve == address(0)) {
                wallet.transfer(payable(to), sharesToCurve);
                value = value.add(valueToCurve);
            }

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
