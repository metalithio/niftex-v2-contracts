// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";
import "./initializable/ERC20Buyout.sol";
import "./initializable/DelayedAction.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract ShardedWallet is ERC20, ERC20Buyout, DelayedAction
{
    using SafeMath for uint256;

    address private _minter;

    modifier restricted()
    {
        require(
            ERC20.balanceOf(msg.sender) == ERC20.totalSupply()
            ||
            (msg.sender == ERC20Buyout.buyoutProposer() && WithTimers._afterTimer(_ERC20BUYOUT_TIMER_)),
            "Sender must own all the shares or perform a buyout");
        _;
    }

    function initialize(
        address               minter_,
        string       calldata name_,
        string       calldata symbol_,
        uint256               totalSupply_,
        address               approve_,
        Allocation[] calldata allocations_)
    external
    {
        require(_minter == address(0));
        // minter
        _minter = minter_;
        // erc20
        ERC20._initialize(name_, symbol_);
        for (uint256 i = 0; i < allocations_.length; ++i)
        {
            Allocation memory allocation = allocations_[i];
            ERC20._mint(allocation.receiver, allocation.amount);
            totalSupply_ = totalSupply_.sub(allocation.amount);
        }
        ERC20._mint(address(this), totalSupply_);
        ERC20._approve(address(this), approve_, totalSupply_);
        // buyout
        ERC20Buyout._initialize(2 weeks);
        // votes
        DelayedAction._initialize(2 weeks);
    }

    function execute(address to, uint256 value, bytes calldata data)
    external restricted()
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = to.call{value: value}(data);
        require(success, string(returndata));
    }

    function delegate(address to, bytes calldata data)
    external restricted()
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = to.delegatecall(data);
        require(success, string(returndata));
    }

    function scheduleAction(ActionType actiontype, address to, bytes memory data)
    external returns (bytes32)
    {
        require(balanceOf(msg.sender) > 0);
        return DelayedAction._schedule(actiontype, to, 0, data);
    }

    function executeAction(ActionType actiontype, address to, bytes memory data)
    external onlyBeforeTimer(_ERC20BUYOUT_TIMER_) returns (bool)
    {
        require(balanceOf(msg.sender) > 0);
        return DelayedAction._execute(actiontype, to, 0, data);
    }

    function cancelAction(bytes32 id)
    external returns (bool)
    {
        require(balanceOf(msg.sender) > 0);
        return DelayedAction._cancel(id);
    }

    function minter() public view returns (address) { return _minter; }

    // inheritance cleanup
    function _initialize(uint256) internal virtual override(ERC20Buyout, DelayedAction) {}

    // ERC721
    function onERC721Received(address, address, uint256, bytes calldata)
    external pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    // ERC777
    function tokensReceived(address, address, address, uint256, bytes calldata, bytes calldata)
    external pure
    {}

    // ERC1155
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
    external pure returns(bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
    external pure returns(bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
