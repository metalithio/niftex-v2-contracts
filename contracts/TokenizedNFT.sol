// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";
import "./initializable/ERC20Capped.sol";

struct NFT
{
    address registry;
    uint256 id;
}

struct Allocation
{
    address receiver;
    uint256 amount;
}

enum Lifecycle
{
    UNSET,
    LIVE, // crowdsale is part of live
    BUYOUT,
    REEDEMED
}

contract TokenizedNFT is Ownable, ERC20, ERC20Capped, IERC721Receiver
{
    using SafeMath for uint256;

    NFT                         public token;
    Lifecycle                   public status;
    mapping(address => uint256) public crowdsaleAllocations;
    uint256                     public crowdsalePricePerShare;
    uint256                     public crowdsaleDeadline;
    uint256                     public crowdsaleBalance;
    address payable             public buyoutProposer;
    uint256                     public buyoutPricePerShare;
    uint256                     public buyoutDeadline;

    event SharesBought(address indexed account, uint256 shares);

    modifier duringCrowdsale()
    {
        require(crowdsaleActive());
        _;
    }

    modifier afterCrowdsale()
    {
        require(!crowdsaleActive());
        _;
    }

    function crowdsaleSuccessfull()
    internal view returns (bool)
    {
        return cap() == totalSupply();
    }

    function crowdsaleActive()
    internal view returns (bool)
    {
        return block.timestamp < crowdsaleDeadline && !crowdsaleSuccessfull();
    }

    function crowdsaleFailled()
    internal view returns (bool)
    {
        return block.timestamp >= crowdsaleDeadline && !crowdsaleSuccessfull();
    }

    /*************************************************************************
     *                            Setup contract                             *
     *************************************************************************/
    function initialize(
        address               admin_,
        string       calldata name_,
        string       calldata symbol_,
        uint256               cap_,
        uint256               crowdsalePricePerShare_,
        uint256               crowdsaleDuration_,
        NFT          calldata token_,
        Allocation[] calldata allocations_)
    external
    {
        // check status
        require(status == Lifecycle.UNSET);
        // setup Ownable
        Ownable._initializeOwnable(admin_);
        // setup ERC020
        ERC20._initializeERC20(name_, symbol_);
        ERC20Capped._initializeERC20Capped(cap_);
        _setupDecimals(0);
        // crowdsale
        crowdsalePricePerShare = crowdsalePricePerShare_;
        crowdsaleDeadline      = block.timestamp + crowdsaleDuration_;
        // token check
        token = token_;
        // distribute shares
        for (uint256 i = 0; i < allocations_.length; ++i)
        {
            _mint(allocations_[i].receiver, allocations_[i].amount);
        }
        // make live
        status = Lifecycle.LIVE;
    }

    /*************************************************************************
     *                               Crowdsale                               *
     *************************************************************************/
    /* Buy shares with Eth, and allocate them to `to` */
    function buy(address to)
    public payable
    {
        require(crowdsaleActive());
        // number of shares
        uint256 shares = Math.min(
            msg.value.div(crowdsalePricePerShare),
            cap().sub(totalSupply())
        );
        uint256 price = shares.mul(crowdsalePricePerShare);
        // create shares
        _mint(address(this), shares);
        crowdsaleAllocations[to] = crowdsaleAllocations[to].add(shares);
        // manage eth
        crowdsaleBalance = crowdsaleBalance.add(price);
        Address.sendValue(msg.sender, msg.value.sub(price));

        emit SharesBought(to, shares);
    }

    /* After crowdsale, either get your allocated shares, or get refunded */
    function claimShares(address payable to)
    public
    {
        require(!crowdsaleActive());
        uint256 shares = crowdsaleAllocations[msg.sender];
        if (crowdsaleSuccessfull())
        {
            _transfer(address(this), to, shares);
        }
        else
        {
            _burn(address(this), shares);
            Address.sendValue(to, shares.mul(crowdsalePricePerShare));
        }
        crowdsaleAllocations[msg.sender] = 0;
    }

    /* On successfull crowdsale, owner then get the value of the crowdsale */
    function withdraw(address payable to)
    public onlyOwner()
    {
        require(crowdsaleSuccessfull());
        Address.sendValue(to, crowdsaleBalance);
        crowdsaleBalance = 0;
    }

    /*************************************************************************
     *                                Buyout                                 *
     *************************************************************************/

    /* Buyout */
    function startBuyout(uint256 pricePerShare)
    public payable
    {
        require(crowdsaleSuccessfull());
        require(status == Lifecycle.LIVE);
        require(balanceOf(msg.sender) > 0);

        uint256 buyoutshares = totalSupply().sub(balanceOf(msg.sender));
        uint256 buyoutprice  = buyoutshares.mul(pricePerShare);
        Address.sendValue(msg.sender, msg.value.sub(buyoutprice));

        buyoutProposer      = msg.sender;
        buyoutPricePerShare = pricePerShare;
        buyoutDeadline      = block.timestamp.add(2 weeks);

        status = Lifecycle.BUYOUT;
    }


    function stopBuyout()
    public payable
    {
        require(status == Lifecycle.BUYOUT, "no buyout scheduled");
        require(block.timestamp < buyoutDeadline);
        require(msg.sender != buyoutProposer);

        status = Lifecycle.LIVE;

        // refund the proposer's deposit
        uint256 buyoutshares = balanceOf(buyoutProposer);
        uint256 buyoutprice  = totalSupply().sub(buyoutshares).mul(buyoutPricePerShare);
        uint256 stopprice    = buyoutshares.mul(buyoutPricePerShare);
        Address.sendValue(buyoutProposer, buyoutprice.add(stopprice)); // send deposit back + buy shares
        Address.sendValue(msg.sender,     msg.value.sub(stopprice)); // refund extra
        _transfer(buyoutProposer, msg.sender, buyoutshares);

        // cleanup
        delete buyoutProposer;
        delete buyoutPricePerShare;
        delete buyoutDeadline;
    }

    function finalizeBuyout(address to)
    public
    {
        require(status == Lifecycle.BUYOUT);
        require(block.timestamp >= buyoutDeadline);
        require(msg.sender == buyoutProposer);

        status = Lifecycle.REEDEMED;

        // Burn share so proposer cannot redeem funds
        _burn(msg.sender, balanceOf(msg.sender));
        // transfer NFTs
        _sendNFT(to);
    }

    function claimFunds(address payable to)
    public
    {
        require(status == Lifecycle.REEDEMED);
        uint256 shares = balanceOf(msg.sender);
        Address.sendValue(to, shares.mul(buyoutPricePerShare));
        _burn(msg.sender, shares);
    }

    /*************************************************************************
     *                            NFT management                             *
     *************************************************************************/
    function redeem(address to)
    public
    {
        require(!crowdsaleActive());
        if (crowdsaleSuccessfull())
        {
            require(balanceOf(msg.sender) == totalSupply());
        }
        else
        {
            // you need to be the owner
            require(msg.sender == owner());
            // TODO: burn you shares ?
        }
        _sendNFT(to);
        status = Lifecycle.REEDEMED;
    }

    function _sendNFT(address to)
    internal
    {
        IERC721(token.registry).safeTransferFrom(address(this), to, token.id);
    }

    /* Standard interface */
    function onERC721Received(address, address, uint256, bytes calldata)
    external view override returns (bytes4)
    {
        require(status == Lifecycle.UNSET);
        return IERC721Receiver.onERC721Received.selector;
    }

    /*************************************************************************
     *                            Fix overloading                            *
     *************************************************************************/
    function _beforeTokenTransfer(address from, address to, uint256 amount)
    internal override(ERC20, ERC20Capped)
    {
        require(status != Lifecycle.BUYOUT, "TODONAME: cannot transfer during buyout");
        super._beforeTokenTransfer(from, to, amount);
    }
}

// TODO: what about NFT that do not onERC721Received ?
// TODO: what about redeeming non standard ERC721 ?
