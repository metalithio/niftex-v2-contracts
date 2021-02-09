import {
	NewInstance as NewInstanceEvent,
} from '../../generated/ShardedWalletFactory/ShardedWalletFactory'

import {
	ShardedWallet as ShardedWalletTemplate,
} from '../../generated/templates'

export function handleNewInstance(event: NewInstanceEvent): void {
	ShardedWalletTemplate.create(event.params.instance)
}
