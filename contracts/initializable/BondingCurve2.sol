// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../wallet/ShardedWallet.sol";
import "../governance/IGovernance.sol";

contract BoundingCurve2 {

    using SafeMath for uint256;

    struct CurveCoordinates {
        uint256 x;
        uint256 k;
    }

    struct Asset {
        uint256 underlyingSupply;
        uint256 feesToNiftex;
        uint256 feesToArtist;
        uint256 totalSupply;
        mapping (address => uint256) balance;
    }

    // bytes32 public constant PCT_FEE_SUPPLIERS = bytes32(uint256(keccak256("PCT_FEE_SUPPLIERS")) - 1);
    bytes32 public constant PCT_FEE_SUPPLIERS  = 0xe4f5729eb40e38b5a39dfb36d76ead9f9bc286f06852595980c5078f1af7e8c9;
    // bytes32 public constant PCT_FEE_ARTIST    = bytes32(uint256(keccak256("PCT_FEE_ARTIST")) - 1);
    bytes32 public constant PCT_FEE_ARTIST     = 0xdd0618e2e2a17ff193a933618181c8f8909dc169e9707cce1921893a88739ca0;
    // bytes32 public constant PCT_FEE_NIFTEX    = bytes32(uint256(keccak256("PCT_FEE_NIFTEX")) - 1);
    bytes32 public constant PCT_FEE_NIFTEX     = 0xcfb1dd89e6f4506eca597e7558fbcfe22dbc7e0b9f2b3956e121d0e344d6f7aa;
    // bytes32 public constant LIQUIDITY_TIMELOCK   = bytes32(uint256(keccak256("LIQUIDITY_TIMELOCK")) - 1);
    bytes32 public constant LIQUIDITY_TIMELOCK = 0x4babff57ebd34f251a515a845400ed950a51f0a64c92e803a3e144fc40623fa8;

    CurveCoordinates  internal _curve;
    Asset             internal _ethLP;
    Asset             internal _shardLP;
    address           internal _wallet;
    uint256           internal _decimals;
    address           internal _recipient;
    uint256           internal _deadline;

    event Initialized(address wallet);
    event ShardsBought(address indexed account, uint256 amount, uint256 cost);
    event ShardsSold(address indexed account, uint256 amount, uint256 payout);
    event ShardsSupplied(address indexed provider, uint256 amount);
    event EtherSupplied(address indexed provider, uint256 amount);
    event ShardsWithdrawn(address indexed provider, uint256 payout, uint256 shards);
    event EtherWithdrawn(address indexed provider, uint256 value, uint256 payout);
    event TransferEthLPTokens(address indexed sender, address indexed recipient, uint256 amount);
    event TransferShardLPTokens(address indexed sender, address indexed recipient, uint256 amount);

    function initialize(
        uint256 supply,
        address wallet,
        address recipient,
        uint256 price
    )
    public payable
   {
        uint256 totalSupply = ShardedWallet(payable(wallet)).totalSupply();
        uint256 decimals    = ShardedWallet(payable(wallet)).decimals();

        // setup params
        _wallet    = wallet;
        _decimals  = decimals;
        _recipient = recipient;
        _deadline  = block.timestamp.add(ShardedWallet(payable(wallet)).governance().getConfig(wallet, LIQUIDITY_TIMELOCK));
        emit Initialized(_wallet);

        // transfer assets
        if (supply > 0) {
            require(ShardedWallet(payable(wallet)).transferFrom(msg.sender, address(this), supply));
        }

        // setup curve
        _curve.x = totalSupply;
        _curve.k = totalSupply.mul(totalSupply).mul(price).div(10 ** decimals);

        // mint liquidity
        _mintShardLP(address(this), supply);
        _mintEthLP(address(this), msg.value);
        _shardLP.underlyingSupply = supply;
        _ethLP.underlyingSupply    = msg.value;
        emit ShardsSupplied(address(this), supply);
        emit EtherSupplied(address(this), msg.value);
    }

    function buyShards(uint256 amount, uint256 maxCost) public payable {
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

        uint256 amountWithFee = amount.mul(uint256(10 ** 18).add(fees[0]).add(fees[1]).add(fees[2])).div(10 ** 18);

        // check curve update
        uint256 newX = _curve.x.sub(amountWithFee);
        uint256 newY = _curve.k.div(newX);
        require(newX > 0 && newY > 0);

        // check cost
        uint256 cost = newY.sub(_curve.k.div(_curve.x));
        require(cost >= msg.value && cost >= maxCost);

        // update curve
        _curve.x = _curve.x.sub(amount.mul(uint256(10**18).add(fees[1]).add(fees[2])).div(10**18));

        // update LP supply
        _shardLP.underlyingSupply = _shardLP.underlyingSupply.add(amount.mul(fees[0]).div(10**18));
        _shardLP.feesToNiftex     = _shardLP.feesToNiftex.add(amount.mul(fees[1]).div(10**18));
        _shardLP.feesToArtist     = _shardLP.feesToArtist.add(amount.mul(fees[2]).div(10**18));

        // transfer
        ShardedWallet(payable(_wallet)).transfer(msg.sender, amount);
        if (msg.value > cost) {
            Address.sendValue(msg.sender, msg.value.sub(cost));
        }

        emit ShardsBought(msg.sender, amount, cost);

        require(
            ShardedWallet(payable(_wallet)).balanceOf(address(this))
            ==
            _shardLP.underlyingSupply.add(_shardLP.feesToNiftex).add(_shardLP.feesToArtist),
            "consistency"
        );
    }

    function sellShards(uint256 amount, uint256 minPayout) public {
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
        require(payout <= address(this).balance.sub(_ethLP.feesToNiftex).sub(_ethLP.feesToArtist) && payout >= minPayout);

        // update curve
        _curve.x = newX;

        // update LP supply
        _ethLP.underlyingSupply = _shardLP.underlyingSupply.add(payout.mul(fees[0]).div(10**18));
        _ethLP.feesToNiftex     = _shardLP.feesToNiftex.add(payout.mul(fees[1]).div(10**18));
        _ethLP.feesToArtist     = _shardLP.feesToArtist.add(payout.mul(fees[2]).div(10**18));

        // transfer
        require(ShardedWallet(payable(_wallet)).transferFrom(msg.sender, address(this), amount));
        Address.sendValue(msg.sender, payout.mul(uint256(10**18).sub(fees[0]).sub(fees[1]).sub(fees[2])).div(10**18));

        emit ShardsSold(msg.sender, amount, payout);
    }

    function calcNewShardLPTokensToIssue(uint256 amount) public view returns (uint256) {
        uint256 pool = _shardLP.underlyingSupply;
        if (pool == 0) { return amount; }
        uint256 proportion = amount.mul(10**18).div(pool.add(amount));
        return proportion.mul(_shardLP.totalSupply).div(uint256(10**18).sub(proportion));
    }

    function calcNewEthLPTokensToIssue(uint256 amount) public view returns (uint256) {
        uint256 pool = _ethLP.underlyingSupply;
        if (pool == 0) { return amount; }
        uint256 proportion = amount.mul(10**18).div(pool.add(amount));
        return proportion.mul(_ethLP.totalSupply).div(uint256(10**18).sub(proportion));
    }

    function calcShardsForEthSuppliers() public view returns (uint256) {
        uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
            .sub(_shardLP.feesToNiftex)
            .sub(_shardLP.feesToArtist);
        return balance < _shardLP.underlyingSupply ? 0 : balance - _shardLP.underlyingSupply;
    }

    function calcEthForShardSuppliers() public view returns (uint256) {
        uint256 balance = address(this).balance
            .sub(_ethLP.feesToNiftex)
            .sub(_ethLP.feesToArtist);
        return balance < _ethLP.underlyingSupply ? 0 : balance - _ethLP.underlyingSupply;
    }

    function supplyShards(uint256 amount) public {
        require(ShardedWallet(payable(_wallet)).transferFrom(msg.sender, address(this), amount));
        require(_curve.x.sub(_shardLP.underlyingSupply).sub(amount) >= 0);

        _mintShardLP(msg.sender, calcNewShardLPTokensToIssue(amount));
        _shardLP.underlyingSupply = _shardLP.underlyingSupply.add(amount);

        emit ShardsSupplied(msg.sender, amount);
    }

    function supplyEther() external payable {
        require(msg.value > 0);
        require(_curve.k.div(_curve.x).sub(address(this).balance) >= 0);

        _mintEthLP(msg.sender, calcNewEthLPTokensToIssue(msg.value));
        _ethLP.underlyingSupply = _ethLP.underlyingSupply.add(msg.value);

    	emit EtherSupplied(msg.sender, msg.value);
    }

    function withdrawSuppliedShards(uint256 amount) external returns (uint256, uint256) {
        require(amount > 0);

        uint256 balance = ShardedWallet(payable(_wallet)).balanceOf(address(this))
            .sub(_shardLP.feesToNiftex)
            .sub(_shardLP.feesToArtist);

        uint256 shards = (balance <= _shardLP.underlyingSupply)
            ? balance.mul(amount).div(_shardLP.totalSupply)
            : _shardLP.underlyingSupply.mul(amount).div(_shardLP.totalSupply);

        uint256 payout = calcEthForShardSuppliers()
            .mul(amount)
            .div(_shardLP.totalSupply);

        // update balances
        _shardLP.underlyingSupply = _shardLP.underlyingSupply.mul(_shardLP.totalSupply.sub(amount)).div(_shardLP.totalSupply);
        _burnShardLP(msg.sender, amount);

        // transfer
        ShardedWallet(payable(_wallet)).transfer(msg.sender, shards);
        if (payout > 0) {
            Address.sendValue(msg.sender, payout);
        }

        emit ShardsWithdrawn(msg.sender, payout, shards);

        return (payout, shards);
    }

    function withdrawSuppliedEther(uint256 amount) external returns (uint256, uint256) {
        require(amount > 0);

        uint256 balance = address(this).balance
            .sub(_ethLP.feesToNiftex)
            .sub(_ethLP.feesToArtist);

        uint256 value = (balance <= _ethLP.underlyingSupply)
            ? balance.mul(amount).div(_ethLP.totalSupply)
            : _ethLP.underlyingSupply.mul(amount).div(_ethLP.totalSupply);

        uint256 payout = calcShardsForEthSuppliers()
            .mul(amount)
            .div(_ethLP.totalSupply);

        // update balances
        _ethLP.underlyingSupply = _ethLP.underlyingSupply.mul(_ethLP.totalSupply.sub(amount)).div(_ethLP.totalSupply);
        _burnEthLP(msg.sender, amount);

        // transfer
        Address.sendValue(msg.sender, value);
        if (payout > 0) {
            ShardedWallet(payable(_wallet)).transfer(msg.sender, payout);
        }

        emit EtherWithdrawn(msg.sender, value, payout);

    	return (value, payout);
    }

    function withdrawNiftexOrArtistFees(address recipient) public {
        uint256 shardFees = 0;
        uint256 ethFees   = 0;

        if (msg.sender == ShardedWallet(payable(_wallet)).artistWallet()) {
            shardFees += _shardLP.feesToArtist;
            ethFees   += _ethLP.feesToArtist;
            _shardLP.feesToArtist = 0;
            _ethLP.feesToArtist   = 0;
        }

        if (msg.sender == ShardedWallet(payable(_wallet)).governance().getNiftexWallet()) {
            shardFees += _shardLP.feesToNiftex;
            ethFees   += _ethLP.feesToNiftex;
            _shardLP.feesToNiftex = 0;
            _ethLP.feesToNiftex   = 0;
        }

        Address.sendValue(payable(recipient), ethFees);
        ShardedWallet(payable(_wallet)).transfer(recipient, shardFees);
    }

    function transferTimelockLiquidity(address recipient) public {
        require(_recipient == msg.sender && _deadline < block.timestamp);
        _transferEthLP(address(this), recipient, _ethLP.balance[address(this)]);
        _transferShardLP(address(this), recipient, _ethLP.balance[address(this)]);
    }

    function transferShardLPTokens(address recipient, uint256 amount) public {
        _transferEthLP(msg.sender, recipient, amount);
    }

    function transferEthLPTokens(address recipient, uint256 amount) public {
        _transferShardLP(msg.sender, recipient, amount);
    }

    function _transferEthLP(address sender, address recipient, uint256 amount) internal {
        _ethLP.balance[sender]    = _ethLP.balance[sender].sub(amount);
        _ethLP.balance[recipient] = _ethLP.balance[recipient].add(amount);
        emit TransferEthLPTokens(sender, recipient, amount);
    }

    function _mintEthLP(address account, uint256 amount) internal {
        _ethLP.balance[account] = _ethLP.balance[account].add(amount);
        _ethLP.totalSupply      = _ethLP.totalSupply.add(amount);
        emit TransferEthLPTokens(address(0), account, amount);
    }

    function _burnEthLP(address account, uint256 amount) internal {
        _ethLP.balance[account] = _ethLP.balance[account].sub(amount);
        _ethLP.totalSupply      = _ethLP.totalSupply.sub(amount);
        emit TransferEthLPTokens(account, address(0), amount);
    }

    function _transferShardLP(address sender, address recipient, uint256 amount) internal {
        _shardLP.balance[sender]    = _shardLP.balance[sender].sub(amount);
        _shardLP.balance[recipient] = _shardLP.balance[recipient].add(amount);
        emit TransferShardLPTokens(sender, recipient, amount);
    }

    function _mintShardLP(address account, uint256 amount) internal {
        _shardLP.balance[account] = _shardLP.balance[account].add(amount);
        _shardLP.totalSupply      = _shardLP.totalSupply.add(amount);
        emit TransferShardLPTokens(address(0), account, amount);
    }

    function _burnShardLP(address account, uint256 amount) internal {
        _shardLP.balance[account] = _shardLP.balance[account].sub(amount);
        _shardLP.totalSupply      = _shardLP.totalSupply.sub(amount);
        emit TransferShardLPTokens(account, address(0), amount);
    }
}

































    // function getCurrentPrice() external view returns (uint256) {
    // 	return _k.mul(10**_shardedWalletDetails.decimals).div(_x).div(_x);
    // }
    //
    // function getCurveCoordinates() external view returns (uint256, uint256) {
    // 	return (_x, _k);
    // }
    //
    // function getEthSuppliers() external view returns (uint256, uint256, uint256, uint256) {
    // 	return (_ethLP.underlyingSupply, _ethLP.totalSupply, _ethLP._ethFeesToNiftex, _ethLP._ethFeesToArtist);
    // }
    //
    // function getShardSuppliers() external view returns (uint256, uint256, uint256, uint256) {
    // 	return (_shardLP.underlyingSupply, _shardLP.totalSupply, _shardLP._shardFeesToNiftex, _shardLP.feesToArtist);
    // }
    //
    // function getEthLPTokens(address owner) public view returns (uint256) {
    // 	return _ethLP._mappingEthLPTokens[owner];
    // }
    //
    // function getShardLPTokens(address owner) public view returns (uint256) {
    // 	return _shardLP._mappingShardLPTokens[owner];
    // }
    //
    // function decimals() public view returns (uint256) {
    // 	return _shardedWalletDetails.decimals;
    // }
    //
    // function getEthInPool() public view returns (uint256) {
    // 	return address(this).balance;
    // }
