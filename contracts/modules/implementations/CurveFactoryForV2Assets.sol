// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../governance/Governance.sol";
import "../../governance/IGovernance.sol";
import "../../initializable/CurveForV2Assets.sol";
import "../../utils/Timers.sol";
import "../ModuleBase.sol";

contract CurveFactoryForV2Assets is IModule, ModuleBase
{
    string public constant override name = type(CurveFactoryForV2Assets).name;

    // bytes32 public constant CURVE_DEPLOYER = bytes32(uint256(keccak256("CURVE_DEPLOYER")) - 1);
    bytes32 public constant CURVE_DEPLOYER = 0xaeddd93aca5d4e01145d05f9e02b741bc8a1fc8f60103715af73b35c24923ead;
    // bytes32 public constant CURVE_TEMPLATE_V2_ASSETS = bytes32(uint256(keccak256("CURVE_TEMPLATE_V2_ASSETS")) - 1);
    bytes32 public constant CURVE_TEMPLATE_V2_ASSETS = 0xbef8d45a153692c431be2463fb0142a9343492571a9105b35dca3fb6bc9e0c64;
    // bytes32 public constant CURVE_STRETCH = bytes32(uint256(keccak256("CURVE_STRETCH")) - 1);
    bytes32 public constant CURVE_STRETCH = 0x93dd957c7b5128fa849cb38b3ebc75f4cb0ed832255ea21c35a997582634caa4;
    event NewBondingCurve(ShardedWallet indexed wallet, address indexed curve);

    constructor(address walletTemplate) ModuleBase(walletTemplate) {}

    function createCurve(
        ShardedWallet wallet,
        uint256 fractionsToProvide_,
        address recipient_, // owner of timelocked liquidity
        address sourceOfFractions_, // wallet to transfer fractions from
        uint256 k_,
        uint256 x_
    )
    external payable 
    onlyShardedWallet(wallet)
    returns (address curve)
    {
        Governance governance = Governance(address(wallet.governance()));
        require(governance.hasRole(CURVE_DEPLOYER, msg.sender));
        address template = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE_V2_ASSETS)));
        if (template != address(0)) {
            curve = Clones.cloneDeterministic(template, bytes32(uint256(uint160(address(wallet)))));
            CurveForV2Assets(curve).initialize{value: msg.value}(
                fractionsToProvide_,
                address(wallet),
                recipient_,
                sourceOfFractions_,
                k_,
                x_
            );
            emit NewBondingCurve(wallet, curve);
        } else {
            return address(0);
        }
    }

    function newCurveAddress(ShardedWallet wallet) public view returns (address) {
        IGovernance governance = wallet.governance();
        address template = address(uint160(governance.getConfig(address(wallet), CURVE_TEMPLATE_V2_ASSETS)));
        return Clones.predictDeterministicAddress(template, bytes32(uint256(uint160(address(wallet)))));
    }

    function defaultCurveCoordinates(ShardedWallet wallet, uint256 price) public view returns (uint256 k, uint256 x) {
        uint256 decimals = wallet.decimals();
        uint256 totalSupply = wallet.totalSupply();
        IGovernance governance = wallet.governance();

        uint256 curveStretch = governance.getConfig(address(wallet), CURVE_STRETCH);
        curveStretch = Math.min(Math.max(1, curveStretch), 10); // curveStretch ranges from 1 to 10.

        k = totalSupply * totalSupply * price / 10**decimals * curveStretch * curveStretch / 100;
        x = totalSupply * curveStretch / 10;
    }
}
