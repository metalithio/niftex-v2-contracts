const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const CrowdsaleManager     = artifacts.require('CrowdsaleManager');
const ShardedWalletFactory = artifacts.require('ShardedWalletFactory');
const ShardedWallet        = artifacts.require('ShardedWallet');
const ERC721Mock           = artifacts.require('ERC721Mock');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

	let instance;

	before(async function () {
		this.crowdsale = await CrowdsaleManager.new();
		this.nft       = await ERC721Mock.new('NFTMock', 'NFTMock');
		this.factory   = await ShardedWalletFactory.new();

		const { gasUsed } = await web3.eth.getTransactionReceipt(this.factory.transactionHash);
		console.log('factory deployment:', gasUsed);
	});

	describe('Initialize', function () {
		it('perform', async function () {

			const { receipt } = await this.factory.mintWallet(
				user1,                        // owner_
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
				this.crowdsale.address,       // crowdsale manager
				20,                           // totalSupply_
				[[ user1, 8 ], [ user2, 2 ]], // mints_
				this.crowdsale.contract.methods.setup(user1, web3.utils.toWei('0.01'), 3600).encodeABI(),
				{ from: user1 }
			);
			console.log('tx.receipt.gasUsed:', receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '10');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
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
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '10');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
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
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '10');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
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
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '10');
			assert.equal(await instance.balanceOf(user1),                   '8');
			assert.equal(await instance.balanceOf(user2),                   '2');
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
		it('perform #1', async function () {
			const { receipt } = await this.crowdsale.redeem(instance.address, other1, { from: other1 });
			expectEvent(receipt, 'SharesRedeemedSuccess', { token: instance.address, from: other1, to: other1, count: '1' });
			// expectEvent(receipt, 'Transfer', { from: instance.address, to: other1, value: '1' });
		});

		it('perform #2', async function () {
			const { receipt } = await this.crowdsale.redeem(instance.address, other2, { from: other2 });
			expectEvent(receipt, 'SharesRedeemedSuccess', { token: instance.address, from: other2, to: other2, count: '9' });
			// expectEvent(receipt, 'Transfer', { from: instance.address, to: other2, value: '9' });
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

	describe('Close buyout', function () {
		it('perform', async function () {
			const { receipt } = await instance.closeBuyout({ from: user2, value: web3.utils.toWei('0.008') });
			expectEvent(receipt, 'Transfer', { from: instance.address, to: user2, value: '8' });
		});

		after(async function () {
			assert.equal(await instance.owner(),                            this.crowdsale.address);
			assert.equal(await instance.name(),                             'Tokenized NFT');
			assert.equal(await instance.symbol(),                           'TNFT');
			assert.equal(await instance.decimals(),                         '18');
			assert.equal(await instance.totalSupply(),                      '20');
			assert.equal(await instance.balanceOf(instance.address),        '0');
			assert.equal(await instance.balanceOf(user1),                   '0');
			assert.equal(await instance.balanceOf(user2),                   '10');
			assert.equal(await instance.balanceOf(user3),                   '0');
			assert.equal(await instance.balanceOf(other1),                  '1');
			assert.equal(await instance.balanceOf(other2),                  '9');
			assert.equal(await instance.balanceOf(other3),                  '0');
			assert.equal(await this.nft.ownerOf(1),                         instance.address);
			assert.equal(await web3.eth.getBalance(instance.address),       web3.utils.toWei('0'));
			assert.equal(await web3.eth.getBalance(this.crowdsale.address), web3.utils.toWei('0'));
		});
	});
});
