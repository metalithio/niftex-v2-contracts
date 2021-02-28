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
	Account,
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
	fetchShardedWallet,
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

export function handleArtistUpdated(event: ArtistUpdatedEvent): void {
	let wallet          = fetchShardedWallet(event.address)
	let artist          = new Account(event.params.newArtist.toHex())
	wallet.artist       = artist.id
	wallet.save()
	artist.save()

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
