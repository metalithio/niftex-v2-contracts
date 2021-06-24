// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../ModuleBase.sol";
import "../../governance/IGovernance.sol";
import "./CurveFactoryForV2Assets.sol";

contract CustomPricingCurveDeployer is IModule, ModuleBase
{
    string public constant override name = type(CustomPricingCurveDeployer).name;

    // bytes32 public constant CURVE_FACTORY_V2_ASSETS = bytes32(uint256(keccak256("CURVE_FACTORY_V2_ASSETS")) - 1);
    bytes32 public constant CURVE_FACTORY_V2_ASSETS = 0x3196913a2a5f43f2fb3b08e7b67c1ea747b72e77ca673c0468475f4f1ba9f0a7;

    event NewBondingCurve(ShardedWallet indexed wallet_, address indexed curve_);

    modifier isAllowed() {
        require(ShardedWallet(payable(msg.sender)).owner() == address(0));
        _;
    }

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    function createCurve(
        uint256 fractionsToProvide_,
        address recipient_, // owner of timelocked liquidity
        address sourceOfFractions_, // wallet to transfer fractions from
        uint256 k_,
        uint256 x_
    ) public payable
    isAllowed
    onlyShardedWallet(ShardedWallet(payable(msg.sender))) 
    returns (address curve) {
        ShardedWallet wallet = ShardedWallet(payable(msg.sender));
        IGovernance governance = wallet.governance();
        address factoryAddress = address(uint160(governance.getConfig(msg.sender, CURVE_FACTORY_V2_ASSETS)));
        if (factoryAddress != address(0)) {
            curve = CurveFactoryForV2Assets(factoryAddress).createCurve{value: msg.value}(
                wallet,
                fractionsToProvide_,
                recipient_,
                sourceOfFractions_,
                k_,
                x_
            );
            emit NewBondingCurve(wallet, curve);
        }
    }
}
