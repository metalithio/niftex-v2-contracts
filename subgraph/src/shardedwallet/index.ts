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
	BuyoutClaimed        as BuyoutClaimedEvent,
	BuyoutClosed         as BuyoutClosedEvent,
	BuyoutOpened         as BuyoutOpenedEvent,
	BuyoutResetted       as BuyoutResettedEvent,
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
	Buyout,
	Timer,
	OwnershipTransferred,
	Transfer,
	Approval,
	ActionScheduled,
	ActionExecuted,
	ActionCancelled,
	BuyoutClaimed,
	BuyoutClosed,
	BuyoutOpened,
	BuyoutResetted,
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
		let contract        = ShardedWalletContract.bind(address)
		let governance      = new Governance(contract.governance().toHex())
		wallet              = new ShardedWallet(id)
		wallet.governance   = governance.id
		wallet.name         = contract.name()
		wallet.symbol       = contract.symbol()
		wallet.decimals     = contract.decimals()
		let walletsupply    = new decimals.Value(id.concat('-totalSupply'), wallet.decimals)
		wallet.totalSupply  = walletsupply.id;
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

export function handleActionScheduled(event: ActionScheduledEvent): void {
	let wallet        = fetchShardedWallet(event.address)
	let to            = new Account(event.params.to.toHex())
	let action        = new Action(event.params.id.toHex())
	let actioncall    = new ActionCall(action.id.concat('-').concat(event.params.i.toHex()))
	action.status     = 'SCHEDULED'
	action.wallet     = wallet.id
	action.timer      = wallet.id.concat('-').concat(action.id)
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

export function handleBuyoutOpened(event: BuyoutOpenedEvent): void {
	let wallet            = fetchShardedWallet(event.address)
	let buyout            = new Buyout(events.id(event))
	let proposer          = new Account(event.params.proposer.toHex())
	let ev                = new BuyoutOpened(events.id(event))

	wallet.activeBuyout   = buyout.id
	buyout.status         = 'RUNNING'
	buyout.wallet         = wallet.id
	buyout.proposer       = proposer.id
	buyout.pricePerShare  = event.params.pricePerShare
	buyout.timer          = wallet.id.concat('-0x5570cd7375d5aef065d84fd2bc70103c74d8b0d806f74aecfa9829fdfad24720')
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.proposer           = proposer.id

	wallet.save()
	buyout.save()
	proposer.save()
	ev.save()
}

export function handleBuyoutClosed(event: BuyoutClosedEvent): void {
	let wallet            = fetchShardedWallet(event.address)
	let buyout            = new Buyout(wallet.activeBuyout)
	let closer            = new Account(event.params.closer.toHex())
	let ev                = new BuyoutClosed(events.id(event))
	wallet.activeBuyout   = null
	buyout.status         = 'CANCELLED'
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.closer             = closer.id
	wallet.save()
	buyout.save()
	closer.save()
	ev.save()
}

export function handleBuyoutClaimed(event: BuyoutClaimedEvent): void {
	let wallet            = fetchShardedWallet(event.address)
	let buyout            = new Buyout(wallet.activeBuyout)
	let user              = new Account(event.params.user.toHex())
	let ev                = new BuyoutClaimed(events.id(event))
	buyout.status         = 'SUCCESSFULL'
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	ev.user               = user.id
	buyout.save()
	user.save()
	ev.save()
}

export function handleBuyoutResetted(event: BuyoutResettedEvent): void {
	let wallet            = fetchShardedWallet(event.address)
	let buyout            = new Buyout(wallet.activeBuyout)
	let ev                = new BuyoutResetted(events.id(event))
	wallet.activeBuyout   = null
	buyout.status         = 'RESETTED'
	ev.transaction        = transactions.log(event).id
	ev.timestamp          = event.block.timestamp
	wallet.save()
	buyout.save()
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
