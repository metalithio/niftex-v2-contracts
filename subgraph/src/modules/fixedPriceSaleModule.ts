import {
	OwnershipReclaimed     as OwnershipReclaimedEvent,
	ShardsBought           as ShardsBoughtEvent,
	ShardsRedeemedFailure  as ShardsRedeemedFailureEvent,
	ShardsRedeemedSuccess  as ShardsRedeemedSuccessEvent,
	TimerReset             as TimerResetEvent,
	TimerStarted           as TimerStartedEvent,
	TimerStopped           as TimerStoppedEvent,
	Withdraw               as WithdrawEvent,
} from '../../generated/FixedPriceSaleModule/FixedPriceSaleModule'

import {
	Account,
} from '../../generated/schema'

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

export function handleShardsBought(event: ShardsBoughtEvent): void {
	//TODO
}

export function handleShardsRedeemedFailure(event: ShardsRedeemedFailureEvent): void {
	//TODO
}

export function handleShardsRedeemedSuccess(event: ShardsRedeemedSuccessEvent): void {
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
