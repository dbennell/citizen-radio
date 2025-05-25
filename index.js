// ========================
// File: index.js
// ========================
const { createDirectories, initPromptWatcher } = require('./promptProcessor');
const { playbackLoop, stopPlayback, requestStop}          = require('./orchestrator');
const { startYouTubeStreamer, getFfmpegStdin }= require('./streamer');
const tracksManager                           = require('./trackManager');
const { runningProcesses }                    = require('./utils');
const { STATION_CONFIG }                      = require('./config');
const fs = require('fs');
const path = require('path');
const ratingManager = require('./ratingsManager');

const TEMP_ROOT = path.join(__dirname, 'temp');

// Add near the beginning of your main function
let metadataUpdateInterval;


function cleanup() {
    console.log('🛑 Cleaning up... Stopping playback and processes.');

    // Stop playback loop
    stopPlayback();

    // End FFmpeg stdin if it exists
    const stdin = getFfmpegStdin();
    if (stdin) stdin.end();

    // Stop the YouTube streamer
    if (STATION_CONFIG.streamMode === 'youtube') {
        if (metadataUpdateInterval) clearInterval(metadataUpdateInterval);

        const { stopYouTubeStreamer } = require('./streamer');
        stopYouTubeStreamer();
    }

    // Kill all monitored processes (including FFmpeg)
    runningProcesses.forEach(proc => {
        if (!proc.killed) {
            console.log(`🛑 Killing process: PID ${proc.pid}`);
            try {
                proc.kill("SIGTERM");
            } catch (err) {
                console.error(`Failed to kill PID ${proc.pid}:`, err.message);
            }
        }
    });

    // Ensure proper exit after cleanup
    setTimeout(() => {
        console.log('✅ Cleanup complete. Exiting...');
        process.exit(0);
    }, 200);
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
    cleanTempDirectory(TEMP_ROOT);
    createDirectories();
    initPromptWatcher();
    setupKeyListener();

    tracksManager.cleanupSegways();

    // Check if the streamMode is YouTube and initialize the streamer
    if (STATION_CONFIG.streamMode === 'youtube') {
        startYouTubeStreamer(); // Initialize YouTube streaming pipeline here
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
