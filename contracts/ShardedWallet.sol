// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/math/Math.sol";
import "./governance/IGovernance.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";

contract ShardedWallet is Ownable, ERC20
{
    using SafeMath for uint256;

    IGovernance public governance;

    event ERC721Received(address indexed token, address indexed operator, address indexed from, uint256 tokenId);
    event ERC777Received(address indexed token, address indexed operator, address indexed from, uint256 amount);
    event ERC1155Received(address indexed token, address indexed operator, address indexed from, uint256 id, uint256 value);

    modifier onlyModule()
    {
        require(isModule(msg.sender), "Access restricted to modules");
        _;
    }

    constructor()
    {
        Ownable._setOwner(address(0xdead));
    }

    /*************************************************************************
     *                            Initialization                             *
     *************************************************************************/
    function initialize(
        address         governance_,
        address         minter_,
        string calldata name_,
        string calldata symbol_)
    external
    {
        require(address(governance) == address(0));
        governance = IGovernance(governance_);
        Ownable._setOwner(minter_);
        ERC20._initialize(name_, symbol_);
    }

    /*************************************************************************
     *                          Owner interactions                           *
     *************************************************************************/
    function execute(address to, uint256 value, bytes calldata data)
    external onlyOwner()
    {
        _call(to, value, data);
    }

    function executeBatch(address[] calldata to, uint256[] calldata value, bytes[] calldata data)
    external onlyOwner()
    {
        require(to.length == value.length);
        require(to.length == data.length);
        for (uint256 i = 0; i < to.length; ++i)
        {
            _call(to[i], value[i], data[i]);
        }
    }

    /*************************************************************************
     *                          Module interactions                          *
     *************************************************************************/
    function isModule(address module)
    public view returns (bool)
    {
        return governance.isModule(module);
    }

    function moduleMint(address to, uint256 value)
    external onlyModule()
    {
        ERC20._mint(to, value);
    }

    function moduleBurn(address from, uint256 value)
    external onlyModule()
    {
        ERC20._burn(from, value);
    }

    function moduleTransfer(address from, address to, uint256 value)
    external onlyModule()
    {
        ERC20._transfer(from, to, value);
    }

    function moduleTransferOwnership(address to)
    external onlyModule()
    {
        Ownable._setOwner(to);
    }

    function moduleExecute(address to, uint256 value, bytes calldata data)
    external onlyModule()
    {
        _call(to, value, data);
    }

    function moduleExecuteBatch(address[] calldata to, uint256[] calldata value, bytes[] calldata data)
    external onlyModule()
    {
        require(to.length == value.length);
        require(to.length == data.length);
        for (uint256 i = 0; i < to.length; ++i)
        {
            _call(to[i], value[i], data[i]);
        }
    }

    /*************************************************************************
     *                               Internal                                *
     *************************************************************************/
    function _call(address to, uint256 value, bytes memory data)
    internal
    {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = to.call{value: value}(data);
        require(success, string(returndata));
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
