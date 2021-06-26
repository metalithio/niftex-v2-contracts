// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "../ModuleBase.sol";
import "../../governance/IGovernance.sol";
import "../../initializable/CustomPricingCurve.sol";

contract CustomPricingCurveDeployer is IModule, ModuleBase
{
    string public constant override name = type(CustomPricingCurveDeployer).name;

    // bytes32 public constant CURVE_TEMPLATE_CUSTOM_PRICING = bytes32(uint256(keccak256("CURVE_TEMPLATE_CUSTOM_PRICING")) - 1);
    bytes32 public constant CURVE_TEMPLATE_CUSTOM_PRICING = 0x015ac18e18061bd4ed0d69c024a10bd206e68a8c90479081e4e55738eb8d069d;

    event NewBondingCurve(ShardedWallet indexed wallet_, address indexed curve_);

    modifier isAllowed(ShardedWallet wallet) {
        require(wallet.owner() == address(0));
        _;
    }

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    function createCurve(
        ShardedWallet wallet,
        uint256 fractionsToProvide_,
        address recipient_, // owner of timelocked liquidity
        address sourceOfFractions_, // wallet to transfer fractions from
        uint256 k_,
        uint256 x_,
        uint256 liquidityTimelock_
    ) public payable
    isAllowed(wallet)
    onlyShardedWallet(wallet) 
    returns (address curve) {
        // only sharded wallet OR one owning 100% fraction supply can create custom pricing curve
        require(msg.sender == address(wallet) || wallet.balanceOf(msg.sender) == wallet.totalSupply());
        IGovernance governance = wallet.governance();
        address template = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE_CUSTOM_PRICING)));
        if (template != address(0)) {
            curve = Clones.cloneDeterministic(template, bytes32(uint256(uint160(address(wallet)))));
            {
                CustomPricingCurve(curve).initialize{value: msg.value}(
                    fractionsToProvide_,
                    address(wallet),
                    recipient_,
                    sourceOfFractions_,
                    k_,
                    x_,
                    liquidityTimelock_
                );
            }
            
            emit NewBondingCurve(wallet, curve);
        }
    }
}
