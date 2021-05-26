// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../initializable/BondingCurve3.sol";
import "../ModuleBase.sol";
import "./ShardedWalletFactory.sol";

contract MagneticPool is IModule, ModuleBase
{
    string public constant override name = type(MagneticPool).name;

    // bytes32 public constant MAGNETIC_FEE_NIFTEX = bytes32(uint256(keccak256("MAGNETIC_FEE_NIFTEX")) - 1);
    bytes32 public constant MAGNETIC_FEE_NIFTEX  = 0x56607a74616b4fa14c14943f0e02b9b315c4525dafdf1b55857c00d254d7950c;
    // bytes32 public constant CURVE_TEMPLATE          = bytes32(uint256(keccak256("CURVE_TEMPLATE")) - 1);
    bytes32 public constant CURVE_TEMPLATE          = 0x3cec7c13345ae32e688f81840d184c63978bb776762e026e7e61d891bb2dd84b;

    ShardedWalletFactory public immutable shardedwalletfactory;
    address              public immutable governance;

    // registry => tokenId => asset
    mapping(address => mapping(uint256 => mapping(address => address))) private _pools;

    event NewPool(address indexed registry, uint256 indexed tokenId, address indexed asset, address pool);
    event Deposit(address indexed registry, uint256 indexed tokenId, address indexed asset, address account, uint256 amount);
    event Withdraw(address indexed registry, uint256 indexed tokenId, address indexed asset, address account, uint256 amount);
    event OfferAccepted(address indexed registry, uint256 indexed tokenId, address indexed asset, address account);
    event NewBondingCurve(ShardedWallet indexed wallet, address indexed curve);

    constructor(address shardedwalletfactory_, address governance_)
    ModuleBase(ShardedWalletFactory(shardedwalletfactory_).walletTemplate())
    {
        shardedwalletfactory = ShardedWalletFactory(shardedwalletfactory_);
        governance           = governance_;
    }

    function getPool(address registry, uint256 tokenId, address asset)
    external view returns (address)
    {
        return _pools[registry][tokenId][asset];
    }

    function createPool(
        address registry,
        uint256 tokenId,
        address asset,
        string memory walletName,
        string memory walletSymbol,
        address walletArtist
    )
    external returns (address instance)
    {
        require(_pools[registry][tokenId][asset] == address(0), "Pool already initialized");
        instance = shardedwalletfactory.mintWallet(
            governance,
            address(this),
            walletName,
            walletSymbol,
            walletArtist
        );
        _pools[registry][tokenId][asset] = instance;

        emit NewPool(registry, tokenId, asset, instance);
    }

    /**
     * Deposit funds to mint option shards
     */
    function deposit(address registry, uint256 tokenId, address asset, uint256 amount)
    external
    {
        SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), amount);
        _deposit(registry, tokenId, asset, msg.sender, amount);
    }

    function depositETH(address registry, uint256 tokenId)
    external payable
    {
        _deposit(registry, tokenId, address(0), msg.sender, msg.value);
    }

    function _deposit(address registry, uint256 tokenId, address asset, address account, uint256 amount)
    internal
    {
        address wallet = _pools[registry][tokenId][asset];
        ShardedWallet(payable(wallet)).moduleMint(account, amount);
        emit Deposit(registry, tokenId, asset, account, amount);
    }

    /**
     * Burn option shards to withdraw funds
     */
    function withdraw(address registry, uint256 tokenId, address asset, uint256 amount)
    external
    {
        _withdraw(registry, tokenId, asset, msg.sender, amount);
        SafeERC20.safeTransfer(IERC20(asset), msg.sender, amount);
    }

    function withdrawETH(address registry, uint256 tokenId, uint256 amount)
    external
    {
        _withdraw(registry, tokenId, address(0), msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);
    }

    function _withdraw(address registry, uint256 tokenId, address asset, address account, uint256 amount)
    internal
    {
        address wallet = _pools[registry][tokenId][asset];
        if (ShardedWallet(payable(wallet)).governance().isModule(wallet, address(this))) {
            ShardedWallet(payable(wallet)).moduleBurn(account, amount);
        } else {
            ShardedWallet(payable(wallet)).burnFrom(account, amount);
        }

        emit Withdraw(registry, tokenId, asset, account, amount);
    }

    /**
     * Accept offer and get corresponding funds
     */
    function acceptOfferERC721(address registry, uint256 tokenId, address asset, uint256 minimum)
    external
    {
        address wallet = _pools[registry][tokenId][asset];
        IERC721(registry).transferFrom(msg.sender, wallet, tokenId);
        _acceptOffer(registry, tokenId, asset, minimum);
    }

    function acceptOfferERC1155(address registry, uint256 tokenId, address asset, uint256 minimum, bytes calldata data)
    external
    {
        address wallet = _pools[registry][tokenId][asset];
        IERC1155(registry).safeTransferFrom(msg.sender, wallet, tokenId, 1, data);
        _acceptOffer(registry, tokenId, asset, minimum);
    }

    function _acceptOffer(address registry, uint256 tokenId, address asset, uint256 minimum)
    internal
    {
        ShardedWallet wallet           = ShardedWallet(payable(_pools[registry][tokenId][asset]));
        IGovernance   walletGovernance = wallet.governance();

        // protection against frontrunning.
        uint256 amount = wallet.totalSupply();
        uint256 fee    = amount * walletGovernance.getConfig(address(wallet), MAGNETIC_FEE_NIFTEX) / 10**18;
        address admin  = walletGovernance.getNiftexWallet();
        require(amount - fee >= minimum, "OfferPools: not enough value in pool");

        // detach wallet
        wallet.renounceOwnership();
        delete _pools[registry][tokenId][asset];

        // pay the sender
        if (address(asset) == address(0)) {
            Address.sendValue(payable(msg.sender), amount - fee);
            Address.sendValue(payable(admin), fee);
        } else {
            SafeERC20.safeTransfer(IERC20(asset), msg.sender, amount - fee);
            SafeERC20.safeTransfer(IERC20(asset), admin, fee);
        }

        if (address(asset) == address(0)) {
            // create curve
            address template = address(uint160(walletGovernance.getConfig(address(wallet), CURVE_TEMPLATE)));
            if (template != address(0)) {
                address curve = Clones.cloneDeterministic(template, bytes32(uint256(uint160(address(wallet)))));
                BondingCurve3(curve).initialize(0, address(wallet), address(0), 10**18);
                emit NewBondingCurve(wallet, curve);
            }
        }
       
        

        emit OfferAccepted(registry, tokenId, asset, msg.sender);
    }
}
