// ping-script.js
import fs from 'fs';

// --- Configuration ---
const MIN_RANDOM_BATCH = 5;      // Minimum for random batch size
const MAX_RANDOM_BATCH = 15;     // Maximum for random batch size
const MAX_PING_ATTEMPTS = 3;     // Max attempts for a single link check
const RETRY_DELAY_MS = 10;      // Delay between attempts for a single link check

// Helper function to get a random batch size
function getRandomBatchSize() {
  return Math.floor(Math.random() * (MAX_RANDOM_BATCH - MIN_RANDOM_BATCH + 1)) + MIN_RANDOM_BATCH;
}

// Helper function to introduce a pause
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to perform the ping with built-in retry logic
async function ping(linkObj) {
  const url = linkObj.download_link;

  for (let attempt = 1; attempt <= MAX_PING_ATTEMPTS; attempt++) {
    try {
      // Use HEAD request for speed
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      
      if (response.ok) {
        // SUCCESS: Link passed on this attempt (1, 2, or 3)
        if (attempt > 1) {
          console.log(`[RETRY SUCCESS] Link: ${url} succeeded on attempt ${attempt}.`);
        }
        return null; // Return null on success
      }
      
      // FAILURE (4xx, 5xx): Prepare for retry
      console.warn(`[FAIL ATTEMPT ${attempt}] Link: ${url} - Status: ${response.status}.`);

    } catch (error) {
      // NETWORK ERROR: Prepare for retry
      console.error(`[ERROR ATTEMPT ${attempt}] Link: ${url} - Network Error: ${error.message}.`);
    }

    // Check if this was the last allowed attempt
    if (attempt === MAX_PING_ATTEMPTS) {
      console.error(`[FINAL FAIL] Link: ${url} failed after ${MAX_PING_ATTEMPTS} attempts.`);
      break; // Exit the loop and return failure
    }
    
    // Wait a brief moment before the next retry
    await sleep(RETRY_DELAY_MS);
  }

  // Return the link object only if all attempts failed
  return linkObj; 
}

// Function for a general concurrent pass
async function concurrentPingPass(links, batchSize) {
  const failedLinks = [];
  
  console.log(`Pinging ${links.length} links using CONCURRENT mode (Batch Size ${batchSize})...`);

  for (let i = 0; i < links.length; i += batchSize) {
      const chunk = links.slice(i, i + batchSize);
      // NOTE: ping is now responsible for internal retries
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
    console.log(`❌ **${currentLinks.length} links could not be successfully pinged after ${passCount} passes and internal retries.**`);
    console.log(`These links have been saved to **${unresolvableFile}** for manual inspection.`);
  } else {
    console.log(`✅ All ${initialLinkCount} links successfully pinged after ${passCount} passes.`);
  }
}

main();
