/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

// this contract holds constants that we/DAO can adjust
contract Constants {
	mapping(uint => address) _upfrontSaleContracts;
	mapping(uint => uint) _upfrontSaleDurations;

	function erc20FactoryAddress() returns (address);
	function buyoutRegistryAddress() returns (address);
	function shardGovernorAddress() returns (address);
	function custodianAddress() returns (address);

	function submissionFeePct() returns (uint);
	function bondingCurveFeePct() returns (uint);

	function buyoutBalanceThreshold() returns (uint);
	function buyoutDuration() returns (uint);

	function getSaleDuration(uint type) returns (uint) {
		return _upfrontSaleDurations[type];
	}

	function niftexWalletAddress() returns (uint);

	function changeUpfrontSaleContract(uint type, address template) {
		_upfrontSaleContracts[type] = template;
	}

	function getUpfrontSaleContract(uint type) external returns (address) {
		return _upfrontSaleContracts[type];
	}

	function getBuyoutParams() returns (address, uint, address, uint) {
		return (
			shardGovernorAddress,
			buyoutBalanceThreshold,
			custodianAddress,
			buyoutDuration
		);
	}
}
