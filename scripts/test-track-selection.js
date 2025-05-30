/**
 * Test Script for Enhanced Track Selection System
 * 
 * This script demonstrates the enhanced track selection system by:
 * 1. Initializing the mood/energy waves
 * 2. Loading available tracks
 * 3. Scoring and selecting tracks based on the current mood/energy
 * 4. Simulating track requests and priority content
 * 5. Visualizing the selection process
 */

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Import components
const moodEnergyManager = require('../src/managers/moodEnergyManager');
const trackScoring = require('../src/utils/trackScoring');
const requestManager = require('../src/managers/requestManager');
const EnhancedContentQueueManager = require('../src/managers/enhancedContentQueueManager');
const { STATION_CONFIG } = require('../src/core/config');
const { getLastPlays } = require('../src/managers/playLogManager');
const { extractMetadata } = require('../src/utils');

// Configuration
const TEST_CONFIG = {
  contentDir: path.join(__dirname, '../ready'),
  trackType: 'music',
  numTracksToSelect: 5,
  simulateRequest: true,
  simulatePriorityContent: true,
  visualizeWaves: true
};

/**
 * Get all tracks of a specific type
 */
async function getAllTracksOfType(type) {
  const dir = path.join(TEST_CONFIG.contentDir, type);

  if (!fs.existsSync(dir)) {
    console.error(chalk.red(`Directory not found: ${dir}`));
    return [];
  }

  // Get all MP3 files in the directory
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp3'))
    .map(f => path.join(dir, f));

  if (files.length === 0) {
    console.error(chalk.red(`No ${type} files found in ${dir}`));
    return [];
  }

  console.log(chalk.blue(`Found ${files.length} ${type} files`));

  // Get play history for play count
  const playLog = getLastPlays(100);

  // Process each file to get metadata and play count
  const tracks = await Promise.all(files.map(async (filepath) => {
    try {
      // Extract metadata
      const meta = await extractMetadata(filepath) || {};

      // Get relative path for play count lookup
      const relPath = path.relative(TEST_CONFIG.contentDir, filepath);

      // Count plays in history
      const playCount = playLog.filter(entry => entry.relPath === relPath).length;

      // Get last played time
      const lastPlayEntry = playLog.find(entry => entry.relPath === relPath);
      const lastPlayed = lastPlayEntry ? new Date(lastPlayEntry.timestamp) : null;

      // Return track with metadata
      return {
        filepath,
        relPath,
        title: meta.title || path.basename(filepath),
        artist: meta.artist || 'Unknown',
        mood: meta.mood || Math.floor(Math.random() * 10) + 1, // Random mood if not available
        energy: meta.energy || Math.floor(Math.random() * 10) + 1, // Random energy if not available
        averageRating: meta.averageRating || 3, // Default rating
        playCount,
        lastPlayed,
        ...(meta || {})
      };
    } catch (error) {
      console.error(chalk.red(`Error processing ${filepath}:`, error));
      return null;
    }
  }));

  // Filter out null entries
  return tracks.filter(track => track !== null);
}

/**
 * Simulate a track request
 */
async function simulateTrackRequest(tracks) {
  if (!tracks || tracks.length === 0) return null;

  // Pick a random track
  const track = tracks[Math.floor(Math.random() * tracks.length)];

  console.log(chalk.yellow(`\nSimulating request for "${track.title}" by ${track.artist}`));

  // Request the track
  const result = await requestManager.requestTrack({
    trackPath: track.filepath,
    requester: 'Test Script',
    priority: 2,
    immediate: Math.random() > 0.7 // 30% chance of immediate request
  });

  if (result.success) {
    console.log(chalk.green(`Request added: ${result.message}`));
    return result.request;
  } else {
    console.error(chalk.red(`Request failed: ${result.message}`));
    return null;
  }
}

/**
 * Simulate priority content
 */
async function simulatePriorityContent(tracks) {
  if (!tracks || tracks.length === 0) return null;

  // Pick a random track
  const track = tracks[Math.floor(Math.random() * tracks.length)];

  console.log(chalk.yellow(`\nSimulating priority content: "${track.title}" by ${track.artist}`));

  // Set as priority content
  const success = await requestManager.setPriorityContent({
    trackPath: track.filepath,
    type: 'priority',
    duration: 5 * 60 * 1000 // 5 minutes
  });

  if (success) {
    console.log(chalk.green('Priority content set successfully'));
    return requestManager.getPriorityContent();
  } else {
    console.error(chalk.red('Failed to set priority content'));
    return null;
  }
}

