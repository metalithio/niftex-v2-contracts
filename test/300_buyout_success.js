const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const Crowdsale            = artifacts.require('PixedPriceCrowdsale');
const Governance           = artifacts.require('BasicGovernance');
const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
const ShardedWallet        = artifacts.require('ShardedWallet');
const ERC721Mock           = artifacts.require('ERC721Mock');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

	let instance;

	before(async function () {
		this.crowdsale  = await Crowdsale.new();
		this.governance = await Governance.new(50400, 50400); // 2 weeks, 2 weeks
		this.nft        = await ERC721Mock.new('NFTMock', 'NFTMock');
		this.factory    = await ShardedWalletFactory.new();

		const { gasUsed } = await web3.eth.getTransactionReceipt(this.factory.transactionHash);
		console.log('factory deployment:', gasUsed);
	});

	describe('Initialize', function () {
		it('perform', async function () {

			const { receipt } = await this.factory.mintWallet(
				user1,                        // owner_
				this.governance.address,      // governance_
				'Tokenized NFT',              // name_
				'TNFT',                       // symbol_
			);
			instance = await ShardedWallet.at(receipt.logs.find(({ event}) => event == "NewInstance").args.instance);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Prepare tokens', function () {
		it('perform', async function () {
			await this.nft.mint(instance.address, 1);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Setup crowdsale', function () {
		it('perform', async function () {
			const { receipt } = await instance.startCrowdsale(
				this.crowdsale.address,         // crowdsale
				this.crowdsale.contract.methods.setup(
					user1,                        // recipient
					web3.utils.toWei('0.01'),     // price
					3600,                         // duration
					20,                           // totalSupply
					[[ user1, 8 ], [ user2, 2 ]], // premint
				).encodeABI(),
				{ from: user1 }
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Buy shard', function () {
		it('perform', async function () {
			const { receipt } = await this.crowdsale.buy(instance.address, other1, { from: other1, value: web3.utils.toWei('0.01')})
			expectEvent(receipt, 'SharesBought', { token: instance.address, from: other1, to: other1, count: '1' });
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0.01'));
		});
	});

	describe('Buy rest', function () {
		it('perform', async function () {
			const { receipt } = await this.crowdsale.buy(instance.address, other2, { from: other2, value: web3.utils.toWei('1')})
			expectEvent(receipt, 'SharesBought', { token: instance.address, from: other2, to: other2, count: '9' });
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0.10'));
		});
	});

	describe('Withdraw', function () {
		it('perform', async function () {
			const { receipt } = await this.crowdsale.withdraw(instance.address, user1, { from: user1 });
			expectEvent(receipt, 'Withdraw', { token: instance.address, from: user1, to: user1, value: web3.utils.toWei('0.10') });
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '0');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('redeem', function () {
		it('perform', async function () {
			for ([ account, value ] of [[ user1, '8' ], [ user2, '2' ], [ other1, '1' ], [ other2, '9' ]])
			{
				const { receipt } = await this.crowdsale.redeem(instance.address, account, { from: account });
				expectEvent(receipt, 'SharesRedeemedSuccess', { token: instance.address, from: account, to: account, count: value });
				// expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: account, value: value });
			}
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '1');
			assert.equal(await instance.balanceOf(other2),                  '9');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Start buyout', function () {
		it('perform', async function () {
			const { receipt } = await instance.openBuyout(web3.utils.toWei('0.001'), { from: user1, value: web3.utils.toWei('1') });
			expectEvent(receipt, 'Transfer', { from: user1, to: instance.address, value: '8' });
			expectEvent(receipt, 'TimerStarted');
			deadline = receipt.logs.find(({ event }) => event == 'TimerStarted').args.deadline;
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '8');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '2');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '1');
			assert.equal(await instance.balanceOf(other2),                  '9');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0.012'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Wait buyout', function () {
		it('perform', async function () {
			await web3.currentProvider.send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [ Number(deadline) - (await web3.eth.getBlock("latest")).timestamp ], id: 0 }, () => {});
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '8');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '2');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '1');
			assert.equal(await instance.balanceOf(other2),                  '9');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0.012'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Claim funds', function () {
		it('perform', async function () {
			for ([ from, value ] of [[ user2, '2'], [other1, '1'], [ other2, '9']])
			{
				const { receipt } = await instance.claimBuyout(from, { from });
				expectEvent(receipt, 'Transfer', { from, to: constants.ZERO_ADDRESS, value });
			}
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '8');
			assert.equal(await instance.balanceOf(instance.address),        '8');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Claim ownership after buyout', function () {
		it('perform', async function () {
			await instance.claimOwnership(user1, { from: user1 });
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '8');
			assert.equal(await instance.balanceOf(instance.address),        '8');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});

	describe('Execute (get NFT)', function () {
		it('perform', async function () {
			await instance.execute(
				this.nft.address,
				0,
				this.nft.contract.methods.safeTransferFrom(instance.address, user1, 1).encodeABI(),
				{ from: user1 }
			);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            user1);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '8');
			assert.equal(await instance.balanceOf(instance.address),        '8');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '0');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '0');
			assert.equal(await instance.balanceOf(other2),                  '0');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         user1);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});
});
