const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const proofsJson = require('../output/tally/merkle-proofs.json');
const { merkleRoot } = require('../output/tally/merkle-root.json');
const tokensPerAddress = require('../output/tokens-per-address-data.json');
const config = require('../config.json');
const { default: BigNumber } = require('bignumber.js');

// Main pipeline
const main = async () => {
  const verifyProofs = () => {
    console.log('Verifying proofs...');
    let total = new BigNumber(0);
    const proofObjects = Object.entries(proofsJson);
    for (let i = 0; i < proofObjects.length; i++) {
      const proofObject = proofObjects[i];
      const address = proofObject[0];
      const { amount, proof } = proofObject[1];
      const isValid = StandardMerkleTree.verify(
        merkleRoot,
        ['address', 'uint'],
        [address, amount],
        proof
      );
      const amountBN = new BigNumber(amount);

      total = total.plus(amountBN);
      if (!isValid) {
        throw new Error('Invalid proof found');
      }
    }
    console.log('total', total.toFixed());
  };

  const verifyTokenAmounts = () => {
    console.log('Verifying token amounts...');
    let total = 0;
    const count = tokensPerAddress.reduce((acc, cur) => {
      return acc + Object.values(cur)[0];
    }, 0);
    console.log('count', count);
  };

  const verifyRegularDistributions = (proofs, root) => {
    console.log('verifying regular distributions...');
  };

  verifyProofs();

  verifyTokenAmounts();
};

main();
