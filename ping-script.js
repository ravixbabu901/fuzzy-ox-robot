// ping-script.js
import fs from 'fs';

// --- Configuration ---
const BATCH_SIZE = 10;          // Optimal concurrent batch size found by user
const RETRY_DELAY_MS = 100;     // Reliable delay for the slow sequential retry pass

// Helper function to introduce a pause
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// Function for the fast, concurrent pass (Pass #1)
async function fastConcurrentPass(links) {
  const failedLinks = [];
  
  console.log(`Pinging ${links.length} links using FAST CONCURRENT mode (Batch Size ${BATCH_SIZE})...`);

  for (let i = 0; i < links.length; i += BATCH_SIZE) {
      const chunk = links.slice(i, i + BATCH_SIZE);
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

// Function for the slow, sequential pass (Pass #2)
async function slowSequentialPass(links) {
  const failedLinks = [];
  
  console.log(`Pinging ${links.length} links using SLOW SEQUENTIAL mode (+${RETRY_DELAY_MS}ms delay)...`);

  for (const linkObj of links) {
      const failedLink = await ping(linkObj);
      if (failedLink) {
          failedLinks.push(failedLink);
      }
      await sleep(RETRY_DELAY_MS); 
  }
  return failedLinks;
}

// Main function implements the two-pass check
async function main() {
  const INITIAL_LINKS_FILE = 'links.json';
  
  if (!fs.existsSync(INITIAL_LINKS_FILE)) {
    console.error(`Error: ${INITIAL_LINKS_FILE} file not found!`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(INITIAL_LINKS_FILE, 'utf8');
  let allLinks = JSON.parse(fileContent);

  if (!Array.isArray(allLinks) || allLinks.length === 0) {
    console.log('No links found in the database or JSON content is invalid. Exiting.');
    return;
  }

  const initialLinkCount = allLinks.length;
  let totalSucceeded = 0;
  
  // --- PASS #1: FAST CONCURRENT CHECK ---
  console.log('\n===================================================================');
  console.log(`STARTING PASS #1 (Fast Check) with ${initialLinkCount} links...`);
  console.log('===================================================================');

  let failedLinks = await fastConcurrentPass(allLinks);

  let succeededInPass1 = allLinks.length - failedLinks.length;
  totalSucceeded += succeededInPass1;
  
  console.log(`\n--- Pass #1 Summary ---`);
  console.log(`✅ Succeeded in this pass: ${succeededInPass1} links`);
  console.log(`❌ Still Failing: ${failedLinks.length} links`);
  
  // --- Check for Early Exit ---
  if (failedLinks.length === 0) {
    console.log('\n--- PINGING COMPLETE ---');
    console.log(`✅ All ${initialLinkCount} links successfully pinged in a single pass.`);
    return; 
  }
  
  // --- PASS #2: SLOW SEQUENTIAL RETRY (Only if Pass #1 failed) ---
  console.log('\n===================================================================');
  console.log(`STARTING PASS #2 (Slow Retry) with ${failedLinks.length} remaining links...`);
  console.log('===================================================================');
  
  const linksToRetry = failedLinks.length;
  const finalFailedLinks = await slowSequentialPass(failedLinks);
  
  const succeededInPass2 = linksToRetry - finalFailedLinks.length;
  totalSucceeded += succeededInPass2;
  
  // --- Pass Summary ---
  console.log(`\n--- Pass #2 Summary ---`);
  console.log(`✅ Succeeded in this retry pass: ${succeededInPass2} links`);
  console.log(`❌ Still Failing: ${finalFailedLinks.length} links`);
  
  // --- Final Output ---
  console.log('\n--- PINGING COMPLETE ---');
  if (finalFailedLinks.length > 0) {
    // Save unresolvable links
    const unresolvableFile = 'unresolvable_links.json';
    fs.writeFileSync(unresolvableFile, JSON.stringify(finalFailedLinks, null, 2), 'utf8');
    console.log(`❌ **${finalFailedLinks.length} links could not be successfully pinged after 2 passes.**`);
    console.log(`These links have been saved to **${unresolvableFile}** for manual inspection.`);
  } else {
    console.log(`✅ All ${initialLinkCount} links successfully pinged after 2 passes.`);
  }
}

main();
