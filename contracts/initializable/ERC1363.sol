// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "./ERC20.sol";
import "../interface/IERC1363.sol";
import "../interface/IERC1363Receiver.sol";
import "../interface/IERC1363Spender.sol";

abstract contract ERC1363 is ERC20, IERC1363 {
    function transferAndCall(address to, uint256 value) public override returns (bool) {
        return transferAndCall(to, value, bytes(""));
    }

    function transferAndCall(address to, uint256 value, bytes memory data) public override returns (bool) {
        require(transfer(to, value));
        require(
            IERC1363Receiver(to).onTransferReceived(_msgSender(), _msgSender(), value, data)
            ==
            IERC1363Receiver(to).onTransferReceived.selector,
            "ERC1363: onTransferReceived failled"
        );
        return true;
    }

    function transferFromAndCall(address from, address to, uint256 value) public override returns (bool) {
        return transferFromAndCall(from, to, value, bytes(""));
    }

    function transferFromAndCall(address from, address to, uint256 value, bytes memory data) public override returns (bool) {
        require(transferFrom(from, to, value));
        require(
            IERC1363Receiver(to).onTransferReceived(_msgSender(), from, value, data)
            ==
            IERC1363Receiver(to).onTransferReceived.selector,
            "ERC1363: onTransferReceived failled"
        );
        return true;
    }

    function approveAndCall(address spender, uint256 value) public override returns (bool) {
        return approveAndCall(spender, value, bytes(""));
    }

    function approveAndCall(address spender, uint256 value, bytes memory data) public override returns (bool) {
        require(approve(spender, value));
        require(
            IERC1363Spender(spender).onApprovalReceived(_msgSender(), value, data)
            ==
            IERC1363Spender(spender).onApprovalReceived.selector,
            "ERC1363: onApprovalReceived failled"
        );
        return true;
    }

}
