import {
	Address,
	Bytes,
} from '@graphprotocol/graph-ts'

import {
	ShardedWallet        as ShardedWalletContract,
	ActionCancelled      as ActionCancelledEvent,
	ActionExecuted       as ActionExecutedEvent,
	ActionScheduled      as ActionScheduledEvent,
	Approval             as ApprovalEvent,
	ERC1155Received      as ERC1155ReceivedEvent,
	ERC721Received       as ERC721ReceivedEvent,
	ERC777Received       as ERC777ReceivedEvent,
	OwnershipTransferred as OwnershipTransferredEvent,
	TimerReset           as TimerResetEvent,
	TimerStarted         as TimerStartedEvent,
	TimerStopped         as TimerStoppedEvent,
	Transfer             as TransferEvent,
} from '../../../generated/templates/ShardedWallet/ShardedWallet'


import {
	Account,
	Governance,
	ShardedWallet,
	Balance,
	Action,
	ActionCall,
	Timer,
	OwnershipTransferred,
	Transfer,
	Approval,
	ActionScheduled,
	ActionExecuted,
	ActionCancelled,
	TimerStarted,
	TimerStopped,
	TimerReset,
} from '../../../generated/schema'

import {
	constants,
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'


function fetchShardedWallet(address: Address): ShardedWallet {
	let id = address.toHex()
	let wallet = ShardedWallet.load(id)
	if (wallet == null) {
		let contract       = ShardedWalletContract.bind(address)
		let governance     = new Governance(contract.governance().toHex())
		wallet             = new ShardedWallet(id)
		wallet.name        = contract.name()
		wallet.symbol      = contract.symbol()
		wallet.decimals    = contract.decimals()
		wallet.governance  = governance.id
		let walletsupply   = new decimals.Value(id.concat('-totalSupply'), wallet.decimals)
		wallet.totalSupply = walletsupply.id;
		governance.save()
	}
	return wallet as ShardedWallet
}

function fetchBalance(wallet: ShardedWallet, account: Account): Balance {
	let balanceid = wallet.id.concat('-').concat(account.id)
	let balance = Balance.load(balanceid)
	if (balance == null) {
		let balancesupply = new decimals.Value(balanceid, wallet.decimals)
		balance           = new Balance(balanceid)
		balance.wallet    = wallet.id
		balance.account   = account.id
		balance.amount    = balancesupply.id
	}
	return balance as Balance
}

function fetchBalanceValue(wallet: ShardedWallet, account: Account): decimals.Value {
	return new decimals.Value(fetchBalance(wallet, account).amount)
}


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

export function handleTransfer(event: TransferEvent): void {
	let wallet       = fetchShardedWallet(event.address)
	let walletsupply = new decimals.Value(wallet.id.concat('-totalSupply'), wallet.decimals)
	let from         = new Account(event.params.from.toHex())
	let to           = new Account(event.params.to.toHex())
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)

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

export function handleApproval(event: ApprovalEvent): void {
	let wallet       = fetchShardedWallet(event.address)
	let owner        = new Account(event.params.owner.toHex())
	let spender      = new Account(event.params.spender.toHex())
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)

	let ev = new Approval(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.wallet      = wallet.id
	ev.owner       = owner.id
	ev.spender     = spender.id
	ev.amount      = amount.id
	ev.save()
}

export function handleActionScheduled(event: ActionScheduledEvent): void {
	let wallet        = fetchShardedWallet(event.address)
	let to            = new Account(event.params.to.toHex())
	let action        = new Action(event.params.id.toHex())
	let actioncall    = new ActionCall(action.id.concat('-').concat(event.params.i.toHex()))
	action.status     = 'SCHEDULED'
	action.wallet     = wallet.id
	action.timer      = action.id
	actioncall.action = action.id
	actioncall.index  = event.params.i
	actioncall.to     = to.id
	actioncall.data   = event.params.data.subarray(0, 2048) as Bytes
	to.save()
	action.save()
	actioncall.save()

	let ev = new ActionScheduled(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.save()
}

export function handleActionExecuted(event: ActionExecutedEvent): void {
	let action    = new Action(event.params.id.toHex())
	action.status = 'EXECUTED'
	action.save()

	let ev = new ActionExecuted(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.save()
}

export function handleActionCancelled(event: ActionCancelledEvent): void {
	let action    = new Action(event.params.id.toHex())
	action.status = 'CANCELLED'
	action.save()

	let ev = new ActionCancelled(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.action      = action.id
	ev.save()
}

export function handleTimerStarted(event: TimerStartedEvent): void {
	let timer    = new Timer(event.params.timer.toHex())
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
	let timer    = new Timer(event.params.timer.toHex())
	timer.status = 'EXECUTED'
	timer.save()

	let ev = new TimerStopped(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()
}

export function handleTimerReset(event: TimerResetEvent): void {
	let timer    = new Timer(event.params.timer.toHex())
	timer.status = 'CANCELLED'
	timer.save()

	let ev = new TimerReset(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.timer       = timer.id
	ev.save()
}




export function handleERC721Received(event: ERC721ReceivedEvent): void {
	// event.params.token
	// event.params.operator
	// event.params.from
	// event.params.tokenId
}

export function handleERC777Received(event: ERC777ReceivedEvent): void {
	// event.params.token
	// event.params.operator
	// event.params.from
	// event.params.amount
}

export function handleERC1155Received(event: ERC1155ReceivedEvent): void {
	// event.params.token
	// event.params.operator
	// event.params.from
	// event.params.id
	// event.params.value
}
