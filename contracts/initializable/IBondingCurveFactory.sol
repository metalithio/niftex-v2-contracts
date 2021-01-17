library IBondingCurveFactory {
	function mintBondingCurve(
	   uint256 suppliedShards,
	   address wallet,
	   address nftOwner,
	   address artistWallet,
	   address niftexWallet,
	   uint256 initialPriceInWei,
	   uint256 minShard0,
	   uint256 ethToSend
	)
	external returns (address instance);
}