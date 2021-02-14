import {
  EtherSupplied         as EtherSuppliedEvent,
  EtherWithdrawn        as EtherWithdrawnEvent,
  Initialized           as InitializedEvent,
  ShardsBought          as ShardsBoughtEvent,
  ShardsSold            as ShardsSoldEvent,
  ShardsSupplied        as ShardsSuppliedEvent,
  ShardsWithdrawn       as ShardsWithdrawnEvent,
  TransferEthLPTokens   as TransferEthLPTokensEvent,
  TransferShardLPTokens as TransferShardLPTokensEvent,
} from '../../../generated/templates/BondingCurve/BondingCurve'

export function handleEtherSupplied(event: EtherSuppliedEvent): void {
  //(uint256,address)
}

export function handleEtherWithdrawn(event: EtherWithdrawnEvent): void {
  //(uint256,uint256,address)
}

export function handleInitialized(event: InitializedEvent): void {
  //(address,address)
}

export function handleShardsBought(event: ShardsBoughtEvent): void {
  //(uint256,uint256,address)
}

export function handleShardsSold(event: ShardsSoldEvent): void {
  //(uint256,uint256,address)
}

export function handleShardsSupplied(event: ShardsSuppliedEvent): void {
  //(uint256,address)
}

export function handleShardsWithdrawn(event: ShardsWithdrawnEvent): void {
  //(uint256,uint256,address)
}

export function handleTransferEthLPTokens(event: TransferEthLPTokensEvent): void {
  //(address,address,uint256)
}

export function handleTransferShardLPTokens(event: TransferShardLPTokensEvent): void {
  //(address,address,uint256)
}
