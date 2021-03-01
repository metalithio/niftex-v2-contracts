import {
	ethereum,
} from '@graphprotocol/graph-ts'

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
	CurvePriceChanged,
	CurveShardsBought,
	CurveShardsSold,
} from '../../../generated/schema'

import {
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	fetchAccount,
	fetchToken,
} from '../utils'

function updatePrice(event: ethereum.Event): void {
	let contract    = BondingCurve3Contract.bind(event.address)
	let ev          = new CurvePriceChanged(events.id(event).concat('-pricechanged'))
	let evprice     = new decimals.Value(ev.id)
	evprice.set(contract.getCurrentPrice())
	ev.transaction  = transactions.log(event).id
	ev.timestamp    = event.block.timestamp
	ev.bondingcurve = event.address.toHex()
	ev.price        = evprice.id
	ev.save()
}

export function handleInitialized(event: InitializedEvent): void {
	let contract                  = BondingCurve3Contract.bind(event.address)
	let etherLPAddress            = contract.etherLPToken()
	let shardLPAddress            = contract.shardLPToken()
	let etherLPToken              = fetchToken(etherLPAddress)
	let shardLPToken              = fetchToken(shardLPAddress)
	let bondingcurve              = new BondingCurve(event.address.toHex())
	let etherLPLiquidity          = new LiquidityToken(etherLPToken.id)
	let shardLPLiquidity          = new LiquidityToken(shardLPToken.id)
	let tradedShards              = new decimals.Value(bondingcurve.id.concat('-tradedShards')) // TODO decimals ?
	let tradedEthers              = new decimals.Value(bondingcurve.id.concat('-tradedEthers')) // TODO decimals ?
	bondingcurve.wallet           = event.params.wallet.toHex()
	bondingcurve.etherLPToken     = etherLPToken.id
	bondingcurve.shardLPToken     = shardLPToken.id
	bondingcurve.tradedEthers     = tradedEthers.id
	bondingcurve.tradedShards     = tradedShards.id
	etherLPToken.asLiquidity      = etherLPLiquidity.id
	shardLPToken.asLiquidity      = shardLPLiquidity.id
	etherLPLiquidity.asToken      = etherLPToken.id
	etherLPLiquidity.bondingcurve = bondingcurve.id
	shardLPLiquidity.asToken      = shardLPToken.id
	shardLPLiquidity.bondingcurve = bondingcurve.id
	bondingcurve.save()
	etherLPToken.save()
	shardLPToken.save()
	etherLPLiquidity.save()
	shardLPLiquidity.save()

	updatePrice(event);

	ERC20Template.create(etherLPAddress)
	ERC20Template.create(shardLPAddress)
}

export function handleShardsBought(event: ShardsBoughtEvent): void {
	let ev          = new CurveShardsBought(events.id(event))
	let evamount    = new decimals.Value(ev.id.concat('-amount')) // TODO: add decimals
	let evcost      = new decimals.Value(ev.id.concat('-cost')) // TODO: add decimals
	evamount.set(event.params.amount)
	evcost.set(event.params.cost)
	ev.transaction  = transactions.log(event).id
	ev.timestamp    = event.block.timestamp
	ev.bondingcurve = event.address.toHex()
	ev.account      = fetchAccount(event.params.account).id
	ev.amount       = evamount.id
	ev.cost         = evcost.id
	ev.save()

	let tradedEthers = new decimals.Value(event.address.toHex().concat('-tradedEthers'))
	let tradedShards = new decimals.Value(event.address.toHex().concat('-tradedShards'))
	tradedEthers.increment(event.params.cost)
	tradedShards.increment(event.params.amount)

	updatePrice(event)
}

export function handleShardsSold(event: ShardsSoldEvent): void {
	let ev          = new CurveShardsSold(events.id(event))
	let evamount    = new decimals.Value(ev.id.concat('-amount')) // TODO: add decimals
	let evpayout    = new decimals.Value(ev.id.concat('-payout')) // TODO: add decimals
	evamount.set(event.params.amount)
	evpayout.set(event.params.payout)
	ev.transaction  = transactions.log(event).id
	ev.timestamp    = event.block.timestamp
	ev.bondingcurve = event.address.toHex()
	ev.account      = fetchAccount(event.params.account).id
	ev.amount       = evamount.id
	ev.payout       = evpayout.id
	ev.save()

	let tradedEthers = new decimals.Value(event.address.toHex().concat('-tradedEthers'))
	let tradedShards = new decimals.Value(event.address.toHex().concat('-tradedShards'))
	tradedEthers.increment(event.params.payout)
	tradedShards.increment(event.params.amount)

	updatePrice(event)
}

export function handleEtherSupplied(event: EtherSuppliedEvent): void {
	// TODO

	// Doesn't change curve parameters
	// updatePrice(event);
}

export function handleEtherWithdrawn(event: EtherWithdrawnEvent): void {
	// TODO

	// Doesn't change curve parameters
	// updatePrice(event);
}

export function handleShardsSupplied(event: ShardsSuppliedEvent): void {
	// TODO

	// Doesn't change curve parameters
	// updatePrice(event);
}

export function handleShardsWithdrawn(event: ShardsWithdrawnEvent): void {
	// TODO

	// Doesn't change curve parameters
	// updatePrice(event);
}
