const axios = require('axios');
const addressList = require('../data/address-list.json');
require('dotenv').config();
const { CHAINALYSIS_API_KEY } = process.env;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isMultipleOf100(number) {
  return number % 100 === 0;
}

// Main pipeline
const main = async () => {
  console.log('Scanning address list for sanctions...');
  for (let i = 0; i < addressList.length; i++) {
    if (isMultipleOf100(i)) {
      console.log('Scanned', i, 'addresses so far...');
    }
    const address = addressList[i];
    const url = `https://public.chainalysis.com/api/v1/address/${address}`;
    try {
      const response = await axios.get(url, {
        headers: {
          'X-API-Key': CHAINALYSIS_API_KEY,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      console.error('error', error);
    }
    // Pause for 75 ms to avoid rate limiting
    await sleep(75);
  }
  console.log('Done scanning address list for sanctions.');
};

main();
