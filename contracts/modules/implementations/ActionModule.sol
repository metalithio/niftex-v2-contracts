// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "../../utils/Timers.sol";
import "../ModuleBase.sol";

contract ActionModule is IModule, ModuleBase, Timers
{
    string public constant override name = type(ActionModule).name;

    // bytes32 public constant ACTION_DURATION_KEY = bytes32(uint256(keccak256("ACTION_DURATION_KEY")) - 1);
		bytes32 public constant ACTION_DURATION_KEY = 0x6a37cc2c94cf66d06643e6dc21aec144736b0fc678ae34185c461f3964937c45;

    event ActionScheduled(ShardedWallet indexed wallet, bytes32 indexed uid, bytes32 indexed id, uint256 i, address to, uint256 value, bytes data);
    event ActionExecuted(ShardedWallet indexed wallet, bytes32 indexed uid, bytes32 indexed id, uint256 i, address to, uint256 value, bytes data);
    event ActionCancelled(ShardedWallet indexed wallet, bytes32 indexed uid, bytes32 indexed id);

    function schedule(ShardedWallet wallet, address[] memory to, uint256[] memory value, bytes[] memory data)
    public onlyAuthorized(wallet, msg.sender) returns (bytes32)
    {
        require(to.length == value.length);
        require(to.length == data.length);
        bytes32 id  = keccak256(abi.encode(to, value, data));
        bytes32 uid = keccak256(abi.encode(wallet, id));

        Timers._startTimer(uid, wallet.governance().getConfig(address(wallet), ACTION_DURATION_KEY));

        for (uint256 i = 0; i < to.length; ++i) {
            emit ActionScheduled(wallet, uid, id, i, to[i], value[i], data[i]);
        }

        return id;
    }

    function execute(ShardedWallet wallet, address[] memory to, uint256[] memory value, bytes[] memory data)
    public onlyAuthorized(wallet, msg.sender) returns (bool)
    {
        require(wallet.owner() == address(0)); // buyout takes over ownership
        require(to.length == value.length);
        require(to.length == data.length);
        bytes32 id  = keccak256(abi.encode(to, value, data));
        bytes32 uid = keccak256(abi.encode(wallet, id));

        Timers._resetTimer(uid);

        for (uint256 i = 0; i < to.length; ++i) {
            wallet.moduleExecute(to[i], value[i], data[i]);
            emit ActionExecuted(wallet, uid, id, i, to[i], value[i], data[i]);
        }

        return true;
    }

    function cancel(ShardedWallet wallet, bytes32 id)
    public onlyAuthorized(wallet, msg.sender) returns (bool)
    {
        bytes32 uid = keccak256(abi.encode(wallet, id));

        Timers._stopTimer(uid);

        emit ActionCancelled(wallet, uid, id);

        return true;
    }
}