/**
 * Print track details with scoring information
 */
function printTrackDetails(track, index) {
  const title = chalk.bold(track.title);
  const artist = chalk.italic(track.artist || 'Unknown');
  const score = track.score !== undefined ? 
    chalk.yellow(`Score: ${track.score.toFixed(2)}`) : '';

  console.log(`${index + 1}. ${title} by ${artist} ${score}`);

  if (track.scoreComponents) {
    const components = track.scoreComponents;
    console.log(`   Rating: ${components.ratingScore.toFixed(2)}, ` +
      `Frequency: ${components.frequencyScore.toFixed(2)}, ` +
      `Wave Fit: ${components.waveFit.toFixed(2)}`);
  }

  if (track.mood && track.energy) {
    console.log(`   Mood: ${track.mood.toFixed(1)}, Energy: ${track.energy.toFixed(1)}`);
  }

  if (track.playCount !== undefined) {
    console.log(`   Play Count: ${track.playCount}, ` +
      `Last Played: ${track.lastPlayed ? track.lastPlayed.toLocaleString() : 'Never'}`);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log(chalk.bold.blue('=== Enhanced Track Selection System Test ===\n'));

  // 1. Initialize mood/energy waves
  console.log(chalk.bold('Current Mood/Energy State:'));
  const currentMood = moodEnergyManager.getCurrentMood();
  const currentEnergy = moodEnergyManager.getCurrentEnergy();
  const stateDesc = moodEnergyManager.getCurrentStateDescription();

  console.log(`Mood: ${currentMood.toFixed(1)}, Energy: ${currentEnergy.toFixed(1)}`);
  console.log(`Description: ${stateDesc}`);

  if (TEST_CONFIG.visualizeWaves) {
    console.log('\nMood Wave (next hour):');
    console.log(moodEnergyManager.moodWave.visualize());
    console.log('\nEnergy Wave (next hour):');
    console.log(moodEnergyManager.energyWave.visualize());
  }

  // 2. Load available tracks
  console.log(chalk.bold('\nLoading Tracks:'));
  const tracks = await getAllTracksOfType(TEST_CONFIG.trackType);

  if (tracks.length === 0) {
    console.error(chalk.red('No tracks available for testing'));
    return;
  }

  console.log(chalk.green(`Loaded ${tracks.length} tracks`));

  // 3. Score and select tracks
  console.log(chalk.bold('\nScoring Tracks:'));
  const playLog = getLastPlays(20);

  // Filter out excluded tracks
  const availableTracks = trackScoring.filterExcludedTracks(tracks, playLog);
  console.log(`${availableTracks.length} tracks available after exclusion filter`);

  // Score tracks
  const scoredTracks = trackScoring.scoreAndSortTracks(availableTracks);

  console.log(chalk.bold('\nTop Scored Tracks:'));
  scoredTracks.slice(0, TEST_CONFIG.numTracksToSelect).forEach(printTrackDetails);

  // 4. Simulate track request
  if (TEST_CONFIG.simulateRequest) {
    await simulateTrackRequest(tracks);
  }

  // 5. Simulate priority content
  if (TEST_CONFIG.simulatePriorityContent) {
    await simulatePriorityContent(tracks);
  }

  // 6. Initialize enhanced content queue manager
  console.log(chalk.bold('\nInitializing Enhanced Content Queue Manager:'));
  const queueManager = new EnhancedContentQueueManager({
    trackSelectionConfig: {
      enabled: true,
      moodEnergyEnabled: true,
      requestsEnabled: true
    }
  });

  await queueManager.initialize();

  // 7. Get next items from queue
  console.log(chalk.bold('\nNext Items in Queue:'));
  for (let i = 0; i < TEST_CONFIG.numTracksToSelect; i++) {
    const item = queueManager.getNextItem();
    if (item) {
      console.log(`\n${i + 1}. ${chalk.bold(item.meta.title)} by ${chalk.italic(item.meta.artist || 'Unknown')} (${item.type})`);

      if (item.segue) {
        console.log(chalk.gray(`   Segue: ${item.segue.text.substring(0, 100)}...`));
      }
    } else {
      console.log(`${i + 1}. No more items in queue`);
      break;
    }
  }

  // Clean up
  queueManager.cleanup();
  console.log(chalk.bold.green('\nTest completed successfully'));
}

// Run the test
runTest().catch(error => {
  console.error(chalk.bold.red('Test failed with error:'), error);
});
