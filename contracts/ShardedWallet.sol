// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./governance/IGovernance.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";
import "./initializable/ERC20Buyout.sol";
import "./initializable/DelayedAction.sol";

contract ShardedWallet is Ownable, ERC20, ERC20Buyout, DelayedAction
{
    using SafeMath for uint256;

    IGovernance public governance;

    modifier restricted()
    {
        require(
            Ownable.owner() == msg.sender
            ||
            (ERC20.totalSupply() > 0 && ERC20.balanceOf(msg.sender) == ERC20.totalSupply()),
            "Sender must be owner or own all the shares");
        _;
    }

    constructor()
    {
        Ownable._setOwner(address(0xdead));
    }

    /*************************************************************************
     *                 Initialization and crowdsale trigger                  *
     *************************************************************************/
    function initialize(
        address         minter_,
        address         governance_,
        string calldata name_,
        string calldata symbol_)
    external
    {
        require(Ownable.owner() == address(0));
        Ownable._setOwner(minter_);
        ERC20._initialize(name_, symbol_);
        governance = IGovernance(governance_);
    }

    function startCrowdsale(address crowdsaleManager_, bytes calldata setupdata_)
    external onlyOwner()
    {
        require(totalSupply() == 0);
        Ownable.transferOwnership(crowdsaleManager_);
        (bool success, bytes memory returndata) = crowdsaleManager_.call(setupdata_);
        require(success, string(returndata));
    }

    function mint(address to, uint256 value)
    external onlyOwner() // only by crowdsalemanager
    {
        ERC20._mint(to, value);
    }

    /*************************************************************************
     *                        Calls / Delegate calls                         *
     *************************************************************************/
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

    /*************************************************************************
     *                       Holders actions with veto                       *
     *************************************************************************/
    function scheduleAction(ActionType actiontype, address to, bytes memory data)
    external returns (bytes32)
    {
        require(balanceOf(msg.sender) > 0);
        return DelayedAction._schedule(actiontype, to, 0, data, governance.ACTION_DURATION());
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

    /*************************************************************************
     *                            Buyout support                             *
     *************************************************************************/
    function openBuyout(uint256 pricePerShare)
    external payable
    {
        ERC20Buyout._openBuyout(pricePerShare, governance.BUYOUT_DURATION());
    }

    function closeBuyout()
    external payable
    {
        ERC20Buyout._closeBuyout();
    }

    function claimBuyout(address to)
    external
    {
        ERC20Buyout._claimBuyout(to);
    }

    function claimOwnership(address to)
    external
    {
        ERC20Buyout._resetBuyout();
        Ownable._setOwner(to);
    }

    /*************************************************************************
     *                           Standard receiver                           *
     *************************************************************************/
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
