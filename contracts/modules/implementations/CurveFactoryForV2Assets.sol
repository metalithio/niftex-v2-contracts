// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../utils/Timers.sol";
import "../ModuleBase.sol";

contract CurveFactoryForV2Assets is IModule, ModuleBase
{
    string public constant override name = type(CurveFactoryForV2Assets).name;

    // bytes32 public constant CURVE_DEPLOYER = bytes32(uint256(keccak256("CURVE_DEPLOYER")) - 1);
    bytes32 public constant CURVE_DEPLOYER = 0xaeddd93aca5d4e01145d05f9e02b741bc8a1fc8f60103715af73b35c24923ead;
    // bytes32 public constant CURVE_TEMPLATE_V2_ASSETS = bytes32(uint256(keccak256("CURVE_TEMPLATE_V2_ASSETS")) - 1);
    bytes32 public constant CURVE_TEMPLATE_V2_ASSETS = 0xbef8d45a153692c431be2463fb0142a9343492571a9105b35dca3fb6bc9e0c64;

    event NewBondingCurve(ShardedWallet indexed wallet, address indexed curve);

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    function createCurve(
        ShardedWallet wallet,
        uint256 fractionsToProvide_,
        address recipient_, // the wallet access to timelocked liquidity
        uint256 k_,
        uint256 x_
    )
    external payable returns (address curve)
    onlyShardedWallet(wallet)
    {
        require(governance.hasRole(msg.sender, CURVE_DEPLOYER));
        IGovernance governance = wallet.governance();

        address template = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE_V2_ASSETS)));
        if (template != address(0)) {
            curve = Clones.cloneDeterministic(template, bytes32(uint256(uint160(address(wallet)))));
            wallet.approve(curve, fractionsToProvide_);
            CurveForV2Assets(curve).initialize{value: msg.value}(
                fractionsToProvide_,
                address(wallet),
                recipient_,
                k_,
                x_
            );
            emit NewBondingCurve(wallet, curve);
        } else {
            return address(0);
        }
    }
}
