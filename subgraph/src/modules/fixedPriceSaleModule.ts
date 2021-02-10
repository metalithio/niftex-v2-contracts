import {
	Address,
	BigInt,
} from '@graphprotocol/graph-ts'

import {
	TimerReset      as TimerResetEvent,
	TimerStarted    as TimerStartedEvent,
	TimerStopped    as TimerStoppedEvent,
} from '../../../generated/ActionModule/Timers'

import {
	FixedPriceSaleModule as FixedPriceSaleModuleContract,
	OwnershipReclaimed     as OwnershipReclaimedEvent,
	ShardsPrebuy           as ShardsPrebuyEvent,
	ShardsBought           as ShardsBoughtEvent,
	ShardsRedeemedFailure  as ShardsRedeemedFailureEvent,
	ShardsRedeemedSuccess  as ShardsRedeemedSuccessEvent,
	Withdraw               as WithdrawEvent,
	NewBondingCurve        as NewBondingCurveEvent,
} from '../../../generated/FixedPriceSaleModule/FixedPriceSaleModule'

import {
	Account,
	ShardedWallet,
	FixedPriceSale,
	FixedPriceSalePrebuy,
	FixedPriceSaleBuy,
} from '../../../generated/schema'

import {
	constants,
	decimals,
	// events,
	// transactions,
} from '@amxx/graphprotocol-utils'

import {
	bytesToAddress,
	addressStringToBytesString,
	fetchShardedWallet,
} from '../utils'

import {
	handleTimerStarted as genericHandleTimerStarted,
	handleTimerStopped as genericHandleTimerStopped,
	handleTimerReset   as genericHandleTimerReset,
} from '../generic/timer'

export function fetchFixedPriceSale(wallet: ShardedWallet, module: Address, reset: bool = false): FixedPriceSale {
	let fixedpricesale = FixedPriceSale.load(wallet.id)
	if (fixedpricesale == null || reset) {
		let index                      = fixedpricesale == null ? 0 : fixedpricesale.index
		let contract                   = FixedPriceSaleModuleContract.bind(module)
		let walletAsAddress            = Address.fromString(wallet.id)
		fixedpricesale                 = new FixedPriceSale(wallet.id)
		let recipient                  = new Account(contract.recipients(walletAsAddress).toHex())
		let balance                    = new decimals.Value(wallet.id.concat('-balance'), 18) // ETH
		let price                      = new decimals.Value(wallet.id.concat('-price'), 18) // ETH per Shard
		let remainingShards            = new decimals.Value(wallet.id.concat('-remaining'), wallet.decimals) // Shards
		price.set(contract.prices(walletAsAddress))
		remainingShards.set(contract.remainingShards(walletAsAddress))
		fixedpricesale.index           = index
		fixedpricesale.wallet          = wallet.id
		fixedpricesale.recipient       = recipient.id
		fixedpricesale.balance         = balance.id
		fixedpricesale.price           = price.id
		fixedpricesale.remainingShards = remainingShards.id
		fixedpricesale.timer           = module.toHex().concat('-').concat(addressStringToBytesString(wallet.id))
		fixedpricesale.status          = remainingShards._entry.exact.equals(constants.BIGINT_ZERO) ? 'SUCCESS' : 'INITIATED'
		fixedpricesale.withdrawn       = false;
		recipient.save();
	}
	return fixedpricesale as FixedPriceSale
}

export function handleTimerStarted(event: TimerStartedEvent): void {
	genericHandleTimerStarted(event)
	let wallet         = fetchShardedWallet(bytesToAddress(event.params.timer))
	let fixedpricesale = fetchFixedPriceSale(wallet, event.address, true)
	wallet.save()
	fixedpricesale.save()
}

export function handleTimerStopped(event: TimerStoppedEvent): void {
	genericHandleTimerStopped(event)
	// Should never be called
}

export function handleTimerReset(event: TimerResetEvent): void {
	genericHandleTimerReset(event)
	let wallet            = fetchShardedWallet(bytesToAddress(event.params.timer))
	let fixedpricesale    = fetchFixedPriceSale(wallet, event.address)
	fixedpricesale.status = 'RESET'
	fixedpricesale.save()
}

