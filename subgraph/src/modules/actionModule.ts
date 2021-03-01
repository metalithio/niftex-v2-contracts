import {
	Bytes,
} from '@graphprotocol/graph-ts'

import {
	ActionCancelled as ActionCancelledEvent,
	ActionExecuted  as ActionExecutedEvent,
	ActionScheduled as ActionScheduledEvent,
} from '../../../generated/ActionModule/ActionModule'

import {
	Action,
	ActionCall,
	ActionScheduled,
	ActionExecuted,
	ActionCancelled,
} from '../../../generated/schema'

import {
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	fetchAccount,
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

export function handleTimerStarted(event: TimerStartedEvent): void {
	let timer = genericHandleTimerStarted(event)
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	let timer = genericHandleTimerStopped(event)
}

export function handleTimerReset(event: TimerResetEvent): void {
	let timer = genericHandleTimerReset(event)
}

export function handleActionScheduled(event: ActionScheduledEvent): void {
	let wallet        = fetchShardedWallet(event.params.wallet)
	let to            = fetchAccount(event.params.to)
	let action        = new Action(event.params.uid.toHex())
	let actioncall    = new ActionCall(action.id.concat('-').concat(event.params.i.toHex()))
	let value         = new decimals.Value(events.id(event))
	value.set(event.params.value)

	action.status     = 'SCHEDULED'
	action.wallet     = wallet.id
	action.identifier = event.params.id.toHex()
	action.timer      = event.address.toHex().concat('-').concat(action.id)
	actioncall.action = action.id
	actioncall.index  = event.params.i
	actioncall.to     = to.id
	actioncall.value  = value.id
	actioncall.data   = event.params.data.subarray(0, 2048) as Bytes
	action.save()
	actioncall.save()

	let ev = new ActionScheduled(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.wallet      = wallet.id
	ev.save()
}

export function handleActionExecuted(event: ActionExecutedEvent): void {
	let wallet    = fetchShardedWallet(event.params.wallet)
	let action    = new Action(event.params.uid.toHex())
	action.status = 'EXECUTED'
	action.save()

	let ev = new ActionExecuted(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.wallet      = wallet.id
	ev.save()
}

export function handleActionCancelled(event: ActionCancelledEvent): void {
	let wallet    = fetchShardedWallet(event.params.wallet)
	let action    = new Action(event.params.uid.toHex())
	action.status = 'CANCELLED'
	action.save()

	let ev = new ActionCancelled(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.wallet      = wallet.id
	ev.save()
}
