// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Mock
 * This mock just provides a public safeMint, mint, and burn functions for testing purposes
 */
contract ERC20Mock is ERC20 {
    constructor (string memory name, string memory symbol) ERC20(name, symbol) { }

    function mint(address to, uint256 value) public {
        _mint(to, value);
    }

    function burn(address from, uint256 value) public {
        _burn(from, value);
    }
}