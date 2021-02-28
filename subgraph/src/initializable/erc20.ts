import {
	Approval as ApprovalEvent,
	Transfer as TransferEvent,
} from '../../../generated/templates/ERC20/ERC20'

import {
	Approval,
	Transfer,
} from '../../../generated/schema'

import {
	constants,
	decimals,
	events,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
	fetchAccount,
	fetchToken,
	fetchBalanceValue,
} from '../utils'

export function handleApproval(event: ApprovalEvent): void {
	let token        = fetchToken(event.address)
	let owner        = fetchAccount(event.params.owner)
	let spender      = fetchAccount(event.params.spender)
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)

	let ev = new Approval(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.token       = token.id
	ev.owner       = owner.id
	ev.spender     = spender.id
	ev.amount      = amount.id
	ev.save()
}

export function handleTransfer(event: TransferEvent): void {
	let token        = fetchToken(event.address)
	let tokensupply  = new decimals.Value(token.id.concat('-totalSupply'), token.decimals)
	let from         = fetchAccount(event.params.from)
	let to           = fetchAccount(event.params.to)
	let amount       = new decimals.Value(events.id(event))
	amount.set(event.params.value)

	let ev = new Transfer(events.id(event))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.token       = token.id
	ev.from        = from.id
	ev.to          = to.id
	ev.amount      = amount.id

	if (from.id == constants.ADDRESS_ZERO) {
		tokensupply.increment(amount._entry.exact)
	} else {
		let balance = fetchBalanceValue(token, from)
		balance.decrement(amount._entry.exact)
		ev.fromBalance = balance.id
	}

	if (to.id == constants.ADDRESS_ZERO) {
		tokensupply.decrement(amount._entry.exact)
	} else {
		let balance = fetchBalanceValue(token, to)
		balance.increment(amount._entry.exact)
		ev.toBalance = balance.id
	}

	ev.save()
}
