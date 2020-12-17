// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../ShardedWallet.sol";

struct Allocation
{
    address receiver;
    uint256 amount;
}

contract BasicCrowdsale
{
    using SafeMath for uint256;

    function setup(Allocation[] calldata mints)
    external
    {
        for (uint256 i = 0; i < mints.length; ++i)
        {
            ShardedWallet(msg.sender).mint(mints[i].receiver, mints[i].amount);
        }
    }
}
