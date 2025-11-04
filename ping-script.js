// ping-script.js
import fs from 'fs';

// --- Configuration ---
const MIN_RANDOM_BATCH = 5;      // Minimum for random batch size
const MAX_RANDOM_BATCH = 15;     // Maximum for random batch size

// Helper function to get a random batch size between MIN_RANDOM_BATCH and MAX_RANDOM_BATCH
function getRandomBatchSize() {
  return Math.floor(Math.random() * (MAX_RANDOM_BATCH - MIN_RANDOM_BATCH + 1)) + MIN_RANDOM_BATCH;
}

// Helper function to perform the ping. Returns the link object on failure, or null on success.
async function ping(linkObj) {
  const url = linkObj.download_link;
  try {
    // We use HEAD requests as they are the fastest way to check link availability.
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    
    // Check if the request was unsuccessful (4xx, 5xx, or network error)
    if (!response.ok) {
      console.warn(`[FAIL] Link: ${url} - Status: ${response.status}.`);
      return linkObj; 
    }
    return null; 
  } catch (error) {
    // Catch network errors (e.g., DNS resolution, timeout, connection reset)
    console.error(`[ERROR] Link: ${url} - Network Error: ${error.message}.`);
    return linkObj; 
  }
}

// Function for a general concurrent pass
async function concurrentPingPass(links, batchSize) {
  const failedLinks = [];
  
  console.log(`Pinging ${links.length} links using CONCURRENT mode (Batch Size ${batchSize})...`);

  for (let i = 0; i < links.length; i += batchSize) {
      const chunk = links.slice(i, i + batchSize);
      const promises = chunk.map(linkObj => ping(linkObj));
      const results = await Promise.all(promises);
      
      results.forEach(failedLink => {
        if (failedLink) {
          failedLinks.push(failedLink);
        }
      });
  }
  return failedLinks;
}

// Main function implements the three-pass check
async function main() {
  const INITIAL_LINKS_FILE = 'links.json';
  
  if (!fs.existsSync(INITIAL_LINKS_FILE)) {
    console.error(`Error: ${INITIAL_LINKS_FILE} file not found!`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(INITIAL_LINKS_FILE, 'utf8');
  let currentLinks = JSON.parse(fileContent);

  if (!Array.isArray(currentLinks) || currentLinks.length === 0) {
    console.log('No links found in the database or JSON content is invalid. Exiting.');
    return;
  }

  const initialLinkCount = currentLinks.length;
  let totalSucceeded = 0;
  let passCount = 0;
  
  // Define the pass configurations: [batchSize, description]
  const passConfigs = [
    [getRandomBatchSize(), 'RANDOM BATCH (Pass 1)'],
    [getRandomBatchSize(), 'RANDOM BATCH (Pass 2)'],
    [1, 'SEQUENTIAL BATCH (Pass 3)'], // Batch size of 1 forces sequential execution
  ];
  
  // --- Start Retry Loop ---
  for (const [batchSize, description] of passConfigs) {
    passCount++;
    if (currentLinks.length === 0) {
        break; // Early exit if previous pass succeeded
    }
    
    console.log('\n===================================================================');
    console.log(`STARTING PASS #${passCount}: ${description} with ${currentLinks.length} links...`);
    console.log('===================================================================');

    // Run the concurrent pass with the configured batch size
    let failedLinks = await concurrentPingPass(currentLinks, batchSize);

    let succeededInPass = currentLinks.length - failedLinks.length;
    totalSucceeded += succeededInPass;
    
    // --- Pass Summary ---
    console.log(`\n--- Pass #${passCount} Summary ---`);
    console.log(`Batch Size Used: ${batchSize}`);
    console.log(`✅ Succeeded in this pass: ${succeededInPass} links`);
    console.log(`❌ Still Failing: ${failedLinks.length} links`);
    console.log(`⏳ Total Succeeded So Far: ${totalSucceeded} links`);
    
    // Set the failed links as the input for the next pass
    currentLinks = failedLinks;
  }
  
  // --- Final Output ---
  console.log('\n--- PINGING COMPLETE ---');
  if (currentLinks.length > 0) {
    // Save unresolvable links
    const unresolvableFile = 'unresolvable_links.json';
    fs.writeFileSync(unresolvableFile, JSON.stringify(currentLinks, null, 2), 'utf8');
    console.log(`❌ **${currentLinks.length} links could not be successfully pinged after ${passCount} passes.**`);
    console.log(`These links have been saved to **${unresolvableFile}** for manual inspection.`);
  } else {
    console.log(`✅ All ${initialLinkCount} links successfully pinged after ${passCount} passes.`);
  }
}

main();
