// ping-script.js
import fs from 'fs';

// Helper function to perform the ping. Returns the link object on failure, or null on success.
async function ping(linkObj) {
  const url = linkObj.download_link;
  try {
    // Note: 'fetch' is usually available globally in modern Node.js environments (like GitHub Actions)
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    
    // Check if the request was unsuccessful (4xx, 5xx, or other error)
    if (!response.ok) {
      // Log the failure and return the link object for retry
      console.warn(`[FAIL] Link: ${url} - Status: ${response.status}. Adding to retry list.`);
      return linkObj; 
    }
    
    // Success
    return null; 
  } catch (error) {
    // Catch network errors (e.g., DNS resolution, timeout, connection reset)
    console.error(`[ERROR] Link: ${url} - Network Error: ${error.message}. Adding to retry list.`);
    return linkObj; 
  }
}

// Function to perform a single fast pass of pinging and collect the failures
async function pingAndCollectFailures(links, batchSize) {
  const failedLinks = [];
  
  // Iterate in batches for manageable Promise.all sizes, but still concurrent within the batch
  for (let i = 0; i < links.length; i += batchSize) {
    const chunk = links.slice(i, i + batchSize);
    
    // Create an array of promises
    const promises = chunk.map(linkObj => ping(linkObj));
    
    // Wait for all pings in the chunk to finish (fast concurrent check)
    const results = await Promise.all(promises);
    
    // Collect the failed link objects (which are not null)
    results.forEach(failedLink => {
      if (failedLink) {
        failedLinks.push(failedLink);
      }
    });
  }
  
  return failedLinks;
}

// Main function implements the retry loop
async function main() {
  const INITIAL_LINKS_FILE = 'links.json';
  const BATCH_SIZE = 50;
  
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
    console.log('\n===================================================================');
    console.log(`Starting Pinging Pass #${passCount} with ${currentLinks.length} links... (FAST PING)`);
    console.log('===================================================================');

    // Run the fast concurrent ping pass
    const failedLinks = await pingAndCollectFailures(currentLinks, BATCH_SIZE);

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
    
    // If the number of failures didn't decrease, we might be hitting a permanent limit or error
    if (failedLinks.length === currentLinks.length && passCount > 1) {
      console.warn('⚠️ WARNING: The number of failed links did not change from the previous pass. Exiting retry loop to prevent infinite loop.');
      break;
    }

    // Set the failed links as the input for the next pass
    currentLinks = failedLinks;
  }

  // --- Final Output ---
  console.log('\n--- PINGING COMPLETE ---');
  if (currentLinks.length > 0) {
    // If the loop exited but links are still in currentLinks, they are unresolvable
    const unresolvableFile = 'unresolvable_links.json';
    fs.writeFileSync(unresolvableFile, JSON.stringify(currentLinks, null, 2), 'utf8');
    console.log(`❌ **${currentLinks.length} links could not be successfully pinged after ${passCount} passes.**`);
    console.log(`These links have been saved to **${unresolvableFile}** for manual inspection.`);
  } else {
    console.log(`✅ All ${totalSucceeded} links successfully pinged after ${passCount} passes.`);
  }
}

main();
