// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/Math.sol";
import "./governance/IGovernance.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";
import "./initializable/ERC20Buyout.sol";
import "./initializable/DelayedAction.sol";

contract ShardedWallet is Ownable, ERC20, ERC20Buyout, DelayedAction
{
    using SafeMath for uint256;

    IGovernance public governance;

    event ERC721Received(address indexed token, address indexed operator, address indexed from, uint256 tokenId);
    event ERC777Received(address indexed token, address indexed operator, address indexed from, uint256 amount);
    event ERC1155Received(address indexed token, address indexed operator, address indexed from, uint256 id, uint256 value);

    modifier restricted()
    {
        require(
            Ownable.owner() == msg.sender
            ||
            ERC20.balanceOf(msg.sender) == Math.max(ERC20.totalSupply(), 1),
            "Sender must be owner or own all the shares");
        _;
    }

    modifier balanceFractionRequired(uint256 fraction, uint256 minimum)
    {
        require(ERC20.balanceOf(msg.sender) >= Math.max(ERC20.totalSupply().mul(fraction).div(10**18), minimum), "Sender does not control enough shares");
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
    external onlyBeforeTimer(_ERC20BUYOUT_TIMER_) onlyOwner()
    {
        ERC20._mint(to, value);
    }

    /*************************************************************************
     *                        Calls / Delegate calls                         *
     *************************************************************************/
    function execute(address[] calldata to, bytes[] calldata data)
    external restricted()
    {
        require(to.length == data.length);
        for (uint i = 0; i < to.length; ++i)
        {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory returndata) = to[i].call(data[i]);
            require(success, string(returndata));
        }
    }

    /*************************************************************************
     *                       Holders actions with veto                       *
     *************************************************************************/
    function scheduleAction(address[] calldata to, bytes[] memory data)
    external balanceFractionRequired(governance.ACTION_REQUIRED(), 1) returns (bytes32)
    {
        return DelayedAction._schedule(to, data, governance.ACTION_DURATION());
    }

    function executeAction(address[] calldata to, bytes[] memory data)
    external balanceFractionRequired(governance.ACTION_REQUIRED(), 1) onlyBeforeTimer(_ERC20BUYOUT_TIMER_) returns (bool)
    {
        return DelayedAction._execute(to, data);
    }

    function cancelAction(bytes32 id)
    external balanceFractionRequired(governance.ACTION_REQUIRED(), 1) returns (bool)
    {
        return DelayedAction._cancel(id);
    }

    /*************************************************************************
     *                            Buyout support                             *
     *************************************************************************/
    function openBuyout(uint256 pricePerShare)
    external balanceFractionRequired(governance.BUYOUT_REQUIRED(), 1) payable
    {
        ERC20Buyout._openBuyout(pricePerShare, governance.BUYOUT_DURATION());
    }

    function closeBuyout()
    external balanceFractionRequired(governance.BUYOUT_REQUIRED(), 1) payable
    {
        ERC20Buyout._closeBuyout();
    }

    function claimBuyout(address to)
    external
    {
        ERC20Buyout._claimBuyout(to);
    }

    function postBuyout() // cleans state: necessary to run a crowdsale after a buyout
    external restricted()
    {
        ERC20Buyout._resetBuyout();
    }

    function claimOwnership(address to)
    external onlyAfterTimer(_ERC20BUYOUT_TIMER_)
    {
        require(msg.sender == ERC20Buyout.buyoutProposer());
        Ownable._setOwner(to);
    }

    /*************************************************************************
     *                           Standard receiver                           *
     *************************************************************************/
    // ERC721
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
    external returns (bytes4)
    {
        emit ERC721Received(msg.sender, operator, from, tokenId);
        return this.onERC721Received.selector;
    }

    // ERC777
    function tokensReceived(address operator, address from, address, uint256 amount, bytes calldata, bytes calldata)
    external
    {
        emit ERC777Received(msg.sender, operator, from, amount);
    }

    // ERC1155
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata)
    external returns(bytes4)
    {
        emit ERC1155Received(msg.sender, operator, from, id, value);
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address operator, address from, uint256[] calldata ids, uint256[] calldata values, bytes calldata)
    external returns(bytes4)
    {
        for (uint256 i = 0; i < ids.length; ++i) {
            emit ERC1155Received(msg.sender, operator, from, ids[i], values[i]);
        }
        return this.onERC1155BatchReceived.selector;
    }
}
