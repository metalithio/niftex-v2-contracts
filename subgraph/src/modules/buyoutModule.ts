import {
	BuyoutOpened    as BuyoutOpenedEvent,
	BuyoutClaimed   as BuyoutClaimedEvent,
	BuyoutFinalized as BuyoutFinalizedEvent,
	BuyoutClosed    as BuyoutClosedEvent,
} from '../../../generated/BuyoutModule/BuyoutModule'

import {
	Account,
	Timer,
	Buyout,
	BuyoutOpened,
	BuyoutClosed,
	BuyoutClaimed,
	BuyoutFinalized,
} from '../../../generated/schema'

import {
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	addressStringToBytesString,
	fetchShardedWallet,
} from '../utils'

import {
	TimerReset         as TimerResetEvent,
	TimerStarted       as TimerStartedEvent,
	TimerStopped       as TimerStoppedEvent,
	handleTimerStarted as genericHandleTimerStarted,
	handleTimerStopped as genericHandleTimerStopped,
	handleTimerReset   as genericHandleTimerReset,
} from '../generic/timer'

export function handleTimerStarted(event: TimerStartedEvent): void {
	let timer = genericHandleTimerStarted(event)
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	let timer = genericHandleTimerStopped(event)
}

export function handleTimerReset(event: TimerResetEvent): void {
	let timer = genericHandleTimerReset(event)
}

export function handleBuyoutOpened(event: BuyoutOpenedEvent): void {
	let wallet            = fetchShardedWallet(event.params.wallet)
	let timer             = Timer.load(event.address.toHex().concat('-').concat(addressStringToBytesString(wallet.id)))
	let buyout            = new Buyout(events.id(event))
	let proposer          = new Account(event.params.proposer.toHex())
	let ev                = new BuyoutOpened(events.id(event))
	wallet.activeBuyout   = buyout.id
	buyout.status         = 'RUNNING'
	buyout.wallet         = wallet.id
	buyout.proposer       = proposer.id
	buyout.pricePerShard  = event.params.pricePerShard
	buyout.timer          = timer.id
	buyout.deadline       = timer.deadline
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.buyout             = buyout.id
	ev.proposer           = proposer.id
	wallet.save()
	buyout.save()
	proposer.save()
	ev.save()
}

export function handleBuyoutClosed(event: BuyoutClosedEvent): void {
	let wallet            = fetchShardedWallet(event.params.wallet)
	let buyout            = new Buyout(wallet.activeBuyout)
	let closer            = new Account(event.params.closer.toHex())
	let ev                = new BuyoutClosed(events.id(event))
	wallet.activeBuyout   = null
	buyout.status         = 'CANCELLED'
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.buyout             = buyout.id
	ev.closer             = closer.id
	wallet.save()
	buyout.save()
	closer.save()
	ev.save()
}

export function handleBuyoutClaimed(event: BuyoutClaimedEvent): void {
	let wallet            = fetchShardedWallet(event.params.wallet)
	let buyout            = new Buyout(wallet.activeBuyout)
	let user              = new Account(event.params.user.toHex())
	let ev                = new BuyoutClaimed(events.id(event))
	buyout.status         = 'SUCCESSFULL'
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.buyout             = buyout.id
	ev.user               = user.id
	buyout.save()
	user.save()
	ev.save()
}

export function handleBuyoutFinalized(event: BuyoutFinalizedEvent): void {
	let wallet            = fetchShardedWallet(event.params.wallet)
	let ev                = new BuyoutFinalized(events.id(event))
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.buyout             = wallet.activeBuyout
	ev.save()
}
