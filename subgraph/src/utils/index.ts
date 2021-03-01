import {
	Address,
	Bytes,
} from '@graphprotocol/graph-ts'

import {
	ERC20 as ERC20Contract,
} from '../../../generated/templates/ERC20/ERC20'

import {
	ShardedWallet as ShardedWalletContract,
} from '../../../generated/templates/ShardedWallet/ShardedWallet'

import {
	Account,
	Governance,
	ShardedWallet,
	Token,
	Balance,
} from '../../../generated/schema'

import {
	decimals,
} from '@amxx/graphprotocol-utils'

export function bytesToAddress(bytes: Bytes): Address {
	return bytes.subarray(12, 40) as Address;
}

// TODO
// export function addressToBytes(bytes: Bytes): Address {
// }

export function addressStringToBytesString(address: string): string {
	return "0x000000000000000000000000".concat(address.substr(2, 40))
}

export function bytesStringToAddressString(address: string): string {
	return "0x".concat(address.substr(26, 40))
}

export function fetchAccount(address: Address): Account {
	let account = new Account(address.toHex());
	account.save()
	return account;
}

export function fetchToken(address: Address): Token {
	let id = address.toHex()
	let token = Token.load(id)
	if (token == null) {
		let contract      = ERC20Contract.bind(address)
		token             = new Token(id)
		token.name        = contract.name()
		token.symbol      = contract.symbol()
		token.decimals    = contract.decimals()
		let tokensupply   = new decimals.Value(id.concat('-totalSupply'), token.decimals)
		token.totalSupply = tokensupply.id;
		token.save()
	}
	return token as Token
}

export function fetchBalance(token: Token, account: Account): Balance {
	let balanceid = token.id.concat('-').concat(account.id)
	let balance = Balance.load(balanceid)
	if (balance == null) {
		let balancesupply = new decimals.Value(balanceid, token.decimals)
		balance           = new Balance(balanceid)
		balance.token     = token.id
		balance.account   = account.id
		balance.amount    = balancesupply.id
		balance.save()
	}
	return balance as Balance
}

export function fetchShardedWallet(address: Address): ShardedWallet {
	let id = address.toHex()
	let wallet = ShardedWallet.load(id)
	if (wallet == null) {
		let token         = fetchToken(address)
		let contract      = ShardedWalletContract.bind(address)
		let governance    = new Governance(contract.governance().toHex())
		let owner         = fetchAccount(contract.owner())
		let artist        = fetchAccount(contract.artistWallet())
		wallet            = new ShardedWallet(id)
		wallet.asToken    = token.id
		wallet.owner      = owner.id
		wallet.governance = governance.id
		wallet.artist     = artist.id
		token.asWallet    = wallet.id
		wallet.save()
		token.save()
		governance.save()
	}
	return wallet as ShardedWallet
}

export function fetchBalanceValue(token: Token, account: Account): decimals.Value {
	return new decimals.Value(fetchBalance(token, account).amount)
}
