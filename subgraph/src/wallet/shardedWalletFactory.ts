import {
	NewInstance as NewInstanceEvent,
} from '../../../generated/ShardedWalletFactory/ShardedWalletFactory'

import {
	ERC20         as ERC20Template,
	ShardedWallet as ShardedWalletTemplate,
} from '../../../generated/templates'

export function handleNewInstance(event: NewInstanceEvent): void {
	ERC20Template.create(event.params.instance)
	ShardedWalletTemplate.create(event.params.instance)
}
