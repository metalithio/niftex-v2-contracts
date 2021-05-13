// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract MagneticPoolModule {
    string public constant override name = type(MagneticPoolModule).name;
    mapping(bytes32 => address) public mapShardedWallet;
    mapping(bytes32 => uint256) public mapTotalWeiContributed;
    mapping(bytes32 => mapping(address => uint256)) public mapWeiContributedPerUser;

    modifier isValidPool(bytes32 _id) {
        require(mapShardedWallet[_id] != address(0));
        _;
    }

    // works only for standard ERC721, Kitties contract and ERC1155. 
    // for ERC1155, only 1 item of same nftRegistry,tokenId is allowed
    function createPool(
        address _nftRegistry, 
        uint256 _tokenId,
        address _shardedWalletFactory,
        address _governance,
        string  calldata _name,
        string  calldata _symbol,
        address _artistWallet
    ) public {
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
        _contribute(id, msg.sender, msg.value);
    }

    function contribute(
        bytes32 _id
    ) public payable isValidPool(_id) {
        _contribute(_id, msg.sender, msg.value);
    }

    function _contribute(
        bytes32 _id, 
        address _contributor,
        uint256 _amount
    ) internal {
        mapTotalWeiContributed[id] += _amount;
        mapWeiContributedPerUser[id][_contributor] += _amount;
    }

    function getId(
        address _nftRegistry,
        uint256 _tokenId,
        address _shardedWalletFactory
    ) public returns (bytes32) {
        return keccak256(abi.encode(_nftRegistry, _tokenId, _shardedWalletFactory));
    }
}
