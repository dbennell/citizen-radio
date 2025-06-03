/**
 * Test script for metadata integration
 * 
 * This script tests:
 * 1. Audio analysis and storage in MP3 metadata
 * 2. Ratings processing and storage in MP3 metadata
 * 3. Sentiment analysis and storage in MP3 metadata
 */

const path = require('path');
const fs = require('fs');
const NodeID3 = require('node-id3');
const AudioAnalysisEngine = require('../src/utils/AudioAnalysisEngine');
const ratingsManager = require('../src/managers/ratingsManager');
const { STATION_CONFIG } = require('../src/core/config');

// Test file path - replace with an actual MP3 file in your project
const testFilePath = path.join(__dirname, '../data/ready/music/test-track.mp3');

// Helper function to read custom frames from MP3 metadata
function readCustomFrames(filePath) {
    try {
        const tags = NodeID3.read(filePath);
        if (!tags || !tags.userDefinedText) {
            return {};
        }

        const frames = {};
        tags.userDefinedText.forEach(frame => {
            frames[frame.description] = frame.text;
        });

        return frames;
    } catch (error) {
        console.error('Error reading MP3 tags:', error);
        return {};
    }
}

// Main test function
async function testMetadataIntegration() {
    console.log('Testing metadata integration...');

    // Check if test file exists
    if (!fs.existsSync(testFilePath)) {
        console.error(`Test file not found: ${testFilePath}`);
        console.log('Please update the script with a valid MP3 file path.');
        return;
    }

    // 1. Test audio analysis
    console.log('\n1. Testing audio analysis...');
    const analysisEngine = new AudioAnalysisEngine();
    const analysis = await analysisEngine.analyzeFile(testFilePath);
    
    console.log('Analysis results:', {
        bpm: analysis.bpm,
        energy: analysis.energy?.rmsEnergy,
        mood: analysis.mood
    });

    // 2. Verify analysis results in MP3 metadata
    console.log('\n2. Verifying analysis results in MP3 metadata...');
    const analysisTags = readCustomFrames(testFilePath);
    
    console.log('MP3 metadata after analysis:');
    console.log('- BPM:', analysisTags.BPM);
    console.log('- ENERGY:', analysisTags.ENERGY);
    console.log('- MOOD:', analysisTags.MOOD);

    // 3. Test ratings processing
    console.log('\n3. Testing ratings processing...');
    
    // Simulate feedback entries
    const feedbackEntries = [
        {
            trackPath: testFilePath,
            rating: 5,
            author: 'TestUser1',
            comment: 'This track is amazing! Love the beat and energy.',
            timestamp: new Date().toISOString()
        },
        {
            trackPath: testFilePath,
            rating: 4,
            author: 'TestUser2',
            comment: 'Great melody, but the vocals could be better.',
            timestamp: new Date().toISOString()
        },
        {
            trackPath: testFilePath,
            rating: 5,
            author: 'TestUser3',
            comment: 'Fantastic production quality! This is my favorite track.',
            timestamp: new Date().toISOString()
        }
    ];

    // Process feedback and update metadata
    await ratingsManager.processFeedbackAndUpdateMetadata(testFilePath, feedbackEntries);

    // 4. Verify ratings and sentiment in MP3 metadata
    console.log('\n4. Verifying ratings and sentiment in MP3 metadata...');
    const ratingTags = readCustomFrames(testFilePath);
    
    console.log('MP3 metadata after ratings processing:');
    console.log('- RATING:', ratingTags.RATING);
    console.log('- RATING_COUNT:', ratingTags.RATING_COUNT);
    console.log('- SENTIMENT:', ratingTags.SENTIMENT);
    console.log('- LAST_UPDATED:', ratingTags.LAST_UPDATED);

    console.log('\nTest completed successfully!');
}

// Run the test
testMetadataIntegration().catch(error => {
    console.error('Test failed with error:', error);
});