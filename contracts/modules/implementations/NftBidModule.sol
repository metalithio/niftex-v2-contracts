// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../governance/IGovernance.sol";
import "../ModuleBase.sol";

// support ERC721 and ERC1155 only
contract NftBidModule is IModule, ModuleBase
{
    string public constant override name = type(NftBidModule).name;

    // bytes32 public constant NFT_TRANSFER_FEE_NIFTEX = bytes32(uint256(keccak256("NFT_TRANSFER_FEE_NIFTEX")) - 1);
    bytes32 public constant NFT_TRANSFER_FEE_NIFTEX  = 0xee6d8ce214fe5e3e7b812c79d0f84bc7716ab8c4211f5d63367b91a9f2ac45d2;
    // bytes32 public constant NFT_TRANSFER_FEE_ARTIST = bytes32(uint256(keccak256("NFT_TRANSFER_FEE_ARTIST")) - 1);
    bytes32 public constant NFT_TRANSFER_FEE_ARTIST  = 0x101a13becc3ce73b196e11acd6b3c7da90ed4a8fbc490c8bb8388f1b5d520be6;


    event NewBid(address registry, uint256 tokenId, address erc20, address proposer, uint256 amount);
    event AcceptBid(address registry, uint256 tokenId, address erc20, address proposer, address nftOwner, uint256 amount);

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    struct Bid {
        address proposer;
        uint256 amount;
    }

    mapping(address => mapping(uint256 => mapping(address => Bid))) public bids;

    function _transferETH(address _recipient, uint256 _amount) internal {
        if (_amount > 0 && _recipient != address(0)) {
            Address.sendValue(payable(_recipient), _amount);
        }
    }

    function _transferERC20(address _recipient, address _erc20, uint256 _amount) internal {
        if (_amount > 0 && _recipient != address(0)) {
            IERC20(_erc20).transfer(_recipient, _amount);
        }
    }

    function _acceptOffer(ShardedWallet wallet, address _erc20, uint256 _amountBeforeFee) internal {
        IGovernance governance = wallet.governance();
        address niftexWallet = governance.getNiftexWallet();
        address artistWallet = wallet.artistWallet();
        uint256 niftexFee = niftexWallet != address(0) ? _amountBeforeFee * governance.getConfig(address(wallet), NFT_TRANSFER_FEE_NIFTEX) / 10**18 : 0;
        uint256 artistFee = artistWallet != address(0) ? _amountBeforeFee * governance.getConfig(address(wallet), NFT_TRANSFER_FEE_ARTIST) / 10**18 : 0;
        
        if (_erc20 == address(0)) {
            _transferETH(niftexWallet, niftexFee);
            _transferETH(artistWallet, artistFee);
            _transferETH(address(wallet), _amountBeforeFee - niftexFee - artistFee); 
        } else {
            _transferERC20(niftexWallet, _erc20, niftexFee);
            _transferERC20(artistWallet, _erc20, artistFee);
            _transferERC20(address(wallet), _erc20, _amountBeforeFee - niftexFee - artistFee);
        }
    }

    function bidWithETH(address _registry, uint256 _tokenId) external payable {
        Bid storage bid = bids[_registry][_tokenId][address(0)];
        require(msg.value > bid.amount);

        address previousBidder = bid.proposer;
        uint256 amount = bid.amount;

        bid.proposer = msg.sender;
        bid.amount = msg.value;

        // refund previous bid to previous proposer
        if (bid.proposer != address(0)) {
            _transferETH(previousBidder, amount);
        }

        emit NewBid(_registry, _tokenId, address(0), msg.sender, msg.value);
    }

    function bidWithERC20(address _registry, uint256 _tokenId, address _erc20, uint256 _amount) external {
        Bid storage bid = bids[_registry][_tokenId][_erc20];
        require(_amount > bid.amount);

        address previousBidder = bid.proposer;
        uint256 amount = bid.amount;

        bid.proposer = msg.sender;
        bid.amount = _amount;

        require(IERC20(_erc20).transferFrom(msg.sender, address(this), _amount));

        if (bid.proposer != address(0)) {
            _transferERC20(previousBidder, _erc20, amount);
        }

        emit NewBid(_registry, _tokenId, _erc20, msg.sender, _amount);
    }

    function withdrawBidETH(address _registry, uint256 _tokenId) external {
        Bid storage bid = bids[_registry][_tokenId][address(0)];
        require(msg.sender == bid.proposer);

        uint256 amount = bid.amount;

        delete bids[_registry][_tokenId][address(0)];

        _transferETH(msg.sender, amount);
        emit NewBid(_registry, _tokenId, address(0), msg.sender, 0);
    }

    function withdrawBidERC20(address _registry, uint256 _tokenId, address _erc20) external {
        Bid storage bid = bids[_registry][_tokenId][_erc20];
        require(msg.sender == bid.proposer);

        uint256 amount = bid.amount;
        delete bids[_registry][_tokenId][_erc20];

        _transferERC20(msg.sender, _erc20, amount);

        emit NewBid(_registry, _tokenId, _erc20, msg.sender, 0);
    }

    function acceptERC721(
        address _registry, 
        uint256 _tokenId, 
        address _erc20, 
        uint256 _minAmount, 
        uint256 _deadline
    ) external onlyShardedWallet(ShardedWallet(payable(msg.sender))) {
        require(block.timestamp < _deadline);
        Bid storage bid = bids[_registry][_tokenId][_erc20];

        require(bid.amount >= _minAmount);
        require(bid.proposer != address(0));

        address proposer = bid.proposer;
        uint256 amount = bid.amount;
        
        delete bids[_registry][_tokenId][_erc20];

        IERC721(_registry).transferFrom(msg.sender, proposer, _tokenId);
        _acceptOffer(ShardedWallet(payable(msg.sender)), _erc20, amount);

        emit AcceptBid(_registry, _tokenId, _erc20, proposer, msg.sender, amount);
    }

    function acceptERC1155(
        address _registry, 
        uint256 _tokenId, 
        bytes calldata _data, 
        address _erc20, 
        uint256 _minAmount, 
        uint256 _deadline
    ) external onlyShardedWallet(ShardedWallet(payable(msg.sender))) {
        require(block.timestamp < _deadline);
        Bid storage bid = bids[_registry][_tokenId][_erc20];

        require(bid.amount >= _minAmount);
        require(bid.proposer != address(0));

        address proposer = bid.proposer;
        uint256 amount = bid.amount;

        delete bids[_registry][_tokenId][_erc20];

        IERC1155(_registry).safeTransferFrom(msg.sender, proposer, _tokenId, 1, _data);
        _acceptOffer(ShardedWallet(payable(msg.sender)), _erc20, amount);
        emit AcceptBid(_registry, _tokenId, _erc20, proposer, msg.sender, amount);
    }
}