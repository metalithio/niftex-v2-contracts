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

    bytes32 public constant PCT_ETH_TO_CURVE = bytes32(uint256(keccak256("PCT_ETH_TO_CURVE")) - 1);
    bytes32 public constant CURVE_TEMPLATE_KEY = bytes32(uint256(keccak256("CURVE_TEMPLATE_KEY")) - 1);

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
    event Withdraw(ShardedWallet indexed wallet, address indexed from, address to, uint256 value, address curve);


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
        uint256 decimals = wallet.decimals();
        if (remainingsShares[wallet] == 0 && balance[wallet] > 0 && msg.sender == recipients[wallet]) {
            withdraw(wallet, to);
        }
        uint256 premint = premintShares[wallet][to];
        uint256 bought  = boughtShares[wallet][to];
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

    function _initializeCurve(address curve, uint256 suppliedShards, ShardedWallet wallet, uint256 valueToCurve) internal {
        wallet.approve(curve, suppliedShards);
        BondingCurve(curve).initialize{value: valueToCurve}(
            suppliedShards, 
            address(wallet),
            recipients[wallet],
            prices[wallet]
        );
    }

    function withdraw(ShardedWallet wallet, address to)
    public onlyCrowdsaleFinished(wallet) onlyRecipient(wallet)
    {
        address shardedWalletAddress = address(wallet);
        if (remainingsShares[wallet] == 0) { // crowdsaleSuccess
            uint256 value = balance[wallet];
            delete balance[wallet];
            IGovernance gov = wallet.governance();
            address recipient = recipients[wallet];
            address template = address(uint160(gov.getConfig(shardedWalletAddress, CURVE_TEMPLATE_KEY)));
            uint256 valueToCurve = template != address(0) ? value.mul(gov.getConfig(shardedWalletAddress, PCT_ETH_TO_CURVE)).div(10000) : 0;
            address curve;
            if (template != address(0))
            {
                uint256 suppliedShards = valueToCurve.mul(10**wallet.decimals()).div(prices[wallet]);
                premintShares[wallet][recipient] = premintShares[wallet][recipient].sub(suppliedShards);
                curve = ERC1167.clone2(template, bytes32(uint256(uint160(shardedWalletAddress))));
                _initializeCurve(
                    curve,
                    suppliedShards,
                    wallet,
                    valueToCurve
                    );
                // TODO: emit an event
            }

            Address.sendValue(payable(to), value.sub(valueToCurve));
            emit Withdraw(wallet, msg.sender, to, value, curve);
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
