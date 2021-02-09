import {
	Bytes,
} from '@graphprotocol/graph-ts'

import {
	Approval             as ApprovalEvent,
	Execute              as ExecuteEvent,
	ModuleExecute        as ModuleExecuteEvent,
	GovernanceUpdated    as GovernanceUpdatedEvent,
	OwnershipTransferred as OwnershipTransferredEvent,
	Received             as ReceivedEvent,
	Transfer             as TransferEvent,
} from '../../generated/templates/ShardedWallet/ShardedWallet'

import {
	Account,
	Governance,
	Module,
	OwnershipTransferred,
	Approval,
	Transfer,
	Execute,
	ModuleExecute,
	GovernanceUpdated,
} from '../../generated/schema'

import {
	constants,
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	fetchShardedWallet,
	fetchBalanceValue,
} from '../utils'

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
	let wallet   = fetchShardedWallet(event.address)
	let from     = new Account(event.params.previousOwner.toHex())
	let to       = new Account(event.params.newOwner.toHex())

	wallet.owner = to.id

	from.save()
	to.save()
	wallet.save()

	let ev         = new OwnershipTransferred(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.from        = from.id
	ev.to          = to.id
	ev.save()
}

export function handleApproval(event: ApprovalEvent): void {
	let wallet       = fetchShardedWallet(event.address)
	let owner        = new Account(event.params.owner.toHex())
	let spender      = new Account(event.params.spender.toHex())
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)
	owner.save()
	spender.save()

	let ev = new Approval(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.owner       = owner.id
	ev.spender     = spender.id
	ev.amount      = amount.id
	ev.save()
}

export function handleTransfer(event: TransferEvent): void {
	let wallet       = fetchShardedWallet(event.address)
	let walletsupply = new decimals.Value(wallet.id.concat('-totalSupply'), wallet.decimals)
	let from         = new Account(event.params.from.toHex())
	let to           = new Account(event.params.to.toHex())
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)
	from.save()
	to.save()

	let ev = new Transfer(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.from        = from.id
	ev.to          = to.id
	ev.amount      = amount.id

	if (from.id == constants.ADDRESS_ZERO) {
		walletsupply.increment(amount._entry.exact)
	} else {
		let balance = fetchBalanceValue(wallet, from)
		balance.decrement(amount._entry.exact)
		ev.fromBalance = balance.id
	}

	if (to.id == constants.ADDRESS_ZERO) {
		walletsupply.decrement(amount._entry.exact)
	} else {
		let balance = fetchBalanceValue(wallet, to)
		balance.increment(amount._entry.exact)
		ev.toBalance = balance.id
	}

	ev.save()
}

export function handleExecute(event: ExecuteEvent): void {
	let wallet = fetchShardedWallet(event.address)
	let to     = new Account(event.params.to.toHex())
	let value  = new decimals.Value(events.id(event))
	value.set(event.params.value)
	to.save()

	let ev = new Execute(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.to          = to.id
	ev.value       = value.id
	ev.data        = event.params.data.subarray(0, 2048) as Bytes
	ev.save()
}

export function handleModuleExecute(event: ModuleExecuteEvent): void {
	let wallet = fetchShardedWallet(event.address)
	let module = new Module(event.params.module.toHex())
	let to     = new Account(event.params.to.toHex())
	let value  = new decimals.Value(events.id(event))
	value.set(event.params.value)
	module.save()
	to.save()

	let ev = new ModuleExecute(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.module      = module.id
	ev.to          = to.id
	ev.value       = value.id
	ev.data        = event.params.data.subarray(0, 2048) as Bytes
	ev.save()
}

export function handleGovernanceUpdated(event: GovernanceUpdatedEvent): void {
	let wallet          = fetchShardedWallet(event.address)
	let governance      = new Governance(event.params.newGovernance.toHex())
	wallet.governance   = governance.id
	wallet.save()
	governance.save()

	let ev = new GovernanceUpdated(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.governance  = governance.id
	ev.save()
}

export function handleReceived(event: ReceivedEvent): void {
	// TODO
}
