// ping-script.js
import fs from 'fs';

// This function performs the HEAD request
async function ping(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok) {
      console.warn(`[WARN] Ping failed for ${url} - Status: ${response.status}`);
    } else {
      // Optional: log success for verbosity
      // console.log(`[INFO] Ping success for ${url} - Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`[ERROR] Ping failed for ${url} - ${error.message}`);
  }
}

// This function processes the links in manageable batches
async function processInBatches(links, batchSize) {
  console.log(`Starting to ping ${links.length} links in batches of ${batchSize}...`);
  for (let i = 0; i < links.length; i += batchSize) {
    const chunk = links.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);
    const promises = chunk.map(linkObj => ping(linkObj.download_link));
    await Promise.all(promises);
  }
  console.log('All batches processed.');
}

// Main function to run the script
function main() {
  const filePath = 'links.json';
  if (!fs.existsSync(filePath)) {
    console.error('Error: links.json file not found!');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const links = JSON.parse(fileContent);

  if (!links || links.length === 0) {
    console.log('No links found in the database. Exiting.');
    return;
  }

  processInBatches(links, 500); // Process in batches of 50
}

main();
