/* solhint-disable no-mix-tabs-and-spaces */
/* solhint-disable indent */

pragma solidity ^0.6.0;

// this contract holds constants that we/DAO can adjust
contract Constants {
	function upfrontSaleFactoryAddress() returns (address);
	function erc20FactoryAddress() returns (address);
	function buyoutFacotryAddress() returns (address);

	function submissionFeePct() returns (uint);
	function bondingCurveFeePct() returns (uint);
}
