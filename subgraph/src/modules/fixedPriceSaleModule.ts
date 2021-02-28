import {
	Address,
	BigInt,
} from '@graphprotocol/graph-ts'

import {
	FixedPriceSaleModule   as FixedPriceSaleModuleContract,
	OwnershipReclaimed     as OwnershipReclaimedEvent,
	ShardsPrebuy           as ShardsPrebuyEvent,
	ShardsBought           as ShardsBoughtEvent,
	ShardsRedeemedFailure  as ShardsRedeemedFailureEvent,
	ShardsRedeemedSuccess  as ShardsRedeemedSuccessEvent,
	Withdraw               as WithdrawEvent,
	NewBondingCurve        as NewBondingCurveEvent,
} from '../../../generated/FixedPriceSaleModule/FixedPriceSaleModule'

import {
	BondingCurve3 as BondingCurve3Template,
} from '../../../generated/templates'

import {
	Token,
	FixedPriceSale,
	FixedPriceSalePrebuy,
	FixedPriceSaleBuy,
	ShardsPrebuy,
	ShardsBought,
} from '../../../generated/schema'

import {
	constants,
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	bytesToAddress,
	addressStringToBytesString,
	fetchAccount,
	fetchToken,
	fetchShardedWallet,
} from '../utils'

import {
	TimerReset         as TimerResetEvent,
	TimerStarted       as TimerStartedEvent,
	TimerStopped       as TimerStoppedEvent,
	handleTimerStarted as genericHandleTimerStarted,
	handleTimerStopped as genericHandleTimerStopped,
	handleTimerReset   as genericHandleTimerReset,
} from '../utils/timer'

function fetchFixedPriceSale(wallet: Token, module: Address, reset: bool = false): FixedPriceSale {
	let fixedpricesale = FixedPriceSale.load(wallet.id)
	if (fixedpricesale == null || reset) {
		let index                      = fixedpricesale == null ? 0 : fixedpricesale.index
		fixedpricesale                 = new FixedPriceSale(wallet.id)
		let contract                   = FixedPriceSaleModuleContract.bind(module)
		let walletAsAddress            = Address.fromString(wallet.id)
		let priceValue                 = contract.prices(walletAsAddress)
		let remainingShardsValue       = contract.remainingShards(walletAsAddress)
		let recipient                  = fetchAccount(contract.recipients(walletAsAddress))
		let balance                    = new decimals.Value(wallet.id.concat('-balance'), 18) // ETH
		let price                      = new decimals.Value(wallet.id.concat('-price'), 18) // ETH per Shard
		let offeredShards              = new decimals.Value(wallet.id.concat('-offered'), wallet.decimals) // Shards
		let remainingShards            = new decimals.Value(wallet.id.concat('-remaining'), wallet.decimals) // Shards
		price.set(priceValue)
		remainingShards.set(remainingShardsValue)
		offeredShards.set(remainingShardsValue)
		fixedpricesale.index           = index
		fixedpricesale.wallet          = wallet.id
		fixedpricesale.recipient       = recipient.id
		fixedpricesale.balance         = balance.id
		fixedpricesale.price           = price.id
		fixedpricesale.offeredShards   = offeredShards.id
		fixedpricesale.remainingShards = remainingShards.id
		fixedpricesale.timer           = module.toHex().concat('-').concat(addressStringToBytesString(wallet.id))
		fixedpricesale.status          = remainingShards._entry.exact.equals(constants.BIGINT_ZERO) ? 'SUCCESS' : 'INITIATED'
		fixedpricesale.withdrawn       = false
	}
	return fixedpricesale as FixedPriceSale
}

function fetchFixedPriceSaleBuy(wallet: Token, fixedpricesale: FixedPriceSale, to: Address): FixedPriceSaleBuy {
	let recipient = fetchAccount(to)

	let id = wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString())

	let fixedpricesalebuy = FixedPriceSaleBuy.load(id)
	if (fixedpricesalebuy == null || fixedpricesalebuy.index < fixedpricesale.index) {
		let amount = new decimals.Value(id.concat('-buy'), wallet.decimals)
		amount.set(constants.BIGINT_ZERO)

		fixedpricesalebuy = new FixedPriceSaleBuy(id)
		fixedpricesalebuy.index          = fixedpricesale.index
		fixedpricesalebuy.fixedpricesale = fixedpricesale.id
		fixedpricesalebuy.recipient      = recipient.id
		fixedpricesalebuy.amount         = amount.id
		fixedpricesalebuy.redeemed       = false
		fixedpricesalebuy.save()
	}
	return fixedpricesalebuy as FixedPriceSaleBuy
}

function fetchFixedPriceSalePrebuy(wallet: Token, fixedpricesale: FixedPriceSale, to: Address): FixedPriceSalePrebuy {
	let recipient = fetchAccount(to)

	let id = wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString())

	let fixedpricesaleprebuy = FixedPriceSalePrebuy.load(id)
	if (fixedpricesaleprebuy == null || fixedpricesaleprebuy.index < fixedpricesale.index) {
		let amount = new decimals.Value(id.concat('-prebuy'), wallet.decimals)
		amount.set(constants.BIGINT_ZERO)

		fixedpricesaleprebuy = new FixedPriceSalePrebuy(id)
		fixedpricesaleprebuy.index          = fixedpricesale.index
		fixedpricesaleprebuy.fixedpricesale = fixedpricesale.id
		fixedpricesaleprebuy.recipient      = recipient.id
		fixedpricesaleprebuy.amount         = amount.id
		fixedpricesaleprebuy.redeemed       = false
		fixedpricesaleprebuy.save()
	}
	return fixedpricesaleprebuy as FixedPriceSalePrebuy
}