export function handleShardsPrebuy(event: ShardsPrebuyEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(wallet, event.address)
	let recipient            = new Account(event.params.receiver.toHex())
	let fixedpricesaleprebuy = new FixedPriceSalePrebuy(wallet.id.concat('-').concat(recipient.id))
	let amount               = new decimals.Value(fixedpricesaleprebuy.id.concat('-prebuy-').concat(BigInt.fromI32(fixedpricesale.index).toString()), wallet.decimals)
	amount.set(event.params.count)

	fixedpricesaleprebuy.index          = fixedpricesale.index;
	fixedpricesaleprebuy.fixedpricesale = fixedpricesale.id
	fixedpricesaleprebuy.recipient      = recipient.id
	fixedpricesaleprebuy.amount         = amount.id
	fixedpricesaleprebuy.redeemed       = false;
	fixedpricesaleprebuy.save()
}

export function handleShardsBought(event: ShardsBoughtEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(wallet, event.address)
	let recipient            = new Account(event.params.to.toHex())
	let fixedpricesalebuy    = new FixedPriceSaleBuy(wallet.id.concat('-').concat(recipient.id))
	let amount               = new decimals.Value(fixedpricesalebuy.id.concat('-buy-').concat(BigInt.fromI32(fixedpricesale.index).toString()), wallet.decimals)
	amount.set(event.params.count)

	fixedpricesalebuy.index          = fixedpricesale.index;
	fixedpricesalebuy.fixedpricesale = fixedpricesale.id
	fixedpricesalebuy.recipient      = recipient.id
	fixedpricesalebuy.amount         = amount.id
	fixedpricesalebuy.redeemed       = false;
	fixedpricesalebuy.save()

	let balance         = new decimals.Value(fixedpricesale.balance)
	let price           = new decimals.Value(fixedpricesale.price)
	let remainingShards = new decimals.Value(fixedpricesale.remainingShards)
	// OPTION 1: Read from chain
	// let contract        = FixedPriceSaleModuleContract.bind(event.address)
	// balance.set(contract.balance(event.params.wallet))
	// remainingShards.set(contract.remainingShards(event.params.wallet))
	// OPTION 2: Update from storage
	balance.increment(
		event.params.count
		.times(price._entry.exact)
		.div(BigInt.fromI32(10).pow(<u8>wallet.decimals))
	)
	remainingShards.decrement(
		event.params.count
	)
	// Check status
	if (remainingShards._entry.exact.equals(constants.BIGINT_ZERO)) {
		fixedpricesale.status = 'SUCCESS'
		fixedpricesale.save()
	}
}

export function handleShardsRedeemedSuccess(event: ShardsRedeemedSuccessEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(wallet, event.address)
	let recipient            = new Account(event.params.to.toHex())

	let fixedpricesaleprebuy = FixedPriceSalePrebuy.load(wallet.id.concat('-').concat(recipient.id))
	if (fixedpricesaleprebuy != null && fixedpricesale.index == fixedpricesaleprebuy.index) {
		fixedpricesaleprebuy.redeemed = true;
		fixedpricesaleprebuy.save()
	}

	let fixedpricesalebuy = FixedPriceSaleBuy.load(wallet.id.concat('-').concat(recipient.id))
	if (fixedpricesalebuy != null && fixedpricesale.index == fixedpricesalebuy.index) {
		fixedpricesalebuy.redeemed = true;
		fixedpricesalebuy.save()
	}
}

export function handleShardsRedeemedFailure(event: ShardsRedeemedFailureEvent): void {
	let wallet               = fetchShardedWallet(event.params.wallet)
	let fixedpricesale       = fetchFixedPriceSale(wallet, event.address)
	let recipient            = new Account(event.params.to.toHex())

	let fixedpricesaleprebuy = FixedPriceSalePrebuy.load(wallet.id.concat('-').concat(recipient.id))
	if (fixedpricesaleprebuy != null && fixedpricesale.index == fixedpricesaleprebuy.index) {
		fixedpricesaleprebuy.redeemed = true;
		fixedpricesaleprebuy.save()
	}

	let fixedpricesalebuy = FixedPriceSaleBuy.load(wallet.id.concat('-').concat(recipient.id))
	if (fixedpricesalebuy != null && fixedpricesale.index == fixedpricesalebuy.index) {
		fixedpricesalebuy.redeemed = true;
		fixedpricesalebuy.save()
	}

	fixedpricesale.status = 'FAILURE'
	fixedpricesale.save()
}

export function handleWithdraw(event: WithdrawEvent): void {
	// TODO: mark withdrawn + mark finish and success
}

export function handleOwnershipReclaimed(event: OwnershipReclaimedEvent): void {
	// TODO: mark withdrawn + mark finish and failure
}
