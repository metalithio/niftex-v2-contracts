const { ethers } = require("hardhat");
const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');
const { advanceBlockTo } = require("../utils/test-timer");

describe("MasterChef", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.minter = this.signers[4]

    this.MasterChef = await ethers.getContractFactory("MasterChef")
    this.FracToken = await ethers.getContractFactory("FracToken")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
  })

  beforeEach(async function () {
    this.frac = await this.FracToken.deploy()
    await this.frac.deployed()
  })

  it("should set correct state variables", async function () {
    this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "1000", "0", "1000")
    await this.chef.deployed()

    await this.frac.transferOwnership(this.chef.address)

    const frac = await this.chef.frac()
    const devaddr = await this.chef.devaddr()
    const owner = await this.frac.owner()

    assert.equal(frac, this.frac.address)
    assert.equal(devaddr, this.dev.address)
    assert.equal(owner, this.chef.address)
  })

  it("should allow dev and only dev to update dev", async function () {
    this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "1000", "0", "1000")
    await this.chef.deployed()

    assert.equal(await this.chef.devaddr(), this.dev.address)

    await expectRevert(this.chef.connect(this.bob).dev(this.bob.address, { from: this.bob.address }),"dev: wut?");

    await this.chef.connect(this.dev).dev(this.bob.address, { from: this.dev.address })

    assert.equal(await this.chef.devaddr(), this.bob.address)

    await this.chef.connect(this.bob).dev(this.alice.address, { from: this.bob.address })

    assert.equal(await this.chef.devaddr(), this.alice.address)
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")

      await this.lp.transfer(this.alice.address, "1000")

      await this.lp.transfer(this.bob.address, "1000")

      await this.lp.transfer(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000")

      await this.lp2.transfer(this.alice.address, "1000")

      await this.lp2.transfer(this.bob.address, "1000")

      await this.lp2.transfer(this.carol.address, "1000")
    })

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "100", "1000")
      await this.chef.deployed()

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")

      await this.chef.connect(this.bob).deposit(0, "100")

      assert.equal(await this.lp.balanceOf(this.bob.address), "900");

      await this.chef.connect(this.bob).emergencyWithdraw(0)

      assert.equal(await this.lp.balanceOf(this.bob.address), "1000");
    })

    it("should give out FRACs only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "100", "1000")
      await this.chef.deployed()

      await this.frac.transferOwnership(this.chef.address)

      await this.chef.add("100", this.lp.address, true)

      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await this.chef.connect(this.bob).deposit(0, "100")
      await advanceBlockTo("89")

      await this.chef.connect(this.bob).deposit(0, "0") // block 90
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("94")

      await this.chef.connect(this.bob).deposit(0, "0") // block 95
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("99")

      await this.chef.connect(this.bob).deposit(0, "0") // block 100
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("100")

      await this.chef.connect(this.bob).deposit(0, "0") // block 101
      assert.equal(await this.frac.balanceOf(this.bob.address), "1000");

      await advanceBlockTo("104")
      await this.chef.connect(this.bob).deposit(0, "0") // block 105

      assert.equal(await this.frac.balanceOf(this.bob.address), "5000");
      assert.equal(await this.frac.balanceOf(this.dev.address), "500");
      assert.equal(await this.frac.totalSupply(), "5500");
    })

    it("should not distribute FRACs if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "200", "1000")
      await this.chef.deployed()
      await this.frac.transferOwnership(this.chef.address)
      await this.chef.add("100", this.lp.address, true)
      await this.lp.connect(this.bob).approve(this.chef.address, "1000")
      await advanceBlockTo("199")
      assert.equal(await this.frac.totalSupply(), "0");
      await advanceBlockTo("204")
      assert.equal(await this.frac.totalSupply(), "0");
      await advanceBlockTo("209")
      await this.chef.connect(this.bob).deposit(0, "10") // block 210
      assert.equal(await this.frac.totalSupply(), "0")
      assert.equal(await this.frac.balanceOf(this.bob.address), "0")
      assert.equal(await this.frac.balanceOf(this.dev.address), "0")
      assert.equal(await this.lp.balanceOf(this.bob.address), "990")
      await advanceBlockTo("219")
      await this.chef.connect(this.bob).withdraw(0, "10") // block 220
      assert.equal(await this.frac.totalSupply(), "11000")
      assert.equal(await this.frac.balanceOf(this.bob.address), "10000")
      assert.equal(await this.frac.balanceOf(this.dev.address), "1000")
      assert.equal(await this.lp.balanceOf(this.bob.address), "1000")
    })

    it("should distribute FRACs properly for each staker", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "300", "1000")
      await this.chef.deployed()
      await this.frac.transferOwnership(this.chef.address)
      await this.chef.add("100", this.lp.address, true)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo("309")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo("313")
      await this.chef.connect(this.bob).deposit(0, "20", { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address })
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
      //   MasterChef should have the remaining: 10000 - 5666 = 4334
      await advanceBlockTo("319")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      assert.equal(await this.frac.totalSupply(), "11000")
      assert.equal(await this.frac.balanceOf(this.alice.address), "5666")
      assert.equal(await this.frac.balanceOf(this.bob.address), "0")
      assert.equal(await this.frac.balanceOf(this.carol.address), "0")
      assert.equal(await this.frac.balanceOf(this.chef.address), "4334")
      assert.equal(await this.frac.balanceOf(this.dev.address), "1000")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
      await advanceBlockTo("329")
      await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address })
      assert.equal(await this.frac.totalSupply(), "22000")
      assert.equal(await this.frac.balanceOf(this.alice.address), "5666")
      assert.equal(await this.frac.balanceOf(this.bob.address), "6190")
      assert.equal(await this.frac.balanceOf(this.carol.address), "0")
      assert.equal(await this.frac.balanceOf(this.chef.address), "8144")
      assert.equal(await this.frac.balanceOf(this.dev.address), "2000")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("339")
      await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address })
      await advanceBlockTo("349")
      await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address })
      await advanceBlockTo("359")
      await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address })
      assert.equal(await this.frac.totalSupply(), "55000")
      assert.equal(await this.frac.balanceOf(this.dev.address), "5000")
      // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
      assert.equal(await this.frac.balanceOf(this.alice.address), "11600")
      // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
      assert.equal(await this.frac.balanceOf(this.bob.address), "11831")
      // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
      assert.equal(await this.frac.balanceOf(this.carol.address), "26568")
      // All of them should have 1000 LPs back.
      assert.equal(await this.lp.balanceOf(this.alice.address), "1000")
      assert.equal(await this.lp.balanceOf(this.bob.address), "1000")
      assert.equal(await this.lp.balanceOf(this.carol.address), "1000")
    })

    it("should give proper FRACs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus until block 1000
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "400", "1000")
      await this.frac.transferOwnership(this.chef.address)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address })
      await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("409")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("419")
      await this.chef.add("20", this.lp2.address, true)
      // Alice should have 10*1000 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "10000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("424")
      await this.chef.connect(this.bob).deposit(1, "5", { from: this.bob.address })
      // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "11666")
      await advanceBlockTo("430")
      // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "13333")
      assert.equal(await this.chef.pendingFrac(1, this.bob.address), "3333")
    })

    it("should stop giving bonus FRACs after the bonus period ends", async function () {
      // 100 per block farming rate starting at block 500 with bonus until block 600
      this.chef = await this.MasterChef.deploy(this.frac.address, this.dev.address, "100", "500", "600")
      await this.frac.transferOwnership(this.chef.address)
      await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address })
      await this.chef.add("1", this.lp.address, true)
      // Alice deposits 10 LPs at block 590
      await advanceBlockTo("589")
      await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
      await advanceBlockTo("605")
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "10500")
      // At block 606, Alice withdraws all pending rewards and should get 10600.
      await this.chef.connect(this.alice).deposit(0, "0", { from: this.alice.address })
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "0")
      assert.equal(await this.frac.balanceOf(this.alice.address), "10600")
    })
  })
})