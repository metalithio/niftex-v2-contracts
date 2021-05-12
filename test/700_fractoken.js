const { ethers } = require("hardhat");
const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require("chai");

describe("FracToken", function () {
  before(async function () {
    this.FracToken = await ethers.getContractFactory("FracToken")
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
  })

  beforeEach(async function () {
    this.frac = await this.FracToken.deploy()
    await this.frac.deployed()
  })

  it("should have correct name and symbol and decimal", async function () {
    const name = await this.frac.name()
    const symbol = await this.frac.symbol()
    const decimals = await this.frac.decimals()
    assert.equal(name, 'FRAC - NIFTEX governance token')
    assert.equal(symbol, 'FRAC')
    assert.equal(decimals, "18")
  })

  it("should only allow owner to mint token", async function () {
    await this.frac.mint(this.alice.address, "100")
    await this.frac.mint(this.bob.address, "1000")
    await expectRevert(this.frac.connect(this.bob).mint(this.carol.address, "1000", { from: this.bob.address }),
      "Ownable: caller is not the owner"
    );

    const totalSupply = await this.frac.totalSupply()
    const aliceBal = await this.frac.balanceOf(this.alice.address)
    const bobBal = await this.frac.balanceOf(this.bob.address)
    const carolBal = await this.frac.balanceOf(this.carol.address)
    assert.equal(totalSupply, '1100');
    assert.equal(aliceBal, '100');
    assert.equal(bobBal, '1000');
    assert.equal(carolBal, '0');
  })

  it("should supply token transfers properly", async function () {
    await this.frac.mint(this.alice.address, "100")
    await this.frac.mint(this.bob.address, "1000")
    await this.frac.transfer(this.carol.address, "10")
    await this.frac.connect(this.bob).transfer(this.carol.address, "100", {
      from: this.bob.address,
    })
    const totalSupply = await this.frac.totalSupply()
    const aliceBal = await this.frac.balanceOf(this.alice.address)
    const bobBal = await this.frac.balanceOf(this.bob.address)
    const carolBal = await this.frac.balanceOf(this.carol.address)
    assert.equal(totalSupply, "1100")
    assert.equal(aliceBal, "90")
    assert.equal(bobBal, "900")
    assert.equal(carolBal, "110")
  })

  it("should fail if you try to do bad transfers", async function () {
    await this.frac.mint(this.alice.address, "100")
    await expectRevert(this.frac.transfer(this.carol.address, "110"), "ERC20: transfer amount exceeds balance")
    await expectRevert(this.frac.connect(this.bob).transfer(this.carol.address, "1", { from: this.bob.address }), "ERC20: transfer amount exceeds balance");
  })
})
