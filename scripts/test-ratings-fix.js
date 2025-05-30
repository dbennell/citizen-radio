const { readJsonFile } = require('../src/utils/fileUtils');

async function testRatingsLogFix() {
    console.log('Testing fix for ratings.log parsing issue...');
    
    try {
        const ratingsData = await readJsonFile('./data/ratings.log', {});
        console.log('Successfully parsed ratings.log!');
        console.log(`Found ratings for ${Object.keys(ratingsData).length} tracks.`);
        
        // Print a sample of the data to verify it's correct
        const sampleTrack = Object.keys(ratingsData)[0];
        if (sampleTrack) {
            console.log(`Sample track: ${sampleTrack}`);
            console.log(`Average rating: ${ratingsData[sampleTrack].averageRating}`);
            console.log(`Number of ratings: ${ratingsData[sampleTrack].ratingCount}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error parsing ratings.log:', error);
        return false;
    }
}

// Run the test
testRatingsLogFix().then(success => {
    if (success) {
        console.log('Test completed successfully!');
    } else {
        console.log('Test failed!');
    }
});