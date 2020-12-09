const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const NFTBatch   = artifacts.require('NFTBatch');
const ERC721Mock = artifacts.require('ERC721Mock');

contract('Batcher', function (accounts) {
	const [ user, other ] = accounts;

	beforeEach(async function () {
		this.batcher = await NFTBatch.new();
		this.nft     = await ERC721Mock.new('NFTMock', 'NFTMock');
	});

	describe('standard nfts', function () {
		beforeEach(async function () {
			await this.nft.mint(user, 101, { from: user });
			await this.nft.mint(user, 102, { from: user });
			await this.nft.mint(user, 103, { from: user });
			await this.nft.approve(this.batcher.address, 101, { from: user });
			await this.nft.approve(this.batcher.address, 102, { from: user });
			await this.nft.approve(this.batcher.address, 103, { from: user });
		});

		describe('wrap', function () {
			beforeEach(async function () {
				assert.equal(await this.nft.ownerOf(101), user);
				assert.equal(await this.nft.ownerOf(102), user);
				assert.equal(await this.nft.ownerOf(103), user);
			});

			it('perform', async function () {
				const { receipt } = await this.batcher.wrap([[ this.nft.address, 101], [ this.nft.address, 102]], { from: user });
				expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: user, tokenId: '1' });
				expectEvent(receipt, 'Transfer', { from: user, to: this.batcher.address, tokenId: '101' });
				expectEvent(receipt, 'Transfer', { from: user, to: this.batcher.address, tokenId: '102' });
			});

			afterEach(async function () {
				assert.equal(await this.nft.ownerOf(101), this.batcher.address);
				assert.equal(await this.nft.ownerOf(102), this.batcher.address);
				assert.equal(await this.nft.ownerOf(103), user);
				assert.equal(await this.batcher.ownerOf(1), user);
			});
		});

		describe('unwrap', function () {
			beforeEach(async function () {
				await this.batcher.wrap([[ this.nft.address, 101], [ this.nft.address, 102]], { from: user });
				assert.equal(await this.nft.ownerOf(101), this.batcher.address);
				assert.equal(await this.nft.ownerOf(102), this.batcher.address);
				assert.equal(await this.nft.ownerOf(103), user);
				assert.equal(await this.batcher.ownerOf(1), user);
			});

			it('perform', async function () {
				const { receipt } = await this.batcher.unwrap(1, other, { from: user });
				expectEvent(receipt, 'Transfer', { from: user, to: constants.ZERO_ADDRESS, tokenId: '1' });
				expectEvent(receipt, 'Transfer', { from: this.batcher.address, to: other, tokenId: '101' });
				expectEvent(receipt, 'Transfer', { from: this.batcher.address, to: other, tokenId: '102' });
			});

			afterEach(async function () {
				assert.equal(await this.nft.ownerOf(101), other);
				assert.equal(await this.nft.ownerOf(102), other);
				assert.equal(await this.nft.ownerOf(103), user);
			});
		});
	});
});
