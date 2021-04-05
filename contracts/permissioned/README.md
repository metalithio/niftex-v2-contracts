# TokenSoft Token
ERC20 Token with 1404 Restrictions

## Use Case
The TokenSoft token is an ERC20 compatible token with transfer restrictions added that follow the ERC1404 standard. The 1404 Restrictions will use whitelists to segregate groups of accounts so they are only allowed to transfer to designated destination addresses.

## Token
The following features will be determined at deploy time, locking them in place.

 - Name
 - Symbol
 - Decimals

The following feature can be increased via minting and burning after deployment.

 - Total Supply

On deployment, all tokens will be transferred to the owner account passed in during deployment.

## Restrictions

If a token transfer is restricted, the code will follow the ERC1404 spec and revert the transaction. Any wallets interacting with an ERC1404 token contract should first query the contract to determine if the transfer is allowed, and if not, show the appropriate error to the user (including the reason code/text from the contract).

## Roles
All accounts need to be granted a role by an admin in order to be able to interact with the contract's administrative functions:

 - Owner: Onwers are responsible for managing permissions of all roles.
 - BurnerRole: These accounts can burn tokens from accounts.
 - MinterRole: These accounts can mint new tokens to other accounts.
 - PauserRole: These accounts can halt all transfers on the contract.
 - RevokerRole: These accounts can revoke tokens from other accounts into their own.
 - WhitelisterRole: These accounts can configure whitelist rules and add/remove accounts from whitelists.

## Owners

Owner accounts can add and remove other account addresses to all Roles, including Owners. Owners can remove themselves from being an Owner, so care needs to be taken to ensure at least 1 address maintains ownership (unless the goal is to remove all owners).

The Owner account specified at the time of deployment will be the only Owner account by default.

## Whitelists
Before tokens can be transferred to a new address, it must be validated that the source is allowed to send to that destination address and that the destination address can receive funds. If the sending client does not check this in advance and sends an invalid transfer, the transfer functionality will fail and the transaction will revert.

Owner accounts will have the ability to transfer tokens to any valid address, regardless of the whitelist configuration state.

An Owner can enable and disable the whitelist functionality to remove the whitelist restrictions on transfers.  The default state is set as enabled/disabled in the initialiation of the token contract.

An address can only be a member of one whitelist at any point in time. If an admin adds any address to a new whitelist, it will no longer be a member of the previous whitelist it was on (if any). Adding an address to a whitelist of ID 0 will remove it from all whitelists, as whitelist ID 0 is invalid. Removing an address from the existing whitelist will set it to belong to whitelist 0. An address with whitelist 0 will be prevented from transferring or receiving tokens. Any tokens on a whitelist 0 account are frozen. All addresses belong to whitelist 0 by default.

Any whitelist can be configured to have multiple Outbound Whitelists. When a transfer is initiated, the restriction logic will first determine the whitelist that both the source and destination belong to. Then it will determine if the source whitelist is configured to allow transactions to the destination whitelist. If either address is on whitelist 0 the transfer will be restricted. Also, the transfer will be restricted if the source whitelist is not configured to send to the destination whitelist.

Example
- Whitelist A is only allowed to send to itself.
- Whitelist B is allowed to send to itself and whitelist A.
- Whitelist C is allowed to send to itself and whitelists A and B.
- Whitelist D is not allowed to transfer to any whitelist, including itself.

<p align="center" style="padding-top: 10px; padding-bottom: 5px;">
  <img src="example_whitelist.png">
</p>


A total of 255 whitelists can be utilized, each with the ability to restrict transfers to all other whitelists.

By default, all whitelists will **NOT** be allowed to transfer between source and destination addresses within the same whitelist. This must explicitly be enabled. By default all whitelists block all transfers.

Administrators will have the ability modify a whitelist beyond the default configuration to add or remove outbound whitelists.

## Pausing

The Pauser accounts may pause/unpause the contract. When the contract is paused all transfers will be blocked. When deployed the contract is initially unpaused.

## Minting
Minter accounts can mint tokens to other accounts. Minting tokens increases the total supply of tokens and the balance of the account the tokens are minted to.

## Burning
Burner accounts can burn tokens from other accounts. Burning tokens decreases the total supply of tokens and the balance of the account the tokens are burned from.

## Revoking
Revoker accounts can revoke tokens from any account. Revoking tokens has no effect on the total supply, it increases the balance of the account revoking the tokens and decreases the balance of the account the tokens are revoked from.

## Upgrading via Proxy

The contract is upgradeable and allows for Owners to update the contract logic while maintaining contract state. Contracts can be upgraded to have more or less restrictive transfer logic or new transfer paradigms including escrow. Upgrading can be a **potentially destructive** operation if the new contract is incompatible with the existing contract due to broken upgrade methods or memory layout issues.

To update the contract logic:
>**1:** Deploy the new contract to the ethereum mainnet, this contract must impliment the Proxiable contract as defined https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1822.md

>**2:** An Owner  must then call the updateCodeAddress method on the existing token contract with the address of the contract deployed in step 1

  The Proxiable contract checks that the new logic contract implements the proxiableUUID method and returns the proper hash but care must still be taken to ensure the new contract implements correct update logic and compatible memory layout. https://blog.trailofbits.com/2018/09/05/contract-upgrade-anti-patterns/

# Testing
You should be able to install dependencies and then run tests:
```
$ npm install
$ npm run test
```

For unit test code coverage metrics:
```
$ npm run coverage
```

# General Warnings

### Proxy Deployment 
The intial deployment logic will not guarantee you are setting the logic address to a valid contract address.  If you set this to an external address, or a contract that is not "Proxiable" then the deployment will result in an invalid state.  This should just be a normal check after deployment and initialization that contract state is valid.

### Approve/TransferFrom ERC20 "Double Spend"
It is a known issue with ERC20 that incorrectly using approve could allow a spending to transfer more tokens than is desired.  To prevent this, ALWAYS set the approval amount to 0 before setting it to a new value.

### Centralization
This token contract allows administrative capabilities that may not be expected on completely decentralized system.  Accounts with administrative capabilities can burn tokens from any account, revoke tokens from any account, mint new tokens, upgrade contract logic, etc.  This should be evaluated before using/interacting with the contract. 

 The main use case for this contract is in dealing with Security Tokens which may require these capabilities from a regulatory necessity.