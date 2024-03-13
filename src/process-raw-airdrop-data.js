const fs = require('fs');
const csv = require('csv-parser');
const BigNumber = require('bignumber.js');
const web3 = require('web3');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const config = require('../config.json');

// Utils
const createRegularDistributionAttrsObj = attrs =>
  Object.assign(
    {},
    ...attrs.map(v => {
      const isArray = Array.isArray(v);
      return {
        [`regular-distribution-${isArray ? v[0] : v}`]: isArray
          ? parseFloat(v[1])
          : 0
      };
    })
  );

const createDistributionAttrsObj = category =>
  Object.assign(
    {},
    ...config[`${category}AirdropGroups`].map(v => ({
      [v]: 0
    }))
  );

const getChecksumAddress = address => {
  let checksumAddress = address;
  try {
    checksumAddress = web3.utils.toChecksumAddress(address);
  } catch (e) {
    if (Object.keys(config.regularDistributionAllocations).includes(address)) {
      checksumAddress = address;
    } else {
      console.log('Error computing checksum address', e);
    }
  }
  return checksumAddress;
};

// Main pipeline
const main = async () => {
  const results = [];
  const processRawAirdropData = () => {
    console.log('processing raw airdrop data (reflexer + testnet)...');
    const airdropHeaders = [
      'address',
      ...config.reflexerAirdropGroups,
      ...config.testnetAirdropGroups,
      ...config.opEcosystemAirdropGroups,
      'total'
    ];
    return new Promise((resolve, reject) => {
      fs.createReadStream(`./data/${config.processRawAirdropDataInput}`)
        .pipe(csv({ headers: airdropHeaders, skipLines: 1 }))
        .on('data', data => {
          const address = data.address;
          const obj = {
            [address]: {
              reflexer: {},
              testnet: {},
              'op-ecosystem': {},
              'regular-distribution': createRegularDistributionAttrsObj(
                config.regularDistributionGroups
              )
            }
          };
          const entries = Object.entries(data);
          for (let i = 1; i < entries.length; i++) {
            const [key, value] = entries[i];
            if (key === 'total') {
              obj[address][key] = parseFloat(value);
            } else {
              const parts = key.split('-');
              const category = parts[0] === 'op' ? 'op-ecosystem' : parts[0];
              obj[address][category][key] = parseFloat(value);
            }
          }
          results.push(obj);
        })
        .on('error', () => reject())
        .on('end', () => {
          fs.writeFileSync(
            `./output/${config.processRawAirdropDataOutput}`,
            JSON.stringify(results, null, 2)
          );
          resolve();
        });
    });
  };

  const processRegularDistributionData = () => {
    console.log('processing regular distribution data...');
    let results = require(`../output/${config.processRawAirdropDataOutput}`);
    return new Promise((resolve, reject) => {
      fs.createReadStream(
        `./data/${config.processRegularDistributionDataInput}`
      )
        .pipe(csv())
        .on('data', data => {
          const address = data.address;
          const existedAddresses = results.map(item =>
            Object.keys(item)[0].toUpperCase()
          );
          const existingAddressIndex = existedAddresses.indexOf(
            address.toUpperCase()
          );
          const entries = Object.entries(data);
          const newAttrs = entries.slice(2, entries.length);
          const newAttrsTotal = newAttrs.reduce((acc, cur) => {
            return acc + parseFloat(cur[1]);
          }, 0);
          if (existingAddressIndex > -1) {
            const existingItem = results[existingAddressIndex];
            const existingTotal = Object.values(existingItem)[0].total;
            const updatedItem = {
              [Object.keys(existingItem)[0]]: {
                ...Object.values(existingItem)[0],
                'regular-distribution':
                  createRegularDistributionAttrsObj(newAttrs),
                total: existingTotal + newAttrsTotal
              }
            };
            results = [
              ...results.slice(0, existingAddressIndex),
              updatedItem,
              ...results.slice(existingAddressIndex + 1, results.length)
            ];
          } else {
            const newItem = {
              [address]: {
                reflexer: createDistributionAttrsObj('reflexer'),
                testnet: createDistributionAttrsObj('testnet'),
                'op-ecosystem': createDistributionAttrsObj('opEcosystem'),
                'regular-distribution':
                  createRegularDistributionAttrsObj(newAttrs),
                total: newAttrsTotal
              }
            };
            results.push(newItem);
          }
        })
        .on('end', () => {
          fs.writeFileSync(
            `./output/${config.processRegularDistributionDataOutput}`,
            JSON.stringify(results, null, 2)
          );
          resolve();
        });
    });
  };

  const removeScreenedAddresses = () => {
    console.log('removing screened addresses...');
    const preScreenedData = require(`../output/${config.removeScreenedAddressesInput}`);
    const addressesToRemove = require(`../data/addresses-to-remove.json`);
    const screenedAddresses = preScreenedData.filter(item => {
      const address = Object.keys(item)[0];
      if (addressesToRemove.includes(address)) {
        return false;
      } else {
        return true;
      }
    });
    fs.writeFileSync(
      `./output/${config.removeScreenedAddressesOutput}`,
      JSON.stringify(screenedAddresses, null, 2)
    );
  };

  const generateTallyEligibilityCriteria = () => {
    console.log('generating tally eligibility criteria...');
    const rawElgibilityData = require(`../output/${config.removeScreenedAddressesOutput}`);
    const tallyElgibilityData = rawElgibilityData.map(rawItem => {
      const entry = Object.entries(rawItem)[0];
      const address = entry[0];
      const categoryGroupObjects = entry[1];
      const checksumAddress = getChecksumAddress(address);
      const elgibilityObj = { [checksumAddress]: {} };
      const categoryGroups = Object.entries(categoryGroupObjects);
      for (let i = 0; i < categoryGroups.length; i++) {
        const categoryGroup = categoryGroups[i];
        const category = categoryGroup[0];
        const categoryEntries = Object.entries(categoryGroup[1]);
        for (let j = 0; j < categoryEntries.length; j++) {
          const categoryItem = categoryEntries[j];
          const categoryItemName = categoryItem[0];
          const categoryItemValue = categoryItem[1];
          const isEligible = categoryItemValue > 0;
          if (elgibilityObj[checksumAddress][category]) {
            elgibilityObj[checksumAddress][category][categoryItemName] =
              isEligible;
          } else {
            elgibilityObj[checksumAddress][category] = {
              [categoryItemName]: isEligible
            };
          }
        }
      }
      return elgibilityObj;
    });
    fs.writeFileSync(
      './output/tally/tally-eligibility-data.json',
      JSON.stringify(tallyElgibilityData, null, 2)
    );
  };

  const generateTallySlugMap = () => {
    console.log('generating tally slug map...');
    const tallySlugMap = config.tallySlugToName;
    fs.writeFileSync(
      './output/tally/tally-slug-map.json',
      JSON.stringify(tallySlugMap, null, 2)
    );
  };

  const calculateTokensPerAddress = () => {
    console.log('calculating tokens per address...');
    const airdropUsers = require(`../output/${config.calculateTokensPerAddressInput}`);
    const airdropUserTokenAmounts = airdropUsers.map(airdropUser => {
      const [address, criteria] = Object.entries(airdropUser)[0];
      const checksumAddress = getChecksumAddress(address);
      return { [checksumAddress]: criteria.total };
    });
    fs.writeFileSync(
      `./output/${config.calculateTokensPerAddressOutput}`,
      JSON.stringify(airdropUserTokenAmounts, null, 2)
    );
  };

  const formatMerkleTreeRawData = () => {
    console.log('formatting raw merkle tree data...');
    const rawDataInput = require(`../output/${config.formatMerkleTreeRawDataInput}`);
    const updatedItems = rawDataInput.map(item => {
      const [address, value] = Object.entries(item)[0];
      const tokenCount = BigNumber(value).times(Math.pow(10, 18)).toFixed();
      return [address, tokenCount];
    });
    fs.writeFileSync(
      `./output/${config.formatMerkleTreeRawDataOutput}`,
      JSON.stringify(updatedItems, null, 2)
    );
  };

  const generateMerkleTree = () => {
    console.log('generating merkle tree and root...');
    const rawMerkleTreeData = require(`../output/${config.generateMerkleTreeInput}`);
    const tree = StandardMerkleTree.of(rawMerkleTreeData, [
      'address',
      'uint256'
    ]);
    fs.writeFileSync(
      `./output/tally/${config.merkleRootOutput}`,
      JSON.stringify({ merkleRoot: tree.root }, null, 2)
    );
    fs.writeFileSync(
      `./output/tally/${config.generateMerkleTreeOutput}`,
      JSON.stringify(tree.dump(), null, 2)
    );
  };

  const generateMerkleProofs = () => {
    console.log('generating merkle proofs...');
    const treeJson = require(`../output/tally/${config.generateMerkleProofsInput}`);
    const tree = StandardMerkleTree.load(treeJson);
    const proofOutput = {};
    for (const [i, v] of tree.entries()) {
      const proof = tree.getProof(i);
      const [address, amount] = v;
      proofOutput[address] = {
        amount,
        proof
      };
    }
    fs.writeFileSync(
      `./output/tally/${config.generateMerkleProofsOutput}`,
      JSON.stringify(proofOutput)
    );
  };

  // Process raw airdrop data csv (includes Reflexer, Testnet, and OP Ecosystem data)
  await processRawAirdropData();

  // Process regular distribution data
  await processRegularDistributionData();

  // Remove screened addresses
  await removeScreenedAddresses();

  // Generate tally eligibility criteria
  await generateTallyEligibilityCriteria();

  // Generate tally slug map
  await generateTallySlugMap();

  // Calculate tokens per address
  await calculateTokensPerAddress();

  // Format data for merkle tree generation
  await formatMerkleTreeRawData();

  // Generate merkle tree
  await generateMerkleTree();

  // Generate merkle proofs
  await generateMerkleProofs();

  console.log('All done processing airdrop data!');
};

main();
