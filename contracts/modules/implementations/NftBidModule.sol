// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../../governance/IGovernance.sol";

// support ERC721 and ERC1155 only
contract NftBidModule
{
    string public constant name = type(NftBidModule).name;

    // bytes32 public constant NFT_BID_FEE_NIFTEX = bytes32(uint256(keccak256("NFT_BID_FEE_NIFTEX")) - 1);
    bytes32 public constant NFT_BID_FEE_NIFTEX  = 0xb82ab1c0e54c999f699ee285649a071a5a4ae87070afbab6656d8ef85e6bd1c9;

    IGovernance public governance;

    constructor(address _governance) {
        governance = IGovernance(_governance);
    }

    struct Bid {
        address proposer;
        uint256 amount;
    }

    mapping(address => mapping(uint256 => mapping(address => Bid))) public bids;

    function _transferETH(address _recipient, uint256 _amount) internal {
        Address.sendValue(payable(_recipient), _amount);
    }

    function _transferERC20(address _recipient, address _erc20, uint256 _amount) internal {
        IERC20(_erc20).transfer(_recipient, _amount);
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
    }

    function withdrawBidETH(address _registry, uint256 _tokenId) external {
        Bid storage bid = bids[_registry][_tokenId][address(0)];
        require(msg.sender == bid.proposer);

        uint256 amount = bid.amount;

        delete bid;

        _transferETH(msg.sender, amount);
    }

    function withdrawBidERC20(address _registry, uint256 _tokenId, address _erc20) external {
        Bid storage bid = bids[_registry][_tokenId][_erc20];
        require(msg.sender == bid.proposer);

        uint256 amount = bid.amount;
        delete bid;

        _transferERC20(msg.sender, _erc20, amount);
    }

    function _acceptOffer(address _nftOwner, address _erc20, uint256 _amountBeforeFee) internal {
        uint256 niftexFee = _amountBeforeFee * governance.getConfig(address(0), NFT_BID_FEE_NIFTEX) / 10**18;
        address niftexWallet = governance.getNiftexWallet();

        if (_erc20 == address(0)) {
            _transferETH(niftexWallet, niftexFee);
            _transferETH(_nftOwner, _amountBeforeFee - niftexFee); 
        } else {
            _transferERC20(niftexWallet, _erc20, niftexFee);
            _transferERC20(_nftOwner, _erc20, _amountBeforeFee - niftexFee);
        }
    }

    function acceptERC721(address _registry, uint256 _tokenId, address _erc20, uint256 _minAmount, uint256 _deadline) external {
        require(block.timestamp < _deadline);
        Bid storage bid = bids[_registry][_tokenId][_erc20];

        require(bid.amount >= _minAmount);
        require(bid.proposer != address(0));

        address proposer = bid.proposer;
        uint256 amount = bid.amount;
        
        delete bid;

        IERC721(_registry).transferFrom(msg.sender, proposer, _tokenId);
        _acceptOffer(msg.sender, _erc20, amount);
    }

    function acceptERC1155(
        address _registry, 
        uint256 _tokenId, 
        bytes calldata _data, 
        address _erc20, 
        uint256 _minAmount, 
        uint256 _deadline
    ) external {
        require(block.timestamp < _deadline);
        Bid storage bid = bids[_registry][_tokenId][_erc20];

        require(bid.amount >= _minAmount);
        require(bid.proposer != address(0));

        address proposer = bid.proposer;
        uint256 amount = bid.amount;

        delete bid;

        IERC1155(_registry).safeTransferFrom(msg.sender, proposer, _tokenId, 1, _data);
        _acceptOffer(msg.sender, _erc20, amount);
    }
}