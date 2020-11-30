./solidityFlattener.pl --contractsdir=contracts/L2 --remapdir "contracts/L2/@openzeppelin=./node_modules/@openzeppelin" --mainsol=ERC721L2Mapping.sol --verbose --outputsol=./flattenedContracts/L2/ERC721L2Mapping_flattened.sol

./solidityFlattener.pl --contractsdir=contracts --remapdir "contracts/@openzeppelin=./node_modules/@openzeppelin" --mainsol=ERC721L2Mapping.sol --verbose

./solidityFlattener.pl --contractsdir=contracts --remapdir "contracts/@openzeppelin=./node_modules/@openzeppelin" --mainsol=ShardFactory.sol --verbose

./solidityFlattener.pl --contractsdir=contracts/L2 --remapdir "contracts/L2/@openzeppelin=./node_modules/@openzeppelin" --mainsol=L2ShardRegistry.sol --verbose

./solidityFlattener.pl --contractsdir=rescueContracts --remapdir "rescueContracts/@openzeppelin=./node_modules/@openzeppelin" --mainsol=MaticDistributor.sol --verbose --outputsol=./flattenedContracts/rescueContracts/MaticDistributor_flattened.sol
