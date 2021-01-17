// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../governance/IGovernance.sol";
import "./initializable/Ownable.sol";
import "./initializable/ERC20.sol";

contract ShardedWallet is Ownable, ERC20
{
    using SafeMath for uint256;

    IGovernance public governance;

    event Received(address indexed sender, uint256 value, bytes data);
    event Execute(address indexed to, uint256 value, bytes data);
    event ModuleExecute(address indexed module, address indexed to, uint256 value, bytes data);

    modifier onlyModule()
    {
        require(_isModule(msg.sender), "Access restricted to modules");
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
        if (module != address(0) && _isModule(module))
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
        else
        {
            emit Received(msg.sender, msg.value, msg.data);
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

    function _isModule(address module)
    internal view returns (bool)
    {
        return governance.isModule(address(this), module);
    }

    /*************************************************************************
     *                          Owner interactions                           *
     *************************************************************************/
    function execute(address to, uint256 value, bytes calldata data)
    external onlyOwner()
    {
        Address.functionCallWithValue(to, data, value);
        emit Execute(to, value, data);
    }

    function retreive(address newOwner)
    external
    {
        ERC20._burn(msg.sender, Math.max(ERC20.totalSupply(), 1));
        Ownable._setOwner(newOwner);
    }

    /*************************************************************************
     *                          Module interactions                          *
     *************************************************************************/
    function moduleExecute(address to, uint256 value, bytes calldata data)
    external onlyModule()
    {
        if (Address.isContract(to))
        {
            Address.functionCallWithValue(to, data, value);
        }
        else
        {
            Address.sendValue(payable(to), value);
        }
        emit ModuleExecute(msg.sender, to, value, data);
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
}
