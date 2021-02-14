import {
	TimerReset      as TimerResetEvent,
	TimerStarted    as TimerStartedEvent,
	TimerStopped    as TimerStoppedEvent,
} from '../../../generated/ActionModule/Timers'

import {
	Timer,
	TimerStarted,
	TimerStopped,
	TimerReset,
} from '../../../generated/schema'

import {
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

export function handleTimerStarted(event: TimerStartedEvent): Timer {
	let timer      = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status   = 'STARTED'
	timer.start    = event.block.timestamp
	timer.deadline = event.params.deadline
	timer.save()

	let ev = new TimerStarted(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()

	return timer;
}

export function handleTimerStopped(event: TimerStoppedEvent): Timer {
	let timer    = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status = 'STOPPED'
	timer.save()

	let ev = new TimerStopped(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()

	return timer;
}

export function handleTimerReset(event: TimerResetEvent): Timer {
	let timer    = new Timer(event.address.toHex().concat('-').concat(event.params.timer.toHex()))
	timer.status = 'RESET'
	timer.save()

	let ev = new TimerReset(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()

	return timer;
}