export function handleTimerStarted(event: TimerStartedEvent): void {
	let timer               = genericHandleTimerStarted(event)
	let wallet              = fetchShardedWallet(bytesToAddress(event.params.timer))
	let token               = fetchToken(bytesToAddress(event.params.timer))
	let fixedpricesale      = fetchFixedPriceSale(token, event.address, true)
	fixedpricesale.start    = timer.start
	fixedpricesale.deadline = timer.deadline
	fixedpricesale.save()
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	let timer = genericHandleTimerStopped(event)
	// Should never be called
}

export function handleTimerReset(event: TimerResetEvent): void {
	let timer               = genericHandleTimerReset(event)
	let wallet              = fetchShardedWallet(bytesToAddress(event.params.timer))
	let token               = fetchToken(bytesToAddress(event.params.timer))
	let fixedpricesale      = fetchFixedPriceSale(token, event.address)
	fixedpricesale.status   = 'RESET'
	fixedpricesale.save()
}

export function handleShardsPrebuy(event: ShardsPrebuyEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	let fixedpricesaleprebuy = fetchFixedPriceSalePrebuy(token, fixedpricesale, event.params.receiver)
	let prebought            = new decimals.Value(fixedpricesaleprebuy.amount)
	prebought.increment(event.params.count)

	let ev = new ShardsPrebuy(events.id(event))
	let value = new decimals.Value(ev.id.concat('-value'), token.decimals)
	value.set(event.params.count)
	ev.transaction          = transactions.log(event).id
	ev.timestamp            = event.block.timestamp
	ev.fixedpricesaleprebuy = fixedpricesaleprebuy.id
	ev.wallet               = wallet.id
	ev.index                = fixedpricesaleprebuy.index
	ev.value                = value.id
	ev.save()
}

export function handleShardsBought(event: ShardsBoughtEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	let fixedpricesalebuy    = fetchFixedPriceSaleBuy(token, fixedpricesale, event.params.to)

	let bought          = new decimals.Value(fixedpricesalebuy.amount)
	let balance         = new decimals.Value(fixedpricesale.balance)
	let price           = new decimals.Value(fixedpricesale.price)
	let remainingShards = new decimals.Value(fixedpricesale.remainingShards)
	// OPTION 1: Read from chain
	// let contract        = FixedPriceSaleModuleContract.bind(event.address)
	// bought.increment(event.params.count)
	// balance.set(contract.balance(event.params.wallet))
	// remainingShards.set(contract.remainingShards(event.params.wallet))
	// OPTION 2: Update from storage
	bought.increment(event.params.count)
	balance.increment(
		event.params.count
		.times(price._entry.exact)
		.div(BigInt.fromI32(10).pow(<u8>token.decimals))
	)
	remainingShards.decrement(
		event.params.count
	)
	// Check status
	if (remainingShards._entry.exact.equals(constants.BIGINT_ZERO)) {
		fixedpricesale.status = 'SUCCESS'
		fixedpricesale.save()
	}

	let ev = new ShardsBought(events.id(event))
	let value = new decimals.Value(ev.id.concat('-value'), token.decimals)
	value.set(event.params.count)
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.fixedpricesalebuy  = fixedpricesalebuy.id
	ev.wallet             = wallet.id
	ev.index              = fixedpricesalebuy.index
	ev.value              = value.id
	ev.save()
}

export function handleShardsRedeemedSuccess(event: ShardsRedeemedSuccessEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	let recipient            = fetchAccount(event.params.to)

	let fixedpricesaleprebuy = FixedPriceSalePrebuy.load(wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString()))
	if (fixedpricesaleprebuy != null) {
		fixedpricesaleprebuy.redeemed = true
		fixedpricesaleprebuy.save()
	}

	let fixedpricesalebuy = FixedPriceSaleBuy.load(wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString()))
	if (fixedpricesalebuy != null) {
		fixedpricesalebuy.redeemed = true
		fixedpricesalebuy.save()
	}

	// TODO: track event ?
}

export function handleShardsRedeemedFailure(event: ShardsRedeemedFailureEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	let recipient            = fetchAccount(event.params.to)

	let fixedpricesaleprebuy = FixedPriceSalePrebuy.load(wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString()))
	if (fixedpricesaleprebuy != null) {
		fixedpricesaleprebuy.redeemed = true
		fixedpricesaleprebuy.save()
	}

	let fixedpricesalebuy = FixedPriceSaleBuy.load(wallet.id.concat('-').concat(recipient.id).concat('-').concat(BigInt.fromI32(fixedpricesale.index).toString()))
	if (fixedpricesalebuy != null) {
		fixedpricesalebuy.redeemed = true
		fixedpricesalebuy.save()
	}

	fixedpricesale.status = 'FAILURE'
	fixedpricesale.save()

	// TODO: track event ?
}

export function handleWithdraw(event: WithdrawEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	fixedpricesale.withdrawn = true
	fixedpricesale.save()

	// TODO: track event ?
}

export function handleOwnershipReclaimed(event: OwnershipReclaimedEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let token                = fetchToken(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(token, event.address)
	fixedpricesale.withdrawn = true
	fixedpricesale.status    = 'FAILURE'
	fixedpricesale.save()

	// TODO: track event ?
}

export function handleNewBondingCurve(event: NewBondingCurveEvent): void {
	BondingCurve3Template.create(event.params.curve)
}
