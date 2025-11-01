// ping-script.js
import fs from 'fs';

// --- Configuration ---
// Delay introduced between each request for the sequential retry passes
const RETRY_DELAY_MS = 25; 
// Slow sequential mode starts at Pass #5
const SLOW_PASS_START_COUNT = 5; 

// Helper function to introduce a pause
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to perform the ping. Returns the link object on failure, or null on success.
async function ping(linkObj) {
  const url = linkObj.download_link;
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    
    // Check if the request was unsuccessful (4xx, 5xx, or network error)
    if (!response.ok) {
      console.warn(`[FAIL] Link: ${url} - Status: ${response.status}.`);
      return linkObj; 
    }
    
    // Success
    return null; 
  } catch (error) {
    // Catch network errors (e.g., DNS resolution, timeout, connection reset)
    console.error(`[ERROR] Link: ${url} - Network Error: ${error.message}.`);
    return linkObj; 
  }
}

// Function to perform a single ping pass (mode depends on passCount)
async function pingPass(links, batchSize, passCount) {
  const failedLinks = [];
  
  // Logic: Passes 1-4 are fast, Pass 5+ are slow
  const isFastPass = passCount < SLOW_PASS_START_COUNT; 
  
  const mode = isFastPass ? 'FAST CONCURRENT' : `SLOW SEQUENTIAL (+${RETRY_DELAY_MS}ms delay)`;
  console.log(`Pinging ${links.length} links in ${mode} mode...`);

  if (isFastPass) {
    // ------------------------------------
    // MODE 1: FAST CONCURRENT (Pass 1 through 4)
    // ------------------------------------
    // Iterate in batches for manageable Promise.all sizes
    for (let i = 0; i < links.length; i += batchSize) {
        const chunk = links.slice(i, i + batchSize);
        const promises = chunk.map(linkObj => ping(linkObj));
        
        // Wait for all pings in the chunk to finish
        const results = await Promise.all(promises);
        
        // Collect the failed link objects
        results.forEach(failedLink => {
          if (failedLink) {
            failedLinks.push(failedLink);
          }
        });
    }

  } else {
    // ------------------------------------
    // MODE 2: SLOW SEQUENTIAL (Pass 5+)
    // ------------------------------------
    // Process links one-by-one with a delay to bypass rate limits
    for (const linkObj of links) {
        const failedLink = await ping(linkObj);
        if (failedLink) {
            failedLinks.push(failedLink);
        }
        await sleep(RETRY_DELAY_MS); // Introduce the mandatory delay
    }
  }
  
  return failedLinks;
}

// Main function implements the retry loop
async function main() {
  const INITIAL_LINKS_FILE = 'links.json';
  const BATCH_SIZE = 15; // Used for the first concurrent pass's chunk size
  
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

  let passCount = 0;
  let totalSucceeded = 0;

  // The retry loop continues as long as there are links to process
  while (currentLinks.length > 0) {
    passCount++;
    // FIX: Define isFastPass here so it is accessible for the break condition check below.
    const isFastPass = passCount < SLOW_PASS_START_COUNT; 

    console.log('\n===================================================================');
    console.log(`Starting Pinging Pass #${passCount} with ${currentLinks.length} links...`);
    console.log('===================================================================');

    // Run the ping pass (fast on pass 1-4, slow on pass 5+)
    const failedLinks = await pingPass(currentLinks, BATCH_SIZE, passCount);

    const succeededInPass = currentLinks.length - failedLinks.length;
    totalSucceeded += succeededInPass;
    
    // --- Pass Summary ---
    console.log(`\n--- Pass #${passCount} Summary ---`);
    console.log(`✅ Succeeded in this pass: ${succeededInPass} links`);
    console.log(`❌ Still Failing: ${failedLinks.length} links`);
    console.log(`⏳ Total Succeeded So Far: ${totalSucceeded} links`);
    
    // If no links failed in this pass, we are done
    if (failedLinks.length === 0) {
      break; 
    }
    
    // Logic: If we are already in the slow pass mode (pass 5+) and failures don't change, we stop.
    if (!isFastPass && failedLinks.length === currentLinks.length) {
      console.warn('⚠️ WARNING: The number of failed links did not decrease after the slow pass. Exiting retry loop to prevent infinite loop.');
      break;
    }

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
    console.log(`✅ All ${totalSucceeded} links successfully pinged after ${passCount} passes.`);
  }
}

main();
