const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const NFTBatch            = artifacts.require('NFTBatch');
const TokenizedNFTFactory = artifacts.require('TokenizedNFTFactory');
const TokenizedNFT        = artifacts.require('TokenizedNFT');
const ERC721Mock          = artifacts.require('ERC721Mock');

contract('Workflow', function (accounts) {
	const [ admin, user1, user2, user3, other1, other2, other3 ] = accounts;

	let niftex;

	before(async function () {
		this.batcher = await NFTBatch.new();
		this.master  = await TokenizedNFT.new();
		this.factory = await TokenizedNFTFactory.new(this.master.address);
		this.nft     = await ERC721Mock.new('NFTMock', 'NFTMock');
	});

	describe('Prepare tokens', function () {
		it('perform', async function () {
			await this.nft.mint(user1, 1);
			await this.nft.approve(this.factory.address, 1, { from: user1 });
		});
	});

	describe('Shard', function () {
		it('perform', async function () {
			const tx = await this.factory.initialize(
				user1,                        // admin_
				'Tokenized NFT',              // name_
				'TNFT',                       // symbol_
				20,                           // cap_
				web3.utils.toWei('0.01'),     // crowdsalePricePerShare_
				3600,                         // crownsaleDuration_
				[ this.nft.address, 1],       // token_
				[[ user1, 8 ], [ user2, 2 ]], // allocations_
				{ from: user1 }
			);
			niftex = await TokenizedNFT.at(tx.receipt.logs.find(({ event }) => event == 'NewInstance').args.instance);

			console.log('tx.receipt.gasUsed:', tx.receipt.gasUsed);
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '10');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '0');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '0');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0'));
		});
	});

	describe('Buy shard', function () {
		it('perform', async function () {
			const { receipt } = await niftex.buy(other1, { from: other1, value: web3.utils.toWei('0.01')})
			expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: niftex.address, value: '1' });
			expectEvent(receipt, 'SharesBought', { account: other1, shares: '1' });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '11');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '1');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '0');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0.01'));
		});
	});

	describe('Buy rest', function () {
		it('perform', async function () {
			const { receipt } = await niftex.buy(other2, { from: other2, value: web3.utils.toWei('1')})
			expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: niftex.address, value: '9' });
			expectEvent(receipt, 'SharesBought', { account: other2, shares: '9' });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '20');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '10');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '0');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0.10'));
		});
	});

	describe('Withdraw', function () {
		it('perform', async function () {
			await niftex.withdraw(user1, { from: user1 });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '20');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '10');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '0');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0'));
		});
	});

	describe('Claim shares', function () {
		it('perform #1', async function () {
			const { receipt } = await niftex.claimShares(other1, { from: other1 });
			expectEvent(receipt, 'Transfer', { from: niftex.address, to: other1, value: '1' });
		});

		it('perform #2', async function () {
			const { receipt } = await niftex.claimShares(other2, { from: other2 });
			expectEvent(receipt, 'Transfer', { from: niftex.address, to: other2, value: '9' });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '20');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '0');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '1');
			assert.equal(await niftex.balanceOf(other2),            '9');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0'));
		});
	});

	describe('Start buyout', function () {
		it('perform', async function () {
			await niftex.startBuyout(web3.utils.toWei('0.01'), { from: other1, value: web3.utils.toWei('1') });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '20');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '0');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '1');
			assert.equal(await niftex.balanceOf(other2),            '9');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 niftex.address);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0.19'));
			// console.log(await niftex.status())
		});
	});

	describe('Wait', function () {
		it('perform', async function () {
			target = Number(await niftex.buyoutDeadline());
			await web3.currentProvider.send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [ target - (await web3.eth.getBlock("latest")).timestamp ], id: 0 }, () => {});
		});
	});

	describe('Finalize buyout', function () {
		it('perform', async function () {
			await niftex.finalizeBuyout(other1, { from: other1 });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '19');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '0');
			assert.equal(await niftex.balanceOf(user1),             '8');
			assert.equal(await niftex.balanceOf(user2),             '2');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '9');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 other1);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0.19'));
		});
	});

	describe('Claim funds', function () {
		it('perform', async function () {
			await niftex.claimFunds(user1,  { from: user1  });
			await niftex.claimFunds(user2,  { from: user2  });
			await niftex.claimFunds(other2, { from: other2 });
		});

		after(async function () {
			assert.equal(await niftex.name(),                       'Tokenized NFT');
			assert.equal(await niftex.symbol(),                     'TNFT');
			assert.equal(await niftex.decimals(),                   '0');
			assert.equal(await niftex.totalSupply(),                '0');
			assert.equal(await niftex.cap(),                        '20');
			assert.equal(await niftex.balanceOf(niftex.address),    '0');
			assert.equal(await niftex.balanceOf(user1),             '0');
			assert.equal(await niftex.balanceOf(user2),             '0');
			assert.equal(await niftex.balanceOf(user3),             '0');
			assert.equal(await niftex.balanceOf(other1),            '0');
			assert.equal(await niftex.balanceOf(other2),            '0');
			assert.equal(await niftex.balanceOf(other3),            '0');
			assert.equal(await this.nft.ownerOf(1),                 other1);
			assert.equal(await web3.eth.getBalance(niftex.address), web3.utils.toWei('0'));
		});
	});
});
