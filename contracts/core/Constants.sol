/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

// this contract holds constants that we/DAO can adjust
contract Constants {
	function upfrontSaleFactoryAddress() returns (address);
	function erc20FactoryAddress() returns (address);
	function buyoutRegistryAddress() returns (address);
	function shardGovernorAddress() returns (address);
	function custodianAddress() returns (address);

	function submissionFeePct() returns (uint);
	function bondingCurveFeePct() returns (uint);

	function buyoutBalanceThreshold() returns (uint);
	function buyoutDuration() returns (uint);

	function niftexWalletAddress() returns (uint);

	function getBuyoutParams() returns (address, uint, address, uint) {
		return (
			shardGovernorAddress,
			buyoutBalanceThreshold,
			custodianAddress,
			buyoutDuration
		);
	}
}
