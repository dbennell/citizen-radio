// ========================
// File: main.js (formerly index.js)
// ========================
const { initPromptWatcher } = require('../processors/promptProcessor');
const { playbackLoop, stopPlayback, requestStop}          = require('./orchestrator');
const { startYouTubeStreamer, getFfmpegStdin }= require('./streamer');
const tracksManager                           = require('../managers/trackManager');
const { runningProcesses }                    = require('../utils');
const { STATION_CONFIG }                      = require('./config');
const fs = require('fs');
const path = require('path');
const ratingManager = require('../managers/ratingsManager');

const TEMP_ROOT = path.join(__dirname, '../../data/temp');

// Add near the beginning of your main function
let metadataUpdateInterval;


function cleanup() {
    console.log('⏹️ Cleaning up... Stopping playback and processes.');

    // Create a promise to track cleanup completion
    const cleanupPromise = new Promise(async (resolve) => {
        try {
            // Stop playback loop
            stopPlayback();

            // End FFmpeg stdin if it exists
            try {
                const stdin = getFfmpegStdin();
                if (stdin) {
                    console.log('⏹️ Closing FFmpeg stdin...');
                    stdin.end();
                }
            } catch (stdinErr) {
                console.error('⚠️ Error closing FFmpeg stdin:', stdinErr.message);
            }

            // Stop the YouTube streamer
            if (STATION_CONFIG.streamMode === 'youtube') {
                if (metadataUpdateInterval) {
                    clearInterval(metadataUpdateInterval);
                }

                try {
                    const { stopYouTubeStreamer } = require('./streamer');
                    await stopYouTubeStreamer();
                } catch (streamerErr) {
                    console.error('⚠️ Error stopping YouTube streamer:', streamerErr.message);
                }
            }

            // Clear segue cache to free up memory
            try {
                const segueManager = require('../managers/segueManager');
                segueManager.clearSegueCache();
            } catch (cacheErr) {
                console.error('⚠️ Error clearing segue cache:', cacheErr.message);
            }

            // Import killAllTrackedProcesses to ensure all processes are terminated
            const { killAllTrackedProcesses } = require('../utils');

            // Wait for all processes to be terminated
            console.log('🧹 Terminating all remaining processes...');
            await killAllTrackedProcesses();
        } catch (err) {
            console.error('⚠️ Error during cleanup:', err.message);
        } finally {
            // Always resolve to ensure we exit
            resolve();
        }
    });

    // Wait for cleanup to complete before exiting
    cleanupPromise.then(() => {
        console.log('👋 Cleanup complete. Exiting...');
        process.exit(0);
    }).catch(err => {
        console.error('⚠️ Cleanup failed:', err.message);
        process.exit(1);
    });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function setupKeyListener() {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', chunk => {
        const code = chunk[0];
        if (code === 0x18) {                // Ctrl-X
            console.log('⏭️ Ctrl-X pressed; will stop after next music track.');
            requestStop();
        }
        if (code === 0x03) {                // Ctrl-C
            cleanup();
        }
    });
}

function cleanTempDirectory(rootDir) {
    console.log(`🧹 Cleaning up all temporary files in: ${rootDir}`);
    fs.rmSync(rootDir, { recursive: true, force: true });
    console.log(`✅ Temp directory cleaned: ${rootDir}`);
}


(async () => {
    console.log(`🪳 Debug mode is ${STATION_CONFIG.debug ? 'ON' : 'OFF'}`);
    //console.log(`📡 Stream mode is set to: '${STATION_CONFIG.streamMode}'`);
    cleanTempDirectory(TEMP_ROOT);
    initPromptWatcher();
    setupKeyListener();

    tracksManager.cleanupSegues();

    // Check if the streamMode is YouTube and initialize the streamer
    if (STATION_CONFIG.streamMode === 'youtube') {
        // If no video ID was provided and we should fetch it, try to get it from the YouTube API
        if (STATION_CONFIG.youtube?.shouldFetchVideoId) {
            console.log('🔍 No video ID provided, attempting to fetch the most recent live stream...');
            try {
                const { fetchLiveVideoId } = require('../utils');
                const videoId = await fetchLiveVideoId();
                if (videoId) {
                    //console.log(`✅ Found video ID: ${videoId}`);
                    STATION_CONFIG.youtube.videoId = videoId;
                } else {
                    console.warn('⚠️ Could not find a live stream video ID. Please provide one manually.');
                }
            } catch (err) {
                console.error('❌ Failed to fetch live video ID:', err.message);
            }
        }

        try {
            // Initialize YouTube streaming pipeline and wait for it to be ready
            await startYouTubeStreamer();
        } catch (err) {
            console.error('❌ Failed to initialize YouTube streamer:', err.message);
            console.log('🔄 Attempting to recover before starting playback...');
            try {
                const { recoverStreamingPipeline } = require('./streamer');
                await recoverStreamingPipeline();
            } catch (recoverErr) {
                console.error('❌ Failed to recover streaming pipeline:', recoverErr.message);
                console.log('⚠️ Continuing with playback, but streaming may not work properly.');
            }
        }
    }

    if (STATION_CONFIG.streamMode === 'youtube' && STATION_CONFIG.youtube?.updateMetadata) {
        // Update metadata every 30 minutes to keep the stream title fresh
        metadataUpdateInterval = setInterval(async () => {
            const { updateYouTubeStreamMetadata } = require('./streamer');
            await updateYouTubeStreamMetadata();
        }, 30 * 60 * 1000); // 30 minutes
    }

    if (STATION_CONFIG.ratingSystem?.enabled) {
        console.log('📊 Initializing rating system...');
        ratingManager.loadRatings();
    }

    await playbackLoop(); // Start the playback loop after initializing the streamer
    cleanup();
})();
