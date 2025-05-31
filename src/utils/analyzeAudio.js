#!/usr/bin/env node

/**
 * Audio Analysis Utility
 * 
 * This script analyzes audio files in the specified directory for mood and energy metrics.
 * It can be run as a standalone utility or integrated with the main application.
 */

const path = require('path');
const fs = require('fs');
const AudioAnalyzer = require('./audioAnalyzer');

// Default music directory
const DEFAULT_MUSIC_DIR = path.join(__dirname, '../../data/ready/music');

/**
 * Analyze all audio files in the specified directory
 * @param {string} directory - Directory containing audio files to analyze
 * @param {Array<string>} extensions - File extensions to include
 */
async function analyzeDirectory(directory = DEFAULT_MUSIC_DIR, extensions = ['.mp3', '.wav', '.flac']) {
    console.log(`🔍 Analyzing audio files in: ${directory}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(directory)) {
        console.log(`📁 Creating directory: ${directory}`);
        fs.mkdirSync(directory, { recursive: true });
    }

    const analyzer = new AudioAnalyzer();
    const results = await analyzer.batchAnalyze(directory, extensions);

    console.log(`✅ Analysis complete. Analyzed ${results.length} files.`);

    // Print summary
    console.log('\n📊 Analysis Summary:');
    console.log('--------------------');

    const moodCounts = {};
    const energyLevels = {
        low: 0,
        medium: 0,
        high: 0
    };

    results.forEach(result => {
        // Count mood categories
        if (!moodCounts[result.mood]) {
            moodCounts[result.mood] = 0;
        }
        moodCounts[result.mood]++;

        // Categorize energy levels
        const energyValue = result.energy.rmsEnergy;
        if (energyValue < 0.3) {
            energyLevels.low++;
        } else if (energyValue < 0.6) {
            energyLevels.medium++;
        } else {
            energyLevels.high++;
        }
    });

    console.log('Mood Distribution:');
    Object.entries(moodCounts).forEach(([mood, count]) => {
        console.log(`  - ${mood}: ${count} files`);
    });

    console.log('\nEnergy Distribution:');
    console.log(`  - Low: ${energyLevels.low} files`);
    console.log(`  - Medium: ${energyLevels.medium} files`);
    console.log(`  - High: ${energyLevels.high} files`);

    return results;
}

// If this script is run directly (not imported)
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let directory = DEFAULT_MUSIC_DIR;

    // Check if a directory was specified
    if (args.length > 0 && !args[0].startsWith('-')) {
        directory = path.resolve(args[0]);
    }

    // Run the analysis
    analyzeDirectory(directory)
        .then(() => {
            console.log('🎵 Audio analysis complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error during audio analysis:', error);
            process.exit(1);
        });
}

module.exports = {
    analyzeDirectory
};
