import {
	Address,
} from '@graphprotocol/graph-ts'

import {
	ShardedWallet as ShardedWalletContract,
} from '../../../generated/templates/ShardedWallet/ShardedWallet'

import {
	Account,
	Governance,
	ShardedWallet,
	Balance,
} from '../../../generated/schema'

import {
	decimals,
} from '@amxx/graphprotocol-utils'

export function fetchShardedWallet(address: Address): ShardedWallet {
	let id = address.toHex()
	let wallet = ShardedWallet.load(id)
	if (wallet == null) {
		let contract        = ShardedWalletContract.bind(address)
		wallet              = new ShardedWallet(id)
		wallet.name         = contract.name()
		wallet.symbol       = contract.symbol()
		wallet.decimals     = contract.decimals()
		let walletsupply    = new decimals.Value(id.concat('-totalSupply'), wallet.decimals)
		wallet.totalSupply  = walletsupply.id;

		let governance      = new Governance(contract.governance().toHex())
		wallet.governance   = governance.id
		governance.save()

		let artist          = new Account(contract.artistWallet().toHex())
		wallet.artist       = artist.id
		artist.save()
	}
	return wallet as ShardedWallet
}

export function fetchBalance(wallet: ShardedWallet, account: Account): Balance {
	let balanceid = wallet.id.concat('-').concat(account.id)
	let balance = Balance.load(balanceid)
	if (balance == null) {
		let balancesupply = new decimals.Value(balanceid, wallet.decimals)
		balance           = new Balance(balanceid)
		balance.wallet    = wallet.id
		balance.account   = account.id
		balance.amount    = balancesupply.id
		balance.save()
	}
	return balance as Balance
}

export function fetchBalanceValue(wallet: ShardedWallet, account: Account): decimals.Value {
	return new decimals.Value(fetchBalance(wallet, account).amount)
}
