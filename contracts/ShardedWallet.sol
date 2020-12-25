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

    event Received(address indexed sender, uint256 value, bytes data);

    modifier onlyModule()
    {
        require(governance.isModule(address(this), msg.sender), "Access restricted to modules");
        _;
    }

    /*************************************************************************
     *                       Contructor and fallbacks                        *
     *************************************************************************/
    constructor()
    {
        governance = IGovernance(0xdead);
    }

    receive()
    external payable
    {
        emit Received(msg.sender, msg.value, msg.data);
    }

    fallback()
    external payable
    {
        address module = governance.getModule(address(this), msg.sig);
        if (module == address(0))
        {
            emit Received(msg.sender, msg.value, msg.data);
        }
        else
        {
            (bool success, /*bytes memory returndata*/) = module.staticcall(msg.data);
            // returning bytes in fallback is not supported until solidity 0.8.0
            // solhint-disable-next-line no-inline-assembly
            assembly {
                returndatacopy(0, 0, returndatasize())
                switch success
                case 0 { revert(0, returndatasize()) }
                default { return (0, returndatasize()) }
            }
        }
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
}
