// ping-script.js
import fs from 'fs';

// Helper function to introduce a pause
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// This function performs the HEAD request
async function ping(url) {
  try {
    // Note: The script will wait for this request to complete before proceeding
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    
    if (!response.ok) {
      // We will now see the actual server error/404, which should be reliable
      console.warn(`[WARN] Ping failed for ${url} - Status: ${response.status}`);
    } else {
      // Optional: log success for verbosity
      // console.log(`[INFO] Ping success for ${url} - Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`[ERROR] Ping failed for ${url} - ${error.message}`);
  }
}

// This function processes the links sequentially within chunks and adds a delay
async function processInBatches(links, batchSize) {
  // Use a constant delay to avoid hammering the worker/proxy
  const REQUEST_DELAY_MS = 200; 
  
  console.log(`Starting to ping ${links.length} links sequentially with a ${REQUEST_DELAY_MS}ms delay...`);
  
  // Outer loop for logging batch progress
  for (let i = 0; i < links.length; i += batchSize) {
    const chunk = links.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);
    
    // Inner loop: Process links ONE-BY-ONE (sequentially)
    for (const linkObj of chunk) {
        await ping(linkObj.download_link);
        await sleep(REQUEST_DELAY_MS); // Wait after each request
    }
  }
  console.log('All links checked.');
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

  // The batchSize is now only used for logging progress, the requests are sequential
  processInBatches(links, 50); 
}

main();
