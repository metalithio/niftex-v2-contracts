import {
	OwnershipReclaimed     as OwnershipReclaimedEvent,
	SharesBought           as SharesBoughtEvent,
	SharesRedeemedFaillure as SharesRedeemedFaillureEvent,
	SharesRedeemedSuccess  as SharesRedeemedSuccessEvent,
	TimerReset             as TimerResetEvent,
	TimerStarted           as TimerStartedEvent,
	TimerStopped           as TimerStoppedEvent,
	Withdraw               as WithdrawEvent,
} from '../../../generated/CrowdsaleFixedPriceModule/CrowdsaleFixedPriceModule'

import {
	Account,
} from '../../../generated/schema'

import {
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	fetchShardedWallet,
} from '../utils'

export {
	handleTimerStarted,
	handleTimerStopped,
	handleTimerReset,
} from '../generic/timer'

export function handleOwnershipReclaimed(event: OwnershipReclaimedEvent): void {
	//TODO
}

export function handleSharesBought(event: SharesBoughtEvent): void {
	//TODO
}

export function handleSharesRedeemedFaillure(event: SharesRedeemedFaillureEvent): void {
	//TODO
}

export function handleSharesRedeemedSuccess(event: SharesRedeemedSuccessEvent): void {
	//TODO
}

export function handleTimerReset(event: TimerResetEvent): void {
	//TODO
}

export function handleTimerStarted(event: TimerStartedEvent): void {
	//TODO
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	//TODO
}

export function handleWithdraw(event: WithdrawEvent): void {
	//TODO
}
