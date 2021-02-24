// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ERC20.sol";
import "../wallet/ShardedWallet.sol";
import "../governance/IGovernance.sol";
import "../interface/IERC1363Receiver.sol";
import "../interface/IERC1363Spender.sol";

contract BondingCurve3LP is ERC20 {
    address internal _controler;

    modifier onlyControler() {
        require(msg.sender == _controler);
        _;
    }

    function initialize(address controler, string memory name, string memory symbol) public {
        require(_controler == address(0));
        _controler = controler;
        _initialize(name, symbol);
    }

    function controllerTransfer(address sender, address recipient, uint256 amount) public onlyControler {
        _transfer(sender, recipient, amount);
    }

    function controllerMint(address account, uint256 amount) public onlyControler {
        _mint(account, amount);
    }

    function controllerBurn(address account, uint256 amount) public onlyControler {
        _burn(account, amount);
    }
}

contract BondingCurve3 is IERC1363Spender {
    using SafeMath for uint256;

    struct CurveCoordinates {
        uint256 x;
        uint256 k;
    }

    struct Asset {
        uint256 underlyingSupply;
        uint256 feeToNiftex;
        uint256 feeToArtist;
    }

    BondingCurve3LP immutable internal _template;

    // bytes32 public constant PCT_FEE_SUPPLIERS = bytes32(uint256(keccak256("PCT_FEE_SUPPLIERS")) - 1);
    bytes32 public constant PCT_FEE_SUPPLIERS  = 0xe4f5729eb40e38b5a39dfb36d76ead9f9bc286f06852595980c5078f1af7e8c9;
    // bytes32 public constant PCT_FEE_ARTIST    = bytes32(uint256(keccak256("PCT_FEE_ARTIST")) - 1);
    bytes32 public constant PCT_FEE_ARTIST     = 0xdd0618e2e2a17ff193a933618181c8f8909dc169e9707cce1921893a88739ca0;
    // bytes32 public constant PCT_FEE_NIFTEX    = bytes32(uint256(keccak256("PCT_FEE_NIFTEX")) - 1);
    bytes32 public constant PCT_FEE_NIFTEX     = 0xcfb1dd89e6f4506eca597e7558fbcfe22dbc7e0b9f2b3956e121d0e344d6f7aa;
    // bytes32 public constant LIQUIDITY_TIMELOCK   = bytes32(uint256(keccak256("LIQUIDITY_TIMELOCK")) - 1);
    bytes32 public constant LIQUIDITY_TIMELOCK = 0x4babff57ebd34f251a515a845400ed950a51f0a64c92e803a3e144fc40623fa8;

    BondingCurve3LP  public   etherLP;
    BondingCurve3LP  public   shardLP;
    CurveCoordinates internal _curve;
    Asset            internal _etherLPExtra;
    Asset            internal _shardLPExtra;
    address          internal _wallet;
    address          internal _recipient;
    uint256          internal _deadline;

    event Initialized(address wallet);
    event ShardsBought(address indexed account, uint256 amount, uint256 cost);
    event ShardsSold(address indexed account, uint256 amount, uint256 payout);
    event ShardsSupplied(address indexed provider, uint256 amount);
    event EtherSupplied(address indexed provider, uint256 amount);
    event ShardsWithdrawn(address indexed provider, uint256 payout, uint256 shards);
    event EtherWithdrawn(address indexed provider, uint256 value, uint256 payout);
    event TransferEthLPTokens(address indexed sender, address indexed recipient, uint256 amount);
    event TransferShardLPTokens(address indexed sender, address indexed recipient, uint256 amount);

    constructor() {
        _template = new BondingCurve3LP();
    }

    function initialize(
        uint256 supply,
        address wallet,
        address recipient,
        uint256 price
    )
    public payable
    {
        require(_wallet == address(0));
        etherLP = BondingCurve3LP(Clones.clone(address(_template)));
        shardLP = BondingCurve3LP(Clones.clone(address(_template)));
        etherLP.initialize(address(this), "EtherLP", "SLP");
        shardLP.initialize(address(this), "ShardLP", "SLP");

        uint256 totalSupply_ = ShardedWallet(payable(wallet)).totalSupply();

        _wallet    = wallet;
        _recipient = recipient;
        _deadline  = block.timestamp.add(ShardedWallet(payable(wallet)).governance().getConfig(wallet, LIQUIDITY_TIMELOCK));
        emit Initialized(_wallet);

        // transfer assets
        if (supply > 0) {
            require(ShardedWallet(payable(wallet)).transferFrom(msg.sender, address(this), supply));
        }

        // setup curve
        _curve.x = totalSupply_;
        _curve.k = totalSupply_.mul(totalSupply_).mul(price).div(10**18);

        // mint liquidity
        etherLP.controllerMint(address(this), msg.value);
        shardLP.controllerMint(address(this), supply);
        _etherLPExtra.underlyingSupply = msg.value;
        _shardLPExtra.underlyingSupply = supply;
        emit EtherSupplied(address(this), msg.value);
        emit ShardsSupplied(address(this), supply);
    }

    function buyShards(uint256 amount, uint256 maxCost) public payable {
        uint256 cost = _buyShards(msg.sender, amount, maxCost);

        require(cost <= msg.value);
        if (msg.value > cost) {
            Address.sendValue(msg.sender, msg.value.sub(cost));
        }
    }

    function sellShards(uint256 amount, uint256 minPayout) public {
        require(ShardedWallet(payable(_wallet)).transferFrom(msg.sender, address(this), amount));
        _sellShards(msg.sender, amount, minPayout);
    }

    function supplyEther() public payable {
        _supplyEther(msg.sender, msg.value);
    }

    function supplyShards(uint256 amount) public {
        require(ShardedWallet(payable(_wallet)).transferFrom(msg.sender, address(this), amount));
        _supplyShards(msg.sender, amount);
    }

    function onApprovalReceived(address owner, uint256 amount, bytes calldata data) public override returns (bytes4) {
        require(msg.sender == _wallet, "onApprovalReceived restricted to token contract");
        require(ShardedWallet(payable(_wallet)).transferFrom(owner, address(this), amount));

        bytes4 selector = abi.decode(data, (bytes4));
        if (selector == this.sellShards.selector) {
            (,uint256 minPayout) = abi.decode(data, (bytes4, uint256));
            _sellShards(owner, amount, minPayout);
        } else if (selector == this.supplyShards.selector) {
            _supplyShards(owner, amount);
        } else {
            revert("invalid selector in onApprovalReceived data");
        }

        return this.onApprovalReceived.selector;
    }

    function _buyShards(address buyer, uint256 amount, uint256 maxCost) internal returns (uint256) {
        IGovernance governance = ShardedWallet(payable(_wallet)).governance();
        address     owner      = ShardedWallet(payable(_wallet)).owner();
        address     artist     = ShardedWallet(payable(_wallet)).artistWallet();

        // pause if someone else reclaimed the ownership of shardedWallet
        require(owner == address(0) || governance.isModule(_wallet, owner));

        // compute fees
        uint256[3] memory fees;
        fees[0] =                            governance.getConfig(_wallet, PCT_FEE_SUPPLIERS);
        fees[1] =                            governance.getConfig(_wallet, PCT_FEE_NIFTEX);
        fees[2] = artist == address(0) ? 0 : governance.getConfig(_wallet, PCT_FEE_ARTIST);

        uint256 amountWithFee = amount.mul(uint256(10**18).add(fees[0]).add(fees[1]).add(fees[2])).div(10**18);

        // check curve update
        uint256 newX = _curve.x.sub(amountWithFee);
        uint256 newY = _curve.k.div(newX);
        require(newX > 0 && newY > 0);

        // check cost
        uint256 cost = newY.sub(_curve.k.div(_curve.x));
        require(cost <= maxCost);

        // consistency check
        require(ShardedWallet(payable(_wallet)).balanceOf(address(this)).sub(_shardLPExtra.feeToNiftex).sub(_shardLPExtra.feeToArtist) >= amountWithFee);

        // update curve
        _curve.x = _curve.x.sub(amount.mul(uint256(10**18).add(fees[1]).add(fees[2])).div(10**18));

        // update LP supply
        _shardLPExtra.underlyingSupply = _shardLPExtra.underlyingSupply.add(amount.mul(fees[0]).div(10**18));
        _shardLPExtra.feeToNiftex      = _shardLPExtra.feeToNiftex.add(amount.mul(fees[1]).div(10**18));
        _shardLPExtra.feeToArtist      = _shardLPExtra.feeToArtist.add(amount.mul(fees[2]).div(10**18));

        // transfer
        ShardedWallet(payable(_wallet)).transfer(buyer, amount);

        emit ShardsBought(buyer, amount, cost);
        return cost;
    }

    function _sellShards(address seller, uint256 amount, uint256 minPayout) internal returns (uint256) {
        IGovernance governance = ShardedWallet(payable(_wallet)).governance();
        address     owner      = ShardedWallet(payable(_wallet)).owner();
        address     artist     = ShardedWallet(payable(_wallet)).artistWallet();

        // pause if someone else reclaimed the ownership of shardedWallet
        require(owner == address(0) || governance.isModule(_wallet, owner));

        // compute fees
        uint256[3] memory fees;
        fees[0] =                            governance.getConfig(_wallet, PCT_FEE_SUPPLIERS);
        fees[1] =                            governance.getConfig(_wallet, PCT_FEE_NIFTEX);
        fees[2] = artist == address(0) ? 0 : governance.getConfig(_wallet, PCT_FEE_ARTIST);

        uint256 newX = _curve.x.add(amount);
        uint256 newY = _curve.k.div(newX);
        require(newX > 0 && newY > 0);

        // check payout
        uint256 payout = _curve.k.div(_curve.x).sub(newY);
        require(payout <= address(this).balance.sub(_etherLPExtra.feeToNiftex).sub(_etherLPExtra.feeToArtist) && payout >= minPayout);
        uint256 value = payout.mul(uint256(10**18).sub(fees[0]).sub(fees[1]).sub(fees[2])).div(10**18);

        // update curve
        _curve.x = newX;

        // update LP supply
        _etherLPExtra.underlyingSupply = _etherLPExtra.underlyingSupply.add(payout.mul(fees[0]).div(10**18));
        _etherLPExtra.feeToNiftex      = _etherLPExtra.feeToNiftex.add(payout.mul(fees[1]).div(10**18));
        _etherLPExtra.feeToArtist      = _etherLPExtra.feeToArtist.add(payout.mul(fees[2]).div(10**18));

        // transfer
        Address.sendValue(payable(seller), value);

        emit ShardsSold(seller, amount, value);
        return value;
    }

    function _supplyEther(address supplier, uint256 amount) internal {
        require(_curve.k.div(_curve.x).sub(address(this).balance) >= 0);

        etherLP.controllerMint(supplier, calcNewEthLPTokensToIssue(amount));
        _etherLPExtra.underlyingSupply = _etherLPExtra.underlyingSupply.add(amount);

        emit EtherSupplied(supplier, amount);
    }


    function _supplyShards(address supplier, uint256 amount) internal {
        require(_curve.x.sub(_shardLPExtra.underlyingSupply).sub(amount) >= 0);

        shardLP.controllerMint(supplier, calcNewShardLPTokensToIssue(amount));
        _shardLPExtra.underlyingSupply = _shardLPExtra.underlyingSupply.add(amount);

        emit ShardsSupplied(supplier, amount);
    }

    function calcNewShardLPTokensToIssue(uint256 amount) public view returns (uint256) {
        uint256 pool = _shardLPExtra.underlyingSupply;
        if (pool == 0) { return amount; }
        uint256 proportion = amount.mul(10**18).div(pool.add(amount));
        return proportion.mul(shardLP.totalSupply()).div(uint256(10**18).sub(proportion));
    }

    function calcNewEthLPTokensToIssue(uint256 amount) public view returns (uint256) {
        uint256 pool = _etherLPExtra.underlyingSupply;
        if (pool == 0) { return amount; }
        uint256 proportion = amount.mul(10**18).div(pool.add(amount));
        return proportion.mul(etherLP.totalSupply()).div(uint256(10**18).sub(proportion));
    }

    function calcShardsForEthSuppliers() public view returns (uint256) {
        uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
        .sub(_shardLPExtra.feeToNiftex)
        .sub(_shardLPExtra.feeToArtist);
        return balance < _shardLPExtra.underlyingSupply ? 0 : balance - _shardLPExtra.underlyingSupply;
    }

    function calcEthForShardSuppliers() public view returns (uint256) {
        uint256 balance = address(this).balance
        .sub(_etherLPExtra.feeToNiftex)
        .sub(_etherLPExtra.feeToArtist);
        return balance < _etherLPExtra.underlyingSupply ? 0 : balance - _etherLPExtra.underlyingSupply;
    }

    function withdrawSuppliedEther(uint256 amount) external returns (uint256, uint256) {
        require(amount > 0);

        uint256 etherLPSupply = etherLP.totalSupply();

        uint256 balance = address(this).balance
        .sub(_etherLPExtra.feeToNiftex)
        .sub(_etherLPExtra.feeToArtist);

        uint256 value = (balance <= _etherLPExtra.underlyingSupply)
        ? balance.mul(amount).div(etherLPSupply)
        : _etherLPExtra.underlyingSupply.mul(amount).div(etherLPSupply);

        uint256 payout = calcShardsForEthSuppliers()
        .mul(amount)
        .div(etherLPSupply);

        // update balances
        _etherLPExtra.underlyingSupply = _etherLPExtra.underlyingSupply.mul(etherLPSupply.sub(amount)).div(etherLPSupply);
        etherLP.controllerBurn(msg.sender, amount);

        // transfer
        Address.sendValue(msg.sender, value);
        if (payout > 0) {
            ShardedWallet(payable(_wallet)).transfer(msg.sender, payout);
        }

        emit EtherWithdrawn(msg.sender, value, payout);

        return (value, payout);
    }

    function withdrawSuppliedShards(uint256 amount) external returns (uint256, uint256) {
        require(amount > 0);

        uint256 shardLPSupply = shardLP.totalSupply();

        uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
        .sub(_shardLPExtra.feeToNiftex)
        .sub(_shardLPExtra.feeToArtist);

        uint256 shards = (balance <= _shardLPExtra.underlyingSupply)
        ? balance.mul(amount).div(shardLPSupply)
        : _shardLPExtra.underlyingSupply.mul(amount).div(shardLPSupply);

        uint256 payout = calcEthForShardSuppliers()
        .mul(amount)
        .div(shardLPSupply);

        // update balances
        _shardLPExtra.underlyingSupply = _shardLPExtra.underlyingSupply.mul(shardLPSupply.sub(amount)).div(shardLPSupply);
        shardLP.controllerBurn(msg.sender, amount);

        // transfer
        ShardedWallet(payable(_wallet)).transfer(msg.sender, shards);
        if (payout > 0) {
            Address.sendValue(msg.sender, payout);
        }

        emit ShardsWithdrawn(msg.sender, payout, shards);

        return (payout, shards);
    }

    function withdrawNiftexOrArtistFees(address recipient) public {
        uint256 etherFees = 0;
        uint256 shardFees = 0;

        if (msg.sender == ShardedWallet(payable(_wallet)).artistWallet()) {
            etherFees += _etherLPExtra.feeToArtist;
            shardFees += _shardLPExtra.feeToArtist;
            delete _etherLPExtra.feeToArtist;
            delete _shardLPExtra.feeToArtist;
        }

        if (msg.sender == ShardedWallet(payable(_wallet)).governance().getNiftexWallet()) {
            etherFees += _etherLPExtra.feeToNiftex;
            shardFees += _shardLPExtra.feeToNiftex;
            delete _etherLPExtra.feeToNiftex;
            delete _shardLPExtra.feeToNiftex;
        }

        Address.sendValue(payable(recipient), etherFees);
        ShardedWallet(payable(_wallet)).transfer(recipient, shardFees);
    }

    function transferTimelockLiquidity(address recipient) public {
        require(_recipient == msg.sender && _deadline < block.timestamp);
        etherLP.controllerTransfer(address(this), recipient, getEthLPTokens(address(this)));
        shardLP.controllerTransfer(address(this), recipient, getShardLPTokens(address(this)));
    }

    function getEthLPTokens(address owner) public view returns (uint256) {
        return etherLP.balanceOf(owner);
    }

    function getShardLPTokens(address owner) public view returns (uint256) {
        return shardLP.balanceOf(owner);
    }

    function transferEthLPTokens(address recipient, uint256 amount) public {
        etherLP.controllerTransfer(msg.sender, recipient, amount);
    }

    function transferShardLPTokens(address recipient, uint256 amount) public {
        shardLP.controllerTransfer(msg.sender, recipient, amount);
    }

    function getCurrentPrice() external view returns (uint256) {
        return _curve.k.mul(10**18).div(_curve.x).div(_curve.x);
    }

    function getCurveCoordinates() external view returns (uint256, uint256) {
        return (_curve.x, _curve.k);
    }

    function getEthSuppliers() external view returns (uint256, uint256, uint256, uint256) {
        return (_etherLPExtra.underlyingSupply, etherLP.totalSupply(), _etherLPExtra.feeToNiftex, _etherLPExtra.feeToArtist);
    }

    function getShardSuppliers() external view returns (uint256, uint256, uint256, uint256) {
        return (_shardLPExtra.underlyingSupply, shardLP.totalSupply(), _shardLPExtra.feeToNiftex, _shardLPExtra.feeToArtist);
    }
}
