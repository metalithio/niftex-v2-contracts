/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

import "./CloneFactory.sol";

pragma solidity ^0.6.0;

//copied from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v3.1.0/contracts/GSN/Context.sol
abstract contract Context {
    function _msgSender() internal view virtual returns (address payable) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes memory) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        return msg.data;
    }
}

//MODIFIED version of https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol
//with constructor removed, _owner made public
abstract contract Ownable is Context {
    address public _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(_owner == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

contract BuyoutFactory is Ownable, CloneFactory {
	address public libraryAddress;
	event NewContract(address contractAddress, uint256 fracId, address desiredOwner);

	constructor(address deployedBuyout) {
		_owner = msg.sender;
		emit OwnershipTransferred(address(0), _owner);
		libraryAddress = deployedBuyout;
	}

	function deploy(

	) onlyOwner() external {
		address newContractAddress = createClone(libraryAddress);
		NiftexERC20(newContractAddress).init();
		emit NewContract(newContractAddress, fracId, desiredOwner);
	}
}
