/*
  Need to run this test first, to ensure block.number is correct
  It putting this back to 702, the starting block.number before this test
  will be wrong (not at 0), hence all numbers in the test are wrong.
*/

const { ethers } = require("hardhat");
const { expect } = require("chai");
const { expectRevert, constants } = require('@openzeppelin/test-helpers');
const BigNumber = require('bignumber.js');
const { advanceBlockTo } = require("../utils/test-timer");

contract("MasterChef", function (accounts) {
  before(async function () {
    this.signers = accounts;
    this.alice = { address: this.signers[0] };
    this.bob = { address: this.signers[1] };
    this.carol = { address: this.signers[2] };
    this.dao = { address: this.signers[3] };
    this.minter = { address: this.signers[4] };
    this.fracVault = { address: this.signers[5] };

    this.MasterChef = await artifacts.require("MasterChef");
    this.FracToken = await artifacts.require("ERC20Mock");
    this.ERC20Mock = await artifacts.require("ERC20Mock");
  })

  beforeEach(async function () {
    this.frac = await this.FracToken.new("FRAC - NIFTEX Governance token", "FRAC");
    await this.frac.mint(this.minter.address, web3.utils.toWei('30000'));
  })

  it("should set correct state variables", async function () {
    this.chef = await this.MasterChef.new(
      this.frac.address, 
      this.dao.address, 
      "1", 
      "100", 
      "10100",
      "20100",
      web3.utils.toWei('2'),
      this.fracVault.address
    );
    await this.frac.transfer(this.fracVault.address, web3.utils.toWei('30000'), { from: this.minter.address });
    await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });
    const frac = await this.chef.frac()
    const daoaddr = await this.chef.daoaddr()

    assert.equal(frac, this.frac.address);
    assert.equal(daoaddr, this.dao.address);
  })

  it("should allow dao and only dao to update dao", async function () {
    this.chef = await this.MasterChef.new(
      this.frac.address, 
      this.dao.address, 
      "1", 
      "100", 
      "10100",
      "20100",
      web3.utils.toWei('2'),
      this.fracVault.address
    );

    await this.frac.transfer(this.fracVault.address, web3.utils.toWei('30000'), { from: this.minter.address });
    await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

    assert.equal(await this.chef.daoaddr(), this.dao.address)

    await expectRevert.unspecified(this.chef.dao(this.bob.address, { from: this.bob.address }));

    await this.chef.dao(this.bob.address, { from: this.dao.address })

    assert.equal(await this.chef.daoaddr(), this.bob.address)

    await this.chef.dao(this.alice.address, { from: this.bob.address })

    assert.equal(await this.chef.daoaddr(), this.alice.address)
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.new("LPToken", "LP");

      await this.lp.mint(this.alice.address, "1000")

      await this.lp.mint(this.bob.address, "1000")

      await this.lp.mint(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.new("LPToken2", "LP2");

      await this.lp2.mint(this.alice.address, "1000")

      await this.lp2.mint(this.bob.address, "1000")

      await this.lp2.mint(this.carol.address, "1000")
    })

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "1", 
        "100", 
        "10100",
        "20100",
        web3.utils.toWei('2'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '30000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.chef.add("100", this.lp.address, true)

      await this.lp.approve(this.chef.address, "1000", { from: this.bob.address });

      await this.chef.deposit(0, "100", { from: this.bob.address })

      assert.equal(await this.lp.balanceOf(this.bob.address), "900");

      await this.chef.emergencyWithdraw(0, { from: this.bob.address });

      assert.equal(await this.lp.balanceOf(this.bob.address), "1000");
    })

    it("should give out FRACs only after farming time", async function () {
      // 1 per block farming rate starting at block 100 with bonus until block 10100
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "1", 
        "100", 
        "10100",
        "20100",
        web3.utils.toWei('2'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '30000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.chef.add("100", this.lp.address, true)

      await this.lp.approve(this.chef.address, "1000", { from: this.bob.address });
      await this.chef.deposit(0, "100", { from: this.bob.address });
      await advanceBlockTo("89")

      await this.chef.deposit(0, "0", { from: this.bob.address }) // block 90
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("94")

      await this.chef.deposit(0, "0", { from: this.bob.address }) // block 95
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("99")

      await this.chef.deposit(0, "0", { from: this.bob.address }) // block 100
      assert.equal(await this.frac.balanceOf(this.bob.address), "0");
      await advanceBlockTo("100")

      await this.chef.deposit(0, "0", { from: this.bob.address })// block 101
      assert.equal(await this.frac.balanceOf(this.bob.address), "2");

      await advanceBlockTo("104")
      await this.chef.deposit(0, "0", { from: this.bob.address }) // block 105

      assert.equal(await this.frac.balanceOf(this.bob.address), "10");
      assert.equal(await this.frac.balanceOf(this.dao.address), "0");
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29990");
    })

    it("should not distribute FRACs if no one deposit", async function () {
      // 1 per block farming rate starting at block 100 with bonus until block 10100
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "1", 
        "200", 
        "10200",
        "20200",
        web3.utils.toWei('2'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '30000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.chef.add("100", this.lp.address, true)
      await this.lp.approve(this.chef.address, "1000", { from: this.bob.address });
      await advanceBlockTo("150")
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "30000");
      await advanceBlockTo("199")
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "30000");
      await advanceBlockTo("209")
      await this.chef.deposit(0, "10", {from: this.bob.address }) // block 210
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "30000");
      assert.equal(await this.frac.balanceOf(this.bob.address), "0")
      assert.equal(await this.frac.balanceOf(this.dao.address), "0")
      assert.equal(await this.lp.balanceOf(this.bob.address), "990");

      await advanceBlockTo('219');
      await this.chef.withdraw(0, "10", { from: this.bob.address }) // block 220
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29980");
      assert.equal(await this.frac.balanceOf(this.bob.address), "20")
      assert.equal(await this.frac.balanceOf(this.dao.address), "0")
      assert.equal(await this.lp.balanceOf(this.bob.address), "1000")
    })

    it("should distribute FRACs properly for each staker", async function () {
      // 1 per block farming rate starting at block 300 with bonus until block 10300
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "1", 
        "300", 
        "10300",
        "20300",
        web3.utils.toWei('2'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '30000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.chef.add("100", this.lp.address, true)
      await this.lp.approve(this.chef.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.approve(this.chef.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.approve(this.chef.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo("309")
      await this.chef.deposit(0, "10", { from: this.alice.address })
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo("313")
      await this.chef.deposit(0, "20", { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo("317")
      await this.chef.deposit(0, "30", { from: this.carol.address })
      await advanceBlockTo("319")
      // console.log('pending Frac for alice: ', new BigNumber(await this.chef.pendingFrac(0, this.alice.address)).toFixed());
      await this.chef.deposit(0, "10", { from: this.alice.address }) // block 320
      // accFracPerShare for pool 0 @320: [2 * 4 * 1e12 / 10] + [2* 4 * 1e12 / 30] + [2 * 2 * 1e12 / 60]
      // = 800000000000 + 266666666666 + 66666666666 = 1133333333332
      assert.equal((await this.chef.poolInfo(0)).accFracPerShare, '1133333333332');
      assert.equal(await this.frac.balanceOf(this.alice.address), '11'); // = 1133333333332 * 10 / 1e12 = 11
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29989"); // 30k - 11 = 29989
      // Bob withdraws 5 LPs at block 330. At this point:
      await advanceBlockTo("329")
      await this.chef.withdraw(0, "5", { from: this.bob.address });
      // accFracPerShare for pool 0 @330: [2 * 4 * 1e12 / 10] + [2* 4 * 1e12 / 30] + [2 * 2 * 1e12 / 60] + [2 * 10 * 1e12 / 70]
      // = 800000000000 + 266666666666 + 66666666666 + 285714285714 = 1419047619046
      assert.equal((await this.chef.poolInfo(0)).accFracPerShare, '1419047619046');
      assert.equal(await this.frac.balanceOf(this.bob.address), '12'); // 1419047619046 * 20 / 1e12 - 800000000000 * 20 / 1e12 = 28 - 16 = 12
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29977"); // 29989 - 12
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo("339")
      await this.chef.withdraw(0, "20", { from: this.alice.address });
      // accFracPerShare for pool 0 @340: [2 * 4 * 1e12 / 10] + [2* 4 * 1e12 / 30] + [2 * 2 * 1e12 / 60] + [2 * 10 * 1e12 / 70] + [2 * 10 * 1e12 / 65]
      // = 800000000000 + 266666666666 + 66666666666 + 285714285714 + 307692307692 = 1726739926738
      assert.equal((await this.chef.poolInfo(0)).accFracPerShare, '1726739926738');
      // console.log('bal of alice: ', new BigNumber(await this.frac.balanceOf(this.alice.address)).toFixed());
      assert.equal(await this.frac.balanceOf(this.alice.address), '23'); // manual calc, 11.3 @320 + 11.8 @340 = 23
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29965");


      await advanceBlockTo("349")
      await this.chef.withdraw(0, "15", { from: this.bob.address })
      assert.equal(await this.frac.balanceOf(this.bob.address), '23'); // manual calc
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29954");


      await advanceBlockTo("359")
      await this.chef.withdraw(0, "30", { from: this.carol.address });
      // console.log('bal of carol: ', new BigNumber(await this.frac.balanceOf(this.carol.address)).toFixed());
      assert.equal(await this.frac.balanceOf(this.carol.address), '54'); // manual calc
      assert.equal(await this.frac.balanceOf(this.fracVault.address), "29900");

      // All of them should have 1000 LPs back.
      assert.equal(await this.lp.balanceOf(this.alice.address), "1000")
      assert.equal(await this.lp.balanceOf(this.bob.address), "1000")
      assert.equal(await this.lp.balanceOf(this.carol.address), "1000")
    })

    it("should give proper FRACs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus until block 1000
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "100", 
        "400", 
        "1000",
        "2000",
        web3.utils.toWei('10'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '300000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.lp.approve(this.chef.address, "1000", { from: this.alice.address })
      await this.lp2.approve(this.chef.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo("409")
      await this.chef.deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo("419")
      await this.chef.add("20", this.lp2.address, true)
      // Alice should have 10*1000 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "10000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo("424")
      await this.chef.deposit(1, "5", { from: this.bob.address })
      // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "11666")
      await advanceBlockTo("430")
      // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "13333")
      assert.equal(await this.chef.pendingFrac(1, this.bob.address), "3333")
    })

    it("should stop giving bonus FRACs after the bonus period ends", async function () {
      // 100 per block farming rate starting at block 500 with bonus until block 600
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "100", 
        "500", 
        "600",
        "2000",
        web3.utils.toWei('10'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '300000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.lp.approve(this.chef.address, "1000", { from: this.alice.address })
      await this.chef.add("1", this.lp.address, true)
      // Alice deposits 10 LPs at block 590
      await advanceBlockTo("589")
      await this.chef.deposit(0, "10", { from: this.alice.address })
      // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
      await advanceBlockTo("605")
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "10500")
      // At block 606, Alice withdraws all pending rewards and should get 10600.
      await this.chef.deposit(0, "0", { from: this.alice.address })
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "0")
      assert.equal(await this.frac.balanceOf(this.alice.address), "10600")
    })

    it("should give proper FRACs allocation to each pool - after DAO prematurely ends liquidity mining program", async function () {
      // 100 per block farming rate starting at block 700 with bonus until block 1300
      this.chef = await this.MasterChef.new(
        this.frac.address, 
        this.dao.address, 
        "100", 
        "700", 
        "1300",
        "2000",
        web3.utils.toWei('10'),
        this.fracVault.address
      );

      await this.frac.transfer(this.fracVault.address, '300000', { from: this.minter.address });
      await this.frac.approve(this.chef.address, constants.MAX_UINT256, { from: this.fracVault.address });

      await this.lp.approve(this.chef.address, "1000", { from: this.alice.address })
      await this.lp2.approve(this.chef.address, "1000", { from: this.bob.address })
      // Add first LP to the pool with allocation 1
      await this.chef.add("10", this.lp.address, true)
      // Alice deposits 10 LPs at block 710
      await advanceBlockTo("709")
      await this.chef.deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 720
      await advanceBlockTo("719")
      await this.chef.add("20", this.lp2.address, true)
      // Alice should have 10*1000 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "10000")
      // Bob deposits 10 LP2s at block 725
      await advanceBlockTo("724")
      await this.chef.deposit(1, "5", { from: this.bob.address })
      // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "11666")
      await advanceBlockTo("729");
      await this.chef.disableMining({ from: this.dao.address });
      await advanceBlockTo('2100');
      // At block 730. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
      assert.equal(await this.chef.pendingFrac(0, this.alice.address), "13333")
      assert.equal(await this.chef.pendingFrac(1, this.bob.address), "3333")
      await advanceBlockTo('3000');
      await this.chef.withdraw(0, '10', { from: this.alice.address });
      await this.chef.withdraw(1, '5', { from: this.bob.address });
      assert.equal(await this.frac.balanceOf(this.alice.address), "13333");
      assert.equal(await this.frac.balanceOf(this.bob.address), "3333");
    })
  })
})
