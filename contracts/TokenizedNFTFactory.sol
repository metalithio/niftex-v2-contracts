// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./utils/ERC1167.sol";
import "./TokenizedNFT.sol";

contract TokenizedNFTFactory
{
    address public master;

    event NewInstance(address instance);

    constructor(address master_)
    {
        master = master_;
    }

    function initialize(
        address               /* admin_ */,
        string       calldata /* name_ */,
        string       calldata /* symbol_ */,
        uint256               /* cap_ */,
        uint256               /* crowdsalePricePerShare_ */,
        uint256               /* crownsaleDuration_ */,
        NFT          calldata token_,
        Allocation[] calldata /* allocations_ */)
    external
    {
        TokenizedNFT instance = TokenizedNFT(ERC1167.clone(master));

        // send tokens
        address owner = IERC721(token_.registry).ownerOf(token_.id);
        require(owner == msg.sender, "unauthorized: only token owner can perform operation");
        IERC721(token_.registry).safeTransferFrom(owner, address(instance), token_.id);

        // make the contract live, prevent erc721 transfers to it.
        (bool success, bytes memory returndata) = address(instance).call(msg.data);
        require(success, string(returndata));

        emit NewInstance(address(instance));
    }
}
