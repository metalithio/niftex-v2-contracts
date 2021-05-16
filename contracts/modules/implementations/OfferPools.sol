// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../ModuleBase.sol";
import "./ShardedWalletFactory.sol";

contract OfferPools is IModule, ModuleBase
{
    string public constant override name = type(OfferPools).name;

    ShardedWalletFactory public immutable shardedwalletfactory;
    address              public immutable governance;

    // registry => tokenId => asset
    mapping(address => mapping(uint256 => mapping(address => address))) private _pools;

    event NewPool(address indexed registry, uint256 indexed tokenId, address indexed asset, address pool);
    event Deposit(address indexed registry, uint256 indexed tokenId, address indexed asset, uint256 amount);
    event Withdraw(address indexed registry, uint256 indexed tokenId, address indexed asset, uint256 amount);
    event OfferAccepted(address indexed registry, uint256 indexed tokenId, address indexed asset, address account);

    constructor(address shardedwalletfactory_, address governance_)
    ModuleBase(ShardedWalletFactory(shardedwalletfactory_).walletTemplate())
    {
        shardedwalletfactory = ShardedWalletFactory(shardedwalletfactory_);
        governance           = governance_;
    }

    function getPool(address registry, uint256 tokenId, address asset) external view returns (address) {
        return _pools[registry][tokenId][asset];
    }

    function createPool(address registry, uint256 tokenId, address asset)
    public returns (address instance)
    {
        require(_pools[registry][tokenId][asset] == address(0), "Pool already initialized");
        instance = shardedwalletfactory.mintWallet(
            governance,        // governance_,
            address(this),     // owner_,
            "OfferPoolWallet", // name_,
            "OPW",             // symbol_,
            address(0)         // artistWallet_
        );
        _pools[registry][tokenId][asset] = instance;

        emit NewPool(registry, tokenId, asset, instance);
    }

    function depositETH(address registry, uint256 tokenId)
    public payable
    {
        address wallet = _pools[registry][tokenId][address(0)];
        if (wallet == address(0)) {
            wallet = createPool(registry, tokenId, address(0));
        }

        ShardedWallet(payable(wallet)).moduleMint(msg.sender, msg.value);

        emit Deposit(registry, tokenId, address(0), msg.value);
    }

    function withdrawETH(address registry, uint256 tokenId, uint256 amount)
    public
    {
        address wallet = _pools[registry][tokenId][address(0)];
        ShardedWallet(payable(wallet)).moduleBurn(msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);

        emit Withdraw(registry, tokenId, address(0), amount);
    }

    function deposit(address registry, uint256 tokenId, address asset, uint256 amount)
    public
    {
        address wallet = _pools[registry][tokenId][asset];
        if (wallet == address(0)) {
            wallet = createPool(registry, tokenId, asset);
        }

        SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), amount);
        ShardedWallet(payable(wallet)).moduleMint(msg.sender, amount);

        emit Deposit(registry, tokenId, asset, amount);
    }

    function withdraw(address registry, uint256 tokenId, address asset, uint256 amount)
    public
    {
        address wallet = _pools[registry][tokenId][asset];
        ShardedWallet(payable(wallet)).moduleBurn(msg.sender, amount);
        SafeERC20.safeTransfer(IERC20(asset), msg.sender, amount);

        emit Withdraw(registry, tokenId, asset, amount);
    }

    function acceptOfferERC721(address registry, uint256 tokenId, address asset, uint256 minimum)
    public
    {
        address wallet = _pools[registry][tokenId][asset];
        IERC721(registry).transferFrom(msg.sender, wallet, tokenId);
        _acceptOffer(registry, tokenId, asset, minimum);
    }

    function acceptOfferERC1155(address registry, uint256 tokenId, address asset, uint256 minimum)
    public
    {
        address wallet = _pools[registry][tokenId][asset];
        IERC1155(registry).safeTransferFrom(msg.sender, wallet, tokenId, 1, "");
        _acceptOffer(registry, tokenId, asset, minimum);
    }

    function _acceptOffer(address registry, uint256 tokenId, address asset, uint256 minimum)
    internal
    {
        address wallet = _pools[registry][tokenId][asset];
        // protection against frontrunning.
        uint256 amount = ShardedWallet(payable(wallet)).totalSupply();
        require(amount >= minimum, "OfferPools: not enough value in pool");

        // detach wallet
        ShardedWallet(payable(wallet)).renounceOwnership();
        delete _pools[registry][tokenId][asset];

        // pay the sender
        if (address(asset) == address(0)) {
            Address.sendValue(payable(msg.sender), amount);
        } else {
            SafeERC20.safeTransfer(IERC20(asset), msg.sender, amount);
        }

        emit OfferAccepted(registry, tokenId, asset, msg.sender);
    }
}
