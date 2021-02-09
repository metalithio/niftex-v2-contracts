import {
	TimerReset      as TimerResetEvent,
	TimerStarted    as TimerStartedEvent,
	TimerStopped    as TimerStoppedEvent,
} from '../../generated/ActionModule/Timers'

import {
	Timer,
	TimerStarted,
	TimerStopped,
	TimerReset,
} from '../../generated/schema'

import {
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

export function handleTimerStarted(event: TimerStartedEvent): void {
	let timer    = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status = 'SCHEDULED'
	timer.start  = event.block.timestamp
	timer.stop   = event.params.deadline
	timer.save()

	let ev = new TimerStarted(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	let timer    = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status = 'EXECUTED'
	timer.save()

	let ev = new TimerStopped(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()
}

export function handleTimerReset(event: TimerResetEvent): void {
	let timer    = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status = 'CANCELLED'
	timer.save()

	let ev = new TimerReset(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()
}
