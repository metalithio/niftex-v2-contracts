const deploymentTime = Math.round(new Date().valueOf() / 1000);

module.exports = {
	investors: [{
		name: 'y0m4m4',
		beneficiary: '0xA31f5bD5Cc1e975A3791015237951F9D6073c42E',
		start: deploymentTime,
		cliffDuration: 60*60*24*365, // 1-year cliff
		duration: 60*60*24*365*2, // 2-year vesting schedule
		revocable: false,
	}]
}