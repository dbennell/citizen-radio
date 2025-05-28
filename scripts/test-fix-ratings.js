const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the ratings log file
const ratingPath = path.join(__dirname, '../data/ratings.log');

console.log('Testing fix-ratings-log.js script...');

// Run the fix-ratings-log.js script
try {
  console.log('Running fix-ratings-log.js...');
  execSync('node scripts/fix-ratings-log.js', { stdio: 'inherit' });
  
  // Check if the file exists and can be parsed
  if (fs.existsSync(ratingPath)) {
    console.log(`File ${ratingPath} exists, checking if it can be parsed...`);
    
    try {
      const data = fs.readFileSync(ratingPath, 'utf8');
      const parsed = JSON.parse(data);
      console.log('Successfully parsed ratings.log file!');
      console.log('Content:', JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.error('Failed to parse ratings.log file:', parseError.message);
    }
  } else {
    console.log(`File ${ratingPath} does not exist.`);
  }
} catch (error) {
  console.error('Error running fix-ratings-log.js:', error.message);
}