// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

contract MagneticPoolModule {
    string public constant override name = type(MagneticPoolModule).name;
    mapping(bytes32 => address) public mapShardedWallet;
    mapping(bytes32 => uint256) public pricePerFraction;

    modifier isValidPool(bytes32 _id) {
        require(mapShardedWallet[_id] != address(0));
        _;
    }

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    // works only for standard ERC721, Kitties contract and ERC1155. 
    // for ERC1155, only 1 item of same nftRegistry,tokenId is allowed
    function createPool(
        address _nftRegistry, 
        uint256 _tokenId,
        uint256 _pricePerFraction,
        address _shardedWalletFactory,
        address _governance,
        string  calldata _name,
        string  calldata _symbol,
        address _artistWallet
    ) public payable {
        bytes32 id = getId(_nftRegistry, _tokenId, _shardedWalletFactory);
        require(mapShardedWallet[id] == address(0));
        address newShardedWallet = ShardedWalletFactory(_shardedWalletFactory).mintWallet(
            _governance,
            address(this),
            _name,
            _symbol,
            _artistWallet
        );

        mapShardedWallet[id] = newShardedWallet;
        pricePerFraction[id] = _pricePerFraction;
        _contribute(id, msg.sender, msg.value);
    }

    function contribute(
        bytes32 _id
    ) public payable isValidPool(_id) {
        _contribute(_id, msg.sender, msg.value);
    }

    function onApprovalReceived(address owner, uint256 amount, bytes calldata data) public override returns (bytes4) {
        bytes4 selector = abi.decode(data, (bytes4));
        require(ShardedWallet(payable(wallet)).transferFrom(owner, address(this), amount));

        if (selector == this.reclaimETH.selector) {
            (bytes32 _id) = abi.decode(data, (bytes4, bytes32));
            require(mapShardedWallet[_id] == msg.sender);
            _reclaimETH(_id, amount, owner);
        } else {
            revert("invalid selector in onApprovalReceived data");
        }

        return this.onApprovalReceived.selector;
    }

    function reclaimETH (
        bytes32 _id,
        uint256 _fractionAmount
    ) public {
        require(ShardedWallet(payable(mapShardedWallet[_id])).owner() == address(this));
        require(ShardedWallet(payable(mapShardedWallet[_id])).transferFrom(msg.sender, address(this), _fractionAmount));
        _reclaimETH(_id, _fractionAmount, msg.sender);
    }

    function _contribute(
        bytes32 _id, 
        address _contributor,
        uint256 _amount
    ) internal {
        require(ShardedWallet(payable(mapShardedWallet[_id])).owner() == address(this));
        uint256 fractions = _amount * 10**18 / pricePerFraction[_id];
        ShardedWallet(payable(mapShardedWallet[_id])).moduleMint(_contributor, fractions);
    }

    function getId(
        address _nftRegistry,
        uint256 _tokenId,
        address _shardedWalletFactory
    ) public returns (bytes32) {
        return keccak256(abi.encode(_nftRegistry, _tokenId, _shardedWalletFactory));
    }

    function _reclaimETH (
        bytes32 _id,
        uint256 _fractionAmount,
        address _recipient
    ) internal {
        uint256 ethToRefund = _fractionAmount * pricePerFraction[_id] / 10**18;
        Address.send(_recipient, ethToRefund);
    }
}
