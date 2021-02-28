import {
  BondingCurve3   as BondingCurve3Contract,
  EtherSupplied   as EtherSuppliedEvent,
  EtherWithdrawn  as EtherWithdrawnEvent,
  Initialized     as InitializedEvent,
  ShardsBought    as ShardsBoughtEvent,
  ShardsSold      as ShardsSoldEvent,
  ShardsSupplied  as ShardsSuppliedEvent,
  ShardsWithdrawn as ShardsWithdrawnEvent,
} from '../../../generated/templates/BondingCurve3/BondingCurve3'

import {
	ERC20 as ERC20Template,
} from '../../../generated/templates'

import {
  BondingCurve,
  LiquidityToken,
} from '../../../generated/schema'

import {
	fetchToken,
} from '../utils'

export function handleInitialized(event: InitializedEvent): void {
  let contract        = BondingCurve3Contract.bind(event.address)
  let etherLPAddress  = contract.etherLPToken()
  let shardLPAddress  = contract.shardLPToken()

  let etherLPToken          = fetchToken(etherLPAddress)
  let shardLPToken          = fetchToken(shardLPAddress)

  let bondingcurve          = new BondingCurve(event.address.toHex())
  let etherLP               = new LiquidityToken(etherLPToken.id)
  let shardLP               = new LiquidityToken(shardLPToken.id)
  bondingcurve.wallet       = event.params.wallet.toHex()
  bondingcurve.etherLPToken = etherLPToken.id
  bondingcurve.shardLPToken = shardLPToken.id
  etherLPToken.asLiquidity  = etherLP.id
  shardLPToken.asLiquidity  = shardLP.id
  etherLP.asToken           = etherLPToken.id
  etherLP.bondingcurve      = bondingcurve.id
  shardLP.asToken           = shardLPToken.id
  shardLP.bondingcurve      = bondingcurve.id
  bondingcurve.save()
  etherLPToken.save()
  shardLPToken.save()
  etherLP.save()
  shardLP.save()

  ERC20Template.create(etherLPAddress)
  ERC20Template.create(shardLPAddress)
}

export function handleShardsBought(event: ShardsBoughtEvent): void {
}

export function handleShardsSold(event: ShardsSoldEvent): void {
}

export function handleEtherSupplied(event: EtherSuppliedEvent): void {
}

export function handleEtherWithdrawn(event: EtherWithdrawnEvent): void {
}

export function handleShardsSupplied(event: ShardsSuppliedEvent): void {
}

export function handleShardsWithdrawn(event: ShardsWithdrawnEvent): void {
}
