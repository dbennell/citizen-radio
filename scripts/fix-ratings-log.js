const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Import the fileUtils module for advanced JSON handling
const fileUtils = require('../src/utils/fileUtils');

// Path to the ratings log file
const ratingPath = path.join(__dirname, '../data/ratings.log');
const backupPath = path.join(__dirname, '../data/ratings.log.backup');

/**
 * Function to fix the ratings log file with enhanced recovery logic
 */
async function fixRatingsLog() {
  console.log(`[FixRatings] Attempting to fix file: ${ratingPath}`);

  try {
    // Check if the file exists
    if (!fsSync.existsSync(ratingPath)) {
      console.log(`[FixRatings] File ${ratingPath} does not exist.`);
      return;
    }

    // Create a backup of the original file
    try {
      await fs.copyFile(ratingPath, backupPath);
      console.log(`[FixRatings] Created backup at ${backupPath}`);
    } catch (backupError) {
      console.warn(`[FixRatings] Failed to create backup: ${backupError.message}`);
    }

    // Read the file content
    let data = await fs.readFile(ratingPath, 'utf8');
    console.log(`[FixRatings] Read ${data.length} bytes from ${ratingPath}`);

    // Step 1: Trim and sanitize invalid characters
    data = data.trim().replace(/[^\x20-\x7E\r\n\t]+/g, '');

    // Step 2: Remove any [object Promise] strings
    if (data.includes('[object Promise]')) {
      console.log(`[FixRatings] Found [object Promise] in file, removing it.`);
      data = data.replace(/\[object Promise\]/g, '');
    }

    // Step 3: Attempt full parsing
    try {
      const parsedData = JSON.parse(data);
      console.log(`[FixRatings] File ${ratingPath} parsed successfully.`);

      // Write the parsed data back to ensure it's properly formatted
      await fs.writeFile(ratingPath, JSON.stringify(parsedData, null, 2), 'utf8');
      console.log(`[FixRatings] Reformatted JSON and saved back to ${ratingPath}`);

      return parsedData;
    } catch (parseError) {
      console.warn(`[FixRatings] Parsing failed: ${parseError.message}`);

      // Step 4: Try to fix common JSON issues
      let fixedData = data;

      // 4.1 Remove trailing commas
      fixedData = fixedData.replace(/,\s*([\]}])/g, '$1');

      // 4.2 Fix missing quotes around property names
      fixedData = fixedData.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');

      // 4.3 Fix unquoted string values
      fixedData = fixedData.replace(/:(\s*)([a-zA-Z0-9_$]+)([,}])/g, ':"$2"$3');

      // 4.4 Try to fix unclosed arrays or objects
      const openBraces = (fixedData.match(/\{/g) || []).length;
      const closeBraces = (fixedData.match(/\}/g) || []).length;

      if (openBraces > closeBraces) {
        console.log(`[FixRatings] Adding ${openBraces - closeBraces} missing closing braces`);
        fixedData += '}'.repeat(openBraces - closeBraces);
      }

      try {
        const parsedData = JSON.parse(fixedData);
        console.log(`[FixRatings] Successfully fixed JSON syntax issues`);

        // Write the fixed data back
        await fs.writeFile(ratingPath, JSON.stringify(parsedData, null, 2), 'utf8');
        console.log(`[FixRatings] Saved fixed JSON to ${ratingPath}`);

        return parsedData;
      } catch (fixError) {
        console.warn(`[FixRatings] Failed to fix syntax issues: ${fixError.message}`);

        // Step 5: Heuristic recovery (find valid JSON segments)
        try {
          // Look for the largest valid JSON object in the file
          const match = data.match(/(\{.*\})/s);
          if (match && match[0]) {
            try {
              // Verify that the extracted object is valid JSON
              const extractedData = JSON.parse(match[0]);
              console.log(`[FixRatings] Successfully extracted valid JSON object`);

              // Write the extracted data back
              await fs.writeFile(ratingPath, JSON.stringify(extractedData, null, 2), 'utf8');
              console.log(`[FixRatings] Saved extracted JSON to ${ratingPath}`);

              return extractedData;
            } catch (extractError) {
              console.warn(`[FixRatings] Extracted object is not valid JSON: ${extractError.message}`);
            }
          }
        } catch (matchError) {
          console.warn(`[FixRatings] Failed to extract JSON object: ${matchError.message}`);
        }

        // Step 6: Last resort - reset to empty object
        console.error(`[FixRatings] Unable to recover valid JSON. Resetting file to empty object.`);
        const emptyObject = {};
        await fs.writeFile(ratingPath, JSON.stringify(emptyObject, null, 2), 'utf8');
        console.log(`[FixRatings] Reset ${ratingPath} to empty object`);

        return emptyObject;
      }
    }
  } catch (error) {
    console.error(`[FixRatings] Error fixing ratings log:`, error);

    // If all else fails, try using the fileUtils.safeReadJsonFile function
    try {
      console.log(`[FixRatings] Attempting recovery using fileUtils.safeReadJsonFile...`);
      const recoveredData = await fileUtils.safeReadJsonFile(ratingPath, {});
      console.log(`[FixRatings] Recovery completed using fileUtils`);
      return recoveredData;
    } catch (recoveryError) {
      console.error(`[FixRatings] Recovery using fileUtils failed:`, recoveryError);
      return {};
    }
  }
}

// Run the function and handle any uncaught errors if this script is executed directly
if (require.main === module) {
  fixRatingsLog()
    .then(() => console.log(`[FixRatings] Completed ratings log fix process`))
    .catch(err => console.error(`[FixRatings] Unhandled error in fix process:`, err));
}

// Export the function for testing and programmatic use
module.exports = {
  fixRatingsLog
};
