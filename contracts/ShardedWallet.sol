// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract ShardedWallet is Ownable, ERC20
{
    using SafeMath for uint256;

    modifier restricted()
    {
        require(ERC20.balanceOf(msg.sender) == ERC20.totalSupply(), "Sender must own all the shares");
        _;
    }

    function initialize(
        address               owner_,
        string       calldata name_,
        string       calldata symbol_,
        uint256               totalSupply_,
        address               approve_,
        Allocation[] calldata allocations_)
    external
    {
        require(totalSupply() == 0);

        // erc20
        Ownable._initialize(owner_);
        ERC20._initialize(name_, symbol_);
        ERC20._setupDecimals(0);
        for (uint256 i = 0; i < allocations_.length; ++i)
        {
            Allocation memory allocation = allocations_[i];
            ERC20._mint(allocation.receiver, allocation.amount);
            totalSupply_ = totalSupply_.sub(allocation.amount);
        }
        ERC20._mint(address(this), totalSupply_);
        ERC20._approve(address(this), approve_, totalSupply_);
    }

    function execute(address to, uint256 value, bytes calldata data)
    external restricted()
    {
        (bool success, bytes memory returndata) = to.call{value: value}(data);
        require(success, string(returndata));
    }

    function delegate(address to, bytes calldata data)
    external restricted()
    {
        (bool success, bytes memory returndata) = to.delegatecall(data);
        require(success, string(returndata));
    }

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
