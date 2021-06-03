// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// MasterChef is the master of frac. He can make Sushi and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once SUSHI is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.

// Copied and modified from MasterChef code:
// https://github.com/sushiswap/sushiswap/blob/master/contracts/MasterChef.sol
contract MasterChef is Ownable {
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of SUSHIs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accFracPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accFracPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. SUSHIs to distribute per block.
        uint256 lastRewardBlock; // Last block number that SUSHIs distribution occurs.
        uint256 accFracPerShare; // Accumulated SUSHIs per share, times 1e12. See below.
    }
    // The FRAC TOKEN!
    ERC20 public frac;
    // NIFTEX DAO address.
    address public daoaddr;
    // Block number when bonus FRAC period ends.
    uint256 public bonusEndBlock;
    // end block number
    uint256 public endBlock;
    // SUSHI tokens created per block.
    uint256 public fracPerBlock;
    // Bonus muliplier for early frac makers.
    uint256 public bonusMultiplier = 10**18;
    // vault to transfer FRAC from
    address public fracVault;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when SUSHI mining starts.
    uint256 public startBlock;
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    modifier isDao() {
        require(msg.sender == daoaddr);
        _;
    }

    constructor(
        ERC20 _frac,
        address _daoaddr,
        uint256 _fracPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _endBlock,
        uint256 _bonusMultiplier,
        address _fracVault
    ) public {
        frac = _frac;
        daoaddr = _daoaddr;
        fracPerBlock = _fracPerBlock;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
        endBlock = _endBlock;
        bonusMultiplier = _bonusMultiplier;
        fracVault = _fracVault;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock =
            Math.min(block.number, endBlock) > startBlock ? Math.min(block.number, endBlock) : startBlock;
        totalAllocPoint = totalAllocPoint + _allocPoint;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accFracPerShare: 0
            })
        );
    }

    // Update the given pool's SUSHI allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + 
            _allocPoint
        ;
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= bonusEndBlock) {
            return (_to - _from) * bonusMultiplier / 10**18;
        } else if (_from >= bonusEndBlock) {
            return _to - _from;
        } else {
            return
                (bonusEndBlock - _from) * bonusMultiplier / 10**18 + (
                    _to - bonusEndBlock
                );
        }
    }

    // View function to see pending FRACs on frontend.
    function pendingFrac(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accFracPerShare = pool.accFracPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (Math.min(block.number, endBlock) > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(pool.lastRewardBlock, Math.min(block.number, endBlock));
            uint256 fracReward =
                multiplier * fracPerBlock * pool.allocPoint / totalAllocPoint;
            accFracPerShare = accFracPerShare + (
                fracReward* 1e12 / lpSupply
            );
        }
        return user.amount * accFracPerShare / 1e12 - user.rewardDebt;
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (Math.min(block.number, endBlock) <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = Math.min(block.number, endBlock);
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, Math.min(block.number, endBlock));
        uint256 fracReward =
            multiplier * fracPerBlock * pool.allocPoint /
                totalAllocPoint;
        pool.accFracPerShare = pool.accFracPerShare + (
            fracReward * 1e12 / lpSupply
        );
        pool.lastRewardBlock = Math.min(block.number, endBlock);
    }

    // Deposit LP tokens to MasterChef for SUSHI allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount * pool.accFracPerShare / 1e12 - user.rewardDebt;
            safeFracTransfer(msg.sender, pending);
        }
        pool.lpToken.transferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount + _amount;
        user.rewardDebt = user.amount * pool.accFracPerShare / 1e12;
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending =
            user.amount * pool.accFracPerShare / 1e12 - user.rewardDebt;
        safeFracTransfer(msg.sender, pending);
        user.amount = user.amount - _amount;
        user.rewardDebt = user.amount * pool.accFracPerShare / 1e12;
        pool.lpToken.transfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.transfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // please use this responsibly
    function disableMining() public isDao {
        endBlock = Math.min(endBlock, block.number);
    }

    // Safe sushi transfer function, just in case if rounding error causes pool to not have enough SUSHIs.
    function safeFracTransfer(address _to, uint256 _amount) internal {
        uint256 fracBal = frac.balanceOf(fracVault);
        if (_amount > fracBal) {
            frac.transferFrom(fracVault, _to, fracBal);
        } else {
            frac.transferFrom(fracVault, _to, _amount);
        }
    }

    // Update dao address by the previous dao.
    function dao(address _daoaddr) public isDao {
        daoaddr = _daoaddr;
    }
}
