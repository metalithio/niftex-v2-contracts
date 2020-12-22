import {
	NewInstance as NewInstanceEvent,
} from '../../../generated/ShardedWalletFactory/ShardedWalletFactory'

import {
	ShardedWallet as ShardedWalletContract,
} from '../../../generated/ShardedWalletFactory/ShardedWallet'

import {
	ShardedWallet as ShardedWalletTemplate,
} from '../../../generated/templates'

import {
	Governance,
	ShardedWallet,
} from '../../../generated/schema'

import {
	events,
	decimals,
	transactions,
} from '@amxx/graphprotocol-utils'


export function handleNewInstance(event: NewInstanceEvent): void {
	let contract              = ShardedWalletContract.bind(event.params.instance)
	let governance            = new Governance(contract.governance().toHex())
	let shardedwallet         = new ShardedWallet(contract._address.toHex())
	shardedwallet.name        = contract.name()
	shardedwallet.symbol      = contract.symbol()
	shardedwallet.decimals    = contract.decimals()
	shardedwallet.governance  = governance.id
	let shardedwalletsupply   = new decimals.Value(shardedwallet.id.concat('-totalSupply'), shardedwallet.decimals)
	shardedwallet.totalSupply = shardedwalletsupply._entry.id;

	governance.save()
	shardedwallet.save()




	// let from = fetchAccount(ev.params.from.toHex())
	// let to   = fetchAccount(ev.params.to.toHex())
	// from.save();
	// to.save();
	//
	// let workerpool = new Workerpool(contract._address.toHex())
	// workerpool.owner                = contract.owner().toHex()
	// workerpool.description          = contract.m_workerpoolDescription()
	// workerpool.workerStakeRatio     = contract.m_workerStakeRatioPolicy()
	// workerpool.schedulerRewardRatio = contract.m_schedulerRewardRatioPolicy()
	// workerpool.save();
	//
	// let transfer = new WorkerpoolTransfer(createEventID(ev))
	// transfer.transaction = logTransaction(ev).id
	// transfer.timestamp   = ev.block.timestamp
	// transfer.workerpool  = workerpool.id;
	// transfer.from        = from.id;
	// transfer.to          = to.id;
	// transfer.save();

	ShardedWalletTemplate.create(contract._address)
}
