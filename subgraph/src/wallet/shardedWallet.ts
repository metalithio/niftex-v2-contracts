import {
	Bytes,
} from '@graphprotocol/graph-ts'

import {
	Execute              as ExecuteEvent,
	ModuleExecute        as ModuleExecuteEvent,
	GovernanceUpdated    as GovernanceUpdatedEvent,
	OwnershipTransferred as OwnershipTransferredEvent,
	Received             as ReceivedEvent,
	ArtistUpdated        as ArtistUpdatedEvent,
} from '../../../generated/templates/ShardedWallet/ShardedWallet'

import {
	Governance,
	Module,
	OwnershipTransferred,
	Execute,
	ModuleExecute,
	GovernanceUpdated,
	ArtistUpdated,
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

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
	let wallet   = fetchShardedWallet(event.address)
	let from     = fetchAccount(event.params.previousOwner)
	let to       = fetchAccount(event.params.newOwner)
	wallet.owner = to.id
	wallet.save()

	let ev         = new OwnershipTransferred(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.from        = from.id
	ev.to          = to.id
	ev.save()
}

export function handleExecute(event: ExecuteEvent): void {
	let wallet = fetchShardedWallet(event.address)
	let to     = fetchAccount(event.params.to)
	let value  = new decimals.Value(events.id(event))
	value.set(event.params.value)

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
	let to     = fetchAccount(event.params.to)
	let value  = new decimals.Value(events.id(event))
	value.set(event.params.value)
	module.save()

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

export function handleArtistUpdated(event: ArtistUpdatedEvent): void {
	let wallet          = fetchShardedWallet(event.address)
	let artist          = fetchAccount(event.params.newArtist)
	wallet.artist       = artist.id
	wallet.save()

	let ev = new ArtistUpdated(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.artist      = artist.id
	ev.save()
}

export function handleReceived(event: ReceivedEvent): void {
	// TODO
}
